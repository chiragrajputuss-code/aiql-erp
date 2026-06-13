/**
 * Embedding pipeline for the knowledge base.
 *
 * Why Ollama / nomic-embed-text:
 *   - Free, runs locally on the customer's box (preserves the privacy story)
 *   - 768-dim vectors — small enough for HNSW with default params
 *   - No external network call needed for embedding (call hits localhost)
 *
 * Customer self-hosts Ollama on the same machine as the AIQL server. We never
 * route embedding text through any external service. This is intentional —
 * embedding text contains the same PII that the answer text does.
 *
 * Fallback semantics:
 *   - If Ollama is unreachable → return null
 *   - Caller (auto-embedder, backfill helper) treats null as "skip, try later"
 *   - Knowledge retrieval gracefully degrades to keyword matching
 *
 * Configuration (env):
 *   OLLAMA_URL       (default http://localhost:11434)
 *   OLLAMA_MODEL     (default nomic-embed-text)
 */

import { prisma } from "@aiql/db";

const DEFAULT_OLLAMA_URL   = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "nomic-embed-text";
const EMBEDDING_DIMS       = 768;
const REQUEST_TIMEOUT_MS   = 8_000;

// Hosts that don't leak data outside the customer's box. Anything else is
// flagged at first use so the operator notices.
const LOCAL_HOST_PATTERNS = [
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/,
  /^\[::1\](:\d+)?$/,
  /^0\.0\.0\.0(:\d+)?$/,
  /^host\.docker\.internal(:\d+)?$/i,   // Docker for Mac/Win
  /^ollama(:\d+)?$/i,                   // typical compose service name
];

let ollamaUrlWarningEmitted = false;

/**
 * Returns the configured Ollama URL, warning ONCE if it points to a non-local
 * host. Embedding text contains the same PII as knowledge answers — sending
 * it to a remote Ollama defeats the privacy story.
 */
function getValidatedOllamaUrl(): string {
  const url = (process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");

  if (ollamaUrlWarningEmitted) return url;
  try {
    const parsed = new URL(url);
    const hostport = parsed.host;
    const isLocal = LOCAL_HOST_PATTERNS.some((re) => re.test(hostport));
    if (!isLocal) {
      ollamaUrlWarningEmitted = true;
      console.warn(
        "\n⚠️  OLLAMA_URL points to a non-local host:", url,
        "\n   Embedding text contains the same data as your answers — a remote Ollama leaks it.",
        "\n   For privacy, OLLAMA_URL should be localhost (or a host on the same machine).",
        "\n   Set this intentionally? Add OLLAMA_ALLOW_REMOTE=true to silence this warning.\n"
      );
    }
  } catch {
    ollamaUrlWarningEmitted = true;
    console.warn(`[embeddings] Malformed OLLAMA_URL: ${url}. Falling back to default.`);
    return DEFAULT_OLLAMA_URL;
  }
  return url;
}

/** Test-only — reset the warning flag so multiple tests each see a fresh warn. */
export function _resetOllamaUrlWarning(): void { ollamaUrlWarningEmitted = false; }

export interface EmbedResult {
  embedding: number[];
  model:     string;
  dims:      number;
}

/**
 * Embed a single text via Ollama. Returns null if Ollama is unreachable
 * or returns malformed output — caller should treat null as "skip".
 */
export async function embed(text: string): Promise<EmbedResult | null> {
  if (!text || !text.trim()) return null;

  // Honour OLLAMA_ALLOW_REMOTE escape hatch — when set, skip the warning.
  const allowRemote = process.env.OLLAMA_ALLOW_REMOTE === "true";
  const url   = allowRemote ? (process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "")
                            : getValidatedOllamaUrl();
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;

  try {
    const res = await fetch(`${url}/api/embeddings`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ model, prompt: text.slice(0, 8000) }),
      signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = await res.json() as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) return null;
    if (data.embedding.length !== EMBEDDING_DIMS) {
      // Wrong model loaded — different dim count. Log and bail.
      console.warn(
        `[embeddings] expected ${EMBEDDING_DIMS} dims, got ${data.embedding.length}. ` +
        `Check OLLAMA_MODEL is set to nomic-embed-text.`
      );
      return null;
    }
    return { embedding: data.embedding, model, dims: data.embedding.length };
  } catch {
    return null;
  }
}

/**
 * Embed and persist a knowledge row's embedding. Idempotent.
 * Combines context + answer + annotation into the embedding text so retrieval
 * matches on any of the three.
 */
export async function embedKnowledgeRow(rowId: string): Promise<boolean> {
  const row = await prisma.orgBusinessKnowledge.findUnique({
    where:  { id: rowId },
    select: { context: true, answer: true, annotation: true },
  });
  if (!row) return false;

  const text = [row.context, row.answer, row.annotation]
    .filter((s): s is string => !!s && s.length > 0)
    .join("\n");

  const result = await embed(text);
  if (!result) return false;

  // Raw SQL — Prisma client doesn't support vector type natively.
  // pgvector accepts a string-encoded array literal.
  const literal = `[${result.embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "org_business_knowledge" SET "embedding" = $1::vector WHERE "id" = $2`,
    literal,
    rowId
  );
  return true;
}

/**
 * Cosine-similarity vector search. Returns the top N most-similar knowledge
 * rows for the given query text.
 *
 * Returns empty array if Ollama is unreachable — caller should fall back
 * to keyword scoring (see knowledge-context.ts).
 */
export interface VectorMatch {
  id:                 string;
  context:            string;
  answer:             string;
  annotation:         string | null;
  verdict:            string;
  reaffirmationCount: number;
  source:             string;
  /** Cosine similarity in [0, 1]. 1 = identical, 0 = unrelated. */
  similarity:         number;
}

export async function searchByEmbedding(args: {
  orgId:         string;
  queryText:     string;
  topN?:         number;
  /** Skip rows below this similarity threshold (default 0.5). */
  minSimilarity?: number;
  connectionId?: string | null;
}): Promise<VectorMatch[]> {
  const queryEmbedding = await embed(args.queryText);
  if (!queryEmbedding) return [];

  const topN = args.topN ?? 5;
  const minSim = args.minSimilarity ?? 0.5;
  const literal = `[${queryEmbedding.embedding.join(",")}]`;

  // pgvector cosine distance = 1 - cosine_similarity. We want similarity, so flip.
  // Filter: only rows with embeddings + matching org + not REJECTED.
  // Connection scope: when connectionId is undefined we don't filter; when
  // explicitly null we match rows where connectionId IS NULL.
  const connClause =
    args.connectionId === undefined ? "" :
    args.connectionId === null      ? `AND "connectionId" IS NULL`
                                    : `AND "connectionId" = $3`;
  const params: unknown[] = [literal, args.orgId];
  if (args.connectionId !== undefined && args.connectionId !== null) {
    params.push(args.connectionId);
  }

  const sql = `
    SELECT
      id, context, answer, annotation, verdict,
      "reaffirmationCount", source,
      1 - ("embedding" <=> $1::vector) AS similarity
    FROM "org_business_knowledge"
    WHERE "embedding" IS NOT NULL
      AND "orgId"   = $2
      AND verdict <> 'REJECTED'
      ${connClause}
    ORDER BY "embedding" <=> $1::vector
    LIMIT ${Math.max(1, Math.min(50, topN))}
  `;

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; context: string; answer: string; annotation: string | null;
      verdict: string; reaffirmationCount: number; source: string;
      similarity: number;
    }>>(sql, ...params);

    return rows
      .filter((r) => r.similarity >= minSim)
      .map((r) => ({
        id:                 r.id,
        context:            r.context,
        answer:             r.answer,
        annotation:         r.annotation,
        verdict:            r.verdict,
        reaffirmationCount: r.reaffirmationCount,
        source:             r.source,
        similarity:         Number(r.similarity),
      }));
  } catch (err) {
    console.warn("[embeddings] vector search failed:", (err as Error).message);
    return [];
  }
}

/**
 * Backfill embeddings for any knowledge rows that don't have one yet.
 * Idempotent — safe to run as a recurring cron.
 */
export async function backfillEmbeddings(args: {
  orgId?:       string;
  batchSize?:   number;
  /** Stop after this many embeddings (safety cap, default unlimited). */
  maxRows?:     number;
}): Promise<{ embedded: number; failed: number; skipped: number }> {
  const batchSize = args.batchSize ?? 25;
  const maxRows   = args.maxRows ?? Infinity;

  let embedded = 0, failed = 0, skipped = 0;

  // Find rows without embeddings via raw SQL (Prisma can't filter on Unsupported types).
  const orgClause = args.orgId ? `AND "orgId" = $1` : "";
  const params: unknown[] = args.orgId ? [args.orgId] : [];

  while (embedded + failed + skipped < maxRows) {
    const sql = `
      SELECT id FROM "org_business_knowledge"
      WHERE "embedding" IS NULL ${orgClause}
      ORDER BY "lastReaffirmedAt" DESC
      LIMIT ${batchSize}
    `;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(sql, ...params);
    if (rows.length === 0) break;

    for (const row of rows) {
      const ok = await embedKnowledgeRow(row.id);
      if (ok) embedded++;
      else    failed++;
      if (embedded + failed + skipped >= maxRows) break;
    }
  }

  return { embedded, failed, skipped };
}

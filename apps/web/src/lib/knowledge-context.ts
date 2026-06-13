/**
 * Knowledge auto-context builder.
 *
 * Given a user prompt + an orgId, retrieves relevant `OrgBusinessKnowledge`
 * rows and formats them as a system-prompt addendum the LLM can consume.
 *
 * This is the core of the "your CA's brain" effect — every LLM call (whether
 * via safeLlmCall internally or via the customer's proxied request) silently
 * gets the org's accumulated wisdom prepended.
 *
 * Retrieval strategy (Phase 1 — keyword overlap):
 *   - Tokenise the prompt into stem-words
 *   - Score each knowledge row by:
 *       * keyword overlap with context + answer + annotation
 *       * confidence × reaffirmationCount (well-established knowledge ranks higher)
 *       * freshness (recently reaffirmed > old)
 *   - Return top N (default 5)
 *
 * Phase 2 will replace this with vector embeddings (deferred to Sprint C+).
 */

import { prisma } from "@aiql/db";
import { searchByEmbedding } from "@/lib/embeddings";

export interface KnowledgeContextItem {
  id:         string;
  context:    string;
  answer:     string;
  annotation: string | null;
  verdict:    string;
  reaffirmationCount: number;
  source:     string;
  /** Present when retrieved via vector search (cosine similarity, 0..1). */
  similarity?: number;
}

export interface BuildContextResult {
  /** The system-prompt addendum to prepend / append. Empty if no relevant knowledge. */
  systemAddendum: string;
  /** The actual rows that were selected — useful for telemetry / display. */
  items:          KnowledgeContextItem[];
  /** Number of rows considered before ranking. */
  candidatesScanned: number;
  /** Which retrieval path was used. "vector" when Ollama produced an embedding,
   *  "keyword" when we fell back to keyword overlap, "none" when no relevant rows. */
  retrieval:      "vector" | "keyword" | "none";
}

export interface BuildContextOptions {
  /** Maximum rows to include (default 5). */
  topN?:        number;
  /** Optional connection scope (org-wide if null). */
  connectionId?: string | null;
  /** Skip rows with confidence below this floor (default 0.4). */
  minConfidence?: number;
}

/**
 * Build a system-prompt addendum from this org's knowledge base.
 *
 * Hybrid retrieval:
 *   1. Try vector search via Ollama embedding (semantic match).
 *   2. If Ollama is unreachable OR returns no rows above threshold, fall
 *      back to keyword scoring.
 *
 * Returns an empty string if no relevant rows are found — caller can
 * unconditionally prepend the result.
 */
export async function buildKnowledgeContext(
  orgId:  string,
  prompt: string,
  opts:   BuildContextOptions = {}
): Promise<BuildContextResult> {
  const topN = opts.topN ?? 5;
  const minConfidence = opts.minConfidence ?? 0.4;

  // ── Path 1: Vector search (preferred when Ollama available) ──────────
  const vectorMatches = await searchByEmbedding({
    orgId,
    queryText:     prompt,
    topN,
    minSimilarity: 0.55,   // tune: too low = noise, too high = misses
    connectionId:  opts.connectionId,
  });

  if (vectorMatches.length > 0) {
    const items: KnowledgeContextItem[] = vectorMatches.map((m) => ({
      id:                 m.id,
      context:            m.context,
      answer:             m.answer,
      annotation:         m.annotation,
      verdict:            m.verdict,
      reaffirmationCount: m.reaffirmationCount,
      source:             m.source,
      similarity:         m.similarity,
    }));
    return {
      systemAddendum:    formatAddendum(items),
      items,
      candidatesScanned: vectorMatches.length,
      retrieval:         "vector",
    };
  }

  // ── Path 2: Keyword fallback ─────────────────────────────────────────
  const promptKeywords = extractKeywords(prompt);
  if (promptKeywords.size === 0) {
    return { systemAddendum: "", items: [], candidatesScanned: 0, retrieval: "none" };
  }

  const candidates = await prisma.orgBusinessKnowledge.findMany({
    where: {
      orgId,
      ...(opts.connectionId !== undefined ? { connectionId: opts.connectionId } : {}),
      verdict:    { not: "REJECTED" },
      confidence: { gte: minConfidence },
    },
    orderBy: [
      { reaffirmationCount: "desc" },
      { lastReaffirmedAt:   "desc" },
    ],
    take: 200,
  });

  const scored = candidates
    .map((r) => ({ row: r, score: scoreRow(promptKeywords, r) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (scored.length === 0) {
    return { systemAddendum: "", items: [], candidatesScanned: candidates.length, retrieval: "none" };
  }

  const items: KnowledgeContextItem[] = scored.map((s) => ({
    id:                 s.row.id,
    context:            s.row.context,
    answer:             s.row.answer,
    annotation:         s.row.annotation,
    verdict:            s.row.verdict,
    reaffirmationCount: s.row.reaffirmationCount,
    source:             s.row.source,
  }));

  return {
    systemAddendum:    formatAddendum(items),
    items,
    candidatesScanned: candidates.length,
    retrieval:         "keyword",
  };
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreRow(
  promptKeywords: Set<string>,
  row: { context: string; answer: string; annotation: string | null; confidence: number; reaffirmationCount: number; lastReaffirmedAt: Date }
): number {
  const rowKeywords = extractKeywords(
    [row.context, row.answer, row.annotation ?? ""].join(" ")
  );

  // Keyword overlap (Jaccard-style: intersection size matters most)
  let overlap = 0;
  for (const k of rowKeywords) {
    if (promptKeywords.has(k)) overlap++;
  }
  if (overlap === 0) return 0;

  // Boost: well-established knowledge (high confidence × many reaffirmations)
  const trustWeight = row.confidence * Math.min(2, 1 + Math.log10(row.reaffirmationCount));

  // Freshness decay: knowledge older than 365 days gets a small penalty
  const ageDays = (Date.now() - row.lastReaffirmedAt.getTime()) / 86_400_000;
  const freshness = ageDays < 365 ? 1.0 : Math.max(0.5, 1.0 - (ageDays - 365) / 730);

  return overlap * trustWeight * freshness;
}

// ─── Keyword extraction ─────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the","is","at","of","on","and","a","an","to","in","for","with","by","this",
  "that","it","be","are","was","were","or","if","but","not","do","does","did",
  "have","has","had","you","your","we","us","our","i","my","me",
  // Finance noise
  "amount","balance","total","entry","entries","period","close","report","data",
  "show","tell","get","want","need","please","help",
]);

function extractKeywords(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const words = text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [];
  for (const w of words) {
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

/** Cheap stemmer — strip a few common English suffixes for better overlap. */
function stem(w: string): string {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("es")  && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s")   && w.length > 3) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed")  && w.length > 4) return w.slice(0, -2);
  return w;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatAddendum(items: KnowledgeContextItem[]): string {
  const lines: string[] = [
    "",
    "## Things this organisation has previously confirmed",
    "(Use these as authoritative context — they were confirmed by the org's CA. Don't re-litigate them.)",
    "",
  ];
  for (const item of items) {
    const verdictTag = item.verdict === "NORMAL"      ? "✓ NORMAL"
                    : item.verdict === "INVESTIGATE" ? "⚠ INVESTIGATE"
                    : item.verdict === "ANNOTATED"   ? "📝 ANNOTATED"
                    : "?";
    const simTag = typeof item.similarity === "number"
      ? `, similarity ${(item.similarity * 100).toFixed(0)}%`
      : "";
    lines.push(`• [${verdictTag}, confirmed ${item.reaffirmationCount}×${simTag}] ${item.context}`);
    lines.push(`  → ${item.answer}`);
    if (item.annotation) lines.push(`  → Note: ${item.annotation}`);
  }
  return lines.join("\n");
}

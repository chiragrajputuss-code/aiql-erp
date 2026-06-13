/**
 * PII-safe LLM call wrapper.
 *
 * Every external LLM call from close-engine MUST go through this wrapper.
 * Direct `fetch("https://api.groq.com/...")` calls are forbidden — a CI lint
 * is in place to catch them (see scripts/lint-llm-calls).
 *
 * Pipeline:
 *   1. Tokenise the user-supplied content (vendors / customers / amounts /
 *      account names → opaque tokens)
 *   2. Send the tokenised text to the LLM
 *   3. Detokenise the response so the caller sees the original values
 *   4. Emit a structured audit trail recording what was masked
 *
 * The system prompt is NEVER tokenised — it's our prompt, it doesn't contain
 * customer PII. Only the dynamic user/data content gets masked.
 */

import { tokenise } from "./index";
import { detokeniseFromMap } from "./detokeniser";
import type { TokenisationConfig } from "./types";

export interface SafeLlmRequest {
  /** OpenAI-compatible endpoint URL. Must use HTTPS. */
  endpoint:    string;
  /** Bearer auth token. */
  apiKey:      string;
  /** Model identifier passed to the LLM. */
  model:       string;
  /** System prompt — NOT tokenised. Our static prompt. */
  systemPrompt: string;
  /** User content — tokenised before send. May contain PII. */
  userContent: string;
  /** Optional max tokens for the LLM response. */
  maxTokens?:  number;
  /** Optional temperature. */
  temperature?: number;
  /** Force JSON-mode response if the provider supports it. */
  jsonMode?:   boolean;
  /** Override masking config (defaults to STANDARD profile). */
  tokeniseConfig?: Partial<TokenisationConfig>;
  /** Request timeout in ms (default 8000). */
  timeoutMs?:  number;
}

export interface SafeLlmAuditEntry {
  category: string;
  count:    number;
}

export interface SafeLlmResponse {
  /** The detokenised response content (original values restored). */
  content:  string;
  /** Tokens emitted by the model. */
  tokensIn: number;
  tokensOut: number;
  /** What we masked, by category. Useful for compliance audit. */
  audit:    SafeLlmAuditEntry[];
  /** True if the model returned valid JSON (jsonMode requests). */
  isJson:   boolean;
}

/**
 * Issue an LLM request with PII tokenisation in/out.
 *
 * Returns null on transport / parsing failure (caller should treat as a
 * downgrade and fall back to whatever non-LLM path it has).
 */
export async function safeLlmCall(req: SafeLlmRequest): Promise<SafeLlmResponse | null> {
  if (!req.endpoint.startsWith("https://")) {
    throw new Error("[safeLlmCall] endpoint must use HTTPS");
  }
  if (!req.apiKey) {
    return null;  // missing key — caller proceeds without LLM
  }

  // ── 1. Tokenise the user content ──────────────────────────────────────
  const tk = tokenise(req.userContent, req.tokeniseConfig ?? {});
  const audit: SafeLlmAuditEntry[] = aggregateAudit(tk.auditLog);

  // ── 2. Call LLM with tokenised content ────────────────────────────────
  let raw: string;
  let usage: { prompt_tokens?: number; completion_tokens?: number } = {};
  try {
    const res = await fetch(req.endpoint, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:    req.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user",   content: tk.tokenised },
        ],
        max_tokens:  req.maxTokens ?? 600,
        temperature: req.temperature ?? 0.2,
        ...(req.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?:   { prompt_tokens?: number; completion_tokens?: number };
    };
    raw = data.choices?.[0]?.message?.content ?? "";
    usage = data.usage ?? {};
  } catch {
    return null;
  }

  // ── 3. Detokenise the response ────────────────────────────────────────
  const restored = detokeniseFromMap(raw, { getMap: () => tk.tokenMap });

  // ── 4. JSON validity check (best-effort, only when jsonMode requested) ─
  let isJson = false;
  if (req.jsonMode) {
    try { JSON.parse(restored); isJson = true; } catch { isJson = false; }
  }

  // ── 5. Audit log (structured, picked up by log aggregation) ───────────
  emitAudit({
    endpoint:   sanitiseEndpointForLog(req.endpoint),
    model:      req.model,
    audit,
    tokensIn:   usage.prompt_tokens ?? 0,
    tokensOut:  usage.completion_tokens ?? 0,
  });

  return {
    content:   restored,
    tokensIn:  usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    audit,
    isJson,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface AuditLogItem { category?: string }

function aggregateAudit(entries: AuditLogItem[]): SafeLlmAuditEntry[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const cat = e.category ?? "UNKNOWN";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}

function sanitiseEndpointForLog(endpoint: string): string {
  // Strip query strings + path-level secrets if any
  try {
    const u = new URL(endpoint);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch { return endpoint; }
}

function emitAudit(payload: {
  endpoint:  string;
  model:     string;
  audit:     SafeLlmAuditEntry[];
  tokensIn:  number;
  tokensOut: number;
}): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  // eslint-disable-next-line no-console
  console.log("[safe-llm]", JSON.stringify({
    ...payload,
    masked_count: payload.audit.reduce((sum, a) => sum + a.count, 0),
    ts: new Date().toISOString(),
  }));
}

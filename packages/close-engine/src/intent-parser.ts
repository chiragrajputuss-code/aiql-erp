/**
 * Close-Period Intent Parser
 *
 * Takes a user's free-text prompt (in English / Hindi / Hinglish) and converts
 * it into a structured `CloseIntent` that the task generator can consume.
 *
 * Layered execution:
 *   Layer 1 — keyword/heuristic match (zero LLM cost) for short, obvious prompts
 *   Layer 2 — Groq Llama 3.3 70B with JSON-mode (free) for the rest
 *   Layer 3 — graceful degradation if neither produces a usable result
 *
 * The output is always a valid `CloseIntent` — never throws on bad input.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CloseFocusArea =
  | "bank"
  | "cash"
  | "ar"
  | "ap"
  | "gst"
  | "tds"
  | "inventory"
  | "salary"
  | "expenses"
  | "fixed_assets"
  | "loans"
  | "owners_equity"
  | "intercompany"
  | "fx"
  | "flux"
  | "other";

/** Standard task keys (or categories) the user wants to skip. */
export type ExclusionKey =
  | "flux-analysis"
  | "bs-review"
  | "pl-review"
  | "inventory-recon"
  | "gst-recon"
  | "ap-recon"
  | "ar-recon"
  | "bank-recon";

export interface CloseIntent {
  /** High-level functional areas the user wants emphasised. */
  focusAreas: CloseFocusArea[];
  /** Account-name fragments the user explicitly called out (verbatim, lowercase). */
  watchAccounts: string[];
  /** Party/vendor/customer name fragments to deep-dive (e.g. "Ganesh Traders"). */
  watchParties: string[];
  /** Task keys / categories the user said to skip. */
  exclusions: ExclusionKey[];
  /** Narrative concerns to feed into AI review (e.g. "one-time bonus paid in March"). */
  riskFlags: string[];
  /** Specific one-off events worth flagging during flux analysis. */
  oneOffEvents: string[];
  /** Things the parser was unsure about — surface to the user as clarifying questions. */
  ambiguities: string[];
  /** 0–1 self-assessed confidence in the parse. */
  confidence: number;
  /** One-line summary of what the parser understood. Shown back to the user. */
  rationale: string;
  /** Which layer produced this result. Useful for telemetry. */
  source: "heuristic" | "llm" | "empty";
}

export interface IntentParseContext {
  /** Counts of accounts by type — helps the LLM stay grounded. */
  accountSummary?: {
    bank: number;
    ar: number;
    ap: number;
    tax: number;
    inventory: number;
  };
  /** Top scan issue codes (not full descriptions) to give the LLM situational awareness. */
  topIssues?: string[];
  /** Previous intent (memory of last close) — improves "same as last time" handling. */
  prevIntent?: CloseIntent;
  /** Override LLM model (for testing). */
  model?: string;
}

// ─── Imports ────────────────────────────────────────────────────────────────

import { safeLlmCall } from "@aiql/tokeniser";

// ─── Public entry point ─────────────────────────────────────────────────────

const EMPTY_INTENT: CloseIntent = {
  focusAreas:    [],
  watchAccounts: [],
  watchParties:  [],
  exclusions:    [],
  riskFlags:     [],
  oneOffEvents:  [],
  ambiguities:   [],
  confidence:    0,
  rationale:     "No specific intent provided — using standard close template.",
  source:        "empty",
};

// Allow-list for watch-account fragments. Account names legitimately contain
// Unicode letters + combining marks (Devanagari, Tamil etc), digits, spaces,
// and a small set of punctuation (e.g. "Petty Cash - Mumbai", "नकद - मुंबई").
//
// Security model: this fragment is interpolated into `LIKE '%${safe}%'` inside
// a single-quoted string literal. The decisive gate is forbidding the single
// quote — without it, no character can break out of the literal. We also
// forbid LIKE wildcards (% _) because they let the user steer the search,
// and we add a paranoia substring blacklist for SQL comment markers.
//
// Note: combining marks (\p{M}) are required for Indic scripts where vowel
// signs are stored as separate Unicode codepoints (e.g. "வங்கி" = வ + ங + ் + க + ி).
const SAFE_WATCH_ACCOUNT_RE = /^[\p{L}\p{M}\p{N} ._\-/&()]+$/u;
const FORBIDDEN_SUBSTRINGS = ["--", "/*", "*/"];
const MAX_WATCH_LEN = 50;

/**
 * Sanitise a single watch-account fragment. Returns null if the input is
 * unsafe (contains SQL metacharacters, excessive length, or empty after trim).
 *
 * Returns the trimmed input with **original casing preserved** so it displays
 * as the user typed it. SQL builders must lowercase at interpolation time.
 *
 * Exported so the task generator can apply the same gate as a defence-in-depth
 * second line of defence — any layer that builds SQL from a fragment must
 * pass the fragment through here first.
 */
export function sanitiseWatchAccount(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WATCH_LEN) return null;
  if (!SAFE_WATCH_ACCOUNT_RE.test(trimmed)) return null;
  for (const sub of FORBIDDEN_SUBSTRINGS) {
    if (trimmed.includes(sub)) return null;
  }
  return trimmed;
}

export async function parseUserIntent(
  userText: string,
  ctx: IntentParseContext = {}
): Promise<CloseIntent> {
  const t0 = Date.now();
  const trimmed = (userText ?? "").trim();
  if (trimmed.length === 0) {
    emitTelemetry({ source: "empty", latencyMs: Date.now() - t0, confidence: 0, inputChars: 0 });
    return EMPTY_INTENT;
  }

  const heuristic = heuristicParse(trimmed);
  if (heuristic && heuristic.confidence >= 0.85) {
    emitTelemetry({
      source: "heuristic", latencyMs: Date.now() - t0,
      confidence: heuristic.confidence, inputChars: trimmed.length,
    });
    return heuristic;
  }

  const llm = await llmParse(trimmed, ctx).catch(() => null);
  if (llm) {
    emitTelemetry({
      source: "llm", latencyMs: Date.now() - t0,
      confidence: llm.confidence, inputChars: trimmed.length,
    });
    return llm;
  }

  if (heuristic) {
    emitTelemetry({
      source: "heuristic-fallback", latencyMs: Date.now() - t0,
      confidence: heuristic.confidence, inputChars: trimmed.length,
    });
    return heuristic;
  }

  emitTelemetry({ source: "empty-fallback", latencyMs: Date.now() - t0, confidence: 0, inputChars: trimmed.length });
  return {
    ...EMPTY_INTENT,
    watchParties: [],
    rationale: "Could not interpret the prompt. Falling back to standard close.",
  };
}

interface TelemetryEvent {
  source:     "heuristic" | "llm" | "heuristic-fallback" | "empty" | "empty-fallback";
  latencyMs:  number;
  confidence: number;
  inputChars: number;
}

function emitTelemetry(ev: TelemetryEvent): void {
  // Structured log line — picked up by log aggregation; cheap no-op in tests.
  // Disabled by default in test envs to keep output clean.
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  // Use stderr so the line doesn't pollute callers that pipe stdout (e.g. validation
  // harness writes a Markdown report to stdout).
  // eslint-disable-next-line no-console
  console.error("[intent-parser]", JSON.stringify({ ...ev, ts: new Date().toISOString() }));
}

// ─── Layer 1: heuristic ──────────────────────────────────────────────────────

const FOCUS_KEYWORDS: Array<{ words: string[]; area: CloseFocusArea }> = [
  { words: ["bank", "banking"],                        area: "bank"          },
  { words: ["cash", "petty cash", "नकद"],              area: "cash"          },
  { words: ["receivable", "ar", "debtor", "customer"], area: "ar"            },
  { words: ["payable", "ap", "creditor", "vendor"],    area: "ap"            },
  { words: ["gst", "cgst", "sgst", "igst"],            area: "gst"           },
  { words: ["tds", "tcs"],                             area: "tds"           },
  { words: ["inventory", "stock", "स्टॉक"],            area: "inventory"     },
  { words: ["salary", "payroll", "wages", "वेतन"],     area: "salary"        },
  { words: ["expense", "expenses"],                    area: "expenses"      },
  { words: ["fixed asset", "depreciation", "asset"],   area: "fixed_assets"  },
  { words: ["loan", "borrowing"],                      area: "loans"         },
  { words: ["equity", "capital", "share"],             area: "owners_equity" },
  { words: ["intercompany", "group company"],          area: "intercompany"  },
  { words: ["fx", "forex", "foreign exchange"],        area: "fx"            },
  { words: ["flux", "variance", "comparison"],         area: "flux"          },
];

const EXCLUSION_PATTERNS: Array<{ re: RegExp; key: ExclusionKey }> = [
  { re: /skip\s+flux|no\s+flux|don'?t\s+(do|run)\s+flux/i,            key: "flux-analysis"   },
  { re: /skip\s+(bs|balance\s*sheet)|no\s+balance\s*sheet/i,          key: "bs-review"       },
  { re: /skip\s+(pl|p&l|profit\s*loss)|no\s+(pl|p&l)/i,               key: "pl-review"       },
  { re: /skip\s+inventory|no\s+inventory/i,                            key: "inventory-recon" },
  { re: /skip\s+gst|no\s+gst/i,                                        key: "gst-recon"       },
];

// Words that signal an account name rather than a party/vendor name.
// If a quoted string contains any of these, it goes to watchAccounts; otherwise watchParties.
const ACCOUNT_SIGNAL_WORDS = [
  "a/c", "account", "bank", "cash", "ledger", "fund", "reserve",
  "payable", "receivable", "creditor", "debtor", "gst", "igst",
  "cgst", "sgst", "tds", "input", "output", "equity", "capital",
  "stock", "inventory", "suspense", "clearing", "holding", "temp",
  // Common Indian GL account name fragments
  "salary", "salaries", "wages", "advance", "bonus", "gratuity",
  "depreciation", "provision", "accrual", "prepaid", "expense",
  "income", "revenue", "sales", "purchase", "loan", "overdraft",
];

function looksLikeAccountName(fragment: string): boolean {
  const low = fragment.toLowerCase();
  return ACCOUNT_SIGNAL_WORDS.some((w) => low.includes(w));
}

function heuristicParse(text: string): CloseIntent | null {
  const lower = text.toLowerCase();
  const focusAreas: CloseFocusArea[] = [];
  const exclusions: ExclusionKey[] = [];

  for (const { words, area } of FOCUS_KEYWORDS) {
    if (words.some((w) => lower.includes(w)) && !focusAreas.includes(area)) {
      focusAreas.push(area);
    }
  }

  for (const { re, key } of EXCLUSION_PATTERNS) {
    if (re.test(text) && !exclusions.includes(key)) exclusions.push(key);
  }

  // Quoted strings → split into watchAccounts (GL account names) vs watchParties
  // (vendor/customer names). Account names contain words like "A/c", "Bank", "GST";
  // party names are proper nouns like "Ganesh Traders Pvt Ltd".
  const watchAccounts: string[] = [];
  const watchParties:  string[] = [];
  const seenLower = new Set<string>();

  const quoted = text.match(/"([^"]{2,50})"/g) ?? [];
  for (const q of quoted) {
    const cleaned = sanitiseWatchAccount(q.slice(1, -1));
    if (!cleaned) continue;
    const dedupeKey = cleaned.toLowerCase();
    if (seenLower.has(dedupeKey)) continue;
    seenLower.add(dedupeKey);
    if (looksLikeAccountName(cleaned)) {
      watchAccounts.push(cleaned);
    } else {
      watchParties.push(cleaned);
    }
  }

  // Unquoted party hints: "check <Name>" / "verify <Name>" / "deep.dive <Name>"
  // Matches 2-4 capitalised words after a trigger verb (not at line start alone).
  const partyHintRe =
    /(?:check|verify|deep[- ]?dive|review|look at|investigate)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z&.]+){0,3}(?:\s+(?:Pvt|Ltd|LLP|Inc|Co|Bros|Group|Industries|Enterprises|Traders|Agencies|Services|Works|Mills|Suppliers)\.?)?)/g;
  let m: RegExpExecArray | null;
  while ((m = partyHintRe.exec(text)) !== null) {
    const raw = m[1].trim();
    const cleaned = sanitiseWatchAccount(raw);
    if (!cleaned) continue;
    const dedupeKey = cleaned.toLowerCase();
    if (seenLower.has(dedupeKey)) continue;
    seenLower.add(dedupeKey);
    watchParties.push(cleaned);
  }

  if (
    focusAreas.length === 0 &&
    exclusions.length === 0 &&
    watchAccounts.length === 0 &&
    watchParties.length === 0
  ) {
    return null;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const isShortPrompt = wordCount <= 12;
  const matchesEverything =
    (focusAreas.length > 0 || exclusions.length > 0 || watchAccounts.length > 0 || watchParties.length > 0) &&
    wordCount <= focusAreas.length * 4 + exclusions.length * 4 + (watchAccounts.length + watchParties.length) * 6 + 6;

  const confidence = matchesEverything && isShortPrompt ? 0.9 : 0.6;

  return {
    focusAreas,
    watchAccounts,
    watchParties,
    exclusions,
    riskFlags:    [],
    oneOffEvents: [],
    ambiguities:  [],
    confidence,
    rationale:    summarise({ focusAreas, exclusions, watchAccounts, watchParties }),
    source:       "heuristic",
  };
}

function summarise(p: {
  focusAreas: CloseFocusArea[];
  exclusions: ExclusionKey[];
  watchAccounts: string[];
  watchParties?: string[];
}): string {
  const parts: string[] = [];
  if (p.focusAreas.length > 0)            parts.push(`focus on ${p.focusAreas.join(", ")}`);
  if (p.watchAccounts.length > 0)         parts.push(`watch ${p.watchAccounts.length} account(s)`);
  if ((p.watchParties ?? []).length > 0)  parts.push(`deep-dive ${p.watchParties!.length} party/vendor(s)`);
  if (p.exclusions.length > 0)            parts.push(`skip ${p.exclusions.join(", ")}`);
  return parts.length > 0 ? `Will ${parts.join("; ")}.` : "No specific changes detected.";
}

// ─── Layer 2: LLM ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You parse close-period instructions from Indian SME finance teams.
Output STRICT JSON only with these fields:
{
  "focusAreas":    string[],   // subset of: bank, cash, ar, ap, gst, tds, inventory, salary, expenses, fixed_assets, loans, owners_equity, intercompany, fx, flux, other
  "watchAccounts": string[],   // GL account-name FRAGMENTS the user mentioned (e.g. "HDFC Bank", "CGST Input") — ≤50 chars each
  "watchParties":  string[],   // vendor/customer/party NAME FRAGMENTS the user wants a deep-dive on (e.g. "Ganesh Traders", "Shree Services") — ≤50 chars each
  "exclusions":    string[],   // subset of: flux-analysis, bs-review, pl-review, inventory-recon, gst-recon, ap-recon, ar-recon, bank-recon
  "riskFlags":     string[],   // narrative concerns to surface in AI review (max 5)
  "oneOffEvents":  string[],   // specific one-time events worth flagging in flux (max 5)
  "ambiguities":   string[],   // questions to ask back if anything is unclear (max 3)
  "confidence":    number,     // 0-1 — your certainty in this parse
  "rationale":     string      // single sentence summary
}

Rules:
- Be conservative. Only include items the user explicitly mentioned.
- The user may write English, Hindi, or Hinglish — handle all three.
- "skip X" or "don't do X" → push to exclusions.
- GL account names (HDFC Bank A/c, CGST Input, Sundry Debtors) → push to watchAccounts.
- Vendor/customer/party names (Ganesh Traders, Shree Services LLP, Maa Mills) → push to watchParties.
- "check Ganesh Traders ITC" → watchParties: ["Ganesh Traders"], focusAreas: ["gst"].
- "we paid bonus in March" / "one-time refund" → push to oneOffEvents.
- "GST changed mid-month" → push to riskFlags.
- If the prompt is vague, set confidence ≤ 0.4 and add to ambiguities.
- NEVER invent accounts, parties, events, or risks not in the user text.`;

async function llmParse(
  text: string,
  ctx: IntentParseContext
): Promise<CloseIntent | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const ctxLines: string[] = [];
  if (ctx.accountSummary) {
    ctxLines.push(
      `Available data: ${ctx.accountSummary.bank} bank, ${ctx.accountSummary.ar} AR, ` +
      `${ctx.accountSummary.ap} AP, ${ctx.accountSummary.tax} tax, ${ctx.accountSummary.inventory} inventory account(s).`
    );
  }
  if (ctx.topIssues && ctx.topIssues.length > 0) {
    ctxLines.push(`Detected issues: ${ctx.topIssues.slice(0, 5).join(", ")}.`);
  }
  if (ctx.prevIntent && ctx.prevIntent.focusAreas.length > 0) {
    ctxLines.push(`Last close focused on: ${ctx.prevIntent.focusAreas.join(", ")}.`);
  }

  const userPrompt =
    (ctxLines.length > 0 ? `Context:\n${ctxLines.join("\n")}\n\n` : "") +
    `User instruction:\n${text}\n\nReturn JSON only.`;

  // PII-safe wrapper — tokenises userPrompt before sending, detokenises response.
  // Forbids us from leaking real vendor/customer/employee names to Groq.
  const result = await safeLlmCall({
    endpoint:     "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model:        ctx.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    systemPrompt: SYSTEM_PROMPT,
    userContent:  userPrompt,
    temperature:  0.1,
    maxTokens:    600,
    jsonMode:     true,
    timeoutMs:    8_000,
  });

  if (!result || !result.content) return null;
  return normaliseLlmOutput(result.content);
}

const ALLOWED_FOCUS = new Set<string>([
  "bank","cash","ar","ap","gst","tds","inventory","salary","expenses",
  "fixed_assets","loans","owners_equity","intercompany","fx","flux","other",
]);
const ALLOWED_EXCLUSIONS = new Set<string>([
  "flux-analysis","bs-review","pl-review","inventory-recon","gst-recon",
  "ap-recon","ar-recon","bank-recon",
]);

function normaliseLlmOutput(raw: string): CloseIntent | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const strArr = (k: string, max: number, dedupeLower = false): string[] => {
    const v = parsed[k];
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of v) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = dedupeLower ? trimmed.toLowerCase() : trimmed;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(dedupeLower ? key : trimmed);
      if (out.length >= max) break;
    }
    return out;
  };

  const focusAreas = strArr("focusAreas", 8, true).filter((s) => ALLOWED_FOCUS.has(s)) as CloseFocusArea[];
  const exclusions = strArr("exclusions", 8, true).filter((s) => ALLOWED_EXCLUSIONS.has(s)) as ExclusionKey[];

  // Both watchAccounts and watchParties pass through the same SQL-safety allow-list
  // (sanitiseWatchAccount) — the LLM output is untrusted as it's partly derived from
  // user text, and both fields are interpolated into LIKE patterns.
  const sanitiseList = (key: string, limit: number): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of strArr(key, limit, false)) {
      const cleaned = sanitiseWatchAccount(raw);
      if (!cleaned) continue;
      const k = cleaned.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(cleaned);
    }
    return out;
  };

  const watchAccounts = sanitiseList("watchAccounts", 20);
  const watchParties  = sanitiseList("watchParties", 10);
  const riskFlags     = strArr("riskFlags", 5);
  const oneOffEvents  = strArr("oneOffEvents", 5);
  const ambiguities   = strArr("ambiguities", 3);

  const conf = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.5;
  const rationale = typeof parsed.rationale === "string" && parsed.rationale.trim().length > 0
    ? parsed.rationale.trim().slice(0, 200)
    : summarise({ focusAreas, exclusions, watchAccounts, watchParties });

  return {
    focusAreas,
    watchAccounts,
    watchParties,
    exclusions,
    riskFlags,
    oneOffEvents,
    ambiguities,
    confidence: conf,
    rationale,
    source:     "llm",
  };
}

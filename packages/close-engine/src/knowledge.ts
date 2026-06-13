/**
 * Knowledge base helpers — pattern-key derivation + lookup contract.
 *
 * The "is this normal?" feedback loop captures CA decisions about anomalies
 * and stores them as `OrgBusinessKnowledge` rows. To match a future occurrence
 * of the same anomaly to a stored answer, we derive a deterministic
 * **pattern key** from the anomaly's signature.
 *
 * Pattern keys are deliberately specific enough to be safe (we don't want
 * "salary issue in March" to auto-resolve "salary issue in October") but
 * loose enough to match recurring patterns (a salary anomaly in March 2026
 * should match the answer captured in March 2025).
 *
 * Key shapes:
 *   scan:<issueCode>                                     — same scan code, same connection
 *   recon:<reconKey>                                     — same recon template
 *   flux:<accountSlug>:<periodLabel>:<directionTag>      — same account, same calendar period, same up/down
 *   agent:<agentType>:<questionHash>                     — same agent question (content hash)
 *
 * connectionId is part of the row's uniqueness — keys don't include it.
 */

// ─── Pattern-key shape ──────────────────────────────────────────────────────

export type KnowledgeSource =
  | "SCAN_ISSUE"
  | "RECONCILIATION"
  | "FLUX_VARIANCE"
  | "AGENT_QUESTION"
  | "MANUAL";

export interface KnowledgeKey {
  patternKey: string;
  source:     KnowledgeSource;
  /** Loose source reference, kept alongside pattern key for context display. */
  sourceRef:  Record<string, unknown>;
}

// ─── Derivers ───────────────────────────────────────────────────────────────

export function patternKeyForScanIssue(args: {
  issueCode: string;
  /** Optional finer-grained narrowing — accountName for sign-anomalies, etc. */
  accountName?: string;
}): KnowledgeKey {
  const code = slug(args.issueCode);
  const acct = args.accountName ? `:${slug(args.accountName)}` : "";
  return {
    patternKey: `scan:${code}${acct}`,
    source:     "SCAN_ISSUE",
    sourceRef:  {
      issueCode:   args.issueCode,
      accountName: args.accountName,
    },
  };
}

export function patternKeyForRecon(args: {
  /** The recon template's name. Stable across periods. */
  reconName: string;
}): KnowledgeKey {
  return {
    patternKey: `recon:${slug(args.reconName)}`,
    source:     "RECONCILIATION",
    sourceRef:  { reconName: args.reconName },
  };
}

export function patternKeyForFlux(args: {
  accountName: string;
  /** ISO date OR a Date object — month-of-year used for periodicity matching. */
  periodEnd:   string | Date;
  /** "increase" or "decrease" — flagging the same direction. */
  direction:   "increase" | "decrease";
}): KnowledgeKey {
  const acct = slug(args.accountName);
  const month = monthLabel(args.periodEnd);
  return {
    patternKey: `flux:${acct}:${month}:${args.direction}`,
    source:     "FLUX_VARIANCE",
    sourceRef:  {
      accountName: args.accountName,
      periodEnd:   typeof args.periodEnd === "string" ? args.periodEnd : args.periodEnd.toISOString(),
      direction:   args.direction,
    },
  };
}

export function patternKeyForAgentQuestion(args: {
  agentType: string;          // e.g. "pl_review"
  question:  string;          // raw question text
}): KnowledgeKey {
  return {
    patternKey: `agent:${slug(args.agentType)}:${shortHash(args.question)}`,
    source:     "AGENT_QUESTION",
    sourceRef:  { agentType: args.agentType, question: args.question },
  };
}

export function patternKeyForManual(args: {
  topic: string;
}): KnowledgeKey {
  return {
    patternKey: `manual:${slug(args.topic)}`,
    source:     "MANUAL",
    sourceRef:  { topic: args.topic },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "unknown";
}

const MONTHS = [
  "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
];

function monthLabel(periodEnd: string | Date): string {
  const d = typeof periodEnd === "string" ? new Date(periodEnd) : periodEnd;
  if (isNaN(d.getTime())) return "unknown";
  return MONTHS[d.getUTCMonth()] ?? "unknown";
}

/**
 * Short, stable, non-cryptographic hash for free-text questions.
 * 8-char base36 fingerprint — enough collision resistance for a per-org keyspace
 * while keeping the pattern key short.
 */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;  // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);  // FNV prime
  }
  // Force unsigned 32-bit, then base36, padded/truncated to a fixed 8 chars
  return ((h >>> 0).toString(36)).padStart(8, "0").slice(0, 8);
}

// ─── History entry shape (stored as JSON in OrgBusinessKnowledge.historyJson) ─

export interface KnowledgeHistoryEntry {
  askedAt:    string;             // ISO
  answeredAt: string;              // ISO
  verdict:    "NORMAL" | "INVESTIGATE" | "ANNOTATED" | "REJECTED";
  annotation: string | null;
  /** Optional period this Q&A was tied to (close period id). */
  periodId?:  string;
}

export function appendHistory(
  existingJson: string | null | undefined,
  entry: KnowledgeHistoryEntry,
  cap = 20
): string {
  let history: KnowledgeHistoryEntry[] = [];
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson) as unknown;
      if (Array.isArray(parsed)) {
        history = parsed.filter(isHistoryEntry);
      }
    } catch { /* ignore malformed */ }
  }
  history.push(entry);
  // Keep the most recent `cap` entries
  if (history.length > cap) history = history.slice(history.length - cap);
  return JSON.stringify(history);
}

function isHistoryEntry(v: unknown): v is KnowledgeHistoryEntry {
  return (
    typeof v === "object" && v !== null &&
    typeof (v as KnowledgeHistoryEntry).askedAt === "string" &&
    typeof (v as KnowledgeHistoryEntry).answeredAt === "string"
  );
}

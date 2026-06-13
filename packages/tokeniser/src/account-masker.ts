import type { TokenMap } from "./token-map";

// ─── Default GL account code patterns ────────────────────────────────────────
//  4000            → plain 4-digit
//  4000-100        → segmented with dash
//  4000-100-300    → two-level segmented
//  4000.100.300    → period-separated
//  AC-4000 / GL-2000 → prefixed

const DEFAULT_ACCOUNT_RE =
  /\b(?:(?:AC|GL)-)?(\d{4})(?:[-.](\d{2,3})(?:[-.](\d{2,3}))?)?\b/g;

export interface DetectedAccount {
  originalText: string;
  position: { start: number; end: number };
}

export function detectAccounts(text: string, accountPattern?: string): DetectedAccount[] {
  const re = accountPattern
    ? new RegExp(accountPattern, "g")
    : new RegExp(DEFAULT_ACCOUNT_RE.source, "g");

  const results: DetectedAccount[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({
      originalText: m[0],
      position: { start: m.index, end: m.index + m[0].length },
    });
  }
  return results;
}

/**
 * Replace all GL account codes in `text` with ACCT_T001, ACCT_T002, etc.
 * Uses the provided TokenMap so the same code always gets the same token.
 */
export function maskAccounts(text: string, map: TokenMap, accountPattern?: string): string {
  const accounts = detectAccounts(text, accountPattern);
  if (accounts.length === 0) return text;

  // Process from end → start to preserve indices
  let result = text;
  for (const acct of [...accounts].reverse()) {
    const token = map.addToken("ACCT", acct.originalText);
    result =
      result.slice(0, acct.position.start) +
      token +
      result.slice(acct.position.end);
  }
  return result;
}

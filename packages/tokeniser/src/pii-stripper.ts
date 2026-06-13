import type { StrippedPII } from "./types";

// ─── Result type ──────────────────────────────────────────────────────────────

export interface StripResult {
  text: string;
  strippedCount: number;
  strippedItems: StrippedPII[];
}

// ─── PII patterns ─────────────────────────────────────────────────────────────

interface PiiPattern {
  type: StrippedPII["type"];
  re: RegExp;
}

const PATTERNS: PiiPattern[] = [
  // GSTIN must come before PAN — GSTIN contains PAN as substring
  {
    type: "GSTIN",
    // 2 digits + 5 letters + 4 digits + 1 letter + 1 digit + Z + 1 checksum = 15 chars
    re: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/g,
  },
  {
    type: "PAN",
    // 5 uppercase letters + 4 digits + 1 uppercase letter, word-bounded
    re: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  },
  {
    type: "AADHAAR",
    // XXXX XXXX XXXX or XXXXXXXXXXXX (12 digits, optional spaces every 4)
    re: /\b\d{4}\s\d{4}\s\d{4}\b|\b\d{12}\b/g,
  },
  {
    type: "SSN",
    // XXX-XX-XXXX or 9 digits (standalone)
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: "EIN",
    // XX-XXXXXXX
    re: /\b\d{2}-\d{7}\b/g,
  },
  {
    type: "BANK_ACCOUNT",
    // "account" followed by 8–16 digit number (real bank accounts, not 4-digit GL codes)
    // OR masked pattern ***XXXX
    re: /\baccount\b[\w\s#:]{0,30}?\b(\d{8,16})\b|\*{2,}\d{4,}/gi,
  },
  {
    type: "PHONE",
    // +91-XXXXXXXXXX or +91 XXXXXXXXXX
    // (XXX) XXX-XXXX  (US format)
    // 10-digit Indian mobile starting with 6-9
    re: /(?:\+91[-\s]?\d{10}|\(\d{3}\)\s?\d{3}-\d{4}|\b[6-9]\d{9}\b)/g,
  },
  {
    type: "EMAIL",
    // Only strip when preceded by employee/PII context words
    re: /\b(?:email|e-mail|mail|contact|employee|emp|hr|staff)\b[:\s]+[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
  },
];

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Strip PII from text. Stripping is IRREVERSIBLE — data is removed entirely,
 * not tokenised. The returned text is safe to pass to the tokeniser pipeline.
 *
 * Patterns run longest-match first (GSTIN before PAN) to avoid partial strips.
 */
export function stripPII(text: string): StripResult {
  const items: StrippedPII[] = [];
  let working = text;

  // Each pattern runs on the already-modified `working` string.
  // Since GSTIN runs before PAN, GSTIN gets stripped first and PAN
  // won't re-match the already-removed substring.
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    const matches: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(working)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length });
    }
    // Replace end → start so indices within this pass stay valid
    for (const { start, end } of [...matches].reverse()) {
      items.push({ type, position: { start, end } });
      working = working.slice(0, start) + working.slice(end);
    }
  }

  return {
    text: working.replace(/\s{2,}/g, " ").trim(),
    strippedCount: items.length,
    strippedItems: items,
  };
}

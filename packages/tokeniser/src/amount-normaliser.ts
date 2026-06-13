import type { DetectedAmount } from "./types";

type Position = { start: number; end: number };

// ─── Currency symbol → code ───────────────────────────────────────────────────

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  "₹": "INR", "Rs": "INR", "Rs.": "INR",
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function overlaps(a: Position, b: Position) {
  return a.start < b.end && b.start < a.end;
}

function parseCommaNumber(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

function parseEuropean(s: string): number {
  // European: periods = thousands, comma = decimal  →  swap then parse
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function collectMatches(
  text: string,
  re: RegExp,
  parser: (m: RegExpExecArray) => DetectedAmount | null,
  used: Position[]
): DetectedAmount[] {
  const results: DetectedAmount[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const pos: Position = { start: m.index, end: m.index + m[0].length };
    if (used.some((u) => overlaps(u, pos))) continue;
    const parsed = parser(m);
    if (parsed) {
      results.push(parsed);
      used.push(pos);
    }
  }
  return results;
}

// ─── Pattern groups (most specific → least specific) ─────────────────────────

// 1. ₹ / Rs with crore abbreviated: ₹10Cr, Rs.5Cr
const RE_INR_CRORE = /(?:₹|Rs\.?\s*)(\d+(?:\.\d+)?)\s*Cr\b/gi;
// 2. ₹ / Rs with lakh abbreviated: ₹5L, Rs.2.5L
const RE_INR_LAKH = /(?:₹|Rs\.?\s*)(\d+(?:\.\d+)?)\s*L\b/gi;
// 3. Spelled-out crore: 10 crore, 5.5 crores, 10 karod
const RE_CRORE_SPELLED = /(\d+(?:\.\d+)?)\s*(?:crores?|karod)\b/gi;
// 4. Spelled-out lakh: 5 lakh, 2.5 lakhs
const RE_LAKH_SPELLED = /(\d+(?:\.\d+)?)\s*(?:lakhs?)\b/gi;
// 5. $ with B/M/K: $1B, $2.5M, $50K
const RE_USD_ABBR = /\$\s*(\d+(?:\.\d+)?)\s*([BMK])\b/gi;
// 6. ₹/Rs with Indian comma grouping: ₹1,23,456.78
const RE_INR_FULL = /(?:₹|Rs\.?\s*)(\d{1,2}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
// 7. $ US format: $1,234.56
const RE_USD_FULL = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g;
// 8. € European: €1.234,56
const RE_EUR_FULL = /€\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/g;
// 9. £ UK format: £1,234.56
const RE_GBP_FULL = /£\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g;
// 10. Number with currency code: 1234.56 USD
const RE_WITH_CODE = /\b(\d[\d,.]*)\s+(USD|INR|EUR|GBP)\b/gi;
// 11. Plain numbers > 1000 adjacent to financial keywords (keyword THEN number)
const RE_KEYWORD_BEFORE =
  /\b(?:amount|balance|total|revenue|expense|cost|invoice|payment|over|under|above|below|exceeds|greater|less|baaki|raashi)\s+(?:of\s+)?(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?\b/gi;
// 12. Plain numbers > 1000 adjacent to financial keywords (number THEN keyword)
const RE_KEYWORD_AFTER =
  /\b(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?\s+(?:amount|balance|total|rupees?)\b/gi;

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectAmounts(text: string): DetectedAmount[] {
  const used: Position[] = [];
  const all: DetectedAmount[] = [];

  const MULTIPLIERS: Record<string, number> = { B: 1e9, M: 1e6, K: 1e3 };

  // 1. ₹ crore abbreviated
  all.push(...collectMatches(text, RE_INR_CRORE, (m) => ({
    originalText: m[0],
    numericValue: parseFloat(m[1]) * 1e7,
    currency: "INR",
    format: "indian-crore-abbr",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 2. ₹ lakh abbreviated
  all.push(...collectMatches(text, RE_INR_LAKH, (m) => ({
    originalText: m[0],
    numericValue: parseFloat(m[1]) * 1e5,
    currency: "INR",
    format: "indian-lakh-abbr",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 3. Spelled-out crore
  all.push(...collectMatches(text, RE_CRORE_SPELLED, (m) => ({
    originalText: m[0],
    numericValue: parseFloat(m[1]) * 1e7,
    currency: "INR",
    format: "indian-crore-spelled",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 4. Spelled-out lakh
  all.push(...collectMatches(text, RE_LAKH_SPELLED, (m) => ({
    originalText: m[0],
    numericValue: parseFloat(m[1]) * 1e5,
    currency: "INR",
    format: "indian-lakh-spelled",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 5. $ abbreviated
  all.push(...collectMatches(text, RE_USD_ABBR, (m) => ({
    originalText: m[0],
    numericValue: parseFloat(m[1]) * (MULTIPLIERS[m[2].toUpperCase()] ?? 1),
    currency: "USD",
    format: `us-${m[2].toUpperCase()}-abbr`,
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 6. ₹ full Indian
  all.push(...collectMatches(text, RE_INR_FULL, (m) => ({
    originalText: m[0],
    numericValue: parseCommaNumber(m[1]),
    currency: "INR",
    format: "indian",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 7. $ US full
  all.push(...collectMatches(text, RE_USD_FULL, (m) => ({
    originalText: m[0],
    numericValue: parseCommaNumber(m[1]),
    currency: "USD",
    format: "us",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 8. € European
  all.push(...collectMatches(text, RE_EUR_FULL, (m) => ({
    originalText: m[0],
    numericValue: parseEuropean(m[1]),
    currency: "EUR",
    format: "european",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 9. £ UK
  all.push(...collectMatches(text, RE_GBP_FULL, (m) => ({
    originalText: m[0],
    numericValue: parseCommaNumber(m[1]),
    currency: "GBP",
    format: "uk",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 10. Number with currency code
  all.push(...collectMatches(text, RE_WITH_CODE, (m) => ({
    originalText: m[0],
    numericValue: parseCommaNumber(m[1]),
    currency: m[2].toUpperCase(),
    format: "code-suffix",
    position: { start: m.index, end: m.index + m[0].length },
  }), used));

  // 11. Keyword before number
  all.push(...collectMatches(text, RE_KEYWORD_BEFORE, (m) => {
    // Capture group 1 is the number — find its position inside the full match
    const numStr = m[1];
    const numOffset = m[0].lastIndexOf(numStr);
    const start = m.index + numOffset;
    return {
      originalText: numStr,
      numericValue: parseCommaNumber(numStr),
      currency: "INR",
      format: "plain-keyword",
      position: { start, end: start + numStr.length },
    };
  }, used));

  // 12. Number before keyword
  all.push(...collectMatches(text, RE_KEYWORD_AFTER, (m) => {
    const numStr = m[1];
    return {
      originalText: numStr,
      numericValue: parseCommaNumber(numStr),
      currency: "INR",
      format: "plain-keyword",
      position: { start: m.index, end: m.index + numStr.length },
    };
  }, used));

  return all.sort((a, b) => a.position.start - b.position.start);
}

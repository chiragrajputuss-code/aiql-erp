// ─── Hindi / Hinglish financial keyword map ───────────────────────────────────
// Maps lowercase Hindi words to English equivalents for LLM preprocessing.

export const HINDI_KEYWORD_MAP: Record<string, string> = {
  // Query verbs
  dikhao: "show",
  batao: "tell",
  nikalo: "extract",
  laao: "get",
  dhoondo: "find",

  // Amounts & comparisons
  kitna: "how much",
  kitne: "how many",
  kul: "total",
  baaki: "outstanding",
  baki: "balance",
  raashi: "amount",
  upar: "above",
  neeche: "below",
  zyada: "more than",
  kam: "less than",

  // Time
  mahine: "month",
  mahina: "month",
  saal: "year",
  pichle: "last",
  agle: "next",
  abhi: "current",
  aaj: "today",

  // Prepositions
  se: "from",
  tak: "to",
  ke: "of",
  mein: "in",

  // Account terms
  khata: "account",
  jama: "credit",
  udhar: "debit",
  bhaari: "overdue",

  // Business / financial
  bikri: "sales",
  khareed: "purchase",
  kharcha: "expense",
  amdani: "income",
  munafa: "profit",
  nuksan: "loss",

  // Numbers / units
  karod: "crore",
  hazaar: "thousand",
  lakh: "lakh",
  rupaye: "rupees",

  // Entities
  vendor: "vendor",
  party: "vendor",
  dukan: "business",
  grahak: "customer",
  sabhi: "all",
};

// Match whole Hindi words — word boundary \b works for ASCII; for Devanagari we'd need a different approach
// These are Romanised Hindi (Hinglish) so word boundaries work fine
const HINDI_WORD_RE = new RegExp(
  `\\b(${Object.keys(HINDI_KEYWORD_MAP).join("|")})\\b`,
  "gi"
);

/**
 * Replace Hindi/Hinglish keywords with English equivalents.
 *
 * Capitalised words are treated as entity names and are NOT translated
 * (e.g. "Sharma Enterprises ka baaki" → "Sharma Enterprises ka outstanding").
 *
 * This is a preprocessing step — runs BEFORE tokenisation so the tokeniser
 * and LLM receive cleaner English queries.
 */
export function preprocessHinglish(text: string): string {
  return text.replace(HINDI_WORD_RE, (match) => {
    // Don't replace if the match starts with a capital letter (entity name heuristic)
    if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
      return match;
    }
    return HINDI_KEYWORD_MAP[match.toLowerCase()] ?? match;
  });
}

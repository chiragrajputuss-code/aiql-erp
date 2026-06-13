/**
 * Token-overlap similarity for financial queries.
 *
 * Works well for the constrained vocabulary of ERP finance questions
 * (vendor, aging, outstanding, monthly, etc.) without requiring embeddings.
 * Phase 2 will replace this with vector cosine similarity via pgvector.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "up",
  "about", "into", "through", "during", "before", "after", "above",
  "below", "between", "out", "off", "over", "under", "again", "further",
  "and", "but", "or", "nor", "so", "yet", "both", "either", "neither",
  "not", "only", "own", "same", "than", "too", "very", "just", "me",
  "my", "show", "give", "get", "list", "tell", "find", "all", "its",
  // Hindi/Hinglish stop words
  "ka", "ki", "ke", "ko", "se", "me", "hai", "hain", "tha", "the",
  "kya", "yeh", "woh", "aur", "ya", "jo", "jab", "tab",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Jaccard similarity with IDF-style boosting for rare financial terms.
 * Returns 0–1.
 */
export function textSimilarity(a: string, b: string): number {
  const ta = new Set(tokenise(a));
  const tb = new Set(tokenise(b));

  if (ta.size === 0 || tb.size === 0) return 0;

  const intersection = new Set([...ta].filter((t) => tb.has(t)));
  const union        = new Set([...ta, ...tb]);

  // Base Jaccard score
  const jaccard = intersection.size / union.size;

  // Boost for key financial terms that are highly discriminative
  const FINANCIAL_TERMS = new Set([
    "aging", "outstanding", "overdue", "payable", "receivable",
    "vendor", "customer", "debtor", "creditor", "balance",
    "revenue", "expense", "salary", "gst", "tds",
    "monthly", "quarterly", "annual", "weekly",
    "top", "highest", "lowest", "summary", "ledger",
    // Hindi equivalents
    "baaki", "udhar", "jama", "mahine", "saal", "bikri",
  ]);

  const sharedFinancialTerms = [...intersection].filter((t) => FINANCIAL_TERMS.has(t)).length;
  const boost = sharedFinancialTerms * 0.05; // 5% boost per shared financial term

  return Math.min(1, jaccard + boost);
}

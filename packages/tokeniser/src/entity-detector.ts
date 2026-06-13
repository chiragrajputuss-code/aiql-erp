import nlp from "compromise";
import type { DetectedEntity, EntityDictionary, TokenCategory } from "./types";

// ─── Accounting non-entities — never tokenise these ──────────────────────────

const ACCOUNTING_STOPWORDS = new Set([
  // Account types
  "AP", "AR", "GL", "PL", "BS",
  // Report names + common SQL table names (singular and plural)
  "Revenue", "Expense", "Expenses", "Balance", "Trial", "Journal",
  "Ledger", "Ledgers", "Voucher", "Vouchers",
  "Invoice", "Invoices", "Receipt", "Receipts",
  "Account", "Accounts", "Transaction", "Transactions",
  "Entry", "Entries", "Record", "Records", "Report", "Reports",
  // Finance terms
  "OPEX", "CAPEX", "EBITDA", "COGS", "PnL", "P&L",
  "Budget", "Forecast", "Variance", "Variances",
  // Accounting operations
  "Accrual", "Accruals", "Prepaid", "Depreciation", "Amortisation", "Amortization",
  // Account names
  "Cash", "Bank", "Payable", "Receivable", "Inventory",
  "Assets", "Liabilities", "Equity", "Capital",
  "Debit", "Debits", "Credit", "Credits",
  // Query words that compromise may tag as proper nouns
  "Show", "Get", "Find", "List", "Display", "Calculate",
  "Total", "Sum", "Count", "Average", "Group",
  // Common words
  "India", "March", "April", "June", "July", "August",
  "September", "October", "November", "December",
  "January", "February",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Q1", "Q2", "Q3", "Q4", "FY", "YTD", "MTD", "QTD",
]);

// ─── Context patterns for Pass 3 ─────────────────────────────────────────────

const CONTEXT_PATTERNS: Array<{ re: RegExp; category: TokenCategory }> = [
  { re: /\bvendor\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{2,50}?)(?=[,;.\n]|$)/gim, category: "VENDOR" },
  { re: /\bsupplier\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{2,50}?)(?=[,;.\n]|$)/gim, category: "VENDOR" },
  { re: /\bcustomer\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{2,50}?)(?=[,;.\n]|$)/gim, category: "CUSTOMER" },
  { re: /\bclient\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{2,50}?)(?=[,;.\n]|$)/gim, category: "CUSTOMER" },
  { re: /\bemployee\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{2,50}?)(?=[,;.\n]|$)/gim, category: "EMPLOYEE" },
  { re: /\bcompany\s*:\s*([A-Z][A-Za-z0-9\s&.,'-]{2,50}?)(?=[,;.\n]|$)/gim, category: "ENTITY" },
  {
    re: /\bfrom\s+([A-Z][A-Za-z0-9\s&.'-]{2,40}?)(?=\s+(?:for|to|and|or|in|at|on|with|by)|[,;.\n]|$)/gim,
    category: "ENTITY",
  },
  {
    re: /\bto\s+([A-Z][A-Za-z0-9\s&.'-]{2,40}?)(?=\s+(?:for|from|and|or|in|at|on|with|by)|[,;.\n]|$)/gim,
    category: "ENTITY",
  },
  {
    re: /\bfor\s+([A-Z][A-Za-z0-9\s&.'-]{2,40}?)(?=\s+(?:from|to|and|or|in|at|on|with|by)|[,;.\n]|$)/gim,
    category: "ENTITY",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0) as number[];
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
  }
  return d[m][n];
}

function findPosition(text: string, value: string): { start: number; end: number } | null {
  const idx = text.toLowerCase().indexOf(value.toLowerCase());
  if (idx === -1) return null;
  return { start: idx, end: idx + value.length };
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start < b.end && b.start < a.end;
}

// Pre-built lowercase set for O(1) case-insensitive lookup
const STOPWORDS_LOWER = new Set(
  Array.from(ACCOUNTING_STOPWORDS).map((w) => w.toLowerCase())
);

function isStopword(value: string): boolean {
  return STOPWORDS_LOWER.has(value.trim().toLowerCase());
}

// ─── Pass 1: Dictionary Match ─────────────────────────────────────────────────

function pass1Dictionary(text: string, dictionary: EntityDictionary): DetectedEntity[] {
  const results: DetectedEntity[] = [];

  const categoryMap: Array<{ list: string[]; category: TokenCategory }> = [
    { list: dictionary.vendors ?? [], category: "VENDOR" },
    { list: dictionary.customers ?? [], category: "CUSTOMER" },
    { list: dictionary.employees ?? [], category: "EMPLOYEE" },
    { list: dictionary.projects ?? [], category: "PROJECT" },
  ];

  for (const { list, category } of categoryMap) {
    // Sort longest-first to prevent "Acme" matching before "Acme Corp"
    const sorted = [...list].sort((a, b) => b.length - a.length);

    for (const term of sorted) {
      if (!term.trim()) continue;

      // Exact match (case-insensitive)
      const pos = findPosition(text, term);
      if (pos) {
        results.push({
          value: term,
          category,
          confidence: 1.0,
          method: "dictionary",
          position: pos,
        });
        continue;
      }

      // Fuzzy match — only for terms longer than 5 chars
      if (term.length > 5) {
        const termWords = term.split(/\s+/);
        const textTokens = text.match(/\S+/g) ?? [];

        for (let i = 0; i <= textTokens.length - termWords.length; i++) {
          const candidate = textTokens.slice(i, i + termWords.length).join(" ");
          const dist = levenshtein(term.toLowerCase(), candidate.toLowerCase());
          if (dist >= 1 && dist <= 2) {
            const fuzzyPos = findPosition(text, candidate);
            if (fuzzyPos) {
              results.push({
                value: candidate,
                category,
                confidence: 0.8,
                method: "dictionary",
                position: fuzzyPos,
              });
              break;
            }
          }
        }
      }
    }
  }

  return results;
}

// ─── Pass 2: NLP NER ──────────────────────────────────────────────────────────

function pass2NLP(text: string, alreadyFound: DetectedEntity[]): DetectedEntity[] {
  const results: DetectedEntity[] = [];
  const doc = nlp(text);

  type CompromiseMatch = { text: string; offset?: { start: number; length: number } };

  const nlpMatches: Array<{ value: string; category: TokenCategory }> = [];

  const orgs = doc.organizations().json({ offset: true }) as CompromiseMatch[];
  for (const m of orgs) {
    nlpMatches.push({ value: m.text.trim(), category: "ENTITY" });
  }

  const people = doc.people().json({ offset: true }) as CompromiseMatch[];
  for (const m of people) {
    nlpMatches.push({ value: m.text.trim(), category: "EMPLOYEE" });
  }

  // Proper nouns not captured as org/person
  const properNouns = doc
    .match("#ProperNoun+")
    .not("#Person")
    .not("#Organization")
    .json({ offset: true }) as CompromiseMatch[];
  for (const m of properNouns) {
    nlpMatches.push({ value: m.text.trim(), category: "ENTITY" });
  }

  for (const { value, category } of nlpMatches) {
    if (!value || value.length < 2) continue;
    if (isStopword(value)) continue;

    const pos = findPosition(text, value);
    if (!pos) continue;

    // Skip if already found in Pass 1
    const alreadyCovered = alreadyFound.some(
      (e) =>
        e.value.toLowerCase() === value.toLowerCase() || overlaps(e.position, pos)
    );
    if (alreadyCovered) continue;

    results.push({ value, category, confidence: 0.6, method: "nlp", position: pos });
  }

  return results;
}

// ─── Pass 3: Context Patterns ─────────────────────────────────────────────────

function pass3Context(text: string, alreadyFound: DetectedEntity[]): DetectedEntity[] {
  const results: DetectedEntity[] = [];

  for (const { re, category } of CONTEXT_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[1]?.trim();
      if (!value || value.length < 2) continue;
      if (isStopword(value)) continue;
      // Context patterns intend [A-Z] = uppercase first letter, but the `i` flag makes
      // it match lowercase too. Enforce the original intent manually.
      if (!/^[A-Z]/.test(value)) continue;

      const start = match.index + match[0].indexOf(value);
      const pos = { start, end: start + value.length };

      const alreadyCovered = alreadyFound.some(
        (e) =>
          e.value.toLowerCase() === value.toLowerCase() || overlaps(e.position, pos)
      );
      if (alreadyCovered) continue;

      results.push({ value, category, confidence: 0.5, method: "context", position: pos });
    }
  }

  return results;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface EntityDetectorOptions {
  dictionary?: EntityDictionary;
}

/**
 * Three-pass entity detection:
 *  1. Dictionary exact + fuzzy match (confidence 1.0 / 0.8)
 *  2. NLP NER via compromise.js (confidence 0.6)
 *  3. Context pattern extraction (confidence 0.5)
 *
 * Returns deduplicated DetectedEntity[] sorted by position.
 */
export function detectEntities(
  text: string,
  options: EntityDetectorOptions = {}
): DetectedEntity[] {
  if (!text.trim()) return [];

  const pass1 = pass1Dictionary(text, options.dictionary ?? { vendors: [], customers: [], employees: [] });
  const pass2 = pass2NLP(text, pass1);
  const pass3 = pass3Context(text, [...pass1, ...pass2]);

  const all = [...pass1, ...pass2, ...pass3];

  // Deduplicate: same value (case-insensitive) → keep highest confidence
  const byValue = new Map<string, DetectedEntity>();
  for (const entity of all) {
    const key = entity.value.toLowerCase();
    const existing = byValue.get(key);
    if (!existing || entity.confidence > existing.confidence) {
      byValue.set(key, entity);
    }
  }

  return Array.from(byValue.values()).sort((a, b) => a.position.start - b.position.start);
}

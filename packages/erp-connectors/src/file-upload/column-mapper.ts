import { CANONICAL_COLUMN_NAMES } from "./canonical-schema";

// ─── Column alias dictionary (250+ entries) ───────────────────────────────────

export const COLUMN_ALIASES: Record<string, string> = {
  // ── transaction_date ───────────────────────────────────────────────────────
  "date": "transaction_date", "txn date": "transaction_date", "txn_date": "transaction_date",
  "transaction date": "transaction_date", "voucher date": "transaction_date",
  "posting date": "transaction_date", "bill date": "transaction_date",
  "invoice date": "transaction_date", "entry date": "transaction_date",
  "doc date": "transaction_date", "document date": "transaction_date",
  "booking date": "transaction_date", "tr date": "transaction_date",
  "cheque date": "transaction_date", "payment date": "transaction_date",
  "trade date": "transaction_date", "effective date": "transaction_date",
  "purchase date": "transaction_date", "sales date": "transaction_date",
  "receipt date": "transaction_date",
  "dt": "transaction_date", "transaction_date": "transaction_date",
  // Hindi / Hinglish
  "तारीख": "transaction_date", "दिनांक": "transaction_date",
  "tarikh": "transaction_date", "dinank": "transaction_date",

  // ── due_date ───────────────────────────────────────────────────────────────
  "due date": "due_date", "due_date": "due_date", "payment due": "due_date",
  "maturity date": "due_date", "expiry date": "due_date", "due by": "due_date",
  "bill due date": "due_date",

  // ── value_date ────────────────────────────────────────────────────────────
  "value date": "value_date", "clearing date": "value_date", "settlement date": "value_date",
  "process date": "value_date", "processed date": "value_date",

  // ── account_code ──────────────────────────────────────────────────────────
  "account code": "account_code", "acct code": "account_code", "gl code": "account_code",
  "account no": "account_code", "account number": "account_code",
  "ledger code": "account_code", "ac no": "account_code", "ac code": "account_code",
  "ledger no": "account_code", "account id": "account_code", "gl no": "account_code",
  "account num": "account_code",

  // ── account_name ──────────────────────────────────────────────────────────
  "account name": "account_name", "account": "account_name",
  "ledger name": "account_name", "ledger": "account_name",
  "account description": "account_name", "particulars": "account_name",
  "account head": "account_name", "acnt": "account_name", "acct name": "account_name",
  "ac name": "account_name", "gl name": "account_name", "account title": "account_name",
  "ledger head": "account_name", "nominal account": "account_name",
  "account details": "account_name", "acnt name": "account_name",
  "acct": "account_name", "gl account": "account_name",
  "account_name": "account_name",
  // Hindi
  "खाता": "account_name", "लेजर": "account_name",
  "khata": "account_name", "lejar": "account_name",

  // ── account_group ─────────────────────────────────────────────────────────
  "account group": "account_group", "group": "account_group", "ledger group": "account_group",
  "account category": "account_group", "gl group": "account_group",
  "account classification": "account_group", "category": "account_group",

  // ── account_type ──────────────────────────────────────────────────────────
  "account type": "account_type", "account kind": "account_type",
  "account class": "account_type", "gl type": "account_type",

  // ── vendor_name ───────────────────────────────────────────────────────────
  "vendor name": "vendor_name", "vendor": "vendor_name", "supplier name": "vendor_name",
  "supplier": "vendor_name", "creditor name": "vendor_name", "creditor": "vendor_name",
  "payee": "vendor_name", "seller": "vendor_name", "sundry creditor": "vendor_name",
  "vendor party": "vendor_name", "bill to vendor": "vendor_name",
  // Hindi
  "विक्रेता": "vendor_name", "vikreta": "vendor_name",

  // ── customer_name ─────────────────────────────────────────────────────────
  "customer name": "customer_name", "customer": "customer_name",
  "buyer name": "customer_name", "buyer": "customer_name",
  "debtor name": "customer_name", "debtor": "customer_name",
  "client name": "customer_name", "client": "customer_name",
  "payer": "customer_name", "sundry debtor": "customer_name",
  "bill from customer": "customer_name",
  // Hindi
  "ग्राहक": "customer_name", "grahak": "customer_name",

  // ── party_name ────────────────────────────────────────────────────────────
  "party name": "party_name", "party": "party_name", "name": "party_name",
  "counterparty": "party_name", "third party": "party_name",
  "trading partner": "party_name", "partner name": "party_name",
  // Hindi
  "पार्टी": "party_name", "party nam": "party_name",

  // ── debit_amount ──────────────────────────────────────────────────────────
  "debit": "debit_amount", "dr": "debit_amount", "dr amount": "debit_amount",
  "dr amt": "debit_amount", "debit amount": "debit_amount", "debit amt": "debit_amount",
  "withdrawal": "debit_amount", "debit entry": "debit_amount", "dr value": "debit_amount",
  "outflow": "debit_amount", "paid": "debit_amount", "dr balance": "debit_amount",
  "debit balance": "debit_amount", "debit total": "debit_amount",
  // Hindi
  "डेबिट": "debit_amount", "उधार": "debit_amount",
  "udhar": "debit_amount",

  // ── credit_amount ─────────────────────────────────────────────────────────
  "credit": "credit_amount", "cr": "credit_amount", "cr amount": "credit_amount",
  "cr amt": "credit_amount", "credit amount": "credit_amount", "credit amt": "credit_amount",
  "deposit": "credit_amount", "credit entry": "credit_amount", "cr value": "credit_amount",
  "inflow": "credit_amount", "received": "credit_amount", "cr balance": "credit_amount",
  "credit balance": "credit_amount", "credit total": "credit_amount",
  // Hindi
  "क्रेडिट": "credit_amount", "जमा": "credit_amount",
  "jama": "credit_amount",

  // ── net_amount ────────────────────────────────────────────────────────────
  "amount": "net_amount", "net amount": "net_amount", "value": "net_amount",
  "total": "net_amount", "net value": "net_amount", "total amount": "net_amount",
  "balance amount": "net_amount", "txn amount": "net_amount",
  "transaction amount": "net_amount", "amt": "net_amount",
  // Hindi
  "राशि": "net_amount", "rashi": "net_amount",

  // ── opening_balance ───────────────────────────────────────────────────────
  "opening balance": "opening_balance", "op balance": "opening_balance",
  "ob": "opening_balance", "opening bal": "opening_balance", "open bal": "opening_balance",
  "balance bf": "opening_balance", "balance b/f": "opening_balance",
  "brought forward": "opening_balance",

  // ── closing_balance ───────────────────────────────────────────────────────
  "closing balance": "closing_balance", "cl balance": "closing_balance",
  "cb": "closing_balance", "closing bal": "closing_balance", "close bal": "closing_balance",
  "balance cf": "closing_balance", "balance c/f": "closing_balance",
  "carried forward": "closing_balance",

  // ── description ───────────────────────────────────────────────────────────
  "description": "description", "narration": "description", "remarks": "description",
  "note": "description", "notes": "description", "details": "description",
  "narrative": "description", "memo": "description", "comment": "description",
  "particulars details": "description", "transaction details": "description",
  "entry details": "description",
  // Hindi
  "विवरण": "description", "vivaran": "description", "टिप्पणी": "description",

  // ── reference_number ──────────────────────────────────────────────────────
  "reference": "reference_number", "ref no": "reference_number",
  "ref number": "reference_number", "ref": "reference_number",
  "reference no": "reference_number", "reference number": "reference_number",
  "voucher no": "reference_number", "voucher number": "reference_number",
  "vch no": "reference_number", "vchno": "reference_number",
  "document no": "reference_number", "doc no": "reference_number",
  "invoice no": "reference_number", "invoice number": "reference_number",
  "transaction id": "reference_number", "txn id": "reference_number",
  "bill no": "reference_number", "bill number": "reference_number",
  "order no": "reference_number",

  // ── document_number (cheque numbers, instrument numbers — distinct from voucher) ──
  "cheque no": "document_number", "check no": "document_number",
  "chq no": "document_number", "dd no": "document_number",
  "payment ref": "document_number", "document number": "document_number",
  "instrument no": "document_number",

  // ── voucher_type ──────────────────────────────────────────────────────────
  "voucher type": "voucher_type", "vch type": "voucher_type", "vch": "voucher_type",
  "vchtyp": "voucher_type", "document type": "voucher_type",
  "entry type": "voucher_type", "voucher_type": "voucher_type",

  // ── transaction_type ──────────────────────────────────────────────────────
  "transaction type": "transaction_type", "type": "transaction_type",
  "mode": "transaction_type", "payment mode": "transaction_type",
  "transaction mode": "transaction_type", "txn type": "transaction_type",

  // ── cost_centre ───────────────────────────────────────────────────────────
  "cost centre": "cost_centre", "cost center": "cost_centre",
  "department": "cost_centre", "dept": "cost_centre", "division": "cost_centre",
  "business unit": "cost_centre", "cost code": "cost_centre",
  "profit centre": "cost_centre", "profit center": "cost_centre",
  // Hindi
  "विभाग": "cost_centre", "vibhag": "cost_centre",

  // ── project ───────────────────────────────────────────────────────────────
  "project": "project", "project name": "project", "job": "project",
  "job code": "project", "project code": "project", "job name": "project",
  "work order": "project",

  // ── currency_code ─────────────────────────────────────────────────────────
  "currency": "currency_code", "currency code": "currency_code",
  "curr code": "currency_code", "ccy": "currency_code", "iso code": "currency_code",

  // ── exchange_rate ─────────────────────────────────────────────────────────
  "exchange rate": "exchange_rate", "fx rate": "exchange_rate",
  "rate": "exchange_rate", "forex rate": "exchange_rate",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColumnMappingResult {
  originalName:    string;
  canonicalName:   string | null;
  confidence:      number;
  detectionMethod: "exact" | "fuzzy" | "inference" | "unmapped";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[_\-\.]+/g, " ")
    .replace(/[()#*\/\\]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
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

// ─── Step 1: Exact / alias match ──────────────────────────────────────────────

function exactMatch(normalized: string): string | null {
  return COLUMN_ALIASES[normalized] ?? null;
}

// ─── Step 2: Fuzzy match ──────────────────────────────────────────────────────

function fuzzyMatch(normalized: string): { canonicalName: string; confidence: number } | null {
  let best: { canonicalName: string; confidence: number; dist: number } | null = null;

  for (const [alias, canonical] of Object.entries(COLUMN_ALIASES)) {
    // Quick length gate: Levenshtein ≤ 2 means length diff ≤ 2
    if (Math.abs(alias.length - normalized.length) > 3) continue;

    const dist = levenshtein(normalized, alias);
    if (dist > 2) continue;

    // Token overlap ≥ 50%
    const normTokens = normalized.split(" ");
    const aliasTokens = alias.split(" ");
    const shared = normTokens.filter((t) => aliasTokens.includes(t)).length;
    const overlap = shared / Math.max(normTokens.length, aliasTokens.length);

    // Accept if distance ≤ 1 OR (distance ≤ 2 AND good token overlap)
    if (dist > 1 && overlap < 0.5) continue;

    const confidence = 1 - dist / Math.max(normalized.length, alias.length, 1);
    if (!best || dist < best.dist || (dist === best.dist && confidence > best.confidence)) {
      best = { canonicalName: canonical, confidence, dist };
    }
  }

  return best ? { canonicalName: best.canonicalName, confidence: best.confidence } : null;
}

// ─── Step 3: Data-type inference from sample values ──────────────────────────

const DATE_PATTERNS = [
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,            // dd/mm/yyyy or dd-mm-yyyy
  /^\d{1,2}[\/\-][A-Za-z]{3}[\/\-]\d{2,4}$/,         // dd-MMM-yyyy
  /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/,                    // yyyy-mm-dd (ISO)
];
const AMOUNT_PATTERNS = /^[₹$€£]?\s*[\d,]+(\.\d+)?$|^[\d,]+(\.\d+)?\s*[₹$€£]?$/;

function inferFromValues(values: unknown[]): { canonicalName: string; confidence: number } | null {
  const sample = values
    .slice(0, 100)
    .map((v) => String(v ?? "").trim())
    .filter((v) => v && v !== "null" && v !== "undefined");

  if (sample.length < 5) return null;

  // Date inference
  const dateLike = sample.filter((v) => DATE_PATTERNS.some((re) => re.test(v)));
  if (dateLike.length / sample.length >= 0.8) {
    return { canonicalName: "transaction_date", confidence: dateLike.length / sample.length };
  }

  // Amount inference
  const amountLike = sample.filter((v) => AMOUNT_PATTERNS.test(v));
  if (amountLike.length / sample.length >= 0.8) {
    return { canonicalName: "net_amount", confidence: amountLike.length / sample.length };
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function mapColumn(columnName: string, sampleValues: unknown[] = []): ColumnMappingResult {
  const normalized = normalizeColumnName(columnName);

  // Step 0: Canonical-name self-match — if the column header IS a canonical
  // name (e.g. `reference_number`, `party_name`), accept it directly. This
  // catches CSVs that already use the canonical naming convention, which the
  // fuzzy matcher misses for canonical names whose aliases differ significantly
  // in length (e.g. "ref number" 10 chars vs "reference number" 16 chars — gated out).
  const underscored = normalized.replace(/\s+/g, "_");
  if (CANONICAL_COLUMN_NAMES.has(underscored)) {
    return { originalName: columnName, canonicalName: underscored, confidence: 1.0, detectionMethod: "exact" };
  }

  // Step 1: Exact / alias match
  const exact = exactMatch(normalized);
  if (exact) {
    return { originalName: columnName, canonicalName: exact, confidence: 1.0, detectionMethod: "exact" };
  }

  // Step 2: Fuzzy match
  const fuzzy = fuzzyMatch(normalized);
  if (fuzzy) {
    return { originalName: columnName, ...fuzzy, detectionMethod: "fuzzy" };
  }

  // Step 3: Inference from sample data
  const inferred = inferFromValues(sampleValues);
  if (inferred) {
    return { originalName: columnName, ...inferred, detectionMethod: "inference" };
  }

  return { originalName: columnName, canonicalName: null, confidence: 0, detectionMethod: "unmapped" };
}

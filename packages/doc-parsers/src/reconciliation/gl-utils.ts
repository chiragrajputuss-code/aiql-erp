import type { GlRow } from "./types";

// ─── Parse raw DB rows into typed GlRows ─────────────────────────────────────

function num(v: unknown): number {
  if (!v && v !== 0) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  return String(v).trim();
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function parseGlRows(rows: Record<string, unknown>[]): GlRow[] {
  return rows.map((r) => ({
    transaction_date: parseDate(r["transaction_date"]),
    account_name:     str(r["account_name"]),
    account_group:    str(r["account_group"]),
    party_name:       str(r["party_name"]),
    vendor_name:      str(r["vendor_name"]),
    customer_name:    str(r["customer_name"]),
    debit_amount:     num(r["debit_amount"]),
    credit_amount:    num(r["credit_amount"]),
    net_amount:       num(r["net_amount"]),
    description:      str(r["description"]),
    reference_number: str(r["reference_number"]),
    voucher_type:     str(r["voucher_type"]),
    _raw:             r,
  }));
}

// ─── TDS keyword filter ───────────────────────────────────────────────────────
// Return GL rows that look like TDS entries (booked as expense or liability)

const TDS_KEYWORDS = [
  "tds", "tax deducted", "tax deduction", "tax at source",
  "tds payable", "tds liability", "tds deducted",
  "194c", "194j", "194h", "194a", "194i", "194q", "206c",
];

function matchesTds(row: GlRow): boolean {
  const fields = [
    row.account_name,
    row.account_group,
    row.description,
    row.voucher_type,
  ].filter(Boolean).map((f) => f!.toLowerCase());
  return fields.some((f) => TDS_KEYWORDS.some((kw) => f.includes(kw)));
}

export function filterTdsRows(rows: GlRow[]): GlRow[] {
  return rows.filter(matchesTds);
}

// ─── Sales keyword filter ─────────────────────────────────────────────────────

const SALES_KEYWORDS = [
  "sales", "revenue", "income", "turnover", "sale",
  "outward supply", "gst sales", "tax invoice",
];

const SALES_VOUCHER_TYPES = ["sales", "sale", "invoice", "tax invoice"];

export function filterSalesRows(rows: GlRow[]): GlRow[] {
  return rows.filter((row) => {
    const fields = [row.account_name, row.account_group, row.description]
      .filter(Boolean).map((f) => f!.toLowerCase());
    const voucher = (row.voucher_type ?? "").toLowerCase();
    return (
      fields.some((f) => SALES_KEYWORDS.some((kw) => f.includes(kw))) ||
      SALES_VOUCHER_TYPES.some((vt) => voucher.includes(vt))
    );
  });
}

// ─── Amount helpers ───────────────────────────────────────────────────────────

export function effectiveAmount(row: GlRow): number {
  if (row.net_amount !== 0) return Math.abs(row.net_amount);
  // For TDS: debit side increases TDS asset, credit side increases TDS liability
  return Math.abs(row.debit_amount || row.credit_amount);
}

export function sumAmount(rows: GlRow[]): number {
  return rows.reduce((acc, r) => acc + effectiveAmount(r), 0);
}

// ─── Fuzzy name matching ──────────────────────────────────────────────────────
// Simple token overlap; avoids dependency on external libraries

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bpvt\b|\bltd\b|\blimited\b|\bprivate\b|\bllp\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  const tokA = new Set(normaliseName(a).split(" ").filter(Boolean));
  const tokB = new Set(normaliseName(b).split(" ").filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  return overlap / Math.max(tokA.size, tokB.size);
}

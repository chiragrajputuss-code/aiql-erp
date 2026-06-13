// ─── 24 canonical columns that AIQL understands ──────────────────────────────
// NOTHING outside this list enters the query engine.

export type PgType = "text" | "numeric" | "date" | "timestamptz" | "boolean";
export type ColumnCategory =
  | "date" | "account" | "party" | "amount" | "description" | "type" | "dimension" | "currency";

export interface CanonicalColumnDef {
  pgType:      PgType;
  required:    boolean;
  category:    ColumnCategory;
  description: string;
}

export const CANONICAL_SCHEMA: Record<string, CanonicalColumnDef> = {
  // ── Dates (3) ───────────────────────────────────────────────────────────────
  transaction_date: { pgType: "date",    required: true,  category: "date",        description: "Primary transaction/voucher/posting date" },
  due_date:         { pgType: "date",    required: false, category: "date",        description: "Payment due / maturity date" },
  value_date:       { pgType: "date",    required: false, category: "date",        description: "Value/clearing date" },

  // ── Account identifiers (4) ─────────────────────────────────────────────────
  account_code:     { pgType: "text",    required: false, category: "account",     description: "GL account code (e.g. 4000, AC-2100)" },
  account_name:     { pgType: "text",    required: false, category: "account",     description: "Ledger / account name" },
  account_group:    { pgType: "text",    required: false, category: "account",     description: "Tally group / Zoho account type" },
  account_type:     { pgType: "text",    required: false, category: "account",     description: "Broad type: income / expense / asset / liability" },

  // ── Party identifiers (3) ──────────────────────────────────────────────────
  vendor_name:      { pgType: "text",    required: false, category: "party",       description: "Vendor / supplier name" },
  customer_name:    { pgType: "text",    required: false, category: "party",       description: "Customer / debtor name" },
  party_name:       { pgType: "text",    required: false, category: "party",       description: "Generic party (vendor or customer)" },

  // ── Amounts (5) ─────────────────────────────────────────────────────────────
  debit_amount:     { pgType: "numeric", required: false, category: "amount",      description: "Debit / DR amount" },
  credit_amount:    { pgType: "numeric", required: false, category: "amount",      description: "Credit / CR amount" },
  net_amount:       { pgType: "numeric", required: false, category: "amount",      description: "Single net / total amount column" },
  opening_balance:  { pgType: "numeric", required: false, category: "amount",      description: "Opening balance" },
  closing_balance:  { pgType: "numeric", required: false, category: "amount",      description: "Closing balance" },

  // ── Description / Reference (4) ────────────────────────────────────────────
  description:      { pgType: "text",    required: false, category: "description", description: "Narration / remarks / memo" },
  reference_number: { pgType: "text",    required: false, category: "description", description: "Voucher no / invoice no / transaction ID" },
  document_number:  { pgType: "text",    required: false, category: "description", description: "Cheque no / payment reference / DD no" },

  // ── Transaction type (2) ────────────────────────────────────────────────────
  voucher_type:     { pgType: "text",    required: false, category: "type",        description: "Tally voucher type: Payment, Receipt, Sales…" },
  transaction_type: { pgType: "text",    required: false, category: "type",        description: "Generic transaction type / mode" },

  // ── Dimensions (2) ─────────────────────────────────────────────────────────
  cost_centre:      { pgType: "text",    required: false, category: "dimension",   description: "Cost centre / department" },
  project:          { pgType: "text",    required: false, category: "dimension",   description: "Project / job code" },

  // ── Currency (2) ────────────────────────────────────────────────────────────
  currency_code:    { pgType: "text",    required: false, category: "currency",    description: "ISO currency code: INR, USD, EUR…" },
  exchange_rate:    { pgType: "numeric", required: false, category: "currency",    description: "Exchange rate to base currency" },
};

export const CANONICAL_COLUMN_NAMES = new Set(Object.keys(CANONICAL_SCHEMA));

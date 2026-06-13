import type { ResolvedMapping } from "./redundancy-resolver";

export interface ValidationResult {
  isValid:        boolean;
  errors:         string[];
  warnings:       string[];
  canonicalColumns: string[];
  droppedColumns: string[];
}

const DATE_COLS    = new Set(["transaction_date", "due_date", "value_date"]);
const ACCOUNT_COLS = new Set(["account_name", "account_code", "party_name", "vendor_name", "customer_name"]);
const AMOUNT_COLS  = new Set(["debit_amount", "credit_amount", "net_amount"]);

/**
 * Validate the resolved column mapping:
 *  - MUST have: at least one date + one account identifier + one amount
 *  - WARN:      no description, no reference
 *  - ERROR:     no date | no account | no amount | too few/many cols
 */
export function validateMappings(mappings: ResolvedMapping[]): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const active = mappings.filter((m) => !m.dropped && m.canonicalName);
  const canonical = active.map((m) => m.canonicalName as string);
  const dropped   = mappings.filter((m) => m.dropped).map((m) => m.originalName);

  const canonicalSet = new Set(canonical);

  // ── Required field groups ──────────────────────────────────────────────────
  const hasDate    = canonical.some((c) => DATE_COLS.has(c));
  const hasAccount = canonical.some((c) => ACCOUNT_COLS.has(c));
  const hasAmount  = canonical.some((c) => AMOUNT_COLS.has(c));

  if (!hasDate)    errors.push("No date column found — at least one of: transaction_date, due_date, value_date is required");
  if (!hasAccount) errors.push("No account identifier found — at least one of: account_name, account_code, party_name, vendor_name, customer_name is required");
  if (!hasAmount)  errors.push("No amount column found — at least one of: debit_amount, credit_amount, net_amount is required");

  // ── Column count guards ───────────────────────────────────────────────────
  if (active.length < 3) {
    errors.push(`Too few canonical columns (${active.length}) — minimum 3 required after filtering`);
  }
  if (active.length > 20) {
    warnings.push(`Many columns mapped (${active.length}) — verify there are no false positives`);
  }

  // ── Warnings for nice-to-have columns ────────────────────────────────────
  if (!canonicalSet.has("description")) {
    warnings.push("No description/narration column found — queries about transaction details may be limited");
  }
  if (!canonicalSet.has("reference_number") && !canonicalSet.has("document_number")) {
    warnings.push("No reference number column found — invoice/voucher lookups will not be available");
  }

  // ── Duplicate type check (should be resolved by redundancy-resolver) ──────
  const typeCounts: Record<string, number> = {};
  for (const c of canonical) {
    typeCounts[c] = (typeCounts[c] ?? 0) + 1;
    if (typeCounts[c] > 1) {
      errors.push(`Duplicate canonical column: ${c} — run redundancy resolver first`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    canonicalColumns: canonical,
    droppedColumns:   dropped,
  };
}

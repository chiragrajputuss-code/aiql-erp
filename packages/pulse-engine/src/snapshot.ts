import type { FinancialSnapshot } from "./types";

// Cash/bank account name patterns (Indian GL naming conventions)
const CASH_BANK_PATTERNS = [
  /\bcash\b/i, /\bbank\b/i, /\bcurrent account\b/i,
  /\bsavings account\b/i, /\bsb a\/c\b/i, /\bca a\/c\b/i,
];

const RECEIVABLE_PATTERNS = [
  /\bsundry debtors?\b/i, /\btrade receivables?\b/i,
  /\baccounts? receivables?\b/i, /\bdebtors?\b/i,
];

const PAYABLE_PATTERNS = [
  /\bsundry creditors?\b/i, /\btrade payables?\b/i,
  /\baccounts? payables?\b/i, /\bcreditors?\b/i,
];

function matchesAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

/**
 * Compute snapshot from raw GL rows. Rows must have at minimum:
 * { account_name, debit_amount, credit_amount } (canonical column names).
 * Falls back gracefully when columns are missing.
 */
export function computeSnapshotFromRows(
  rows: Record<string, unknown>[],
): Omit<FinancialSnapshot, "glPeriodStart" | "glPeriodEnd" | "computedAt"> {
  if (rows.length === 0) {
    return { cashAndBankBalance: null, totalReceivables: null, totalPayables: null };
  }

  let cashAndBank  = 0;
  let receivables  = 0;
  let payables     = 0;

  let hasCashBank  = false;
  let hasReceiv    = false;
  let hasPay       = false;

  for (const row of rows) {
    const name   = String(row.account_name ?? row.account ?? "");
    const debit  = Number(row.debit_amount ?? row.debit ?? 0);
    const credit = Number(row.credit_amount ?? row.credit ?? 0);
    const net    = debit - credit;

    if (matchesAny(name, CASH_BANK_PATTERNS))  { cashAndBank += net; hasCashBank = true; }
    if (matchesAny(name, RECEIVABLE_PATTERNS)) { receivables += net; hasReceiv   = true; }
    if (matchesAny(name, PAYABLE_PATTERNS))    { payables    += net; hasPay      = true; }
  }

  return {
    cashAndBankBalance: hasCashBank ? cashAndBank : null,
    totalReceivables:   hasReceiv   ? receivables  : null,
    totalPayables:      hasPay      ? Math.abs(payables) : null,
  };
}

/**
 * Format a raw number as a readable Indian currency string (lakhs / crores).
 */
export function formatINR(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Pure helper functions for data quality issue detection.
 * These work on JS objects (rows from SQL) — easy to unit test without a DB.
 */

import type { Issue, IssueSeverity } from "../scanner";

// ─── Voucher imbalance ────────────────────────────────────────────────────────

export interface VoucherImbalanceRow {
  reference_number: string;
  dr:               number;
  cr:               number;
  diff:             number;
}

export function buildVoucherImbalanceIssue(rows: VoucherImbalanceRow[]): Issue | null {
  if (rows.length === 0) return null;

  const totalDiff = rows.reduce((s, r) => s + Number(r.diff || 0), 0);

  return {
    code:         "voucher_imbalance",
    severity:     "critical",
    category:     "Data Integrity",
    title:        `${rows.length} voucher${rows.length > 1 ? "s" : ""} where Debit ≠ Credit`,
    description:
      `Each voucher must have equal debits and credits. ` +
      `${rows.length} voucher${rows.length > 1 ? "s" : ""} have a mismatch totalling ₹${totalDiff.toLocaleString("en-IN", { maximumFractionDigits: 2 })}. ` +
      `Likely rounding errors or missed line items.`,
    affectedRows: rows.length,
    exposure:     totalDiff,
    examples:     rows.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

export interface DuplicateRow {
  party:   string;
  amount:  number;
  vch_a:   string;
  date_a:  Date;
  vch_b:   string;
  date_b:  Date;
}

export function buildDuplicateIssue(rows: DuplicateRow[]): Issue | null {
  if (rows.length === 0) return null;

  const totalDup = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return {
    code:         "duplicate_transactions",
    severity:     "critical",
    category:     "Data Integrity",
    title:        `${rows.length} possible duplicate transaction${rows.length > 1 ? "s" : ""}`,
    description:
      `Transactions with the same party, same amount, and dates within 7 days are likely duplicates. ` +
      `Total at risk: ₹${totalDup.toLocaleString("en-IN", { maximumFractionDigits: 0 })}. ` +
      `Review these and reverse one entry if confirmed duplicate.`,
    affectedRows: rows.length,
    exposure:     totalDup,
    examples:     rows.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ─── Severity rank for sort ───────────────────────────────────────────────────

export const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  review:   1,
  info:     2,
};

export function compareIssues(a: Issue, b: Issue): number {
  const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (r !== 0) return r;
  return (b.exposure ?? 0) - (a.exposure ?? 0);
}

// ─── Materiality thresholds for question budget ───────────────────────────────

export const QUESTION_MATERIALITY_INR = 10_000;
export const QUESTION_BUDGET_MAX = 3;
export const FLUX_MATERIAL_ABS_THRESHOLD = 50_000;
export const FLUX_MATERIAL_PCT_THRESHOLD = 10;

export function isMaterialFlux(variance: number, priorBalance: number): boolean {
  const absVar = Math.abs(variance);
  if (absVar < FLUX_MATERIAL_ABS_THRESHOLD) return false;
  if (priorBalance === 0) return absVar >= FLUX_MATERIAL_ABS_THRESHOLD;
  const pct = (absVar / Math.abs(priorBalance)) * 100;
  return pct >= FLUX_MATERIAL_PCT_THRESHOLD;
}

// ─── Number coercion (Postgres bigint → JS number) ────────────────────────────

export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getPriorPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const ms = end.getTime() - start.getTime();
  const priorEnd   = new Date(start.getTime() - 86_400_000);
  const priorStart = new Date(priorEnd.getTime() - ms);
  return { start: priorStart, end: priorEnd };
}

// ─── Account categorisation (pure) ────────────────────────────────────────────

export interface AccountCategoryBuckets {
  bank:       string[];
  payable:    string[];
  receivable: string[];
  tax:        string[];
  inventory:  string[];
}

export function bucketAccountsByType(typeMap: Map<string, string>): AccountCategoryBuckets {
  const result: AccountCategoryBuckets = {
    bank: [], payable: [], receivable: [], tax: [], inventory: [],
  };
  for (const [name, type] of typeMap) {
    if (type === "BANK" || type === "CASH")             result.bank.push(name);
    else if (type === "PAYABLE" || type === "CURRENT_LIABILITY") result.payable.push(name);
    else if (type === "RECEIVABLE")                     result.receivable.push(name);
    else if (type === "TAX")                            result.tax.push(name);
    else if (type === "INVENTORY")                      result.inventory.push(name);
  }
  return result;
}

// ─── Cost estimation (pure) ───────────────────────────────────────────────────

export const PROVIDER_RATES_USD_PER_M: Record<string, { input: number; output: number }> = {
  "groq:llama-3.1-8b-instant":    { input: 0,    output: 0    },
  "groq:llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "anthropic:claude-haiku-4-5":   { input: 0.80, output: 4.00 },
  "anthropic:claude-sonnet-4-6":  { input: 3.00, output: 15.0 },
};

export const USD_TO_INR = 83;

export function estimateCostInr(
  providerKey: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = PROVIDER_RATES_USD_PER_M[providerKey] ?? PROVIDER_RATES_USD_PER_M["groq:llama-3.3-70b-versatile"]!;
  const usd = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return usd * USD_TO_INR;
}

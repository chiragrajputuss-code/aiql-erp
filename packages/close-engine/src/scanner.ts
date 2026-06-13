/**
 * Data Quality Scanner — surfaces real issues in uploaded GL data.
 *
 * Runs 7 deterministic checks. Each check returns Issue[] with severity,
 * exposure amount, and example rows. No LLM calls — pure SQL + math.
 *
 * Severity:
 *   critical — books won't tally, must fix (Dr ≠ Cr, duplicate entries)
 *   review   — likely an issue but verify (date outliers, sign anomalies)
 *   info     — informational (CGST/SGST mismatch, unclassified accounts)
 */

import { prisma } from "@aiql/db";
import { buildColMap, applyColMap, getTableName, loadAccountTypeMap, getTableColumns, makeSqlDefensive } from "./utils/column-mapping";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueSeverity = "critical" | "review" | "info";

export interface Issue {
  /** Stable check ID — same code always returns same id */
  code:         string;
  severity:     IssueSeverity;
  category:     string;
  title:        string;
  description:  string;
  affectedRows: number;
  /** Financial impact in INR (null = not applicable / not computable) */
  exposure:     number | null;
  /** Up to 5 example rows showing the actual problem */
  examples:     Record<string, unknown>[];
  /**
   * ALL reference numbers in the affected rows (not just the 5 examples).
   * Used by the GL lister to highlight every matching row, not only examples.
   * Undefined for aggregate checks that have no row-level reference number.
   */
  affectedRefNos?: string[];
}

export interface ScanResult {
  connectionId: string;
  tableName:    string;
  startDate:    Date;
  endDate:      Date;
  scannedAt:    Date;
  durationMs:   number;
  totalIssues:  number;
  bySeverity:   Record<IssueSeverity, number>;
  totalExposure: number;
  issues:       Issue[];
}

// ─── SQL helper ───────────────────────────────────────────────────────────────

async function runSql<T = Record<string, unknown>>(
  sql:    string,
  colMap: Map<string, string>,
  presentColumns: Set<string> = new Set(),
): Promise<T[]> {
  let mapped = applyColMap(sql, colMap);
  mapped = makeSqlDefensive(mapped, presentColumns);
  // When the GL table has been visited via the lister, an _excluded column exists.
  // Inject the filter so excluded rows (user-marked as noise) don't pollute scans.
  // We replace only the FIRST WHERE — which is always the main table predicate;
  // outer CTE/join WHERE clauses operate on derived rows that are already filtered.
  if (presentColumns.has("_excluded")) {
    mapped = mapped.replace(/\bWHERE\b/, "WHERE (_excluded IS NOT TRUE) AND ");
  }
  if (process.env.AIQL_DEBUG_SQL) {
    // eslint-disable-next-line no-console
    console.error("\n────── SQL ──────\n" + mapped + "\n──────────────");
  }
  const rows = await prisma.$queryRawUnsafe<T[]>(mapped);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out as T;
  });
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ─── Check 1: Trial balance (total Dr ≠ total Cr for the period) ─────────────
//
// Replaces the old per-voucher imbalance check. Modern ERPs (Tally, Zoho) enforce
// Dr=Cr before saving, so per-voucher imbalance is nearly always zero on real exports.
// The trial balance check catches the far more common real-world problem: an incomplete
// export (e.g. only purchase vouchers exported, sales missing) or a manually edited file.

async function checkTrialBalance(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  const sql = `
    SELECT
      COALESCE(SUM(debit_amount),  0) AS total_dr,
      COALESCE(SUM(credit_amount), 0) AS total_cr,
      ABS(COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0)) AS imbalance
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
  `;

  let rows: { total_dr: number; total_cr: number; imbalance: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  const r = rows[0];
  if (!r || toNum(r.imbalance) < 1) return null; // ₹1 tolerance for rounding

  // Per-account breakdown — shows which accounts contribute most to the gap
  const breakdownSql = `
    SELECT account_name,
           COALESCE(SUM(debit_amount),  0) AS dr,
           COALESCE(SUM(credit_amount), 0) AS cr,
           COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0) AS net
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
      AND account_name IS NOT NULL AND account_name <> ''
    GROUP BY account_name
    HAVING ABS(COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0)) > 0.01
    ORDER BY ABS(COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0)) DESC
    LIMIT 10
  `;

  let breakdown: { account_name: string; dr: number; cr: number; net: number }[] = [];
  try { breakdown = await runSql(breakdownSql, colMap, presentColumns); }
  catch { /* ignore — breakdown is best-effort */ }

  const imbalance = toNum(r.imbalance);

  return {
    code:         "trial_balance_mismatch",
    severity:     "critical",
    category:     "Data Integrity",
    title:        `Trial balance is off by ₹${imbalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
    description:
      `Total debits (₹${toNum(r.total_dr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}) ` +
      `do not equal total credits (₹${toNum(r.total_cr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}) ` +
      `for this period — the books are out of balance by ₹${imbalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}. ` +
      `This usually means the GL export is incomplete (missing some voucher types or date range) ` +
      `or the file was modified after export. ` +
      `No reconciliation or report can be signed off until this gap is resolved.`,
    affectedRows: breakdown.length,
    exposure:     imbalance,
    examples:     breakdown.slice(0, 5),
    // account-level check — highlight by account_name, not reference_number
    affectedRefNos: undefined,
  };
}

// ─── Check 2: Duplicate transactions (same party + amount within 7 days) ─────

async function checkDuplicateTransactions(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  // We use party_name OR vendor_name OR customer_name OR account_name as the party
  const sql = `
    WITH transactions AS (
      SELECT reference_number, transaction_date,
             COALESCE(party_name, vendor_name, customer_name, account_name) AS party,
             GREATEST(COALESCE(debit_amount, 0), COALESCE(credit_amount, 0)) AS amount
      FROM "${table}"
      WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
        AND COALESCE(party_name, vendor_name, customer_name, account_name) IS NOT NULL
        AND GREATEST(COALESCE(debit_amount, 0), COALESCE(credit_amount, 0)) > 100
    )
    SELECT a.party,
           a.amount,
           a.reference_number AS vch_a,
           a.transaction_date AS date_a,
           b.reference_number AS vch_b,
           b.transaction_date AS date_b
    FROM transactions a
    JOIN transactions b
      ON a.party = b.party
     AND a.amount = b.amount
     AND a.reference_number < b.reference_number
     AND ABS(EXTRACT(EPOCH FROM (b.transaction_date::timestamp - a.transaction_date::timestamp)) / 86400) <= 7
    ORDER BY a.amount DESC
    LIMIT 30
  `;

  let rows: { party: string; amount: number; vch_a: string; date_a: Date; vch_b: string; date_b: Date }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  if (rows.length === 0) return null;

  const totalDup = rows.reduce((s, r) => s + toNum(r.amount), 0);

  return {
    code:         "duplicate_transactions",
    severity:     "critical",
    category:     "Data Integrity",
    title:        `${rows.length} possible duplicate transaction${rows.length > 1 ? "s" : ""}`,
    description:
      `Transactions with the same party, same amount, and dates within 7 days are likely duplicates. ` +
      `Total at risk: ₹${totalDup.toLocaleString("en-IN", { maximumFractionDigits: 0 })}. ` +
      `Review these and reverse one entry if confirmed duplicate.`,
    affectedRows:   rows.length,
    exposure:       totalDup,
    examples:       rows.slice(0, 5),
    affectedRefNos: [...new Set([
      ...rows.map((r) => r.vch_a),
      ...rows.map((r) => r.vch_b),
    ].filter(Boolean))],
  };
}

// ─── Check 3: Date outliers (entries outside the period) ─────────────────────

async function checkDateOutliers(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  const sql = `
    SELECT transaction_date,
           COUNT(*) AS rows,
           COALESCE(SUM(debit_amount + credit_amount), 0) AS total_amount
    FROM "${table}"
    WHERE transaction_date IS NOT NULL
      AND (transaction_date < '${isoDate(start)}'::date - INTERVAL '60 days'
        OR transaction_date > '${isoDate(end)}'::date + INTERVAL '30 days')
    GROUP BY transaction_date
    ORDER BY transaction_date
    LIMIT 20
  `;

  let rows: { transaction_date: Date; rows: number; total_amount: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  if (rows.length === 0) return null;

  const totalRows = rows.reduce((s, r) => s + toNum(r.rows), 0);
  const totalAmt  = rows.reduce((s, r) => s + toNum(r.total_amount), 0);

  return {
    code:         "date_outliers",
    severity:     "review",
    category:     "Data Integrity",
    title:        `${totalRows} entr${totalRows > 1 ? "ies" : "y"} dated outside the period`,
    description:
      `Entries dated more than 60 days before period start or 30 days after period end. ` +
      `These are usually data-entry errors (wrong year, wrong month). Verify the dates are correct.`,
    affectedRows: totalRows,
    exposure:     totalAmt,
    examples:     rows.slice(0, 5),
  };
}

// ─── Check 4: Missing critical fields ────────────────────────────────────────

async function checkMissingFields(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  // Only flag genuinely broken rows:
  //   • missing_date  — no transaction_date (can't be placed in any period)
  //   • zero_amount   — both Dr and Cr are zero (entry has no financial effect)
  //
  // Removed (too many false positives):
  //   • missing_account — bank charges, depreciation, provisions legitimately have no party name
  //   • both_dr_cr      — contra vouchers in Tally legitimately have both sides on one line
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE transaction_date IS NULL)                                            AS missing_date,
      COUNT(*) FILTER (WHERE COALESCE(debit_amount, 0) = 0 AND COALESCE(credit_amount, 0) = 0)  AS zero_amount
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
       OR transaction_date IS NULL
  `;

  let rows: { missing_date: number; zero_amount: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  const r = rows[0];
  if (!r) return null;

  const total = toNum(r.missing_date) + toNum(r.zero_amount);
  if (total === 0) return null;

  const parts: string[] = [];
  if (toNum(r.missing_date)  > 0) parts.push(`${r.missing_date} entries with no transaction date`);
  if (toNum(r.zero_amount)   > 0) parts.push(`${r.zero_amount} entries where both debit and credit are zero`);

  return {
    code:         "missing_fields",
    severity:     "critical",
    category:     "Data Integrity",
    title:        `${total} entr${total === 1 ? "y" : "ies"} with missing critical fields`,
    description:
      `${parts.join("; ")}. ` +
      `Entries without a date cannot be placed in any accounting period. ` +
      `Zero-amount entries have no financial effect and are likely import artefacts.`,
    affectedRows: total,
    exposure:     null,
    examples:     [r as unknown as Record<string, unknown>],
  };
}

// ─── Check 5: Unclassified accounts ──────────────────────────────────────────

async function checkUnclassifiedAccounts(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  typeMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  const sql = `
    SELECT account_name, COUNT(*) AS txns,
           COALESCE(SUM(debit_amount + credit_amount), 0) AS total
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
      AND account_name IS NOT NULL AND account_name <> ''
    GROUP BY account_name
    ORDER BY total DESC
  `;

  let rows: { account_name: string; txns: number; total: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  const unclassified = rows.filter((r) => {
    const t = typeMap.get(r.account_name);
    return !t || t === "UNKNOWN";
  });

  if (unclassified.length === 0) return null;

  const totalAmt = unclassified.reduce((s, r) => s + toNum(r.total), 0);

  return {
    code:         "unclassified_accounts",
    severity:     "info",
    category:     "Configuration",
    title:        `${unclassified.length} unclassified account${unclassified.length > 1 ? "s" : ""}`,
    description:
      `These accounts are not classified into a financial category (Bank, AP, AR, Tax, etc.). ` +
      `Reconciliations and reports will skip them until classified. Visit Account Mapping to fix.`,
    affectedRows: unclassified.length,
    exposure:     totalAmt,
    examples:     unclassified.slice(0, 5),
  };
}

// ─── Check 6: CGST ≠ SGST per voucher ────────────────────────────────────────

async function checkGSTMismatch(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  // IGST applies to inter-state transactions — those vouchers won't have CGST/SGST.
  // We only flag vouchers where CGST and SGST are both present but unequal.
  // Vouchers with any IGST amount are intra-state only by different rules — skip them.
  const sql = `
    WITH gst_vch AS (
      SELECT reference_number,
        SUM(CASE WHEN LOWER(account_name) LIKE '%cgst%' THEN ABS(credit_amount - debit_amount) ELSE 0 END) AS cgst,
        SUM(CASE WHEN LOWER(account_name) LIKE '%sgst%' THEN ABS(credit_amount - debit_amount) ELSE 0 END) AS sgst,
        SUM(CASE WHEN LOWER(account_name) LIKE '%igst%' THEN ABS(credit_amount - debit_amount) ELSE 0 END) AS igst
      FROM "${table}"
      WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
        AND reference_number IS NOT NULL
      GROUP BY reference_number
    )
    SELECT reference_number, cgst, sgst, ABS(cgst - sgst) AS diff
    FROM gst_vch
    WHERE cgst > 0 AND sgst > 0
      AND igst = 0
      AND ABS(cgst - sgst) > 0.01
    ORDER BY diff DESC
    LIMIT 30
  `;

  let rows: { reference_number: string; cgst: number; sgst: number; diff: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  if (rows.length === 0) return null;

  const totalDiff = rows.reduce((s, r) => s + toNum(r.diff), 0);

  return {
    code:         "gst_mismatch",
    severity:     "review",
    category:     "Indian SME",
    title:        `${rows.length} voucher${rows.length > 1 ? "s" : ""} where CGST ≠ SGST`,
    description:
      `For intra-state transactions, CGST and SGST must be equal. ` +
      `${rows.length} voucher${rows.length > 1 ? "s have" : " has"} a mismatch totalling ₹${totalDiff.toLocaleString("en-IN", { maximumFractionDigits: 2 })}. ` +
      `Verify GST configuration in Tally / source ERP.`,
    affectedRows:   rows.length,
    exposure:       totalDiff,
    examples:       rows.slice(0, 5),
    affectedRefNos: rows.map((r) => r.reference_number).filter(Boolean),
  };
}

// ─── Check 7: Sign anomalies (Creditor with Dr balance, Debtor with Cr balance) ──

async function checkSignAnomalies(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  payableAccounts: string[], receivableAccounts: string[],
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  if (payableAccounts.length === 0 && receivableAccounts.length === 0) return null;

  const issues: Record<string, unknown>[] = [];
  let totalExposure = 0;

  // Payables with Dr balance (should normally be Cr)
  if (payableAccounts.length > 0) {
    const list = payableAccounts.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    const sql = `
      SELECT account_name,
             COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM "${table}"
      WHERE transaction_date <= '${isoDate(end)}'
        AND account_name IN (${list})
      GROUP BY account_name
      HAVING SUM(debit_amount - credit_amount) > 100
      ORDER BY balance DESC
      LIMIT 10
    `;
    try {
      const rows = await runSql<{ account_name: string; balance: number }>(sql, colMap, presentColumns);
      for (const r of rows) {
        issues.push({ ...r, expected: "credit balance", note: "Payable with debit balance — likely advance to vendor or misclassification" });
        totalExposure += toNum(r.balance);
      }
    } catch { /* ignore */ }
  }

  // Receivables with Cr balance (should normally be Dr)
  if (receivableAccounts.length > 0) {
    const list = receivableAccounts.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    const sql = `
      SELECT account_name,
             COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
      FROM "${table}"
      WHERE transaction_date <= '${isoDate(end)}'
        AND account_name IN (${list})
      GROUP BY account_name
      HAVING SUM(credit_amount - debit_amount) > 100
      ORDER BY balance DESC
      LIMIT 10
    `;
    try {
      const rows = await runSql<{ account_name: string; balance: number }>(sql, colMap, presentColumns);
      for (const r of rows) {
        issues.push({ ...r, expected: "debit balance", note: "Receivable with credit balance — likely advance from customer or misclassification" });
        totalExposure += toNum(r.balance);
      }
    } catch { /* ignore */ }
  }

  if (issues.length === 0) return null;

  return {
    code:         "sign_anomalies",
    severity:     "review",
    category:     "Subledger",
    title:        `${issues.length} account${issues.length > 1 ? "s" : ""} with unusual sign`,
    description:
      `Accounts where the balance direction is opposite to what's expected for the account type. ` +
      `Often indicates advances that need reclassification, or wrong account postings.`,
    affectedRows: issues.length,
    exposure:     totalExposure,
    examples:     issues.slice(0, 5),
  };
}

// ─── Check 8: Period completeness (Sprint 1) ─────────────────────────────────
// Validates that the uploaded GL appears to cover the FULL period claimed,
// not a partial upload or wrong-period upload.

async function checkPeriodCompleteness(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  // Fetch daily activity summary
  const sql = `
    SELECT transaction_date AS date,
           COUNT(*) AS entries,
           COUNT(DISTINCT reference_number) AS vouchers
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
    GROUP BY transaction_date
    ORDER BY transaction_date
  `;

  let activeDays: { date: Date; entries: number; vouchers: number }[];
  try { activeDays = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  // Fetch voucher type distribution
  const typeSql = `
    SELECT LOWER(voucher_type) AS vtype, COUNT(*) AS entries,
           COUNT(DISTINCT reference_number) AS vouchers
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
      AND voucher_type IS NOT NULL
    GROUP BY LOWER(voucher_type)
  `;
  let typeStats: { vtype: string; entries: number; vouchers: number }[];
  try { typeStats = await runSql(typeSql, colMap, presentColumns); }
  catch { typeStats = []; }

  const concerns: Record<string, unknown>[] = [];

  // ── Concern 1: Empty period ──────────────────────────────────────────────
  if (activeDays.length === 0) {
    return {
      code:         "period_completeness",
      severity:     "critical",
      category:     "Period Validity",
      title:        "Period has no transactions",
      description:  "The uploaded data has zero transactions in the requested period. Upload may be empty or wrong period selected.",
      affectedRows: 0,
      exposure:     null,
      examples:     [{ issue: "no_transactions", periodStart: isoDate(start), periodEnd: isoDate(end) }],
    };
  }

  // ── Concern 2: Date coverage gaps ────────────────────────────────────────
  // Count weekdays in the period
  let totalWeekdays = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) totalWeekdays++; // Mon-Fri
  }

  const activeWeekdayDates = activeDays.filter((d) => {
    const dow = new Date(d.date).getDay();
    return dow >= 1 && dow <= 5;
  });

  const coverageRatio = totalWeekdays > 0 ? activeWeekdayDates.length / totalWeekdays : 1;

  if (coverageRatio < 0.4) {
    concerns.push({
      type: "low_coverage",
      activeWeekdays: activeWeekdayDates.length,
      totalWeekdays,
      coveragePct: Math.round(coverageRatio * 100),
      note: "Less than 40% of weekdays have activity — likely partial upload",
    });
  }

  // ── Concern 3: Missing voucher types ─────────────────────────────────────
  const vtypeNames = new Set(typeStats.map((t) => t.vtype));
  const expected = ["sales", "purchase", "receipt", "payment"];
  const missing = expected.filter((e) =>
    !Array.from(vtypeNames).some((v) => v.includes(e))
  );

  if (missing.length >= 3) {
    concerns.push({
      type: "missing_voucher_types",
      missingTypes: missing,
      foundTypes: Array.from(vtypeNames).slice(0, 10),
      note: `Period is missing ${missing.length} of 4 standard voucher types — likely partial upload`,
    });
  }

  // ── Concern 4: Suspiciously light/heavy activity ─────────────────────────
  const totalEntries = activeDays.reduce((s, d) => s + toNum(d.entries), 0);
  const avgPerWeekday = totalWeekdays > 0 ? totalEntries / totalWeekdays : 0;

  if (totalWeekdays >= 20 && avgPerWeekday < 2) {
    concerns.push({
      type: "very_light_activity",
      totalEntries,
      avgPerWeekday: Math.round(avgPerWeekday * 10) / 10,
      note: "Less than 2 entries per weekday on average — partial upload or very small business",
    });
  }

  // ── Concern 5: Date range mismatch (data extends well beyond period) ─────
  const minDateSql = `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${table}"`;
  try {
    const ranges = await runSql<{ min_d: Date; max_d: Date }>(minDateSql, colMap, presentColumns);
    if (ranges[0]) {
      const minD = new Date(ranges[0].min_d);
      const maxD = new Date(ranges[0].max_d);
      const periodMs = end.getTime() - start.getTime();
      const dataMs   = maxD.getTime() - minD.getTime();
      if (dataMs > periodMs * 1.5 && dataMs > 90 * 86_400_000) {
        concerns.push({
          type: "wider_data_range",
          dataStart: isoDate(minD),
          dataEnd:   isoDate(maxD),
          periodStart: isoDate(start),
          periodEnd:   isoDate(end),
          note: "Uploaded file spans well beyond the selected period — verify period selection",
        });
      }
    }
  } catch { /* ignore */ }

  if (concerns.length === 0) return null;

  return {
    code:         "period_completeness",
    severity:     concerns.some((c) => (c as { type: string }).type === "missing_voucher_types") ? "critical" : "review",
    category:     "Period Validity",
    title:        `Period coverage looks ${concerns.length === 1 ? "off" : "incomplete"}`,
    description:
      `Detected ${concerns.length} signal${concerns.length > 1 ? "s" : ""} that the uploaded data may not fully cover the requested period. ` +
      `Reconciliations and reports based on partial data will be misleading. Verify the upload before proceeding.`,
    affectedRows: concerns.length,
    exposure:     null,
    examples:     concerns,
  };
}

// ─── Check 9: TDS deduction (Indian Income Tax compliance) ───────────────────
//
// Section 194 of the Indian Income Tax Act requires TDS to be deducted on
// certain payments above threshold (most commonly ₹30,000 single / ₹1L aggregate
// for 194C contractor & 194J professional services). Failure to deduct =
// disallowance of expense under Sec 40(a)(ia) — 30% of the payment becomes
// taxable, plus interest u/s 201.
//
// We flag any payment / purchase voucher with total amount > ₹30,000 where
// no row in that voucher touches a TDS account. This is a review-severity
// signal (not certain — the TDS might be in a separate voucher), but it's the
// kind of thing CAs check manually every close.

async function checkTdsDeduction(
  table: string, start: Date, end: Date, colMap: Map<string, string>,
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  // Skip the check if essential columns are missing
  if (!presentColumns.has("reference_number") || !presentColumns.has("party_name")) {
    return null;
  }

  const sql = `
    WITH voucher_summary AS (
      SELECT
        reference_number,
        MAX(transaction_date)                                         AS dt,
        MAX(party_name)                                               AS party,
        MAX(voucher_type)                                             AS vtype,
        GREATEST(COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)) AS amount,
        BOOL_OR(LOWER(COALESCE(account_name, '')) LIKE '%tds%')        AS has_tds_line,
        BOOL_OR(LOWER(COALESCE(account_name, '')) LIKE '%creditor%' OR
                LOWER(COALESCE(voucher_type, ''))  LIKE '%purchase%'  OR
                LOWER(COALESCE(voucher_type, ''))  LIKE '%payment%'   OR
                LOWER(COALESCE(voucher_type, ''))  LIKE '%pur%'       OR
                LOWER(COALESCE(voucher_type, ''))  LIKE '%bp%')        AS is_vendor_payment
      FROM "${table}"
      WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
        AND reference_number IS NOT NULL AND reference_number <> ''
      GROUP BY reference_number
    )
    SELECT party, reference_number, dt, vtype, amount
    FROM voucher_summary
    WHERE amount > 30000
      AND party IS NOT NULL AND party <> ''
      AND is_vendor_payment
      AND NOT has_tds_line
    ORDER BY amount DESC
    LIMIT 50
  `;

  let rows: { party: string; reference_number: string; dt: Date; vtype: string; amount: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  if (rows.length === 0) return null;

  const totalExposure = rows.reduce((s, r) => s + toNum(r.amount), 0);
  // Potential tax disallowance under Sec 40(a)(ia) is 30% of the payment.
  // We report the FULL payment as exposure since that's what's at risk if
  // the deduction is required and not done.

  return {
    code:         "tds_potentially_missed",
    severity:     "review",
    category:     "Tax Compliance",
    title:        `${rows.length} vendor payment${rows.length > 1 ? "s" : ""} above ₹30,000 with no TDS deducted`,
    description:
      `Under Section 194 of the Income Tax Act, TDS must typically be deducted on vendor payments ` +
      `above ₹30,000 (contractor/professional services). Vouchers totalling ₹${totalExposure.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ` +
      `appear to lack a TDS line. If a deduction was required and not made, ` +
      `30% of these expenses may be disallowed under Sec 40(a)(ia) plus interest under Sec 201. ` +
      `Verify whether TDS was deducted in a separate journal entry, or whether the deduction was genuinely missed.`,
    affectedRows:   rows.length,
    exposure:       totalExposure,
    examples:       rows.slice(0, 5),
    affectedRefNos: rows.map((r) => r.reference_number).filter(Boolean),
  };
}

// ─── Check 10: Debtors aging ──────────────────────────────────────────────────
//
// The single most common thing a CA or finance manager checks at month-end.
// Finds receivable accounts with an outstanding debit balance and no recent
// credit activity — meaning money is owed and hasn't been collected.
//
// Uses mapped RECEIVABLE accounts first. Falls back to name heuristics
// (%debtor%, %receivable%, %sundry debtor%) if no mapping exists yet.

async function checkDebtorsAging(
  table: string, end: Date, colMap: Map<string, string>,
  receivableAccounts: string[],
  presentColumns: Set<string> = new Set()
): Promise<Issue | null> {
  // Build the account filter — prefer explicit mapping, fall back to name heuristics
  let acctFilter: string;
  if (receivableAccounts.length > 0) {
    const list = receivableAccounts.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    acctFilter = `account_name IN (${list})`;
  } else {
    // Heuristic: common naming patterns for debtor/receivable accounts in Indian SMEs
    acctFilter = `(
      LOWER(COALESCE(account_name, '')) LIKE '%debtor%'        OR
      LOWER(COALESCE(account_name, '')) LIKE '%receivable%'    OR
      LOWER(COALESCE(account_name, '')) LIKE '%sundry debtor%' OR
      LOWER(COALESCE(account_name, '')) LIKE '%trade receivable%'
    )`;
  }

  const sql = `
    SELECT
      account_name,
      COALESCE(SUM(debit_amount - credit_amount), 0) AS outstanding,
      MAX(transaction_date)                           AS last_txn,
      COUNT(*)                                        AS entries
    FROM "${table}"
    WHERE ${acctFilter}
      AND transaction_date <= '${isoDate(end)}'
    GROUP BY account_name
    HAVING SUM(debit_amount - credit_amount) > 1000
    ORDER BY outstanding DESC
    LIMIT 30
  `;

  let rows: { account_name: string; outstanding: number; last_txn: Date; entries: number }[];
  try { rows = await runSql(sql, colMap, presentColumns); }
  catch { return null; }

  if (rows.length === 0) return null;

  // Classify by how long since last receipt
  const cutoff60 = new Date(end); cutoff60.setDate(cutoff60.getDate() - 60);
  const cutoff90 = new Date(end); cutoff90.setDate(cutoff90.getDate() - 90);

  // Only flag accounts with no activity for 60+ days — active accounts are fine
  const stale = rows.filter((r) => new Date(r.last_txn) < cutoff60);
  if (stale.length === 0) return null;

  const totalOutstanding = stale.reduce((s, r) => s + toNum(r.outstanding), 0);
  const over90           = stale.filter((r) => new Date(r.last_txn) < cutoff90);

  return {
    code:         "debtors_overdue",
    severity:     over90.length > 0 ? "critical" : "review",
    category:     "Receivables",
    title:        `${stale.length} debtor${stale.length > 1 ? "s" : ""} with no recovery in 60+ days`,
    description:
      `${stale.length} receivable account${stale.length > 1 ? "s have" : " has"} an outstanding debit balance ` +
      `(total ₹${totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}) ` +
      `with no credit entry (payment received) in the last 60+ days. ` +
      (over90.length > 0
        ? `${over90.length} of these ${over90.length > 1 ? "are" : "is"} overdue >90 days — ` +
          `consider provisioning for bad debt per AS-9 / Ind AS 109.`
        : `Follow up on collection immediately to avoid bad debts.`),
    affectedRows:   stale.length,
    exposure:       totalOutstanding,
    examples:       stale.slice(0, 5),
    affectedRefNos: undefined, // account-level — highlighted by account_name in the lister
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runDataQualityScan(
  connectionId: string,
  startDate:    Date,
  endDate:      Date
): Promise<ScanResult> {
  const t0 = Date.now();

  const tableName = await getTableName(connectionId);
  if (!tableName) {
    throw new Error("No GL table found for this connection");
  }

  const [colMap, typeMap, presentColumns] = await Promise.all([
    buildColMap(connectionId),
    loadAccountTypeMap(connectionId),
    getTableColumns(tableName),
  ]);

  // Group accounts by category for the sign anomaly check
  const payable:    string[] = [];
  const receivable: string[] = [];
  for (const [name, type] of typeMap) {
    if (type === "PAYABLE")    payable.push(name);
    if (type === "RECEIVABLE") receivable.push(name);
  }

  // Run all checks in parallel — presentColumns lets each check make its SQL
  // defensive about missing optional columns (vendor_name, customer_name, etc.)
  const checkResults = await Promise.all([
    checkTrialBalance(tableName, startDate, endDate, colMap, presentColumns),
    checkDuplicateTransactions(tableName, startDate, endDate, colMap, presentColumns),
    checkDateOutliers(tableName, startDate, endDate, colMap, presentColumns),
    checkMissingFields(tableName, startDate, endDate, colMap, presentColumns),
    checkUnclassifiedAccounts(tableName, startDate, endDate, colMap, typeMap, presentColumns),
    checkGSTMismatch(tableName, startDate, endDate, colMap, presentColumns),
    checkSignAnomalies(tableName, startDate, endDate, colMap, payable, receivable, presentColumns),
    checkPeriodCompleteness(tableName, startDate, endDate, colMap, presentColumns),
    checkTdsDeduction(tableName, startDate, endDate, colMap, presentColumns),
    checkDebtorsAging(tableName, endDate, colMap, receivable, presentColumns),
  ]);

  const issues = checkResults.filter((i): i is Issue => i !== null);

  const bySeverity: Record<IssueSeverity, number> = { critical: 0, review: 0, info: 0 };
  let totalExposure = 0;
  for (const issue of issues) {
    bySeverity[issue.severity]++;
    if (issue.exposure) totalExposure += issue.exposure;
  }

  // Sort: critical first, then review, then info; within each, by exposure desc
  const severityRank: Record<IssueSeverity, number> = { critical: 0, review: 1, info: 2 };
  issues.sort((a, b) => {
    const r = severityRank[a.severity] - severityRank[b.severity];
    if (r !== 0) return r;
    return (b.exposure ?? 0) - (a.exposure ?? 0);
  });

  return {
    connectionId,
    tableName,
    startDate,
    endDate,
    scannedAt:     new Date(),
    durationMs:    Date.now() - t0,
    totalIssues:   issues.length,
    bySeverity,
    totalExposure,
    issues,
  };
}

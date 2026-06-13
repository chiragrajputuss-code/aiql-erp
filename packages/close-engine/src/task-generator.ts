/**
 * Adaptive Task Generator
 *
 * Inspects the connection's actual GL data + scan results, then generates
 * a customer-specific close-task list. No fixed 14-task template — only
 * tasks that are RELEVANT to this customer's data shape and anomalies.
 *
 * Three sources of tasks:
 *   1. Always-included: Opening balance verification, P&L/BS review, sign-off
 *   2. Account-driven: Bank/AP/AR/GST/Inventory recon — only if accounts exist
 *   3. Anomaly-driven: Tasks generated from scan critical/review issues
 *
 * Profile shapes the output:
 *   STANDARD  — full template (default)
 *   QUICK     — strip to bank recon + critical anomalies + sign-off
 *   YEAR_END  — STANDARD + year-end accruals/depreciation/26AS/inventory count
 *   ADAPTIVE  — STANDARD + tasks driven by parsed user intent
 */

import { loadAccountTypeMap, accountsByType } from "./utils/column-mapping";
import { runDataQualityScan, type ScanResult, type Issue } from "./scanner";
import type { CloseTemplate, CloseTaskTemplate, ReconciliationTemplate } from "./types";
import { sanitiseWatchAccount, type CloseIntent } from "./intent-parser";

// Re-exported here so callers don't have to import @aiql/db just for this.
export type CloseProfile = "STANDARD" | "QUICK" | "YEAR_END" | "ADAPTIVE";

export interface GenerateOptions {
  profile?: CloseProfile;
  intent?:  CloseIntent | null;
  /**
   * Pre-fetched context (scan + accountTypeMap). When provided, skips the
   * expensive DB+SQL work. Use for diff/preview flows that generate multiple
   * templates from the same underlying data.
   */
  context?: CloseContext;
}

/**
 * Pre-computed inputs for `generateAdaptiveTemplate`. Building these requires
 * a DB read + a full SQL scan, both of which are independent of profile.
 * Computed once and shared across multiple template generations.
 */
export interface CloseContext {
  accounts: ReturnType<typeof accountsByType>;
  scanResult: ScanResult;
}

export async function prepareCloseContext(
  connectionId: string,
  startDate:    Date,
  endDate:      Date
): Promise<CloseContext> {
  const typeMap = await loadAccountTypeMap(connectionId);
  return {
    accounts:   accountsByType(typeMap),
    scanResult: await runDataQualityScan(connectionId, startDate, endDate),
  };
}

// ─── Reconciliation SQL builders ────────────────────────────────────────────
//
// Each recon compares TWO INDEPENDENT VIEWS of the same data.
// If they don't match, there's a real data quality issue (misposted entries,
// missing party attribution, etc.). These work on internal data only — no
// external bank statements / GSTR / vendor master needed.

function bankReconRecon(): ReconciliationTemplate {
  return {
    name: "Bank Internal Consistency Check",
    sourceQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE (LOWER(account_name) LIKE '%bank%' OR LOWER(account_name) LIKE '%cash%')
        AND transaction_date BETWEEN '{startDate}' AND '{endDate}'
    `,
    targetQuery: `
      SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
      FROM {tableName}
      WHERE reference_number IN (
        SELECT DISTINCT reference_number FROM {tableName}
        WHERE (LOWER(account_name) LIKE '%bank%' OR LOWER(account_name) LIKE '%cash%')
          AND transaction_date BETWEEN '{startDate}' AND '{endDate}'
          AND reference_number IS NOT NULL
      )
        AND NOT (LOWER(account_name) LIKE '%bank%' OR LOWER(account_name) LIKE '%cash%')
        AND transaction_date BETWEEN '{startDate}' AND '{endDate}'
    `,
    detailQuery: `
      SELECT reference_number, transaction_date, account_name,
             debit_amount, credit_amount
      FROM {tableName}
      WHERE reference_number IN (
        SELECT reference_number FROM {tableName}
        WHERE (LOWER(account_name) LIKE '%bank%' OR LOWER(account_name) LIKE '%cash%')
          AND transaction_date BETWEEN '{startDate}' AND '{endDate}'
        GROUP BY reference_number
        HAVING ABS(SUM(debit_amount) - SUM(credit_amount)) > 0.01
      )
      ORDER BY reference_number, transaction_date
      LIMIT 50
    `,
    varianceThreshold: 1,
  };
}

function apRecon(): ReconciliationTemplate {
  return {
    name: "AP Control vs Vendor Subsidiary",
    sourceQuery: `
      SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date <= '{endDate}'
        AND (LOWER(account_name) LIKE '%sundry creditor%'
          OR LOWER(account_name) LIKE '%creditor%'
          OR LOWER(account_name) LIKE '%payable%')
    `,
    targetQuery: `
      SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date <= '{endDate}'
        AND (LOWER(account_name) LIKE '%sundry creditor%'
          OR LOWER(account_name) LIKE '%creditor%'
          OR LOWER(account_name) LIKE '%payable%')
        AND COALESCE(vendor_name, party_name) IS NOT NULL
        AND COALESCE(vendor_name, party_name) <> ''
    `,
    detailQuery: `
      SELECT transaction_date, reference_number, account_name,
             COALESCE(vendor_name, party_name, '(NO VENDOR)') AS vendor,
             debit_amount, credit_amount
      FROM {tableName}
      WHERE transaction_date <= '{endDate}'
        AND (LOWER(account_name) LIKE '%sundry creditor%'
          OR LOWER(account_name) LIKE '%creditor%'
          OR LOWER(account_name) LIKE '%payable%')
        AND (vendor_name IS NULL OR vendor_name = '')
        AND (party_name IS NULL OR party_name = '')
      ORDER BY transaction_date DESC
      LIMIT 50
    `,
    varianceThreshold: 1,
  };
}

function arRecon(): ReconciliationTemplate {
  return {
    name: "AR Control vs Customer Subsidiary",
    sourceQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date <= '{endDate}'
        AND (LOWER(account_name) LIKE '%sundry debtor%'
          OR LOWER(account_name) LIKE '%debtor%'
          OR LOWER(account_name) LIKE '%receivable%')
    `,
    targetQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date <= '{endDate}'
        AND (LOWER(account_name) LIKE '%sundry debtor%'
          OR LOWER(account_name) LIKE '%debtor%'
          OR LOWER(account_name) LIKE '%receivable%')
        AND COALESCE(customer_name, party_name) IS NOT NULL
        AND COALESCE(customer_name, party_name) <> ''
    `,
    detailQuery: `
      SELECT transaction_date, reference_number, account_name,
             COALESCE(customer_name, party_name, '(NO CUSTOMER)') AS customer,
             debit_amount, credit_amount
      FROM {tableName}
      WHERE transaction_date <= '{endDate}'
        AND (LOWER(account_name) LIKE '%sundry debtor%'
          OR LOWER(account_name) LIKE '%debtor%'
          OR LOWER(account_name) LIKE '%receivable%')
        AND (customer_name IS NULL OR customer_name = '')
        AND (party_name IS NULL OR party_name = '')
      ORDER BY transaction_date DESC
      LIMIT 50
    `,
    varianceThreshold: 1,
  };
}

function gstRecon(): ReconciliationTemplate {
  return {
    name: "GST Output vs Sales-Implied",
    sourceQuery: `
      SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND (LOWER(account_name) LIKE '%cgst output%'
          OR LOWER(account_name) LIKE '%sgst output%'
          OR LOWER(account_name) LIKE '%igst output%')
    `,
    targetQuery: `
      SELECT COALESCE(SUM(credit_amount - debit_amount), 0) * 0.18 AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(voucher_type) IN ('sales', 'tax invoice', 'sales invoice')
        AND LOWER(account_name) LIKE 'sales%'
    `,
    detailQuery: `
      SELECT reference_number, transaction_date, account_name,
             debit_amount, credit_amount
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(voucher_type) IN ('sales', 'tax invoice', 'sales invoice')
        AND reference_number NOT IN (
          SELECT DISTINCT reference_number FROM {tableName}
          WHERE LOWER(account_name) LIKE '%gst%'
            AND reference_number IS NOT NULL
        )
      ORDER BY transaction_date
      LIMIT 50
    `,
    varianceThreshold: 100,
  };
}

function inventoryRecon(): ReconciliationTemplate {
  return {
    name: "Inventory Movement vs Purchase-Sales Net",
    sourceQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND (LOWER(account_name) LIKE '%stock%' OR LOWER(account_name) LIKE '%inventory%')
    `,
    targetQuery: `
      SELECT COALESCE(SUM(
        CASE
          WHEN LOWER(voucher_type) IN ('purchase', 'purchase invoice', 'material receipt', 'goods receipt')
            AND LOWER(account_name) NOT LIKE '%gst%'
            AND LOWER(account_name) NOT LIKE '%creditor%'
            AND LOWER(account_name) NOT LIKE '%payable%'
          THEN debit_amount - credit_amount
          WHEN LOWER(voucher_type) IN ('sales', 'sales invoice', 'tax invoice')
            AND (LOWER(account_name) LIKE 'cogs%' OR LOWER(account_name) LIKE '%cost of goods%')
          THEN -(debit_amount - credit_amount)
          ELSE 0
        END
      ), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
    `,
    detailQuery: `
      SELECT transaction_date, voucher_type, account_name,
             reference_number, debit_amount, credit_amount
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND (LOWER(account_name) LIKE '%stock%' OR LOWER(account_name) LIKE '%inventory%')
      ORDER BY transaction_date
      LIMIT 50
    `,
    varianceThreshold: 1000,
  };
}

/**
 * Custom recon for an account-name fragment the user explicitly called out.
 *
 * SECURITY: SQL is built by string interpolation because reconciliations are
 * stored as fully-resolved SQL strings (see Reconciliation model + runSql in
 * reconciliation.ts which uses $queryRawUnsafe). Defence is layered:
 *
 *   1. intent-parser sanitiseWatchAccount() — first gate, filters at parse time
 *   2. This function — second gate, returns null to skip the recon entirely
 *      if the fragment is unsafe (e.g. crafted to bypass layer 1)
 *   3. runSql() WRITE_PATTERNS check — blocks DML even if 1+2 fail
 *
 * Returns null if the input is not safe; caller MUST handle null by skipping
 * the watch task altogether.
 */
function customWatchRecon(name: string): ReconciliationTemplate | null {
  const safe = sanitiseWatchAccount(name);
  if (!safe) return null;
  // The watch fragment is bound at execution time as $1, NOT interpolated.
  // sanitiseWatchAccount above is the first defence (allow-list).
  // Bound parameters are the second defence (no SQL injection vector at all).
  const likePattern = `%${safe.toLowerCase()}%`;
  return {
    name: `Watch: ${safe}`,
    sourceQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(account_name) LIKE $1
    `,
    targetQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(account_name) LIKE $1
        AND reference_number IS NOT NULL
    `,
    detailQuery: `
      SELECT transaction_date, reference_number, account_name,
             debit_amount, credit_amount
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(account_name) LIKE $1
      ORDER BY transaction_date DESC
      LIMIT 50
    `,
    params: [likePattern],
    varianceThreshold: 1,
  };
}

/**
 * Custom recon for a party/vendor/customer name fragment the user called out.
 * Queries the party_name column instead of account_name, so "Ganesh Traders"
 * surfaces every entry (purchase, payment, journal) touching that party.
 *
 * Same security layering as customWatchRecon — sanitiseWatchAccount is the
 * first gate; null return means the caller must skip the task entirely.
 */
function customWatchPartyRecon(partyFragment: string): ReconciliationTemplate | null {
  const safe = sanitiseWatchAccount(partyFragment);
  if (!safe) return null;
  const likePattern = `%${safe.toLowerCase()}%`;
  return {
    name: `Party deep-dive: ${safe}`,
    sourceQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(COALESCE(party_name, '')) LIKE $1
    `,
    targetQuery: `
      SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(COALESCE(party_name, '')) LIKE $1
        AND reference_number IS NOT NULL
    `,
    detailQuery: `
      SELECT transaction_date, reference_number, voucher_type,
             account_name, party_name, debit_amount, credit_amount, description
      FROM {tableName}
      WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
        AND LOWER(COALESCE(party_name, '')) LIKE $1
      ORDER BY transaction_date DESC
      LIMIT 100
    `,
    params: [likePattern],
    varianceThreshold: 1,
  };
}

// ─── Issue → task title/description mapping ──────────────────────────────────

function issueTaskTitle(issue: Issue): string {
  const titles: Record<string, string> = {
    voucher_imbalance:        `Resolve ${issue.affectedRows} voucher${issue.affectedRows > 1 ? "s" : ""} where Dr ≠ Cr`,
    duplicate_transactions:   `Review ${issue.affectedRows} possible duplicate transaction${issue.affectedRows > 1 ? "s" : ""}`,
    date_outliers:            `Verify ${issue.affectedRows} entries dated outside the period`,
    missing_fields:           `Fill in ${issue.affectedRows} entries with missing fields`,
    unclassified_accounts:    `Classify ${issue.affectedRows} unmapped account${issue.affectedRows > 1 ? "s" : ""}`,
    gst_mismatch:             `Fix ${issue.affectedRows} voucher${issue.affectedRows > 1 ? "s" : ""} with CGST ≠ SGST`,
    sign_anomalies:           `Investigate ${issue.affectedRows} account${issue.affectedRows > 1 ? "s" : ""} with unusual sign`,
    period_completeness:      `Verify period coverage — uploaded data may be incomplete`,
  };
  return titles[issue.code] ?? `Resolve: ${issue.title}`;
}

// ─── Profile-aware feature flags ─────────────────────────────────────────────

interface ProfileFlags {
  includeAccountRecons: boolean;   // bank/ap/ar/gst/inventory
  includeBSReview:      boolean;
  includePLReview:      boolean;
  includeFlux:          boolean;
  includeReviewIssues:  boolean;   // severity = "review" issues become tasks
  includeYearEndExtras: boolean;   // depreciation, accruals, 26AS, physical count
  templateName:         string;
}

function flagsFor(profile: CloseProfile): ProfileFlags {
  switch (profile) {
    case "QUICK":
      return {
        includeAccountRecons: false,  // bank-only handled separately
        includeBSReview:      false,
        includePLReview:      true,
        includeFlux:          false,
        includeReviewIssues:  false,  // critical only
        includeYearEndExtras: false,
        templateName:         "Quick Close",
      };
    case "YEAR_END":
      return {
        includeAccountRecons: true,
        includeBSReview:      true,
        includePLReview:      true,
        includeFlux:          true,
        includeReviewIssues:  true,
        includeYearEndExtras: true,
        templateName:         "Year-End Close",
      };
    case "ADAPTIVE":
      return {
        includeAccountRecons: true,
        includeBSReview:      true,
        includePLReview:      true,
        includeFlux:          true,
        includeReviewIssues:  true,
        includeYearEndExtras: false,
        templateName:         "Adaptive Close",
      };
    case "STANDARD":
    default:
      return {
        includeAccountRecons: true,
        includeBSReview:      true,
        includePLReview:      true,
        includeFlux:          true,
        includeReviewIssues:  true,
        includeYearEndExtras: false,
        templateName:         "Standard Monthly Close",
      };
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function generateAdaptiveTemplate(
  connectionId: string,
  startDate:    Date,
  endDate:      Date,
  options:      GenerateOptions = {}
): Promise<{ template: CloseTemplate; scanResult: ScanResult; reasoning: string[] }> {
  const profile = options.profile ?? "STANDARD";
  const intent  = options.intent ?? null;
  const flags   = flagsFor(profile);

  // 1. Load context — use pre-fetched if provided (preview/diff flows pass it
  //    in to avoid running the scan twice).
  const ctx = options.context ?? await prepareCloseContext(connectionId, startDate, endDate);
  const accounts   = ctx.accounts;
  const scanResult = ctx.scanResult;

  const tasks: CloseTaskTemplate[] = [];
  const reasoning: string[] = [];
  let order = 1;

  reasoning.push(`Profile: ${profile} (${flags.templateName})`);
  if (intent && intent.confidence > 0.3) {
    reasoning.push(`User intent: ${intent.rationale}`);
  }

  // Helper: was a task key explicitly excluded by user intent?
  const isExcluded = (key: string): boolean =>
    intent?.exclusions?.includes(key as never) ?? false;

  // Helper: emphasised area? (used to bump sortOrder priority for ADAPTIVE)
  const isFocused = (area: string): boolean =>
    intent?.focusAreas?.includes(area as never) ?? false;

  // ── Always include: Opening balance verification ─────────────────────────
  tasks.push({
    key:           "opening-balance",
    title:         "Verify Opening Balances",
    description:   "Confirm the trial balance opening figures match the prior period closing balances.",
    category:      "REVIEW",
    autoComplete:  false,
    dependsOnKeys: [],
    sortOrder:     order++,
  });
  reasoning.push("Always: Opening balance verification (mandatory)");

  // ── Anomaly-driven: tasks per scan issue ─────────────────────────────────
  const actionableIssues = flags.includeReviewIssues
    ? scanResult.issues.filter((i) => i.severity !== "info")
    : scanResult.issues.filter((i) => i.severity === "critical");

  for (const issue of actionableIssues) {
    tasks.push({
      key:           `fix-${issue.code}`,
      title:         issueTaskTitle(issue),
      description:   issue.description,
      category:      "CUSTOM",
      autoComplete:  false,
      dependsOnKeys: ["opening-balance"],
      sortOrder:     order++,
    });
    reasoning.push(
      `Anomaly (${issue.severity}): ${issueTaskTitle(issue)}` +
      (issue.exposure ? ` — ₹${issue.exposure.toLocaleString("en-IN", { maximumFractionDigits: 0 })} exposure` : "")
    );
  }

  // ── Account-driven: Reconciliations ─────────────────────────────────────
  const reconDeps: string[] = ["opening-balance"];
  for (const t of tasks.filter((tk) => tk.category === "CUSTOM")) reconDeps.push(t.key);

  // Bank recon: included for STANDARD/YEAR_END/ADAPTIVE; for QUICK only if
  // bank focus or accounts exist (this is the one essential recon for QUICK).
  const includeBank =
    accounts.bank.length > 0 &&
    !isExcluded("bank-recon") &&
    (flags.includeAccountRecons || profile === "QUICK");

  if (includeBank) {
    tasks.push({
      key:           "bank-recon",
      title:         `Bank Reconciliation (${accounts.bank.length} account${accounts.bank.length > 1 ? "s" : ""})`,
      description:   `Reconcile GL bank account balances. Affected accounts: ${accounts.bank.slice(0, 3).join(", ")}${accounts.bank.length > 3 ? `, +${accounts.bank.length - 3} more` : ""}.`,
      category:      "RECONCILIATION",
      autoComplete:  true,
      dependsOnKeys: reconDeps,
      sortOrder:     isFocused("bank") ? 0 : order++,
      reconciliation: bankReconRecon(),
    });
    reasoning.push(`Account-driven: Bank recon (${accounts.bank.length} bank/cash account(s))`);
  } else if (accounts.bank.length === 0) {
    reasoning.push("Skipped: Bank recon — no bank/cash accounts found");
  } else if (isExcluded("bank-recon")) {
    reasoning.push("Skipped: Bank recon — excluded by user intent");
  }

  if (flags.includeAccountRecons) {
    if (accounts.payable.length > 0 && !isExcluded("ap-recon")) {
      tasks.push({
        key:           "ap-recon",
        title:         `AP Subledger Reconciliation (${accounts.payable.length} account${accounts.payable.length > 1 ? "s" : ""})`,
        description:   `Verify AP aging matches control account. Affected: ${accounts.payable.slice(0, 3).join(", ")}${accounts.payable.length > 3 ? `, +${accounts.payable.length - 3} more` : ""}.`,
        category:      "RECONCILIATION",
        autoComplete:  true,
        dependsOnKeys: reconDeps,
        sortOrder:     isFocused("ap") ? 0 : order++,
        reconciliation: apRecon(),
      });
      reasoning.push(`Account-driven: AP recon (${accounts.payable.length} payable account(s))`);
    } else if (accounts.payable.length === 0) {
      reasoning.push("Skipped: AP recon — no payable accounts found");
    } else if (isExcluded("ap-recon")) {
      reasoning.push("Skipped: AP recon — excluded by user intent");
    }

    if (accounts.receivable.length > 0 && !isExcluded("ar-recon")) {
      tasks.push({
        key:           "ar-recon",
        title:         `AR Subledger Reconciliation (${accounts.receivable.length} account${accounts.receivable.length > 1 ? "s" : ""})`,
        description:   `Verify AR aging matches control account. Affected: ${accounts.receivable.slice(0, 3).join(", ")}${accounts.receivable.length > 3 ? `, +${accounts.receivable.length - 3} more` : ""}.`,
        category:      "RECONCILIATION",
        autoComplete:  true,
        dependsOnKeys: reconDeps,
        sortOrder:     isFocused("ar") ? 0 : order++,
        reconciliation: arRecon(),
      });
      reasoning.push(`Account-driven: AR recon (${accounts.receivable.length} receivable account(s))`);
    } else if (accounts.receivable.length === 0) {
      reasoning.push("Skipped: AR recon — no receivable accounts found");
    } else if (isExcluded("ar-recon")) {
      reasoning.push("Skipped: AR recon — excluded by user intent");
    }

    if (accounts.tax.length > 0 && !isExcluded("gst-recon")) {
      const gstDeps = ["ap-recon", "ar-recon"].filter((k) => tasks.some((t) => t.key === k));
      tasks.push({
        key:           "gst-recon",
        title:         `GST Reconciliation (${accounts.tax.length} tax account${accounts.tax.length > 1 ? "s" : ""})`,
        description:   `Reconcile CGST/SGST/IGST balances. Affected: ${accounts.tax.slice(0, 3).join(", ")}${accounts.tax.length > 3 ? `, +${accounts.tax.length - 3} more` : ""}.`,
        category:      "RECONCILIATION",
        autoComplete:  true,
        dependsOnKeys: gstDeps.length > 0 ? gstDeps : ["opening-balance"],
        sortOrder:     isFocused("gst") ? 0 : order++,
        reconciliation: gstRecon(),
      });
      reasoning.push(`Account-driven: GST recon (${accounts.tax.length} tax account(s))`);
    } else if (accounts.tax.length === 0) {
      reasoning.push("Skipped: GST recon — no GST/tax accounts found");
    } else if (isExcluded("gst-recon")) {
      reasoning.push("Skipped: GST recon — excluded by user intent");
    }

    if (accounts.inventory.length > 0 && !isExcluded("inventory-recon")) {
      tasks.push({
        key:           "inventory-recon",
        title:         `Inventory Reconciliation (${accounts.inventory.length} account${accounts.inventory.length > 1 ? "s" : ""})`,
        description:   `Reconcile stock ledger to GL. Affected: ${accounts.inventory.slice(0, 3).join(", ")}${accounts.inventory.length > 3 ? `, +${accounts.inventory.length - 3} more` : ""}.`,
        category:      "RECONCILIATION",
        autoComplete:  true,
        dependsOnKeys: ["opening-balance"],
        sortOrder:     isFocused("inventory") ? 0 : order++,
        reconciliation: inventoryRecon(),
      });
      reasoning.push(`Account-driven: Inventory recon (${accounts.inventory.length} inventory account(s))`);
    } else if (accounts.inventory.length === 0) {
      reasoning.push("Skipped: Inventory recon — no inventory accounts found");
    } else if (isExcluded("inventory-recon")) {
      reasoning.push("Skipped: Inventory recon — excluded by user intent");
    }
  }

  // ── User-intent-driven custom watch tasks (accounts) ────────────────────
  if (intent && intent.watchAccounts.length > 0) {
    for (const fragment of intent.watchAccounts) {
      const recon = customWatchRecon(fragment);
      if (!recon) {
        reasoning.push(`Skipped: watch fragment "${fragment}" rejected by SQL safety check`);
        continue;
      }
      const key = `watch-${slugify(fragment)}`;
      tasks.push({
        key,
        title:         `Review activity in "${fragment}"`,
        description:   `User-flagged account fragment. Inspect all transactions whose account name contains "${fragment}".`,
        category:      "REVIEW",
        autoComplete:  false,
        dependsOnKeys: ["opening-balance"],
        sortOrder:     0,
        reconciliation: recon,
      });
      reasoning.push(`User-flagged: Watch account "${fragment}"`);
    }
  }

  // ── User-intent-driven party deep-dive tasks ─────────────────────────────
  if (intent && (intent.watchParties ?? []).length > 0) {
    for (const party of intent.watchParties!) {
      const recon = customWatchPartyRecon(party);
      if (!recon) {
        reasoning.push(`Skipped: party fragment "${party}" rejected by SQL safety check`);
        continue;
      }
      const key = `party-${slugify(party)}`;
      tasks.push({
        key,
        title:         `Deep-dive: ${party}`,
        description:   `Review all transactions involving "${party}" — purchases, payments, receipts, and journals. Verify ITC, outstanding balances, and posting correctness.`,
        category:      "REVIEW",
        autoComplete:  false,
        dependsOnKeys: ["opening-balance"],
        sortOrder:     0,
        reconciliation: recon,
      });
      reasoning.push(`User-flagged: Party deep-dive "${party}"`);
    }
  }

  // ── Risk-flag review tasks (one consolidated task) ───────────────────────
  if (intent && (intent.riskFlags.length > 0 || intent.oneOffEvents.length > 0)) {
    const items: string[] = [];
    if (intent.riskFlags.length > 0)    items.push(...intent.riskFlags.map((f) => `Risk: ${f}`));
    if (intent.oneOffEvents.length > 0) items.push(...intent.oneOffEvents.map((e) => `One-off: ${e}`));
    tasks.push({
      key:           "user-risk-review",
      title:         "Review user-flagged risks & one-off events",
      description:   items.join("\n• "),
      category:      "REVIEW",
      autoComplete:  false,
      dependsOnKeys: ["opening-balance"],
      sortOrder:     0,
    });
    reasoning.push(`User-flagged: ${items.length} risk/one-off item(s) for review`);
  }

  // ── Year-end extras ─────────────────────────────────────────────────────
  if (flags.includeYearEndExtras) {
    tasks.push({
      key:           "ye-accruals",
      title:         "Year-end accruals & provisions",
      description:   "Book outstanding expenses, accrued income, gratuity, leave encashment, and other year-end provisions.",
      category:      "REVIEW",
      autoComplete:  false,
      dependsOnKeys: ["opening-balance"],
      sortOrder:     order++,
    });
    tasks.push({
      key:           "ye-depreciation",
      title:         "Depreciation & fixed-asset register",
      description:   "Run depreciation for the full year, reconcile FAR with GL, post any disposals.",
      category:      "REVIEW",
      autoComplete:  false,
      dependsOnKeys: ["opening-balance"],
      sortOrder:     order++,
    });
    tasks.push({
      key:           "ye-26as",
      title:         "26AS / TDS reconciliation",
      description:   "Match 26AS to TDS receivable in books; investigate any mismatch.",
      category:      "RECONCILIATION",
      autoComplete:  false,
      dependsOnKeys: ["opening-balance"],
      sortOrder:     order++,
    });
    if (accounts.inventory.length > 0) {
      tasks.push({
        key:           "ye-physical-count",
        title:         "Physical inventory count vs book stock",
        description:   "Compare physical count results to GL inventory balance; book shortage/excess as appropriate.",
        category:      "RECONCILIATION",
        autoComplete:  false,
        dependsOnKeys: ["opening-balance"],
        sortOrder:     order++,
      });
    }
    reasoning.push(`Year-end extras: accruals, depreciation, 26AS${accounts.inventory.length > 0 ? ", inventory count" : ""}`);
  }

  // ── Period-end review tasks ─────────────────────────────────────────────
  const reviewDeps = tasks
    .filter((t) => t.category === "RECONCILIATION" || t.key.startsWith("fix-") || t.key.startsWith("watch-"))
    .map((t) => t.key);
  if (reviewDeps.length === 0) reviewDeps.push("opening-balance");

  if (flags.includePLReview && !isExcluded("pl-review")) {
    tasks.push({
      key:           "pl-review",
      title:         "P&L Review",
      description:   "Review income statement for unusual items, large variances, or missing entries.",
      category:      "REVIEW",
      autoComplete:  false,
      dependsOnKeys: reviewDeps,
      sortOrder:     order++,
    });
  }

  if (flags.includeBSReview && !isExcluded("bs-review")) {
    tasks.push({
      key:           "bs-review",
      title:         "Balance Sheet Review",
      description:   "Review balance sheet accounts for unusual balances or reconciling items.",
      category:      "REVIEW",
      autoComplete:  false,
      dependsOnKeys: reviewDeps,
      sortOrder:     order++,
    });
  }

  if (flags.includeFlux && !isExcluded("flux-analysis")) {
    const fluxDescription = profile === "YEAR_END"
      ? "Compare current year balances against the prior year. Material variances (>₹50K AND >10%) are flagged with AI-generated explanations."
      : "Compare current period balances against the prior period. Material variances (>₹50K AND >10%) are flagged with AI-generated explanations.";
    tasks.push({
      key:           "flux-analysis",
      title:         profile === "YEAR_END" ? "Year-on-Year Flux Analysis" : "Flux Analysis",
      description:   fluxDescription,
      category:      "FLUX_ANALYSIS",
      autoComplete:  false,
      dependsOnKeys: tasks.some((t) => t.key === "pl-review") ? ["pl-review"] : reviewDeps,
      sortOrder:     order++,
    });
  } else if (isExcluded("flux-analysis")) {
    reasoning.push("Skipped: Flux analysis — excluded by user intent");
  }

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffDeps = ["pl-review", "bs-review", "flux-analysis"].filter(
    (k) => tasks.some((t) => t.key === k)
  );
  tasks.push({
    key:           "cfo-signoff",
    title:         profile === "YEAR_END" ? "Year-end CFO Sign-off" : "CFO Sign-off",
    description:   "Final approval. Period is locked after this.",
    category:      "APPROVAL",
    autoComplete:  false,
    dependsOnKeys: signoffDeps.length > 0 ? signoffDeps : ["opening-balance"],
    sortOrder:     order++,
  });

  reasoning.push(`Always: CFO Sign-off`);

  // Renumber sortOrder so user-flagged items (sortOrder=0) sort before others,
  // but everything else preserves its insertion order.
  tasks.sort((a, b) => {
    if (a.sortOrder === 0 && b.sortOrder !== 0) return -1;
    if (a.sortOrder !== 0 && b.sortOrder === 0) return 1;
    return a.sortOrder - b.sortOrder;
  });
  tasks.forEach((t, i) => { t.sortOrder = i + 1; });

  return {
    template: {
      id:         `${profile.toLowerCase()}-${connectionId}-${startDate.toISOString().slice(0, 10)}`,
      name:       flags.templateName,
      periodType: profile === "YEAR_END" ? "ANNUAL" : "MONTHLY",
      tasks,
    },
    scanResult,
    reasoning,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "watch";
}

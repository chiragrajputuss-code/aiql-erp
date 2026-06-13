import type { CloseTemplate } from "../types";

/**
 * Standard 14-task monthly close template for Indian SME GL data.
 *
 * Column names used match the canonical names from the column mapper:
 *   transaction_date, account_name, debit_amount, credit_amount,
 *   voucher_type, reference_number, party_name, description
 *
 * SQL placeholders: {tableName}, {startDate}, {endDate}
 */
export const MONTHLY_CLOSE_TEMPLATE: CloseTemplate = {
  id: "monthly-close-v1",
  name: "Monthly Close",
  periodType: "MONTHLY",
  tasks: [
    // ── 1. Opening balance verification ─────────────────────────────────────
    {
      key: "opening-balance",
      title: "Verify Opening Balances",
      description: "Confirm trial balance opening figures match prior period closing balances.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: [],
      sortOrder: 1,
    },

    // ── 2. Bank reconciliation ───────────────────────────────────────────────
    {
      key: "bank-recon",
      title: "Bank Reconciliation",
      description: "Reconcile GL bank account balance against bank statement closing balance.",
      category: "RECONCILIATION",
      autoComplete: true,
      dependsOnKeys: ["opening-balance"],
      sortOrder: 2,
      reconciliation: {
        name: "Bank Balance Reconciliation",
        sourceQuery: `
          SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
          FROM {tableName}
          WHERE (LOWER(account_name) LIKE '%bank%'
              OR LOWER(account_name) LIKE '%cash%')
            AND transaction_date <= '{endDate}'
        `,
        targetQuery: `
          SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
          FROM {tableName}
          WHERE (LOWER(account_name) LIKE '%bank%'
              OR LOWER(account_name) LIKE '%cash%')
            AND transaction_date BETWEEN '{startDate}' AND '{endDate}'
        `,
        detailQuery: `
          SELECT transaction_date, reference_number, description,
                 debit_amount, credit_amount,
                 (credit_amount - debit_amount) AS net
          FROM {tableName}
          WHERE (LOWER(account_name) LIKE '%bank%'
              OR LOWER(account_name) LIKE '%cash%')
            AND transaction_date BETWEEN '{startDate}' AND '{endDate}'
          ORDER BY transaction_date
          LIMIT 50
        `,
        varianceThreshold: 0,
      },
    },

    // ── 3. AP subledger reconciliation ──────────────────────────────────────
    {
      key: "ap-recon",
      title: "AP Subledger Reconciliation",
      description: "Verify AP aging total matches the AP control account in the GL.",
      category: "RECONCILIATION",
      autoComplete: true,
      dependsOnKeys: ["opening-balance"],
      sortOrder: 3,
      reconciliation: {
        name: "AP Control vs Subledger",
        sourceQuery: `
          SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%sundry creditor%'
              OR LOWER(account_name) LIKE '%accounts payable%'
              OR LOWER(account_name) LIKE '%creditor%'
              OR LOWER(account_name) LIKE '%payable%')
        `,
        targetQuery: `
          SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%sundry creditor%'
              OR LOWER(account_name) LIKE '%accounts payable%'
              OR LOWER(account_name) LIKE '%creditor%'
              OR LOWER(account_name) LIKE '%payable%')
            AND vendor_name IS NOT NULL
            AND vendor_name <> ''
        `,
        detailQuery: `
          SELECT COALESCE(party_name, vendor_name, account_name) AS party,
                 SUM(debit_amount - credit_amount) AS outstanding
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%sundry creditor%'
              OR LOWER(account_name) LIKE '%accounts payable%'
              OR LOWER(account_name) LIKE '%creditor%'
              OR LOWER(account_name) LIKE '%payable%')
          GROUP BY COALESCE(party_name, vendor_name, account_name)
          HAVING ABS(SUM(debit_amount - credit_amount)) > 0.01
          ORDER BY outstanding DESC
          LIMIT 20
        `,
        varianceThreshold: 1,
      },
    },

    // ── 4. AR subledger reconciliation ──────────────────────────────────────
    {
      key: "ar-recon",
      title: "AR Subledger Reconciliation",
      description: "Verify AR aging total matches the AR control account in the GL.",
      category: "RECONCILIATION",
      autoComplete: true,
      dependsOnKeys: ["opening-balance"],
      sortOrder: 4,
      reconciliation: {
        name: "AR Control vs Subledger",
        sourceQuery: `
          SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%sundry debtor%'
              OR LOWER(account_name) LIKE '%accounts receivable%'
              OR LOWER(account_name) LIKE '%debtor%'
              OR LOWER(account_name) LIKE '%receivable%')
        `,
        targetQuery: `
          SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%sundry debtor%'
              OR LOWER(account_name) LIKE '%accounts receivable%'
              OR LOWER(account_name) LIKE '%debtor%'
              OR LOWER(account_name) LIKE '%receivable%')
            AND customer_name IS NOT NULL
            AND customer_name <> ''
        `,
        detailQuery: `
          SELECT COALESCE(party_name, customer_name, account_name) AS party,
                 SUM(credit_amount - debit_amount) AS outstanding
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%sundry debtor%'
              OR LOWER(account_name) LIKE '%accounts receivable%'
              OR LOWER(account_name) LIKE '%debtor%'
              OR LOWER(account_name) LIKE '%receivable%')
          GROUP BY COALESCE(party_name, customer_name, account_name)
          HAVING ABS(SUM(credit_amount - debit_amount)) > 0.01
          ORDER BY outstanding DESC
          LIMIT 20
        `,
        varianceThreshold: 1,
      },
    },

    // ── 5. Fixed asset depreciation ─────────────────────────────────────────
    {
      key: "depreciation",
      title: "Fixed Asset Depreciation",
      description: "Verify depreciation entry has been posted for the period.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: ["bank-recon"],
      sortOrder: 5,
    },

    // ── 6. Prepaid expense amortization ─────────────────────────────────────
    {
      key: "prepaid-amort",
      title: "Prepaid Expense Amortization",
      description: "Review and post monthly amortization of prepaid expenses.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: ["bank-recon"],
      sortOrder: 6,
    },

    // ── 7. Accrued expenses ──────────────────────────────────────────────────
    {
      key: "accruals",
      title: "Accrue Outstanding Expenses",
      description: "Post accruals for expenses incurred but not yet invoiced.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: ["ap-recon"],
      sortOrder: 7,
    },

    // ── 8. GST reconciliation ────────────────────────────────────────────────
    {
      key: "gst-recon",
      title: "GST Reconciliation",
      description: "Reconcile CGST / SGST / IGST GL balances against GSTR-3B data.",
      category: "RECONCILIATION",
      autoComplete: true,
      dependsOnKeys: ["ap-recon", "ar-recon"],
      sortOrder: 8,
      reconciliation: {
        name: "GST Liability Reconciliation",
        sourceQuery: `
          SELECT COALESCE(SUM(credit_amount - debit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
            AND (LOWER(account_name) LIKE '%cgst%'
              OR LOWER(account_name) LIKE '%sgst%'
              OR LOWER(account_name) LIKE '%igst%'
              OR LOWER(account_name) LIKE '%gst%')
        `,
        targetQuery: `
          SELECT COALESCE(SUM(
            CASE WHEN LOWER(voucher_type) IN ('sales','tax invoice','sales invoice') THEN credit_amount
                 WHEN LOWER(voucher_type) IN ('purchase','purchase invoice') THEN -debit_amount
                 ELSE credit_amount - debit_amount END
          ), 0) AS balance
          FROM {tableName}
          WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
            AND (LOWER(account_name) LIKE '%cgst%'
              OR LOWER(account_name) LIKE '%sgst%'
              OR LOWER(account_name) LIKE '%igst%'
              OR LOWER(account_name) LIKE '%gst%')
        `,
        detailQuery: `
          SELECT transaction_date, reference_number, account_name,
                 debit_amount, credit_amount,
                 (credit_amount - debit_amount) AS net
          FROM {tableName}
          WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
            AND (LOWER(account_name) LIKE '%cgst%'
              OR LOWER(account_name) LIKE '%sgst%'
              OR LOWER(account_name) LIKE '%igst%'
              OR LOWER(account_name) LIKE '%gst%')
          ORDER BY transaction_date
          LIMIT 50
        `,
        varianceThreshold: 1,
      },
    },

    // ── 9. TDS verification ──────────────────────────────────────────────────
    {
      key: "tds",
      title: "TDS Verification",
      description: "Verify TDS deducted on payments matches TDS payable account.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: ["ap-recon"],
      sortOrder: 9,
    },

    // ── 10. Inventory reconciliation ─────────────────────────────────────────
    {
      key: "inventory-recon",
      title: "Inventory Reconciliation",
      description: "Reconcile stock ledger closing balance to GL inventory control account.",
      category: "RECONCILIATION",
      autoComplete: true,
      dependsOnKeys: [],
      sortOrder: 10,
      reconciliation: {
        name: "Inventory Control vs Stock Ledger",
        sourceQuery: `
          SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%stock%'
              OR LOWER(account_name) LIKE '%inventory%')
        `,
        targetQuery: `
          SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS balance
          FROM {tableName}
          WHERE transaction_date <= '{endDate}'
            AND (LOWER(account_name) LIKE '%stock%'
              OR LOWER(account_name) LIKE '%inventory%')
            AND LOWER(voucher_type) IN ('stock journal','material receipt','goods receipt',
                                        'purchase','stock transfer')
        `,
        detailQuery: `
          SELECT transaction_date, reference_number, description,
                 debit_amount, credit_amount
          FROM {tableName}
          WHERE transaction_date BETWEEN '{startDate}' AND '{endDate}'
            AND (LOWER(account_name) LIKE '%stock%'
              OR LOWER(account_name) LIKE '%inventory%')
          ORDER BY transaction_date
          LIMIT 50
        `,
        varianceThreshold: 100,
      },
    },

    // ── 11. P&L review ───────────────────────────────────────────────────────
    {
      key: "pl-review",
      title: "P&L Review",
      description: "Review income statement for unusual items, large variances, or missing entries.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: ["depreciation", "prepaid-amort", "accruals", "tds", "inventory-recon"],
      sortOrder: 11,
    },

    // ── 12. Balance sheet review ─────────────────────────────────────────────
    {
      key: "bs-review",
      title: "Balance Sheet Review",
      description: "Review balance sheet accounts for unusual balances or reconciling items.",
      category: "REVIEW",
      autoComplete: false,
      dependsOnKeys: ["depreciation", "prepaid-amort", "accruals", "gst-recon", "tds", "inventory-recon"],
      sortOrder: 12,
    },

    // ── 13. Flux analysis ────────────────────────────────────────────────────
    {
      key: "flux-analysis",
      title: "Flux Analysis",
      description: "Compare period-over-period balances. Flag and explain material variances.",
      category: "FLUX_ANALYSIS",
      autoComplete: false,
      dependsOnKeys: ["pl-review"],
      sortOrder: 13,
    },

    // ── 14. CFO sign-off ─────────────────────────────────────────────────────
    {
      key: "cfo-signoff",
      title: "CFO Sign-off",
      description: "Final approval by CFO or Finance Manager. Period is locked after this.",
      category: "APPROVAL",
      autoComplete: false,
      dependsOnKeys: ["pl-review", "bs-review", "flux-analysis"],
      sortOrder: 14,
    },
  ],
};

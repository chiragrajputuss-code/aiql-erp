import type { ERPKnowledge, AccountType } from "./types";

// ─── Zoho Books account_type → financial type ─────────────────────────────────
// These are the exact account_type values returned by Zoho Books API.

const ZOHO_ACCOUNT_TYPES: Record<string, AccountType> = {
  // ── Income ─────────────────────────────────────────────────────────────────
  "income":              "REVENUE",
  "other_income":        "OTHER_INCOME",
  "sales":               "REVENUE",

  // ── Expenses ───────────────────────────────────────────────────────────────
  "expense":             "EXPENSE",
  "cost_of_goods_sold":  "COGS",
  "other_expense":       "EXPENSE",

  // ── Assets ─────────────────────────────────────────────────────────────────
  "fixed_asset":         "FIXED_ASSET",
  "other_asset":         "CURRENT_ASSET",
  "current_asset":       "CURRENT_ASSET",
  "other_current_asset": "CURRENT_ASSET",
  "cash":                "CASH",
  "bank":                "BANK",
  "accounts_receivable": "RECEIVABLE",
  "stock":               "INVENTORY",

  // ── Liabilities ────────────────────────────────────────────────────────────
  "current_liability":       "CURRENT_LIABILITY",
  "other_current_liability": "CURRENT_LIABILITY",
  "long_term_liability":     "LONG_TERM_LIABILITY",
  "accounts_payable":        "PAYABLE",
  "credit_card":             "CURRENT_LIABILITY",
  "other_liability":         "CURRENT_LIABILITY",

  // ── Equity ─────────────────────────────────────────────────────────────────
  "equity":     "EQUITY",
  "retained_earnings": "EQUITY",
};

// ─── Full Zoho Books knowledge config ────────────────────────────────────────

export const zohoKnowledge: ERPKnowledge = {
  erpType: "ZOHO_BOOKS",
  accountGroups: ZOHO_ACCOUNT_TYPES,

  periodConfig: {
    fiscalYearStart:    "04-01", // India: April 1
    fiscalYearEndMonth: 2,       // March (0-based)
    drCrNotation:       false,   // Zoho uses plain positive/negative numbers
  },

  dimensions: {
    payableGroups:    ["accounts_payable"],
    receivableGroups: ["accounts_receivable"],
    employeeGroups:   [],
    costCentreDimension: "project",
  },

  reportNames: {
    profitAndLoss:     "profitandloss",
    balanceSheet:      "balancesheet",
    trialBalance:      "trialbalance",
    generalLedger:     "generalledger",
    cashFlow:          "cashflow",
    arAging:           "receivablesummary",
    apAging:           "payablesummary",
  },
};

// ─── GST config (India-specific) ─────────────────────────────────────────────

export const zohoGSTConfig = {
  enabled:       true,
  gstinField:    "gstin",          // field name on contacts
  taxGroupField: "tax_group_name", // field on line items
  // Common GST rates in Zoho Books India
  rates:         [0, 5, 12, 18, 28],
  // Zoho stores GST as separate line item taxes, not embedded in amounts
  taxInclusive:  false,
};

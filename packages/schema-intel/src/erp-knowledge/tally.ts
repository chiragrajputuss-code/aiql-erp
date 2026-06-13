import type { ERPKnowledge, AccountType } from "./types";

// ─── Tally Prime — standard account group → financial type mapping ─────────────
// Based on Tally Prime's default Chart of Accounts (India standard).
// Keys are LOWERCASE group names to allow case-insensitive lookup.

const TALLY_ACCOUNT_GROUPS: Record<string, AccountType> = {
  // ── P&L — Revenue ──────────────────────────────────────────────────────────
  "sales accounts":       "REVENUE",
  "sales":                "REVENUE",
  "direct incomes":       "REVENUE",
  "income":               "REVENUE",
  "revenue":              "REVENUE",
  "indirect incomes":     "OTHER_INCOME",
  "other income":         "OTHER_INCOME",

  // ── P&L — Expenses ─────────────────────────────────────────────────────────
  "purchase accounts":    "COGS",
  "purchases":            "COGS",
  "direct expenses":      "COGS",
  "cost of goods sold":   "COGS",
  "indirect expenses":    "EXPENSE",
  "expenses":             "EXPENSE",
  "overhead":             "EXPENSE",
  "depreciation":         "EXPENSE",
  "salaries":             "EXPENSE",
  "wages":                "EXPENSE",
  "administration expenses": "EXPENSE",
  "selling expenses":     "EXPENSE",

  // ── Balance Sheet — Assets ─────────────────────────────────────────────────
  "fixed assets":         "FIXED_ASSET",
  "plant & machinery":    "FIXED_ASSET",
  "furniture & fittings": "FIXED_ASSET",
  "vehicles":             "FIXED_ASSET",
  "computer equipment":   "FIXED_ASSET",
  "office equipment":     "FIXED_ASSET",
  "land & building":      "FIXED_ASSET",

  "investments":          "INVESTMENT",
  "investment":           "INVESTMENT",

  "stock-in-hand":        "INVENTORY",
  "stock in hand":        "INVENTORY",
  "closing stock":        "INVENTORY",
  "inventory":            "INVENTORY",
  "raw materials":        "INVENTORY",
  "finished goods":       "INVENTORY",
  "work-in-progress":     "INVENTORY",

  "sundry debtors":       "RECEIVABLE",
  "debtors":              "RECEIVABLE",
  "trade receivables":    "RECEIVABLE",
  "accounts receivable":  "RECEIVABLE",
  "debtors (domestic)":   "RECEIVABLE",
  "debtors (foreign)":    "RECEIVABLE",

  "cash-in-hand":         "CASH",
  "cash in hand":         "CASH",
  "petty cash":           "CASH",

  "bank accounts":        "BANK",
  "bank":                 "BANK",
  "bank o/d accounts":    "BANK",
  "bank od accounts":     "BANK",

  "loans & advances (asset)": "CURRENT_ASSET",
  "loans and advances (asset)": "CURRENT_ASSET",
  "deposits (asset)":     "CURRENT_ASSET",
  "advance to suppliers": "CURRENT_ASSET",
  "prepaid expenses":     "CURRENT_ASSET",
  "other current assets": "CURRENT_ASSET",
  "current assets":       "CURRENT_ASSET",
  "misc. expenses (asset)": "CURRENT_ASSET",

  // ── Balance Sheet — Liabilities ────────────────────────────────────────────
  "sundry creditors":     "PAYABLE",
  "creditors":            "PAYABLE",
  "trade payables":       "PAYABLE",
  "accounts payable":     "PAYABLE",
  "creditors (domestic)": "PAYABLE",
  "creditors (foreign)":  "PAYABLE",

  "duties & taxes":       "TAX",
  "duties and taxes":     "TAX",
  "gst payable":          "TAX",
  "tds payable":          "TAX",
  "service tax":          "TAX",
  "income tax":           "TAX",

  "provisions":           "CURRENT_LIABILITY",
  "current liabilities":  "CURRENT_LIABILITY",
  "other current liabilities": "CURRENT_LIABILITY",
  "advance from customers": "CURRENT_LIABILITY",

  "capital account":      "EQUITY",
  "capital":              "EQUITY",
  "reserves & surplus":   "EQUITY",
  "reserves and surplus": "EQUITY",
  "retained earnings":    "EQUITY",
  "share capital":        "EQUITY",

  "secured loans":        "LONG_TERM_LIABILITY",
  "unsecured loans":      "LONG_TERM_LIABILITY",
  "loans (liability)":    "LONG_TERM_LIABILITY",
  "term loans":           "LONG_TERM_LIABILITY",
  "bank loans":           "LONG_TERM_LIABILITY",
};

// ─── Full Tally knowledge config ─────────────────────────────────────────────

export const tallyKnowledge: ERPKnowledge = {
  erpType: "TALLY",
  accountGroups: TALLY_ACCOUNT_GROUPS,

  periodConfig: {
    fiscalYearStart:    "04-01", // April 1 (India standard)
    fiscalYearEndMonth: 2,       // March (0-based: Jan=0, Mar=2)
    drCrNotation:       true,    // Tally stores balances as "50000.00 Dr"
  },

  dimensions: {
    payableGroups:   ["sundry creditors", "creditors", "trade payables", "accounts payable"],
    receivableGroups: ["sundry debtors", "debtors", "trade receivables", "accounts receivable"],
    employeeGroups:  ["employees", "salary payable", "wages payable", "directors remuneration"],
    costCentreDimension: "cost_centre",
  },

  reportNames: {
    trialBalance:      "Trial Balance",
    balanceSheet:      "Balance Sheet",
    profitLoss:        "Profit & Loss",
    ledgerVouchers:    "Ledger Vouchers",
    stockSummary:      "Stock Summary",
    listOfLedgers:     "List of Ledgers",
    listOfGroups:      "List of Groups",
    listOfVoucherTypes: "List of Voucher Types",
    dayBook:           "Day Book",
    cashFlow:          "Cash Flow",
    agingAnalysis:     "Ageing Analysis",
  },
};

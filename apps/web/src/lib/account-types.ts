export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BANK:                "Bank / Cash",
  CASH:                "Bank / Cash",
  RECEIVABLE:          "Accounts Receivable (Debtors)",
  PAYABLE:             "Accounts Payable (Creditors)",
  TAX:                 "GST / Tax",
  INVENTORY:           "Inventory / Stock",
  FIXED_ASSET:         "Fixed Assets",
  CURRENT_ASSET:       "Current Assets",
  CURRENT_LIABILITY:   "Current Liabilities",
  LONG_TERM_LIABILITY: "Long-term Liabilities",
  REVENUE:             "Revenue / Sales",
  COGS:                "Cost of Goods Sold",
  EXPENSE:             "Expenses",
  OTHER_INCOME:        "Other Income",
  EQUITY:              "Capital / Equity",
  INVESTMENT:          "Investments",
  UNKNOWN:             "Unclassified",
};

export const RECON_RELEVANT = ["BANK", "CASH", "RECEIVABLE", "PAYABLE", "TAX", "INVENTORY"];

// ─── Account types used across all ERPs ──────────────────────────────────────

export type AccountType =
  | "REVENUE"
  | "COGS"
  | "EXPENSE"
  | "OTHER_INCOME"
  | "CURRENT_ASSET"
  | "FIXED_ASSET"
  | "INVESTMENT"
  | "CASH"
  | "BANK"
  | "RECEIVABLE"
  | "INVENTORY"
  | "CURRENT_LIABILITY"
  | "LONG_TERM_LIABILITY"
  | "PAYABLE"
  | "EQUITY"
  | "TAX"
  | "UNKNOWN";

/** name → AccountType */
export type AccountTypeMap = Record<string, AccountType>;

/** Input to classifyAccounts() */
export interface AccountInfo {
  name: string;
  /** The group/category name from the ERP (e.g. Tally group, Zoho category) */
  group: string;
}

// ─── ERP Knowledge interface ──────────────────────────────────────────────────

export interface PeriodConfig {
  /** ISO date fragment "MM-DD" e.g. "04-01" for April 1 (India) */
  fiscalYearStart: string;
  /** 0-based month index of fiscal year end (2 = March) */
  fiscalYearEndMonth: number;
  /** Whether the ERP stores amounts as Dr/Cr strings */
  drCrNotation: boolean;
}

export interface ERPKnowledge {
  erpType: string;
  /** Lowercase group name → AccountType */
  accountGroups: Record<string, AccountType>;
  periodConfig: PeriodConfig;
  dimensions: {
    /** Group names that represent Accounts Payable */
    payableGroups: string[];
    /** Group names that represent Accounts Receivable */
    receivableGroups: string[];
    /** Group names that represent Employee payroll */
    employeeGroups: string[];
    costCentreDimension?: string;
  };
  /** Standard report names available in this ERP */
  reportNames: Record<string, string>;
}

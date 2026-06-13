import type { AccountType } from "./erp-knowledge/types";

// ─── Enriched column ──────────────────────────────────────────────────────────

export interface SchemaColumn {
  name:        string;
  displayName: string;
  dataType:    "string" | "number" | "boolean" | "date" | "currency" | "id";
  nullable:    boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; column: string };
  /** If this column holds account codes, what type are they */
  accountType?: AccountType;
  isAmount:    boolean; // monetary value
  isDate:      boolean;
  isName:      boolean; // label / description field
  description?: string;
}

// ─── Enriched table ───────────────────────────────────────────────────────────

export interface SchemaTable {
  name:        string;
  displayName: string;
  columns:     SchemaColumn[];
  /** 'ledger' | 'voucher' | 'contact' | 'invoice' | 'bill' | 'account' */
  category?: string;
  /** Which AccountTypes appear in this table (for account tables) */
  accountTypes?: AccountType[];
  rowCount?: number;
}

// ─── Relationships ────────────────────────────────────────────────────────────

export interface SchemaRelationship {
  fromTable:  string;
  fromColumn: string;
  toTable:    string;
  toColumn:   string;
  type:       "many-to-one" | "one-to-many" | "many-to-many";
  /** Inferred from ERP knowledge, not explicit FK */
  implicit?:  boolean;
  label?:     string;
}

// ─── Currency config ──────────────────────────────────────────────────────────

export interface CurrencyConfig {
  baseCurrency:    string;   // 'INR' | 'USD' | 'EUR' | 'GBP'
  isMultiCurrency: boolean;
  currencyColumn?: string;   // column holding ISO currency code
  amountColumns:   string[]; // all monetary amount columns across schema
  locale:          string;   // 'en-IN' | 'en-US' | 'de-DE' | 'en-GB'
}

// ─── Period ───────────────────────────────────────────────────────────────────

export interface DateRange {
  startDate: Date;
  endDate:   Date;
  label?:    string; // human-readable, e.g. "Q1 FY 2025-26"
}

// ─── Complete ERPSchema ───────────────────────────────────────────────────────

export interface ERPSchema {
  erpType:        string;
  tables:         SchemaTable[];
  relationships:  SchemaRelationship[];
  /** Flat map of account name → type (for the query engine prompt) */
  accountTypeMap: Record<string, AccountType>;
  /** Available analytical dimensions e.g. ['cost_centre', 'project'] */
  dimensions:     string[];
  currency:       CurrencyConfig;
  metadata:       Record<string, unknown>;
  introspectedAt: Date;
}

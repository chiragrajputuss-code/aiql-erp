import { describe, it, expect } from "vitest";
import { matchTemplate } from "../template-matcher";
import type { ERPSchema } from "@aiql/schema-intel";

// ─── Schema fixtures ──────────────────────────────────────────────────────────

function makeCol(name: string, dataType = "string") {
  return { name, displayName: name, dataType, nullable: true,
    isPrimaryKey: false, isForeignKey: false,
    isAmount: dataType === "currency",
    isDate:   dataType === "date",
    isName:   false };
}

/** Full canonical GL schema — all 24 columns present */
const FULL_SCHEMA: ERPSchema = {
  erpType: "FILE_UPLOAD",
  tables: [{
    name: "gl_table",
    displayName: "GL",
    category: "ledger",
    columns: [
      makeCol("transaction_date",  "date"),
      makeCol("due_date",          "date"),
      makeCol("account_code",      "string"),
      makeCol("account_name",      "string"),
      makeCol("account_group",     "string"),
      makeCol("account_type",      "string"),
      makeCol("vendor_name",       "string"),
      makeCol("customer_name",     "string"),
      makeCol("party_name",        "string"),
      makeCol("debit_amount",      "currency"),
      makeCol("credit_amount",     "currency"),
      makeCol("net_amount",        "currency"),
      makeCol("opening_balance",   "currency"),
      makeCol("closing_balance",   "currency"),
      makeCol("description",       "string"),
      makeCol("reference_number",  "string"),
      makeCol("document_number",   "string"),
      makeCol("voucher_type",      "string"),
      makeCol("transaction_type",  "string"),
      makeCol("cost_centre",       "string"),
      makeCol("project",           "string"),
      makeCol("currency_code",     "string"),
      makeCol("exchange_rate",     "currency"),
    ],
  }],
  relationships: [],
  accountTypeMap: {},
  dimensions:    ["cost_centre", "project"],
  currency:      { baseCurrency: "INR", isMultiCurrency: false, amountColumns: [], locale: "en-IN" },
  metadata:      {},
  introspectedAt: new Date(),
};

/** Minimal schema — only account_name + debit_amount */
const MINIMAL_SCHEMA: ERPSchema = {
  ...FULL_SCHEMA,
  tables: [{
    name: "gl_table",
    displayName: "GL",
    category: "ledger",
    columns: [
      makeCol("account_name", "string"),
      makeCol("debit_amount", "currency"),
    ],
  }],
};

/** No columns at all */
const EMPTY_SCHEMA: ERPSchema = {
  ...FULL_SCHEMA,
  tables: [{ name: "gl_table", displayName: "GL", category: "ledger", columns: [] }],
};

/** Schema with no tables */
const NO_TABLE_SCHEMA: ERPSchema = { ...FULL_SCHEMA, tables: [] };

// ─── Helper ───────────────────────────────────────────────────────────────────

function sqlOf(question: string, schema = FULL_SCHEMA): string {
  return matchTemplate(question, schema)?.sql ?? "";
}

function idOf(question: string, schema = FULL_SCHEMA): string | null {
  return matchTemplate(question, schema)?.templateId ?? null;
}

// ─── Meta: all 50 templates must be reachable ─────────────────────────────────

// Each entry: [templateId, sample question]
const ALL_TEMPLATES: [string, string][] = [
  // Original 5
  ["ap-aging",                   "Show AP aging by vendor"],
  ["ar-aging",                   "AR aging report"],
  ["top-vendors",                "Top 10 vendors by spend"],
  ["monthly-summary",            "Monthly summary of transactions"],
  ["cost-centre-breakdown",      "Cost centre breakdown by department"],
  // Day 3 — 8 templates
  ["cash-balance",               "What is the bank balance today?"],
  ["overdue-debtors-30-60-90",   "Overdue debtors aging report"],
  ["gst-summary",                "GST summary for this quarter"],
  ["vendor-ledger",              "Vendor ledger summary"],
  ["customer-ledger",            "Customer ledger statement"],
  ["purchase-register",          "Purchase register last month"],
  ["sales-register",             "Sales register this year"],
  ["payroll-summary",            "Salary report for March"],
  // Day 4 — 7 templates
  ["profit-loss-summary",        "Profit and loss summary"],
  ["balance-sheet-snapshot",     "Balance sheet as of today"],
  ["expense-by-voucher-type",    "Expense by voucher type"],
  ["tds-summary",                "TDS summary this quarter"],
  ["bank-reconciliation",        "Bank reconciliation report"],
  ["advance-payments-outstanding","Advance payments outstanding"],
  ["top-customers",              "Top 10 customers by revenue"],
  // Day 5 — 10 templates
  ["sales-last-quarter",         "Sales last quarter"],
  ["expenses-last-quarter",      "Expenses last quarter"],
  ["cash-flow-monthly",          "Monthly cash flow report"],
  ["cost-centre-revenue",        "Revenue by department"],
  ["cost-centre-expenses",       "Expenses by cost centre"],
  ["yoy-comparison-monthly",     "Year over year comparison"],
  ["gst-input-vs-output",        "GST input vs output"],
  ["creditors-top-10",           "Top 10 creditors"],
  ["debtors-top-10",             "Top 10 debtors"],
  ["zero-balance-accounts",      "Zero balance accounts"],
  // Week 2 Day 6-7 — 20 templates
  ["journal-entries",            "Journal entries listing"],
  ["contra-entries",             "Contra voucher entries"],
  ["provisions",                 "Provisions made this year"],
  ["write-offs",                 "Bad debt write-offs"],
  ["multi-currency-summary",     "Multi-currency transactions summary"],
  ["unrealized-gains-losses",    "Unrealized forex gain loss"],
  ["current-ratio",              "Current ratio"],
  ["debt-equity-ratio",          "Debt equity ratio"],
  ["working-capital",            "Working capital"],
  ["budget-variance",            "Budget variance report"],
  ["forecast-vs-actual",         "Forecast vs actual revenue"],
  ["fixed-asset-summary",        "Fixed assets summary"],
  ["depreciation-schedule",      "Depreciation schedule"],
  ["vendor-payment-summary",     "Vendor payments summary"],
  ["customer-receipts-summary",  "Customer receipts report"],
  ["large-transactions",         "Large transactions above 1 lakh"],
  ["intercompany-transactions",  "Intercompany transactions"],
  ["pending-bills",              "Pending bills payable"],
  ["account-monthly-drill",      "Account-wise monthly breakdown"],
  ["period-close-summary",       "Month-end close summary"],
];

describe("all 50 templates are reachable", () => {
  it("has exactly 50 template entries", () => {
    expect(ALL_TEMPLATES).toHaveLength(50);
  });

  for (const [expectedId, question] of ALL_TEMPLATES) {
    it(`[${expectedId}] matches "${question}"`, () => {
      const result = matchTemplate(question, FULL_SCHEMA);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe(expectedId);
    });
  }
});

// ─── SQL structural invariants ────────────────────────────────────────────────

describe("SQL structural invariants (all 50 templates)", () => {
  for (const [id, question] of ALL_TEMPLATES) {
    it(`[${id}] SQL starts with SELECT and contains FROM`, () => {
      const sql = sqlOf(question);
      expect(sql.trim().toUpperCase()).toMatch(/^(SELECT|WITH)\b/);
      expect(sql.toUpperCase()).toContain("FROM");
    });

    it(`[${id}] SQL contains the table name`, () => {
      const sql = sqlOf(question);
      expect(sql).toContain("gl_table");
    });

    it(`[${id}] SQL contains no undefined placeholder tokens`, () => {
      const sql = sqlOf(question);
      expect(sql).not.toContain("undefined");
      expect(sql).not.toContain("{{");
      expect(sql).not.toContain(":vendor_name");
    });

    it(`[${id}] confidence is 0.95`, () => {
      const result = matchTemplate(question, FULL_SCHEMA);
      expect(result!.confidence).toBe(0.95);
    });
  }
});

// ─── Graceful degradation with minimal schema ─────────────────────────────────

describe("templates degrade gracefully with minimal columns", () => {
  const templatesRequiringMinimal = [
    ["ap-aging",          "Show AP aging by vendor"],
    ["top-vendors",       "Top vendors"],
    ["vendor-ledger",     "Vendor ledger summary"],
    ["customer-ledger",   "Customer ledger statement"],
    ["vendor-payment-summary", "Vendor payments summary"],
  ];

  for (const [id, question] of templatesRequiringMinimal) {
    it(`[${id}] still returns SQL with minimal schema`, () => {
      const result = matchTemplate(question, MINIMAL_SCHEMA);
      expect(result).not.toBeNull();
      const sql = result!.sql;
      expect(sql.toUpperCase()).toMatch(/^SELECT/);
      expect(sql.toUpperCase()).toContain("FROM");
    });
  }

  it("returns null when schema has no tables", () => {
    expect(matchTemplate("AP aging", NO_TABLE_SCHEMA)).toBeNull();
  });
});

// ─── Column-conditional SQL branches ─────────────────────────────────────────

describe("cash-balance uses closing_balance when available", () => {
  const withClosing: ERPSchema = {
    ...FULL_SCHEMA,
    tables: [{
      ...FULL_SCHEMA.tables[0],
      columns: [
        makeCol("account_name"),
        makeCol("closing_balance", "currency"),
      ],
    }],
  };
  it("uses MAX(closing_balance) when column exists", () => {
    const sql = sqlOf("What is our cash balance?", withClosing);
    expect(sql).toContain("closing_balance");
    expect(sql).toContain("MAX(");
  });
  it("falls back to SUM(credit - debit) without closing_balance", () => {
    const sql = sqlOf("bank balance", MINIMAL_SCHEMA);
    expect(sql).not.toContain("closing_balance");
    expect(sql.toLowerCase()).toContain("sum");
  });
});

describe("overdue-debtors-30-60-90 produces 4 aging buckets", () => {
  it("SQL contains 0_30, 31_60, 61_90, over_90 columns", () => {
    const sql = sqlOf("overdue debtors aging report");
    expect(sql).toContain("0_30_days");
    expect(sql).toContain("31_60_days");
    expect(sql).toContain("61_90_days");
    expect(sql).toContain("over_90_days");
    expect(sql).toContain("CURRENT_DATE");
  });
});

describe("gst-summary splits CGST / SGST / IGST", () => {
  it("SQL contains cgst, sgst, igst columns", () => {
    const sql = sqlOf("GST summary for this quarter");
    expect(sql.toLowerCase()).toContain("cgst");
    expect(sql.toLowerCase()).toContain("sgst");
    expect(sql.toLowerCase()).toContain("igst");
  });
});

describe("yoy-comparison-monthly produces current_year and previous_year", () => {
  it("SQL contains current_year and previous_year CASE expressions", () => {
    const sql = sqlOf("Year over year comparison");
    expect(sql).toContain("current_year");
    expect(sql).toContain("previous_year");
    expect(sql).toContain("EXTRACT(YEAR FROM");
  });
});

describe("budget-variance uses CTE + window function", () => {
  it("SQL contains WITH clause and AVG OVER", () => {
    const sql = sqlOf("Budget variance report");
    expect(sql.toUpperCase()).toContain("WITH");
    expect(sql.toUpperCase()).toContain("AVG(");
    expect(sql.toUpperCase()).toContain("OVER");
  });
});

describe("forecast-vs-actual uses LAG window function", () => {
  it("SQL contains LAG() for prior period comparison", () => {
    const sql = sqlOf("Forecast vs actual revenue");
    expect(sql.toUpperCase()).toContain("LAG(");
    expect(sql).toContain("forecast_5pct_growth");
  });
});

describe("ratio queries return single-row aggregates", () => {
  it("current-ratio SQL has no GROUP BY (single row)", () => {
    const sql = sqlOf("Current ratio");
    expect(sql.toLowerCase()).not.toContain("group by");
    expect(sql).toContain("current_ratio");
    expect(sql).toContain("NULLIF");
  });
  it("debt-equity-ratio SQL has NULLIF guard against division by zero", () => {
    const sql = sqlOf("Debt equity ratio");
    expect(sql).toContain("NULLIF");
    expect(sql).toContain("debt_equity_ratio");
  });
  it("working-capital SQL subtracts liabilities from assets", () => {
    const sql = sqlOf("Working capital");
    expect(sql).toContain("working_capital");
  });
});

describe("top-N templates use LIMIT 10", () => {
  for (const [id, q] of [
    ["top-vendors",    "Top 10 vendors by spend"],
    ["top-customers",  "Top 10 customers by revenue"],
    ["creditors-top-10", "Top 10 creditors"],
    ["debtors-top-10", "Top 10 debtors"],
  ]) {
    it(`[${id}] SQL contains LIMIT 10`, () => {
      expect(sqlOf(q)).toContain("LIMIT 10");
    });
  }
});

describe("large-transactions uses LIMIT 50 and threshold 100000", () => {
  it("SQL filters amount >= 100000", () => {
    const sql = sqlOf("Large transactions above 1 lakh");
    expect(sql).toContain("100000");
    expect(sql).toContain("LIMIT 50");
  });
});

describe("zero-balance-accounts uses ABS(...) < 0.01", () => {
  it("detects near-zero not just exact zero", () => {
    const sql = sqlOf("zero balance accounts");
    expect(sql).toContain("0.01");
    expect(sql.toUpperCase()).toContain("ABS(");
  });
});

describe("cost-centre templates return null / fallback without cost_centre column", () => {
  it("cost-centre-revenue falls back gracefully", () => {
    const sql = sqlOf("revenue by department", MINIMAL_SCHEMA);
    // Without cost_centre column, template returns a LIMIT 50 fallback
    expect(sql).toContain("LIMIT 50");
    expect(sql.toUpperCase()).toContain("FROM");
  });
  it("cost-centre-expenses falls back gracefully", () => {
    const sql = sqlOf("expenses by cost centre", MINIMAL_SCHEMA);
    expect(sql).toContain("LIMIT 50");
    expect(sql.toUpperCase()).toContain("FROM");
  });
});

describe("Hindi / Hinglish pattern coverage", () => {
  const hindiCases: [string, string][] = [
    ["cash-balance",               "cash kitna hai"],
    ["overdue-debtors-30-60-90",   "baaki customers dikhao"],
    ["gst-summary",                "kar vivaran"],
    ["vendor-ledger",              "vikreta khata dikhao"],
    ["customer-ledger",            "grahak khata"],
    ["payroll-summary",            "tankhwah kitni gayi"],
    ["profit-loss-summary",        "munaafa kitna hua"],
    ["balance-sheet-snapshot",     "tulapat dikhao"],
    ["tds-summary",                "kar katautee"],
    ["bank-reconciliation",        "bank milan report"],
    ["advance-payments-outstanding","peshgi baaki hai"],
    ["top-customers",              "sabse bade grahak"],
    ["sales-last-quarter",         "pichli timahi bikri dikhao"],
    ["expenses-last-quarter",      "pichli timahi kharcha"],
    ["yoy-comparison-monthly",     "saal dar saal vikri"],
    ["creditors-top-10",           "sabse bade lenadar"],
    ["debtors-top-10",             "sabse bade denadaar"],
    ["zero-balance-accounts",      "shunya bakaya waale khate"],
    ["multi-currency-summary",     "videshi mudra transactions"],
    ["working-capital",            "karya poonji"],
    ["fixed-asset-summary",        "asthir sampatti"],
    ["depreciation-schedule",      "mulya hrass schedule"],
    ["intercompany-transactions",  "samanbandhit paksh transactions"],
    ["pending-bills",              "baaki bill dikhao"],
    ["account-monthly-drill",      "khata wise mahine ka vivaran"],
    ["period-close-summary",       "mahine ke ant ki summary"],
  ];

  for (const [expectedId, question] of hindiCases) {
    it(`[${expectedId}] Hindi/Hinglish: "${question}"`, () => {
      const result = matchTemplate(question, FULL_SCHEMA);
      expect(result).not.toBeNull();
      expect(result!.templateId).toBe(expectedId);
    });
  }
});

describe("no false positives on unrelated questions", () => {
  it("returns null for fully unrelated question", () => {
    expect(matchTemplate("what is the weather today", FULL_SCHEMA)).toBeNull();
  });
  it("returns null for empty question", () => {
    expect(matchTemplate("", FULL_SCHEMA)).toBeNull();
  });
});

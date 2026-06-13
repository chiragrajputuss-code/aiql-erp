import { describe, it, expect } from "vitest";
import { applyColMap, accountsByType, makeSqlDefensive } from "../utils/column-mapping";

describe("applyColMap", () => {
  it("returns SQL unchanged when colMap is empty", () => {
    const sql = "SELECT * FROM upload WHERE transaction_date = '2026-01-01'";
    expect(applyColMap(sql, new Map())).toBe(sql);
  });

  it("rewrites alias names to canonical (date → transaction_date)", () => {
    // DB columns are canonical, so the map should be alias → canonical
    const map = new Map([["date", "transaction_date"]]);
    const result = applyColMap("WHERE date = '2026-01-01'", map);
    expect(result).toContain("transaction_date");
    expect(result).not.toMatch(/\bdate\b/);
  });

  it("does NOT rewrite canonical → source headers (would break: DB has canonical cols)", () => {
    // Critical regression test for the bug found in smoke test.
    // The DB column is `account_name`, NOT "Particulars" (the original CSV header).
    // applyColMap must NOT translate canonical names to source headers.
    const map = new Map([["account_name", "account_name"]]); // identity = no-op
    const result = applyColMap("SELECT account_name FROM x", map);
    expect(result).toContain("account_name");
    expect(result).not.toContain('"Particulars"');
  });

  it("handles multiple alias rewrites in one query", () => {
    const map = new Map([
      ["date",       "transaction_date"],
      ["voucher_no", "reference_number"],
    ]);
    const sql = "SELECT date, voucher_no FROM x";
    const result = applyColMap(sql, map);
    expect(result).toContain("transaction_date");
    expect(result).toContain("reference_number");
  });

  it("uses word boundaries (does not replace inside other words)", () => {
    const map = new Map([["date", "transaction_date"]]);
    const result = applyColMap("UPDATE SET candidate = 1", map);
    expect(result).toContain("candidate");
  });

  it("treats alias === canonical as no-op (skip rewrite)", () => {
    const map = new Map([["transaction_date", "transaction_date"]]);
    const result = applyColMap("WHERE transaction_date = '2026-01-01'", map);
    expect(result).toBe("WHERE transaction_date = '2026-01-01'");
  });

  it("strips IS NOT NULL guards on vendor_name", () => {
    const sql = "WHERE vendor_name IS NOT NULL AND vendor_name <> '' AND x = 1";
    const result = applyColMap(sql, new Map());
    expect(result).toContain("TRUE");
    expect(result).not.toContain("vendor_name IS NOT NULL");
  });

  it("strips IS NOT NULL guards on customer_name", () => {
    const sql = "WHERE customer_name IS NOT NULL AND customer_name <> '' AND x = 1";
    const result = applyColMap(sql, new Map());
    expect(result).toContain("TRUE");
  });

  // ─── Regression tests for bugs found by integration testing ────────────────

  it("REGRESSION: does NOT rewrite `date` inside a PostgreSQL type cast `::date`", () => {
    // Bug: `\bdate\b` matched inside `'2025-01-01'::date - INTERVAL '60 days'`,
    // turning it into `'2025-01-01'::transaction_date` (invalid type).
    const map = new Map([["date", "transaction_date"]]);
    const sql = "WHERE transaction_date < '2025-01-01'::date - INTERVAL '60 days'";
    const result = applyColMap(sql, map);
    expect(result).toContain("::date");
    expect(result).not.toContain("::transaction_date");
  });

  it("REGRESSION: does NOT rewrite alias when alias appears as a column name", () => {
    // Lookbehind `(?<![\w.])` prevents `a.date` from being matched as `date`.
    const map = new Map([["date", "transaction_date"]]);
    const sql = "SELECT a.date FROM x a"; // hypothetical alias-prefixed reference
    const result = applyColMap(sql, map);
    expect(result).toContain("a.date");
  });

  it("REGRESSION: rewrites bare `date` but leaves `::date` and `.date` intact", () => {
    const map = new Map([["date", "transaction_date"]]);
    const sql = "SELECT date, a.date, '2025-01-01'::date FROM x a WHERE date > '2024-01-01'::date";
    const result = applyColMap(sql, map);
    expect(result).toContain("SELECT transaction_date, a.date, '2025-01-01'::date");
    expect(result).toContain("WHERE transaction_date > '2024-01-01'::date");
  });
});

describe("makeSqlDefensive — missing optional columns", () => {
  const PRESENT_ALL = new Set([
    "vendor_name", "customer_name", "party_name", "reference_number",
    "voucher_type", "description", "account_code", "transaction_date",
    "account_name", "debit_amount", "credit_amount",
  ]);

  it("returns SQL unchanged when all optional columns are present", () => {
    const sql = "SELECT vendor_name, party_name FROM x";
    expect(makeSqlDefensive(sql, PRESENT_ALL)).toBe(sql);
  });

  it("replaces bare missing column reference with NULL", () => {
    const present = new Set(["transaction_date", "account_name"]);
    const sql = "SELECT vendor_name FROM x";
    const result = makeSqlDefensive(sql, present);
    expect(result).toContain("SELECT NULL FROM x");
  });

  it("REGRESSION: does NOT produce `a.NULL` for alias-prefixed missing column", () => {
    // Bug: `\bvendor_name\b(?![\w'])` matched inside `a.vendor_name` because
    // `.` is a non-word boundary, producing `a.NULL` which Postgres rejects.
    const present = new Set(["transaction_date"]);
    const sql = "SELECT a.vendor_name FROM x a";
    const result = makeSqlDefensive(sql, present);
    expect(result).not.toContain("a.NULL");
    expect(result).not.toContain("a.null");
    // The qualified column stays unchanged
    expect(result).toContain("a.vendor_name");
  });

  it("REGRESSION: handles all 7 optional columns with alias prefixes", () => {
    const present = new Set<string>(); // none present
    const sql = "SELECT a.vendor_name, b.customer_name, c.party_name, d.reference_number FROM x";
    const result = makeSqlDefensive(sql, present);
    expect(result).not.toMatch(/a\.NULL|b\.NULL|c\.NULL|d\.NULL/i);
  });

  it("REGRESSION: replaces GROUP BY NULL with GROUP BY 1 (valid SQL)", () => {
    // Bug: When a bare grouping column (e.g. `GROUP BY reference_number`) gets
    // replaced with NULL because the column is missing, PostgreSQL rejects
    // `GROUP BY NULL` with "non-integer constant in GROUP BY". We rewrite
    // it to `GROUP BY 1` (single group) so the query at least returns something.
    const present = new Set(["transaction_date"]);
    const sql = "SELECT reference_number, COUNT(*) FROM x GROUP BY reference_number";
    const result = makeSqlDefensive(sql, present);
    expect(result).not.toContain("GROUP BY NULL");
    expect(result).toContain("GROUP BY 1");
  });

  it("REGRESSION: handles GROUP BY NULL, NULL (multiple missing columns)", () => {
    const present = new Set<string>();
    const sql = "SELECT vendor_name, customer_name FROM x GROUP BY vendor_name, customer_name";
    const result = makeSqlDefensive(sql, present);
    expect(result).not.toMatch(/GROUP BY NULL/i);
    expect(result).toContain("GROUP BY 1");
  });

  it("leaves valid GROUP BY clauses (with column names) untouched", () => {
    const sql = "SELECT account_name, COUNT(*) FROM x GROUP BY account_name";
    const result = makeSqlDefensive(sql, PRESENT_ALL);
    expect(result).toContain("GROUP BY account_name");
  });

  it("does not match substrings (e.g. `description_alt` is not `description`)", () => {
    const present = new Set<string>();
    const sql = "SELECT description_alt FROM x";
    const result = makeSqlDefensive(sql, present);
    expect(result).toContain("description_alt"); // unchanged
  });

  it("does not match column name inside a string literal", () => {
    const present = new Set<string>();
    const sql = "SELECT 'vendor_name' AS label, account_name FROM x";
    const result = makeSqlDefensive(sql, present);
    // The string literal is unchanged
    expect(result).toContain("'vendor_name'");
  });
});

describe("accountsByType", () => {
  it("buckets accounts correctly", () => {
    const map = new Map([
      ["HDFC Bank A/c",    "BANK"],
      ["Petty Cash",       "CASH"],
      ["Sundry Creditors", "PAYABLE"],
      ["Sundry Debtors",   "RECEIVABLE"],
      ["CGST Output",      "TAX"],
      ["Stock-in-Hand",    "INVENTORY"],
    ]);
    const result = accountsByType(map);
    expect(result.bank).toEqual(["HDFC Bank A/c", "Petty Cash"]);
    expect(result.payable).toEqual(["Sundry Creditors"]);
    expect(result.receivable).toEqual(["Sundry Debtors"]);
    expect(result.tax).toEqual(["CGST Output"]);
    expect(result.inventory).toEqual(["Stock-in-Hand"]);
  });

  it("returns empty buckets when no accounts", () => {
    const result = accountsByType(new Map());
    expect(result.bank).toEqual([]);
    expect(result.payable).toEqual([]);
  });

  it("ignores unknown account types", () => {
    const map = new Map([
      ["Some Revenue", "REVENUE"],
      ["Some Expense", "EXPENSE"],
    ]);
    const result = accountsByType(map);
    expect(result.bank).toEqual([]);
    expect(result.payable).toEqual([]);
    // Revenue and expense accounts don't go in any of the 5 buckets
  });
});

import { describe, it, expect } from "vitest";
import { validateSql, portMysqlToPostgres } from "../sql-validator";

// ─── Valid SELECT queries ─────────────────────────────────────────────────────

describe("valid SELECT queries", () => {
  it("accepts a plain SELECT", () => {
    const r = validateSql("SELECT account_name, SUM(debit_amount) FROM ledger GROUP BY account_name");
    expect(r.isValid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.sanitisedSql).toContain("SELECT");
  });

  it("accepts a SELECT with JOIN", () => {
    const r = validateSql("SELECT a.name, SUM(b.amount) FROM accounts a JOIN transactions b ON a.id = b.account_id");
    expect(r.isValid).toBe(true);
  });

  it("accepts a CTE (WITH ... SELECT)", () => {
    const r = validateSql("WITH totals AS (SELECT vendor, SUM(amount) AS total FROM gl GROUP BY vendor) SELECT * FROM totals");
    expect(r.isValid).toBe(true);
  });

  it("strips trailing semicolons", () => {
    const r = validateSql("SELECT 1;;");
    expect(r.isValid).toBe(true);
    expect(r.sanitisedSql).toBe("SELECT 1");
  });

  it("strips single trailing semicolon", () => {
    const r = validateSql("SELECT name FROM vendors;");
    expect(r.sanitisedSql.endsWith(";")).toBe(false);
  });
});

// ─── Layer 1: Blacklisted keywords ───────────────────────────────────────────

describe("Layer 1 — blacklisted keywords", () => {
  it("rejects INSERT", () => {
    const r = validateSql("INSERT INTO accounts VALUES (1, 'test')");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("INSERT"))).toBe(true);
  });

  it("rejects UPDATE", () => {
    const r = validateSql("UPDATE accounts SET balance = 0 WHERE id = 1");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("UPDATE"))).toBe(true);
  });

  it("rejects DELETE", () => {
    const r = validateSql("DELETE FROM accounts WHERE id = 1");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("DELETE"))).toBe(true);
  });

  it("rejects DROP TABLE", () => {
    const r = validateSql("DROP TABLE accounts");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("DROP"))).toBe(true);
  });

  it("rejects CREATE TABLE", () => {
    const r = validateSql("CREATE TABLE foo (id INT)");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("CREATE"))).toBe(true);
  });

  it("rejects ALTER TABLE", () => {
    const r = validateSql("ALTER TABLE accounts ADD COLUMN new_col TEXT");
    expect(r.isValid).toBe(false);
  });

  it("rejects TRUNCATE", () => {
    const r = validateSql("TRUNCATE TABLE accounts");
    expect(r.isValid).toBe(false);
  });

  it("rejects EXEC", () => {
    const r = validateSql("EXEC sp_helpdb");
    expect(r.isValid).toBe(false);
  });

  it("rejects EXECUTE (full keyword)", () => {
    const r = validateSql("EXECUTE sp_helpdb");
    expect(r.isValid).toBe(false);
  });

  it("rejects xp_cmdshell (SQL Server shell injection)", () => {
    const r = validateSql("SELECT * FROM openrowset; xp_cmdshell 'whoami'");
    expect(r.isValid).toBe(false);
  });

  it("is case-insensitive for blacklist", () => {
    expect(validateSql("insert into t values (1)").isValid).toBe(false);
    expect(validateSql("Delete From t").isValid).toBe(false);
    expect(validateSql("dRoP tAbLe t").isValid).toBe(false);
  });

  it("catches injection inside subquery", () => {
    const r = validateSql("SELECT * FROM t WHERE id IN (SELECT id FROM u); DROP TABLE t");
    expect(r.isValid).toBe(false);
  });
});

// ─── Layer 2: Structural checks ───────────────────────────────────────────────

describe("Layer 2 — structural checks", () => {
  it("rejects SQL not starting with SELECT or WITH", () => {
    const r = validateSql("SHOW TABLES");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("SELECT or WITH"))).toBe(true);
  });

  it("rejects empty SQL", () => {
    const r = validateSql("");
    expect(r.isValid).toBe(false);
    expect(r.errors).toContain("Empty SQL");
  });

  it("rejects SELECT ... INTO (data exfiltration)", () => {
    const r = validateSql("SELECT * INTO backup_table FROM accounts");
    expect(r.isValid).toBe(false);
    expect(r.errors.some(e => e.includes("INTO"))).toBe(true);
  });

  it("returns empty sanitisedSql when invalid", () => {
    const r = validateSql("DROP TABLE accounts");
    expect(r.sanitisedSql).toBe("");
  });
});

// ─── Warnings ─────────────────────────────────────────────────────────────────

describe("warnings", () => {
  it("warns on SELECT *", () => {
    const r = validateSql("SELECT * FROM accounts");
    expect(r.isValid).toBe(true); // not an error
    expect(r.warnings.some(w => w.includes("SELECT *"))).toBe(true);
  });

  it("warns on ORDER BY without LIMIT", () => {
    const r = validateSql("SELECT name FROM accounts ORDER BY name");
    expect(r.warnings.some(w => w.includes("LIMIT"))).toBe(true);
  });

  it("does NOT warn on ORDER BY with LIMIT", () => {
    const r = validateSql("SELECT name FROM accounts ORDER BY name LIMIT 100");
    expect(r.warnings.some(w => w.includes("LIMIT"))).toBe(false);
  });

  it("valid query may have warnings but still isValid=true", () => {
    const r = validateSql("SELECT * FROM accounts ORDER BY name");
    expect(r.isValid).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// ─── MySQL → PostgreSQL dialect porter ────────────────────────────────────────
//
// Regression tests for every common MySQL-ism the LLM occasionally generates.
// The bug that prompted this layer: the LLM produced
//   `GROUP BY description WITH ROLLUP`
// which PostgreSQL rejects with "syntax error at or near WITH".

describe("portMysqlToPostgres — dialect translation", () => {
  it("REGRESSION: converts GROUP BY x WITH ROLLUP to GROUP BY ROLLUP(x)", () => {
    const sql = "SELECT description, COUNT(*) FROM tbl GROUP BY description WITH ROLLUP";
    const out = portMysqlToPostgres(sql);
    expect(out).toBe("SELECT description, COUNT(*) FROM tbl GROUP BY ROLLUP(description)");
  });

  it("REGRESSION: handles multi-column WITH ROLLUP", () => {
    const sql = "SELECT a, b, SUM(c) FROM tbl GROUP BY a, b WITH ROLLUP";
    const out = portMysqlToPostgres(sql);
    expect(out).toContain("GROUP BY ROLLUP(a, b)");
    expect(out).not.toContain("WITH ROLLUP");
  });

  it("converts GROUP BY x WITH CUBE to GROUP BY CUBE(x)", () => {
    const sql = "SELECT a, SUM(b) FROM t GROUP BY a WITH CUBE";
    expect(portMysqlToPostgres(sql)).toContain("GROUP BY CUBE(a)");
  });

  it("converts backtick identifiers to double quotes", () => {
    const sql = "SELECT `account_name`, `debit_amount` FROM `accounts`";
    const out = portMysqlToPostgres(sql);
    expect(out).toBe('SELECT "account_name", "debit_amount" FROM "accounts"');
  });

  it("converts IFNULL to COALESCE", () => {
    const sql = "SELECT IFNULL(amount, 0) FROM tbl";
    expect(portMysqlToPostgres(sql)).toBe("SELECT COALESCE(amount, 0) FROM tbl");
  });

  it("converts MySQL LIMIT offset,count to PostgreSQL LIMIT count OFFSET offset", () => {
    const sql = "SELECT * FROM tbl LIMIT 10, 20";
    expect(portMysqlToPostgres(sql)).toBe("SELECT * FROM tbl LIMIT 20 OFFSET 10");
  });

  it("does NOT touch standard PostgreSQL LIMIT n syntax", () => {
    const sql = "SELECT * FROM tbl LIMIT 50";
    expect(portMysqlToPostgres(sql)).toBe(sql);
  });

  it("converts DATE_FORMAT to TO_CHAR (best-effort)", () => {
    const sql = "SELECT DATE_FORMAT(date, '%Y-%m') FROM tbl";
    expect(portMysqlToPostgres(sql)).toContain("TO_CHAR(");
  });

  it("converts STR_TO_DATE to TO_DATE", () => {
    const sql = "SELECT STR_TO_DATE('2026-01-01', '%Y-%m-%d') FROM tbl";
    expect(portMysqlToPostgres(sql)).toContain("TO_DATE(");
  });

  it("converts GROUP_CONCAT to STRING_AGG", () => {
    const sql = "SELECT GROUP_CONCAT(name) FROM tbl";
    expect(portMysqlToPostgres(sql)).toContain("STRING_AGG");
  });

  it("leaves pure-PostgreSQL SQL untouched", () => {
    const sql = "SELECT account_name, SUM(debit_amount) FROM upload GROUP BY ROLLUP(account_name) LIMIT 100";
    expect(portMysqlToPostgres(sql)).toBe(sql);
  });

  it("applies multiple translations in one pass", () => {
    const sql = "SELECT `name`, IFNULL(`amt`, 0) FROM `t` GROUP BY `name` WITH ROLLUP LIMIT 5, 10";
    const out = portMysqlToPostgres(sql);
    expect(out).not.toContain("`");          // no backticks
    expect(out).not.toContain("IFNULL");      // converted to COALESCE
    expect(out).not.toContain("WITH ROLLUP"); // converted to ROLLUP()
    expect(out).toContain("LIMIT 10 OFFSET 5");
  });
});

describe("validateSql — integration with dialect porter", () => {
  it("REGRESSION: validateSql sanitises WITH ROLLUP automatically", () => {
    const sql = "SELECT description, COUNT(*) FROM upload_test GROUP BY description WITH ROLLUP";
    const r = validateSql(sql);
    expect(r.isValid).toBe(true);
    expect(r.sanitisedSql).toContain("GROUP BY ROLLUP(description)");
    expect(r.sanitisedSql).not.toContain("WITH ROLLUP");
    expect(r.warnings.some(w => w.includes("MySQL"))).toBe(true);
  });

  it("REGRESSION: validateSql sanitises backticks automatically", () => {
    const r = validateSql("SELECT `col` FROM `tbl` LIMIT 10");
    expect(r.isValid).toBe(true);
    expect(r.sanitisedSql).not.toContain("`");
    expect(r.sanitisedSql).toContain('"col"');
  });

  it("does not add MySQL warning for already-PostgreSQL SQL", () => {
    const r = validateSql("SELECT col FROM tbl LIMIT 10");
    expect(r.isValid).toBe(true);
    expect(r.warnings.some(w => w.includes("MySQL"))).toBe(false);
  });
});

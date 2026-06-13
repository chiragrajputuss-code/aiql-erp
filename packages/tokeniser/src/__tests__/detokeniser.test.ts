import { describe, it, expect } from "vitest";
import { detokenise, detokeniseFromMap } from "../detokeniser";
import { TokenMap } from "../token-map";

// ── Basic replacement ─────────────────────────────────────────────────────────

describe("detokenise — basic replacement", () => {
  it("replaces a single token", () => {
    const m = new Map([["VENDOR_T001", "Acme Corp"]]);
    expect(detokenise("SELECT * FROM vendors WHERE name = VENDOR_T001", m))
      .toBe("SELECT * FROM vendors WHERE name = Acme Corp");
  });

  it("replaces multiple different tokens", () => {
    const m = new Map([
      ["VENDOR_T001", "Acme Corp"],
      ["AMOUNT_T001", "500000"],
    ]);
    const sql = "WHERE vendor = VENDOR_T001 AND amount > AMOUNT_T001";
    expect(detokenise(sql, m))
      .toBe("WHERE vendor = Acme Corp AND amount > 500000");
  });

  it("replaces multiple occurrences of the same token", () => {
    const m = new Map([["VENDOR_T001", "Tata Motors"]]);
    const sql = "VENDOR_T001 UNION SELECT VENDOR_T001";
    expect(detokenise(sql, m)).toBe("Tata Motors UNION SELECT Tata Motors");
  });

  it("returns text unchanged when tokenMap is empty", () => {
    const sql = "SELECT * FROM ledgers WHERE balance > 1000";
    expect(detokenise(sql, new Map())).toBe(sql);
  });

  it("returns text unchanged when no tokens match", () => {
    const m = new Map([["VENDOR_T001", "Acme Corp"]]);
    const sql = "SELECT * FROM accounts";
    expect(detokenise(sql, m)).toBe(sql);
  });
});

// ── SQL string quoting ────────────────────────────────────────────────────────

describe("detokenise — SQL quoted strings", () => {
  it("preserves single quotes around replaced token", () => {
    const m = new Map([["VENDOR_T001", "Acme Corp"]]);
    const sql = "WHERE vendor_name = 'VENDOR_T001'";
    expect(detokenise(sql, m)).toBe("WHERE vendor_name = 'Acme Corp'");
  });

  it("preserves double quotes around replaced token", () => {
    const m = new Map([["CUSTOMER_T001", "Sharma Enterprises"]]);
    const sql = `WHERE customer = "CUSTOMER_T001"`;
    expect(detokenise(sql, m)).toBe(`WHERE customer = "Sharma Enterprises"`);
  });

  it("replaces token in SQL IN clause with quotes", () => {
    const m = new Map([
      ["VENDOR_T001", "Alpha Ltd"],
      ["VENDOR_T002", "Beta Corp"],
    ]);
    const sql = "WHERE vendor IN ('VENDOR_T001', 'VENDOR_T002')";
    expect(detokenise(sql, m)).toBe("WHERE vendor IN ('Alpha Ltd', 'Beta Corp')");
  });

  it("handles token in LIKE clause", () => {
    const m = new Map([["VENDOR_T001", "Acme%"]]);
    const sql = "WHERE vendor LIKE 'VENDOR_T001'";
    expect(detokenise(sql, m)).toBe("WHERE vendor LIKE 'Acme%'");
  });
});

// ── Longest match first ───────────────────────────────────────────────────────

describe("detokenise — longest token replaced first", () => {
  it("replaces ACCT_T0010 before ACCT_T001 (avoids partial match)", () => {
    const m = new Map([
      ["ACCT_T001", "4000"],
      ["ACCT_T0010", "4000-100"],
    ]);
    const sql = "WHERE acct = ACCT_T0010";
    // Without sorting, ACCT_T001 might match inside ACCT_T0010 first → wrong result
    expect(detokenise(sql, m)).toBe("WHERE acct = 4000-100");
  });

  it("replaces longer vendor name before shorter one if prefixes overlap", () => {
    const m = new Map([
      ["VENDOR_T001", "Acme"],
      ["VENDOR_T0011", "Acme Holdings"],
    ]);
    const sql = "VENDOR_T0011 and VENDOR_T001";
    const result = detokenise(sql, m);
    expect(result).toBe("Acme Holdings and Acme");
  });
});

// ── Full SQL round-trip ───────────────────────────────────────────────────────

describe("detokenise — full SQL round-trip", () => {
  it("restores a realistic AP aging SQL query", () => {
    const map = new TokenMap();
    map.addToken("VENDOR", "Sharma & Sons Pvt Ltd");
    map.addToken("AMOUNT", "250000");
    map.addToken("ACCT", "2100");

    const tokenised =
      "SELECT vendor_name, SUM(outstanding) FROM ap_ledger " +
      "WHERE vendor_name = 'VENDOR_T001' AND acct_code = 'ACCT_T001' " +
      "AND outstanding > AMOUNT_T001 GROUP BY vendor_name";

    const restored = detokenise(tokenised, map.getMap());

    expect(restored).toBe(
      "SELECT vendor_name, SUM(outstanding) FROM ap_ledger " +
      "WHERE vendor_name = 'Sharma & Sons Pvt Ltd' AND acct_code = '2100' " +
      "AND outstanding > 250000 GROUP BY vendor_name"
    );
  });

  it("handles special characters in original values", () => {
    const m = new Map([["VENDOR_T001", "O'Brien & Co."]]);
    const sql = "WHERE vendor = 'VENDOR_T001'";
    expect(detokenise(sql, m)).toBe("WHERE vendor = 'O'Brien & Co.'");
  });

  it("handles Indian company names with unicode", () => {
    const m = new Map([["VENDOR_T001", "टाटा कंसल्टेंसी"]]);
    const sql = "WHERE vendor = 'VENDOR_T001'";
    expect(detokenise(sql, m)).toBe("WHERE vendor = 'टाटा कंसल्टेंसी'");
  });
});

// ── detokeniseFromMap helper ──────────────────────────────────────────────────

describe("detokeniseFromMap", () => {
  it("works with a TokenMap instance", () => {
    const map = new TokenMap();
    map.addToken("CUSTOMER", "Infosys Ltd");
    const sql = "WHERE customer = 'CUSTOMER_T001'";
    expect(detokeniseFromMap(sql, map)).toBe("WHERE customer = 'Infosys Ltd'");
  });
});

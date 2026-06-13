import { describe, it, expect } from "vitest";
import { tokenise, detokenise } from "../index";
import type { EntityDictionary } from "../types";

const dict = (
  vendors: string[] = [],
  customers: string[] = [],
  employees: string[] = []
): EntityDictionary => ({ vendors, customers, employees });

// ─── Zero sensitive data ──────────────────────────────────────────────────────

describe("zero sensitive data", () => {
  it("passes through a clean query unchanged (no tokenisation)", () => {
    const text = "SELECT * FROM accounts WHERE status = 'active' ORDER BY created_at DESC";
    const { tokenised, stats } = tokenise(text, {}, dict());
    expect(stats.totalTokens).toBe(0);
    expect(stats.piiStripped).toBe(0);
  });

  it("empty text returns empty tokenised string", () => {
    const { tokenised } = tokenise("", {}, dict());
    expect(tokenised).toBe("");
  });

  it("whitespace-only text is handled without crash", () => {
    expect(() => tokenise("   ", {}, dict())).not.toThrow();
  });

  it("plain SQL keywords are not tokenised", () => {
    const text = "SELECT SUM(balance) FROM ledgers GROUP BY department";
    const { tokenised } = tokenise(text, {}, dict());
    expect(tokenised).toContain("SELECT");
    expect(tokenised).toContain("SUM");
    expect(tokenised).toContain("ledgers");
  });

  it("accounting terms (AP, GL, OPEX) are not tokenised", () => {
    const text = "Show AP aging and GL balance with OPEX variance";
    const { tokenised } = tokenise(text, {}, dict());
    expect(tokenised).toContain("AP");
    expect(tokenised).toContain("GL");
    expect(tokenised).toContain("OPEX");
  });
});

// ─── 100% entity names ────────────────────────────────────────────────────────

describe("text that is 100% entity names", () => {
  it("tokenises text made entirely of vendor names", () => {
    const { tokenised, stats } = tokenise(
      "Acme Corp Sharma Enterprises Tata Motors",
      {},
      dict(["Acme Corp", "Sharma Enterprises", "Tata Motors"])
    );
    expect(tokenised).not.toContain("Acme Corp");
    expect(tokenised).not.toContain("Sharma Enterprises");
    expect(tokenised).not.toContain("Tata Motors");
    expect(tokenised).toContain("VENDOR_T001");
    expect(tokenised).toContain("VENDOR_T002");
    expect(tokenised).toContain("VENDOR_T003");
  });

  it("all entities get unique tokens", () => {
    const { tokenMap } = tokenise(
      "Vendor A, Vendor B, Vendor C",
      {},
      dict(["Vendor A", "Vendor B", "Vendor C"])
    );
    const tokens = Array.from(tokenMap.keys());
    const unique = new Set(tokens);
    expect(tokens.length).toBe(unique.size);
  });

  it("same entity appearing twice reuses the same token", () => {
    const { tokenised } = tokenise(
      "Acme Corp payment. Acme Corp balance.",
      {},
      dict(["Acme Corp"])
    );
    // Both occurrences should use VENDOR_T001
    const matches = tokenised.match(/VENDOR_T001/g) ?? [];
    expect(matches.length).toBe(2);
    // Should NOT have VENDOR_T002
    expect(tokenised).not.toContain("VENDOR_T002");
  });
});

// ─── Entity name contains a number ───────────────────────────────────────────

describe("entity name containing a number — '3M Company'", () => {
  it("tokenises '3M Company' as a single vendor token", () => {
    const { tokenised } = tokenise(
      "Invoice from 3M Company for supplies",
      {},
      dict(["3M Company"])
    );
    expect(tokenised).not.toContain("3M Company");
    expect(tokenised).toContain("VENDOR_T001");
  });

  it("the 'M' in '3M' is not treated as a US dollar abbreviation", () => {
    // $50M pattern requires $ prefix — '3M' without $ should not match
    const { tokenised } = tokenise(
      "Payment to 3M Company",
      {},
      dict(["3M Company"])
    );
    expect(tokenised).not.toContain("AMOUNT_T");
  });

  it("entity with embedded number tokenised as unit, not split", () => {
    const { tokenMap } = tokenise(
      "Report for 3M Company Q3 results",
      {},
      dict(["3M Company"])
    );
    // The token map should contain "3M Company" as one original value
    const originals = Array.from(tokenMap.values());
    expect(originals.some((v) => v === "3M Company")).toBe(true);
    // And NOT have "3" or "M" separately
    expect(originals.some((v) => v === "3")).toBe(false);
  });
});

// ─── Amount inside entity name — 'Fortune 500' ───────────────────────────────

describe("amount inside entity name — 'Fortune 500'", () => {
  it("tokenises 'Fortune 500' as vendor, does not also tokenise '500' as amount", () => {
    const { tokenised, stats } = tokenise(
      "Fortune 500 companies report",
      {},
      dict(["Fortune 500"])
    );
    expect(tokenised).not.toContain("Fortune 500");
    expect(tokenised).toContain("VENDOR_T001");
    // '500' < 1000 and has no currency symbol — should not be an amount
    expect(stats.amountsFound).toBe(0);
  });

  it("amount normaliser does not re-tokenise numbers inside entity tokens", () => {
    // After entity is replaced with VENDOR_T001, amount normaliser
    // runs on the tokenised text — 'Fortune 500' is already gone
    const { tokenMap } = tokenise(
      "Listed Fortune 500 vendor with ₹50,000 outstanding",
      {},
      dict(["Fortune 500"])
    );
    const originals = Array.from(tokenMap.values());
    // "Fortune 500" should be there as entity
    expect(originals).toContain("Fortune 500");
    // "₹50,000" should be there as amount (has currency symbol)
    expect(originals.some((v) => v.includes("50,000"))).toBe(true);
    // But "500" alone should NOT be there
    expect(originals).not.toContain("500");
  });

  it("'Fortune 500' not in dictionary — '500' alone is still not tokenised (< 1000, no symbol)", () => {
    const { stats } = tokenise("Fortune 500 list", { tokeniseAmounts: true }, dict());
    // 500 is only 3 digits with no currency symbol — should not match
    expect(stats.amountsFound).toBe(0);
  });
});

// ─── PAN that looks like an account code ─────────────────────────────────────

describe("PAN number vs account code", () => {
  it("PAN is stripped by PII stripper before account masker runs", () => {
    // PAN: ABCDE1234F — stripped by PII stripper first.
    // GL account 4000 is separate — only 4 digits so NOT matched as bank account.
    // Use SQL context so context patterns don't accidentally capture '4000'.
    const { tokenised, stats } = tokenise(
      "WHERE pan = 'ABCDE1234F' AND acct_code = 4000",
      {},
      dict()
    );
    expect(tokenised).not.toContain("ABCDE1234F");
    expect(stats.piiStripped).toBeGreaterThanOrEqual(1);
    expect(tokenised).toContain("ACCT_T");
    expect(tokenised).not.toContain(" 4000");
  });

  it("account codes survive when no PAN is present", () => {
    const { tokenised } = tokenise("Debit account 4000, credit 2000", {}, dict());
    expect(tokenised).toContain("ACCT_T001");
    expect(tokenised).toContain("ACCT_T002");
  });

  it("PAN letters prevent it from matching the 4-digit account code pattern", () => {
    // PAN: XYZAB9876W — has letters, account code pattern needs digits only
    // If PII stripper wasn't there, the account masker still wouldn't match it
    const { tokenised } = tokenise("PAN XYZAB9876W does not look like GL code", {}, dict());
    // No ACCT token should appear (PAN is stripped, not account-tokenised)
    expect(tokenised).not.toContain("ACCT_T");
  });
});

// ─── No sensitive data in tokenised output ───────────────────────────────────

describe("verify: NO sensitive data in tokenised output", () => {
  const vendors    = ["Sharma Enterprises", "Tata Consultancy"];
  const customers  = ["Infosys Ltd"];
  const text = [
    `Vendors ${vendors.join(" and ")} owe ₹5L each.`,
    `Customer ${customers[0]} has balance ₹10Cr.`,
    `GL account 4000-100 shows variance.`,
    `Employee PAN ABCDE1234F on file.`,
    `SSN 123-45-6789 for US employee.`,
    `Phone +91-9876543210 on record.`,
  ].join(" ");

  it("no vendor names appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    for (const v of vendors) expect(tokenised).not.toContain(v);
  });

  it("no customer names appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    for (const c of customers) expect(tokenised).not.toContain(c);
  });

  it("no INR amounts (₹) appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    expect(tokenised).not.toMatch(/₹[\d,]/);
  });

  it("no GL account codes appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    expect(tokenised).not.toMatch(/\b4000-100\b/);
  });

  it("no PAN numbers appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    expect(tokenised).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/);
  });

  it("no SSNs appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    expect(tokenised).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });

  it("no phone numbers appear in tokenised output", () => {
    const { tokenised } = tokenise(text, {}, dict(vendors, customers));
    expect(tokenised).not.toMatch(/\+91-\d{10}/);
  });

  it("tokenised output contains only tokens (no original sensitive values at all)", () => {
    const { tokenised, tokenMap } = tokenise(text, {}, dict(vendors, customers));
    for (const original of tokenMap.values()) {
      if (original === "[STRIPPED]") continue;
      expect(tokenised).not.toContain(original);
    }
  });
});

// ─── SQL round-trip correctness ───────────────────────────────────────────────

describe("token map round-trip preserves SQL correctness", () => {
  it("WHERE clause with quoted vendor name round-trips exactly", () => {
    const sql = "SELECT * FROM ap WHERE vendor_name = 'Sharma Enterprises' AND status = 'open'";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict(["Sharma Enterprises"]));
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toBe(sql);
  });

  it("IN clause with multiple vendors round-trips exactly", () => {
    const sql = "WHERE vendor IN ('Acme Corp', 'Beta Ltd') AND amount > 0";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict(["Acme Corp", "Beta Ltd"]));
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toBe(sql);
  });

  it("amount comparison round-trips — numeric value preserved", () => {
    const sql = "WHERE outstanding > ₹5L AND balance <= ₹10Cr";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict());
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toBe(sql);
  });

  it("complex SQL with JOINs and aliases round-trips correctly", () => {
    const sql =
      "SELECT v.name, SUM(ap.amount) FROM ap_ledger ap " +
      "JOIN vendors v ON v.id = ap.vendor_id " +
      "WHERE v.name = 'Tata Motors' AND ap.amount > ₹1Cr " +
      "GROUP BY v.name";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict(["Tata Motors"]));
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toBe(sql);
  });

  it("tokenised SQL is valid SQL structure (SELECT still present)", () => {
    const sql = "SELECT name FROM vendors WHERE name = 'Acme Corp'";
    const { tokenised } = tokenise(sql, {}, dict(["Acme Corp"]));
    expect(tokenised).toMatch(/^SELECT/);
    expect(tokenised).toContain("FROM vendors");
    expect(tokenised).toContain("WHERE name =");
  });
});

// ─── Performance ──────────────────────────────────────────────────────────────

describe("performance", () => {
  const COMPLEX_QUERY =
    "Show AP aging for Acme Corp, Sharma Enterprises, Tata Motors, and Beta Ltd " +
    "where outstanding balance exceeds ₹5L or $50K. Include GL accounts 4000, 2000, 6100. " +
    "Employee ABCDE1234F has phone +91-9876543210. Filter vendors above ₹10Cr.";

  it("50 sequential tokenisations complete in <2500ms", () => {
    const vendors   = ["Acme Corp", "Sharma Enterprises", "Tata Motors", "Beta Ltd"];
    const customers = ["Infosys Ltd"];
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      tokenise(COMPLEX_QUERY, {}, dict(vendors, customers));
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2500);
  });

  it("single tokenisation of a complex query is <50ms", () => {
    const { stats } = tokenise(
      COMPLEX_QUERY,
      {},
      dict(["Acme Corp", "Sharma Enterprises", "Tata Motors", "Beta Ltd"], ["Infosys Ltd"])
    );
    expect(stats.processingTimeMs).toBeLessThan(50);
  });
});

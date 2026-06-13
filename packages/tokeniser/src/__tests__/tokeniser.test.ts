import { describe, it, expect } from "vitest";
import { tokenise, previewTokenisation, detokenise } from "../index";
import type { EntityDictionary } from "../types";

const dict = (
  vendors: string[] = [],
  customers: string[] = [],
  employees: string[] = []
): EntityDictionary => ({ vendors, customers, employees });

// ─── Full pipeline ────────────────────────────────────────────────────────────

describe("full pipeline", () => {
  it("tokenises vendors from dictionary", () => {
    const { tokenised, tokenMap } = tokenise(
      "Show AP aging for Sharma Enterprises",
      {},
      dict(["Sharma Enterprises"])
    );
    expect(tokenised).not.toContain("Sharma Enterprises");
    expect(tokenised).toContain("VENDOR_T001");
    expect(tokenMap.get("VENDOR_T001")).toBe("Sharma Enterprises");
  });

  it("tokenises amounts when tokeniseAmounts=true (default)", () => {
    const { tokenised, stats } = tokenise("balance ₹5L outstanding", {}, dict());
    expect(tokenised).not.toContain("₹5L");
    expect(stats.amountsFound).toBeGreaterThanOrEqual(1);
  });

  it("tokenises GL account codes when tokeniseAccounts=true (default)", () => {
    const { tokenised } = tokenise("debit account 4000 credit 2000", {}, dict());
    expect(tokenised).not.toContain(" 4000 ");
    expect(tokenised).toContain("ACCT_T");
  });

  it("strips PII first — PII does not appear in tokenised output", () => {
    const { tokenised, stats } = tokenise(
      "Employee PAN ABCDE1234F has outstanding balance of ₹50,000",
      {},
      dict()
    );
    expect(tokenised).not.toMatch(/ABCDE1234F/);
    expect(stats.piiStripped).toBeGreaterThanOrEqual(1);
  });

  it("handles text with vendors + amounts + PII together", () => {
    const text =
      "Vendor Acme Corp owes ₹1Cr. Employee SSN 123-45-6789 on file. Account 4000-100 impacted.";
    const { tokenised, stats } = tokenise(text, {}, dict(["Acme Corp"]));
    expect(tokenised).not.toContain("Acme Corp");
    expect(tokenised).not.toContain("₹1Cr");
    expect(tokenised).not.toContain("123-45-6789");
    expect(tokenised).not.toContain("4000-100");
    expect(stats.piiStripped).toBeGreaterThanOrEqual(1);
    expect(stats.totalTokens).toBeGreaterThanOrEqual(2);
  });

  it("tokenises customer separately from vendor", () => {
    const { tokenised } = tokenise(
      "Vendor Acme Corp and customer Infosys Ltd both have dues",
      {},
      dict(["Acme Corp"], ["Infosys Ltd"])
    );
    expect(tokenised).toContain("VENDOR_T001");
    expect(tokenised).toContain("CUSTOMER_T001");
  });

  it("returns correct stats", () => {
    const { stats } = tokenise(
      "Acme Corp owes ₹5L. Balance 4000 account.",
      {},
      dict(["Acme Corp"])
    );
    expect(stats.entitiesFound).toBeGreaterThanOrEqual(1);
    expect(stats.amountsFound).toBeGreaterThanOrEqual(1);
    expect(stats.processingTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Config respects flags ────────────────────────────────────────────────────

describe("config flags", () => {
  it("tokeniseAmounts=false — amounts pass through unchanged", () => {
    const { tokenised } = tokenise(
      "balance ₹5L outstanding",
      { tokeniseAmounts: false },
      dict()
    );
    expect(tokenised).toContain("₹5L");
    expect(tokenised).not.toContain("AMOUNT_T");
  });

  it("tokeniseAccounts=false — account codes pass through", () => {
    const { tokenised } = tokenise(
      "debit 4000 credit 2000",
      { tokeniseAccounts: false },
      dict()
    );
    expect(tokenised).toContain("4000");
    expect(tokenised).not.toContain("ACCT_T");
  });

  it("tokeniseVendors=false — vendors pass through", () => {
    const { tokenised } = tokenise(
      "Invoice from Acme Corp",
      { tokeniseVendors: false },
      dict(["Acme Corp"])
    );
    expect(tokenised).toContain("Acme Corp");
    expect(tokenised).not.toContain("VENDOR_T");
  });

  it("customEntities are tokenised as ENTITY", () => {
    const { tokenised, tokenMap } = tokenise(
      "Show data for Project Phoenix this quarter",
      { customEntities: ["Project Phoenix"] },
      dict()
    );
    expect(tokenised).not.toContain("Project Phoenix");
    const entityToken = [...tokenMap.entries()].find(([_, v]) => v === "Project Phoenix");
    expect(entityToken).toBeTruthy();
  });

  it("customStripList removes terms from output", () => {
    const { tokenised } = tokenise(
      "confidential note: INTERNAL DO NOT SHARE — balance 5000",
      { customStripList: ["INTERNAL DO NOT SHARE"] },
      dict()
    );
    expect(tokenised).not.toContain("INTERNAL DO NOT SHARE");
  });
});

// ─── Round-trip: tokenise → detokenise ───────────────────────────────────────

describe("round-trip: tokenise → detokenise", () => {
  it("SQL round-trip restores vendor name correctly", () => {
    const sql = "SELECT * FROM ledgers WHERE vendor = 'Sharma Enterprises' AND amount > 0";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict(["Sharma Enterprises"]));
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toContain("Sharma Enterprises");
  });

  it("SQL round-trip restores amount correctly", () => {
    const sql = "WHERE outstanding > ₹5L";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict());
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toContain("₹5L");
  });

  it("round-trip preserves SQL single quotes", () => {
    const sql = "WHERE vendor_name = 'Acme Corp' AND acct = '4000'";
    const { tokenised, tokenMap } = tokenise(sql, {}, dict(["Acme Corp"]));
    expect(tokenised).toContain("'VENDOR_T001'");
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toContain("'Acme Corp'");
  });

  it("multiple tokens round-trip correctly", () => {
    const sql =
      "SELECT * FROM ap WHERE vendor = 'Acme Corp' AND customer = 'Infosys Ltd' AND amount > ₹10L";
    const { tokenised, tokenMap } = tokenise(
      sql,
      {},
      dict(["Acme Corp"], ["Infosys Ltd"])
    );
    const restored = detokenise(tokenised, tokenMap);
    expect(restored).toContain("Acme Corp");
    expect(restored).toContain("Infosys Ltd");
    expect(restored).toContain("₹10L");
  });

  it("tokenised output contains NO original sensitive values", () => {
    const { tokenised } = tokenise(
      "Vendor Tata Motors owes ₹5L on account 4000",
      {},
      dict(["Tata Motors"])
    );
    expect(tokenised).not.toContain("Tata Motors");
    expect(tokenised).not.toContain("₹5L");
    expect(tokenised).not.toContain(" 4000 ");
  });
});

// ─── previewTokenisation() ───────────────────────────────────────────────────

describe("previewTokenisation", () => {
  it("returns original and tokenised text", () => {
    const { original, tokenised } = previewTokenisation(
      "Invoice from Acme Corp for ₹5L",
      {},
      dict(["Acme Corp"])
    );
    expect(original).toContain("Acme Corp");
    expect(tokenised).toContain("VENDOR_T001");
  });

  it("tokens array has entries with correct positions", () => {
    const text = "Invoice from Acme Corp";
    const { tokens } = previewTokenisation(text, {}, dict(["Acme Corp"]));
    const vendorToken = tokens.find((t) => t.category === "VENDOR");
    if (vendorToken) {
      expect(text.slice(vendorToken.startIndex, vendorToken.endIndex)).toBe("Acme Corp");
    }
  });

  it("tokens are sorted by position", () => {
    const { tokens } = previewTokenisation(
      "Acme Corp owes ₹5L, Infosys Ltd owes ₹10L",
      {},
      dict(["Acme Corp"], ["Infosys Ltd"])
    );
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i].startIndex).toBeGreaterThanOrEqual(tokens[i - 1].startIndex);
    }
  });
});

// ─── Performance ─────────────────────────────────────────────────────────────

describe("performance", () => {
  const TYPICAL_QUERY =
    "Show me AP aging for Acme Corp, Sharma Enterprises, and Tata Motors where " +
    "outstanding balance exceeds ₹5L. Include account 4000 and 2000. " +
    "Filter for vendor Infosys Ltd with amount above $50K.";

  it("tokenises a typical query in <50ms", () => {
    const { stats } = tokenise(
      TYPICAL_QUERY,
      {},
      dict(["Acme Corp", "Sharma Enterprises", "Tata Motors"], ["Infosys Ltd"])
    );
    expect(stats.processingTimeMs).toBeLessThan(50);
  });

  it("50 sequential tokenisations complete in <2500ms", () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      tokenise(TYPICAL_QUERY, {}, dict(["Acme Corp", "Sharma Enterprises"]));
    }
    expect(Date.now() - start).toBeLessThan(2500);
  });
});

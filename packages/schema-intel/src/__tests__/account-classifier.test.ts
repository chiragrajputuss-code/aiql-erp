import { describe, it, expect } from "vitest";
import { classifyAccounts, groupByType } from "../account-classifier";
import { tallyKnowledge } from "../erp-knowledge/tally";

// ─── classifyAccounts with Tally knowledge ────────────────────────────────────

describe("classifyAccounts — Tally", () => {
  it("classifies Sundry Creditors ledgers as PAYABLE", () => {
    const map = classifyAccounts(
      [{ name: "Acme Corp", group: "Sundry Creditors" }],
      tallyKnowledge
    );
    expect(map["Acme Corp"]).toBe("PAYABLE");
  });

  it("classifies Sundry Debtors ledgers as RECEIVABLE", () => {
    const map = classifyAccounts(
      [{ name: "Infosys Ltd", group: "Sundry Debtors" }],
      tallyKnowledge
    );
    expect(map["Infosys Ltd"]).toBe("RECEIVABLE");
  });

  it("classifies Sales Accounts as REVENUE", () => {
    const map = classifyAccounts(
      [{ name: "Domestic Sales", group: "Sales Accounts" }],
      tallyKnowledge
    );
    expect(map["Domestic Sales"]).toBe("REVENUE");
  });

  it("classifies Purchase Accounts as COGS", () => {
    const map = classifyAccounts(
      [{ name: "Raw Material Purchases", group: "Purchase Accounts" }],
      tallyKnowledge
    );
    expect(map["Raw Material Purchases"]).toBe("COGS");
  });

  it("classifies Indirect Expenses as EXPENSE", () => {
    const map = classifyAccounts(
      [{ name: "Office Rent", group: "Indirect Expenses" }],
      tallyKnowledge
    );
    expect(map["Office Rent"]).toBe("EXPENSE");
  });

  it("classifies Bank Accounts as BANK", () => {
    const map = classifyAccounts(
      [{ name: "HDFC Current Account", group: "Bank Accounts" }],
      tallyKnowledge
    );
    expect(map["HDFC Current Account"]).toBe("BANK");
  });

  it("classifies Cash-in-Hand as CASH", () => {
    const map = classifyAccounts(
      [{ name: "Petty Cash", group: "Cash-in-Hand" }],
      tallyKnowledge
    );
    expect(map["Petty Cash"]).toBe("CASH");
  });

  it("classifies Fixed Assets as FIXED_ASSET", () => {
    const map = classifyAccounts(
      [{ name: "Office Building", group: "Fixed Assets" }],
      tallyKnowledge
    );
    expect(map["Office Building"]).toBe("FIXED_ASSET");
  });

  it("classifies Duties & Taxes as TAX", () => {
    const map = classifyAccounts(
      [{ name: "GST Payable 18%", group: "Duties & Taxes" }],
      tallyKnowledge
    );
    expect(map["GST Payable 18%"]).toBe("TAX");
  });

  it("classifies Capital Account as EQUITY", () => {
    const map = classifyAccounts(
      [{ name: "Share Capital", group: "Capital Account" }],
      tallyKnowledge
    );
    expect(map["Share Capital"]).toBe("EQUITY");
  });

  it("classifies Secured Loans as LONG_TERM_LIABILITY", () => {
    const map = classifyAccounts(
      [{ name: "Term Loan - SBI", group: "Secured Loans" }],
      tallyKnowledge
    );
    expect(map["Term Loan - SBI"]).toBe("LONG_TERM_LIABILITY");
  });

  it("classifies Stock-in-Hand as INVENTORY", () => {
    const map = classifyAccounts(
      [{ name: "Finished Goods Stock", group: "Stock-in-Hand" }],
      tallyKnowledge
    );
    expect(map["Finished Goods Stock"]).toBe("INVENTORY");
  });

  it("returns UNKNOWN for unrecognised group", () => {
    const map = classifyAccounts(
      [{ name: "Mystery Account", group: "Some Unknown Group" }],
      tallyKnowledge
    );
    expect(map["Mystery Account"]).toBe("UNKNOWN");
  });

  it("lookup is case-insensitive (group names from Tally may vary in casing)", () => {
    const map = classifyAccounts(
      [{ name: "Acme Corp", group: "SUNDRY CREDITORS" }],
      tallyKnowledge
    );
    expect(map["Acme Corp"]).toBe("PAYABLE");
  });

  it("classifies multiple accounts correctly in one call", () => {
    const map = classifyAccounts(
      [
        { name: "Domestic Sales",      group: "Sales Accounts"  },
        { name: "Office Rent",         group: "Indirect Expenses" },
        { name: "Acme Corp",           group: "Sundry Creditors" },
        { name: "HDFC Bank",           group: "Bank Accounts"   },
      ],
      tallyKnowledge
    );
    expect(map["Domestic Sales"]).toBe("REVENUE");
    expect(map["Office Rent"]).toBe("EXPENSE");
    expect(map["Acme Corp"]).toBe("PAYABLE");
    expect(map["HDFC Bank"]).toBe("BANK");
  });
});

// ─── groupByType ──────────────────────────────────────────────────────────────

describe("groupByType", () => {
  it("groups accounts by their classified type", () => {
    const map = {
      "Domestic Sales":   "REVENUE" as const,
      "Export Sales":     "REVENUE" as const,
      "Office Rent":      "EXPENSE" as const,
      "HDFC Bank":        "BANK"    as const,
    };
    const grouped = groupByType(map);
    expect(grouped.REVENUE).toContain("Domestic Sales");
    expect(grouped.REVENUE).toContain("Export Sales");
    expect(grouped.EXPENSE).toContain("Office Rent");
    expect(grouped.BANK).toContain("HDFC Bank");
  });

  it("returns empty arrays for types with no accounts", () => {
    const grouped = groupByType({ "Domestic Sales": "REVENUE" });
    expect(grouped.EXPENSE).toBeUndefined(); // not present
  });
});

// ─── tallyKnowledge config ────────────────────────────────────────────────────

describe("tallyKnowledge config", () => {
  it("has April fiscal year start", () => {
    expect(tallyKnowledge.periodConfig.fiscalYearStart).toBe("04-01");
  });

  it("uses Dr/Cr notation", () => {
    expect(tallyKnowledge.periodConfig.drCrNotation).toBe(true);
  });

  it("payableGroups includes Sundry Creditors", () => {
    expect(tallyKnowledge.dimensions.payableGroups).toContain("sundry creditors");
  });

  it("receivableGroups includes Sundry Debtors", () => {
    expect(tallyKnowledge.dimensions.receivableGroups).toContain("sundry debtors");
  });

  it("reportNames includes Trial Balance", () => {
    expect(tallyKnowledge.reportNames.trialBalance).toBe("Trial Balance");
  });
});

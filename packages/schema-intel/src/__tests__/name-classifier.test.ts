import { describe, it, expect } from "vitest";
import {
  classifyByName,
  classifyAccountNames,
  fillUnknownsByName,
} from "../account-classifier";

describe("classifyByName — Bank/Cash", () => {
  it("classifies named banks", () => {
    expect(classifyByName("HDFC Bank A/c")).toBe("BANK");
    expect(classifyByName("ICICI Current A/c")).toBe("BANK");
    expect(classifyByName("SBI Current A/c")).toBe("BANK");
    expect(classifyByName("Axis Bank A/c")).toBe("BANK");
    expect(classifyByName("Kotak Current A/c")).toBe("BANK");
    expect(classifyByName("Yes Bank A/c")).toBe("BANK");
    expect(classifyByName("BoB Current A/c")).toBe("BANK");
    expect(classifyByName("Bank of India A/c")).toBe("BANK");
    expect(classifyByName("Punjab National Bank")).toBe("BANK");
  });

  it("classifies generic bank/account variations", () => {
    expect(classifyByName("Current A/c 12345")).toBe("BANK");
    expect(classifyByName("Cash Credit A/c")).toBe("BANK");
    expect(classifyByName("Bank OD")).toBe("BANK");
  });

  it("classifies cash variants as CASH", () => {
    expect(classifyByName("Cash")).toBe("CASH");
    expect(classifyByName("Petty Cash")).toBe("CASH");
    expect(classifyByName("Cash-in-Hand")).toBe("CASH");
    expect(classifyByName("Cash A/c")).toBe("CASH");
  });
});

describe("classifyByName — Tax", () => {
  it("classifies all GST variants", () => {
    expect(classifyByName("CGST Output @9%")).toBe("TAX");
    expect(classifyByName("SGST Input @9%")).toBe("TAX");
    expect(classifyByName("IGST Output @18%")).toBe("TAX");
    expect(classifyByName("GST Payable")).toBe("TAX");
  });

  it("classifies TDS / TCS / Service Tax", () => {
    expect(classifyByName("TDS Payable")).toBe("TAX");
    expect(classifyByName("TCS Payable")).toBe("TAX");
    expect(classifyByName("Service Tax")).toBe("TAX");
  });

  it("classifies Composition Tax", () => {
    expect(classifyByName("Composition Tax @5%")).toBe("TAX");
    expect(classifyByName("Composition Tax @1%")).toBe("TAX");
  });

  it("classifies Duties & Taxes generically", () => {
    expect(classifyByName("Duties & Taxes")).toBe("TAX");
    expect(classifyByName("Duties and Taxes")).toBe("TAX");
  });
});

describe("classifyByName — Receivable", () => {
  it("classifies sundry debtor variants", () => {
    expect(classifyByName("Sundry Debtors")).toBe("RECEIVABLE");
    expect(classifyByName("Trade Receivables")).toBe("RECEIVABLE");
    expect(classifyByName("Accounts Receivable")).toBe("RECEIVABLE");
    expect(classifyByName("Debtors")).toBe("RECEIVABLE");
  });
});

describe("classifyByName — Payable", () => {
  it("classifies sundry creditor variants", () => {
    expect(classifyByName("Sundry Creditors")).toBe("PAYABLE");
    expect(classifyByName("Trade Payables")).toBe("PAYABLE");
    expect(classifyByName("Accounts Payable")).toBe("PAYABLE");
    expect(classifyByName("Creditors")).toBe("PAYABLE");
  });
});

describe("classifyByName — Inventory", () => {
  it("classifies stock variants", () => {
    expect(classifyByName("Stock-in-Hand")).toBe("INVENTORY");
    expect(classifyByName("Inventory")).toBe("INVENTORY");
    expect(classifyByName("Finished Goods")).toBe("INVENTORY");
    expect(classifyByName("Raw Material - Stock")).toBe("INVENTORY");
    expect(classifyByName("WIP - Project A")).toBe("INVENTORY");
  });
});

describe("classifyByName — Fixed Assets", () => {
  it("classifies equipment / vehicles / property", () => {
    expect(classifyByName("Plant & Machinery")).toBe("FIXED_ASSET");
    expect(classifyByName("Office Building")).toBe("FIXED_ASSET");
    expect(classifyByName("Computers & Laptops")).toBe("FIXED_ASSET");
    expect(classifyByName("Trucks & Vehicles")).toBe("FIXED_ASSET");
    expect(classifyByName("Furniture & Fixtures")).toBe("FIXED_ASSET");
  });
});

describe("classifyByName — Revenue & Other Income", () => {
  it("classifies sales accounts as REVENUE", () => {
    expect(classifyByName("Sales - Hindustan Unilever")).toBe("REVENUE");
    expect(classifyByName("Sales Accounts")).toBe("REVENUE");
    expect(classifyByName("Domestic Sales")).toBe("REVENUE");
    expect(classifyByName("Export Sales - USA")).toBe("REVENUE");
  });

  it("classifies service income as REVENUE", () => {
    expect(classifyByName("Tuition Fees")).toBe("REVENUE");
    expect(classifyByName("Freight Income")).toBe("REVENUE");
    expect(classifyByName("Diagnostic Service Income")).toBe("REVENUE");
  });

  it("classifies Other Income separately", () => {
    expect(classifyByName("Other Income")).toBe("OTHER_INCOME");
    expect(classifyByName("Interest Received")).toBe("OTHER_INCOME");
  });
});

describe("classifyByName — Expense & COGS", () => {
  it("classifies COGS items", () => {
    expect(classifyByName("Purchase - Hindustan Unilever")).toBe("COGS");
    expect(classifyByName("Raw Material - Steel")).toBe("COGS");
    expect(classifyByName("Cement Purchases")).toBe("COGS");
    expect(classifyByName("Power & Fuel")).toBe("COGS");
    expect(classifyByName("Mobile Phones - Samsung")).toBe("COGS");
  });

  it("classifies operating expenses", () => {
    expect(classifyByName("Office Rent")).toBe("EXPENSE");
    expect(classifyByName("Salaries & Wages")).toBe("EXPENSE");
    expect(classifyByName("Electricity Charges")).toBe("EXPENSE");
    expect(classifyByName("Year-end Bonus")).toBe("EXPENSE");
    expect(classifyByName("Software Subscriptions")).toBe("EXPENSE");
    expect(classifyByName("Discount Allowed")).toBe("EXPENSE");
  });
});

describe("classifyByName — Equity", () => {
  it("classifies capital and equity accounts", () => {
    expect(classifyByName("Capital Account")).toBe("EQUITY");
    expect(classifyByName("Drawings")).toBe("EQUITY");
    expect(classifyByName("Share Capital")).toBe("EQUITY");
    expect(classifyByName("Reserves")).toBe("EQUITY");
  });
});

describe("classifyByName — Unknown", () => {
  it("returns UNKNOWN for genuinely unusual / generic suspense-style names", () => {
    expect(classifyByName("Adjustment Account")).toBe("UNKNOWN");
    expect(classifyByName("Suspense A/c")).toBe("UNKNOWN");
    expect(classifyByName("Petty Refund")).toBe("UNKNOWN");
    expect(classifyByName("Temp Holding")).toBe("UNKNOWN");
  });

  it("classifies generic-but-categorisable names by their dominant pattern", () => {
    // "Misc Expenses 999" → EXPENSE (has 'expenses' in name)
    expect(classifyByName("Misc Expenses 999")).toBe("EXPENSE");
    // "Old Liability A/c" → CURRENT_LIABILITY (has 'liability' in name)
    // (note: pattern may not catch this — depends on classifier rules)
  });

  it("returns UNKNOWN for completely unrecognisable strings", () => {
    expect(classifyByName("AC1001")).toBe("UNKNOWN");
    expect(classifyByName("XYZ9999")).toBe("UNKNOWN");
  });
});

describe("classifyByName — case insensitivity", () => {
  it("matches regardless of casing", () => {
    expect(classifyByName("HDFC BANK A/C")).toBe("BANK");
    expect(classifyByName("hdfc bank a/c")).toBe("BANK");
    expect(classifyByName("Sundry CREDITORS")).toBe("PAYABLE");
  });
});

describe("classifyAccountNames", () => {
  it("classifies a list of names in one call", () => {
    const result = classifyAccountNames([
      "HDFC Bank A/c",
      "Sundry Creditors",
      "CGST Output @9%",
      "Adjustment Account",
    ]);
    expect(result["HDFC Bank A/c"]).toBe("BANK");
    expect(result["Sundry Creditors"]).toBe("PAYABLE");
    expect(result["CGST Output @9%"]).toBe("TAX");
    expect(result["Adjustment Account"]).toBe("UNKNOWN");
  });

  it("returns empty map for empty input", () => {
    expect(classifyAccountNames([])).toEqual({});
  });
});

describe("fillUnknownsByName", () => {
  it("only updates UNKNOWN entries", () => {
    const input = {
      "HDFC Bank A/c":     "BANK"     as const, // already classified, leave alone
      "Sundry Creditors":  "UNKNOWN"  as const, // fill in
    };
    const result = fillUnknownsByName(input);
    expect(result["HDFC Bank A/c"]).toBe("BANK");
    expect(result["Sundry Creditors"]).toBe("PAYABLE");
  });

  it("leaves UNKNOWNs as UNKNOWN if pattern does not match", () => {
    const input = { "AC1001": "UNKNOWN" as const };
    const result = fillUnknownsByName(input);
    expect(result["AC1001"]).toBe("UNKNOWN");
  });

  it("does not mutate input", () => {
    const input = { "HDFC Bank A/c": "UNKNOWN" as const };
    fillUnknownsByName(input);
    expect(input["HDFC Bank A/c"]).toBe("UNKNOWN");
  });
});

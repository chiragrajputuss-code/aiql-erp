import { describe, it, expect } from "vitest";
import { detectAmounts } from "../amount-normaliser";

// ─── Indian rupee symbol formats ──────────────────────────────────────────────

describe("Indian rupee formats", () => {
  it("detects ₹1,23,456.78 (Indian with paise)", () => {
    const [a] = detectAmounts("outstanding ₹1,23,456.78 payable");
    expect(a.currency).toBe("INR");
    expect(a.numericValue).toBeCloseTo(123456.78);
  });

  it("detects ₹1,23,456 (Indian without paise)", () => {
    const [a] = detectAmounts("balance ₹1,23,456 due");
    expect(a.currency).toBe("INR");
    expect(a.numericValue).toBeCloseTo(123456);
  });

  it("detects ₹50,000 (simple thousands)", () => {
    const [a] = detectAmounts("invoice ₹50,000");
    expect(a.numericValue).toBeCloseTo(50000);
  });
});

// ─── Indian lakh / crore abbreviated ─────────────────────────────────────────

describe("Indian abbreviated formats (CRITICAL)", () => {
  it("₹5L → 500000", () => {
    const [a] = detectAmounts("payment of ₹5L pending");
    expect(a.numericValue).toBe(500000);
    expect(a.format).toBe("indian-lakh-abbr");
  });

  it("₹10L → 1000000", () => {
    const [a] = detectAmounts("revenue ₹10L this quarter");
    expect(a.numericValue).toBe(1000000);
  });

  it("₹2.5L → 250000", () => {
    const [a] = detectAmounts("cost ₹2.5L");
    expect(a.numericValue).toBeCloseTo(250000);
  });

  it("₹1Cr → 10000000", () => {
    const [a] = detectAmounts("total ₹1Cr outstanding");
    expect(a.numericValue).toBe(10000000);
    expect(a.format).toBe("indian-crore-abbr");
  });

  it("₹5Cr → 50000000", () => {
    const [a] = detectAmounts("OPEX ₹5Cr vs budget");
    expect(a.numericValue).toBe(50000000);
  });

  it("₹10Cr → 100000000", () => {
    const [a] = detectAmounts("total payables ₹10Cr");
    expect(a.numericValue).toBe(100000000);
  });
});

// ─── Spelled-out Indian amounts ───────────────────────────────────────────────

describe("Spelled-out Indian amounts", () => {
  it("'5 lakh' → 500000", () => {
    const [a] = detectAmounts("balance of 5 lakh rupees");
    expect(a.numericValue).toBe(500000);
    expect(a.format).toBe("indian-lakh-spelled");
  });

  it("'10 crore' → 100000000", () => {
    const [a] = detectAmounts("revenue 10 crore this year");
    expect(a.numericValue).toBe(100000000);
    expect(a.format).toBe("indian-crore-spelled");
  });

  it("'2.5 lakhs' → 250000", () => {
    const [a] = detectAmounts("invoice of 2.5 lakhs");
    expect(a.numericValue).toBeCloseTo(250000);
  });

  it("'10 karod' → 100000000 (Hindi crore)", () => {
    const [a] = detectAmounts("10 karod ka payment");
    expect(a.numericValue).toBe(100000000);
  });
});

// ─── US Dollar formats ────────────────────────────────────────────────────────

describe("US dollar formats", () => {
  it("detects $1,234.56", () => {
    const [a] = detectAmounts("invoice $1,234.56 USD");
    expect(a.currency).toBe("USD");
    expect(a.numericValue).toBeCloseTo(1234.56);
  });

  it("$50K → 50000", () => {
    const [a] = detectAmounts("budget $50K allocated");
    expect(a.numericValue).toBe(50000);
    expect(a.format).toBe("us-K-abbr");
  });

  it("$2.5M → 2500000", () => {
    const [a] = detectAmounts("revenue $2.5M");
    expect(a.numericValue).toBeCloseTo(2500000);
  });

  it("$1B → 1000000000", () => {
    const [a] = detectAmounts("valuation $1B");
    expect(a.numericValue).toBe(1000000000);
  });
});

// ─── Other currencies ─────────────────────────────────────────────────────────

describe("European and UK formats", () => {
  it("detects €1.234,56 (European format)", () => {
    const [a] = detectAmounts("expense €1.234,56");
    expect(a.currency).toBe("EUR");
    expect(a.numericValue).toBeCloseTo(1234.56);
    expect(a.format).toBe("european");
  });

  it("detects £1,234.56 (UK format)", () => {
    const [a] = detectAmounts("invoice £1,234.56");
    expect(a.currency).toBe("GBP");
    expect(a.numericValue).toBeCloseTo(1234.56);
  });
});

// ─── Currency code suffix ─────────────────────────────────────────────────────

describe("Numbers with currency code", () => {
  it("detects '1234.56 USD'", () => {
    const [a] = detectAmounts("total 1234.56 USD");
    expect(a.currency).toBe("USD");
    expect(a.numericValue).toBeCloseTo(1234.56);
  });

  it("detects '50000 INR'", () => {
    const [a] = detectAmounts("50000 INR outstanding");
    expect(a.currency).toBe("INR");
    expect(a.numericValue).toBe(50000);
  });
});

// ─── Adjacent to financial keywords ──────────────────────────────────────────

describe("Plain numbers adjacent to financial keywords", () => {
  it("detects plain number after 'balance'", () => {
    const amounts = detectAmounts("balance of 50000 is overdue");
    expect(amounts.some((a) => a.numericValue === 50000)).toBe(true);
  });

  it("detects plain number after 'over'", () => {
    const amounts = detectAmounts("vendors with outstanding over 10000");
    expect(amounts.some((a) => a.numericValue === 10000)).toBe(true);
  });
});

// ─── Multiple amounts & deduplication ────────────────────────────────────────

describe("Multiple amounts in one text", () => {
  it("detects two separate amounts", () => {
    const amounts = detectAmounts("₹5L from Acme Corp and ₹10Cr from Beta Ltd");
    expect(amounts).toHaveLength(2);
    const values = amounts.map((a) => a.numericValue);
    expect(values).toContain(500000);
    expect(values).toContain(100000000);
  });

  it("returns amounts sorted by position", () => {
    const amounts = detectAmounts("₹1Cr total, of which ₹50L is overdue");
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i].position.start).toBeGreaterThan(amounts[i - 1].position.start);
    }
  });

  it("position reflects location in original text", () => {
    const text = "invoice amount ₹5L is pending";
    const amounts = detectAmounts(text);
    const a = amounts.find((x) => x.numericValue === 500000)!;
    expect(text.slice(a.position.start, a.position.end)).toContain("₹5L");
  });

  it("returns empty array for text with no amounts", () => {
    expect(detectAmounts("show all vendors")).toHaveLength(0);
  });
});

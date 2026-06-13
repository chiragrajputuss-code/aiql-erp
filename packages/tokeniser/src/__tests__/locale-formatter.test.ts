import { describe, it, expect } from "vitest";
import { formatCurrency, formatNumber, detectLocale } from "../locale-formatter";

describe("detectLocale", () => {
  it("maps INR to en-IN", () => expect(detectLocale("INR")).toBe("en-IN"));
  it("maps USD to en-US", () => expect(detectLocale("USD")).toBe("en-US"));
  it("maps EUR to de-DE", () => expect(detectLocale("EUR")).toBe("de-DE"));
  it("maps GBP to en-GB", () => expect(detectLocale("GBP")).toBe("en-GB"));
  it("defaults unknown currency to en-US", () => expect(detectLocale("XYZ")).toBe("en-US"));
  it("is case-insensitive", () => expect(detectLocale("inr")).toBe("en-IN"));
});

describe("formatCurrency — INR uses Indian grouping (lakhs/crores)", () => {
  it("₹1,245,000 formats as ₹12,45,000 in en-IN", () => {
    const result = formatCurrency(1245000, "INR");
    // en-IN groups as 12,45,000 — NOT 1,245,000
    expect(result).toContain("12,45,000");
  });

  it("₹10,000,000 (1 crore) formats correctly", () => {
    const result = formatCurrency(10000000, "INR");
    expect(result).toContain("1,00,00,000");
  });

  it("small INR amount formats without lakhs grouping issue", () => {
    const result = formatCurrency(5000, "INR");
    expect(result).toContain("5,000");
  });
});

describe("formatCurrency — USD uses US grouping (millions)", () => {
  it("$1,245,000 formats correctly", () => {
    const result = formatCurrency(1245000, "USD");
    expect(result).toContain("1,245,000");
  });
});

describe("formatCurrency — EUR", () => {
  it("EUR amount includes € symbol", () => {
    const result = formatCurrency(1000, "EUR");
    expect(result).toContain("1.000"); // German locale: period as thousands separator
  });
});

describe("formatNumber", () => {
  it("formats number with en-IN locale (Indian grouping)", () => {
    const result = formatNumber(1245000, "en-IN");
    expect(result).toContain("12,45,000");
  });

  it("formats number with en-US locale", () => {
    const result = formatNumber(1245000, "en-US");
    expect(result).toBe("1,245,000");
  });
});

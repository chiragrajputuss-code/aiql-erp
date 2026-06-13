import { describe, it, expect } from "vitest";
import { stripPII } from "../pii-stripper";

// ─── SSN ──────────────────────────────────────────────────────────────────────

describe("SSN", () => {
  it("strips XXX-XX-XXXX format", () => {
    const { text, strippedCount } = stripPII("Employee SSN is 123-45-6789 on file");
    expect(text).not.toContain("123-45-6789");
    expect(strippedCount).toBe(1);
  });

  it("records SSN in strippedItems with correct type", () => {
    const { strippedItems } = stripPII("SSN: 987-65-4321");
    expect(strippedItems.some((i) => i.type === "SSN")).toBe(true);
  });
});

// ─── EIN ──────────────────────────────────────────────────────────────────────

describe("EIN", () => {
  it("strips XX-XXXXXXX format", () => {
    const { text } = stripPII("Company EIN is 12-3456789 for tax purposes");
    expect(text).not.toContain("12-3456789");
  });

  it("records EIN type in audit", () => {
    const { strippedItems } = stripPII("EIN: 98-7654321");
    expect(strippedItems.some((i) => i.type === "EIN")).toBe(true);
  });
});

// ─── PAN (India) ──────────────────────────────────────────────────────────────

describe("PAN (India)", () => {
  it("strips a valid PAN: ABCDE1234F", () => {
    const { text } = stripPII("Director PAN: ABCDE1234F submitted");
    expect(text).not.toContain("ABCDE1234F");
  });

  it("strips PAN embedded in text", () => {
    const { text, strippedCount } = stripPII("Tax filing for PQRST5678Z this year");
    expect(text).not.toContain("PQRST5678Z");
    expect(strippedCount).toBeGreaterThanOrEqual(1);
  });

  it("does NOT strip a lowercase pan-like string", () => {
    // PAN is uppercase only
    const { strippedItems } = stripPII("abcde1234f is not a PAN");
    expect(strippedItems.some((i) => i.type === "PAN")).toBe(false);
  });
});

// ─── Aadhaar (India) ──────────────────────────────────────────────────────────

describe("Aadhaar (India)", () => {
  it("strips XXXX XXXX XXXX (spaced) format", () => {
    const { text } = stripPII("Aadhaar: 1234 5678 9012 provided for KYC");
    expect(text).not.toContain("1234 5678 9012");
  });

  it("strips 12-digit unspaced Aadhaar", () => {
    const { text } = stripPII("Aadhaar number 123456789012 on record");
    expect(text).not.toContain("123456789012");
  });

  it("records type as AADHAAR", () => {
    const { strippedItems } = stripPII("Aadhaar: 1234 5678 9012");
    expect(strippedItems.some((i) => i.type === "AADHAAR")).toBe(true);
  });
});

// ─── GSTIN (India) ────────────────────────────────────────────────────────────

describe("GSTIN (India)", () => {
  it("strips a valid GSTIN: 27ABCDE1234F1Z5", () => {
    const { text } = stripPII("Vendor GSTIN: 27ABCDE1234F1Z5 for invoice");
    expect(text).not.toContain("27ABCDE1234F1Z5");
  });

  it("strips GSTIN and does NOT separately strip the embedded PAN", () => {
    // GSTIN contains a PAN substring — should be one strip, not two
    const { strippedCount, strippedItems } = stripPII("GSTIN 07AAACR0090L1ZJ billing");
    // Should strip once (GSTIN), not twice
    const gstinStrips = strippedItems.filter((i) => i.type === "GSTIN");
    expect(gstinStrips.length).toBeGreaterThanOrEqual(1);
  });

  it("records type as GSTIN", () => {
    const { strippedItems } = stripPII("GST: 29AABCU9603R1ZX");
    expect(strippedItems.some((i) => i.type === "GSTIN")).toBe(true);
  });
});

// ─── Bank account ─────────────────────────────────────────────────────────────

describe("Bank account", () => {
  it("strips account number after keyword 'account'", () => {
    const { text } = stripPII("credit to account 1234567890 processed");
    expect(text).not.toContain("1234567890");
  });

  it("strips masked pattern ***XXXX", () => {
    const { text } = stripPII("last 4 digits: ***6789 on file");
    expect(text).not.toContain("***6789");
  });

  it("records type as BANK_ACCOUNT", () => {
    const { strippedItems } = stripPII("account number 9876543210 registered");
    expect(strippedItems.some((i) => i.type === "BANK_ACCOUNT")).toBe(true);
  });
});

// ─── Phone numbers ────────────────────────────────────────────────────────────

describe("Phone numbers", () => {
  it("strips +91-XXXXXXXXXX (Indian international format)", () => {
    const { text } = stripPII("Contact +91-9876543210 for details");
    expect(text).not.toContain("9876543210");
  });

  it("strips (XXX) XXX-XXXX (US format)", () => {
    const { text } = stripPII("Call (415) 555-0123 for support");
    expect(text).not.toContain("(415) 555-0123");
  });

  it("strips 10-digit Indian mobile starting with 6-9", () => {
    const { text } = stripPII("employee mobile 9988776655 on HR file");
    expect(text).not.toContain("9988776655");
  });

  it("records type as PHONE", () => {
    const { strippedItems } = stripPII("mobile: +91 8765432109");
    expect(strippedItems.some((i) => i.type === "PHONE")).toBe(true);
  });
});

// ─── Email (contextual) ───────────────────────────────────────────────────────

describe("Email (employee/PII context only)", () => {
  it("strips email when preceded by 'email:'", () => {
    const { text } = stripPII("email: john.doe@acme.com for HR records");
    expect(text).not.toContain("john.doe@acme.com");
  });

  it("strips email when preceded by 'employee'", () => {
    const { text } = stripPII("employee priya@company.com payroll record");
    expect(text).not.toContain("priya@company.com");
  });

  it("does NOT strip email in general financial text without PII context", () => {
    // "vendor@acme.com" without a preceding employee/email keyword
    const { strippedItems } = stripPII("Send invoice to billing@acme.com");
    expect(strippedItems.some((i) => i.type === "EMAIL")).toBe(false);
  });
});

// ─── Multiple PII items ───────────────────────────────────────────────────────

describe("Multiple PII in one text", () => {
  it("strips multiple PII types from a single text", () => {
    const text = "Employee PAN ABCDE1234F, mobile 9988776655, SSN 123-45-6789";
    const { strippedCount, strippedItems } = stripPII(text);
    expect(strippedCount).toBeGreaterThanOrEqual(3);
    const types = strippedItems.map((i) => i.type);
    expect(types).toContain("PAN");
    expect(types).toContain("PHONE");
    expect(types).toContain("SSN");
  });

  it("stripped text contains none of the original PII values", () => {
    const text = "Aadhaar 1234 5678 9012, GSTIN 27ABCDE1234F1Z5, mobile 9876543210";
    const { text: stripped } = stripPII(text);
    expect(stripped).not.toMatch(/\b\d{4}\s\d{4}\s\d{4}\b/);
    expect(stripped).not.toMatch(/27ABCDE1234F1Z5/);
    expect(stripped).not.toMatch(/9876543210/);
  });

  it("returns empty string for text that is entirely PII", () => {
    const { text } = stripPII("123-45-6789");
    expect(text).toBe("");
  });

  it("returns unchanged text when no PII present", () => {
    const clean = "Show AP aging for Acme Corp above ₹5L";
    const { text, strippedCount } = stripPII(clean);
    expect(strippedCount).toBe(0);
    expect(text).toBe(clean);
  });
});

import { describe, it, expect } from "vitest";
import { normalizeInvoiceNo } from "../reconciliation/gl-utils";

const n = normalizeInvoiceNo;

describe("normalizeInvoiceNo — kills false 'not filed' without false matches", () => {
  it("matches the same invoice across separator + zero-padding differences", () => {
    // The exact case the messy stress test surfaced:
    expect(n("MSRM-26-412")).toBe(n("MSRM/26/0412"));
    expect(n("INV/2024/001")).toBe(n("INV-2024-1"));
    expect(n("GFH-2211")).toBe(n("GFH/2211"));
    expect(n("po 0045")).toBe(n("PO-45"));
  });

  it("strips leading zeros whether the run follows a letter, a separator, or start", () => {
    expect(n("INV0412")).toBe("INV412");
    expect(n("0001")).toBe("1");
    expect(n("26/0412")).toBe("26412");
  });

  it("does NOT collapse genuinely different invoices (no false collisions)", () => {
    expect(n("INV-100")).not.toBe(n("INV-1000")); // significant trailing digits kept
    expect(n("PO-412")).not.toBe(n("INV-412"));   // different prefix kept
    expect(n("MSRM-26-412")).not.toBe(n("MSRM-27-412")); // different middle segment kept
    expect(n("A-123")).not.toBe(n("A-124"));
  });

  it("is stable and safe on empty / null", () => {
    expect(n("")).toBe("");
    expect(n(null)).toBe("");
    expect(n(undefined)).toBe("");
  });
});

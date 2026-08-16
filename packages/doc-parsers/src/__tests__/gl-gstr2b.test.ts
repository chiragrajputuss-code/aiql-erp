import { describe, it, expect } from "vitest";
import { reconcileGlGstr2B } from "../reconciliation/gl-gstr2b";
import type { Gstr2BRow } from "../types";

function glRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    transaction_date: "2026-05-15",
    account_name:      "Purchases",
    account_group:     "Direct Expenses",
    voucher_type:      "purchase",
    description:       "Purchase invoice",
    debit_amount:      0,
    credit_amount:     0,
    net_amount:        0,
    vendor_name:       null,
    party_name:        null,
    reference_number:  null,
    ...overrides,
  };
}

function gstr2bRow(overrides: Partial<Gstr2BRow> = {}): Gstr2BRow {
  return {
    supplierGstin: "27AAAAA0000A1Z5",
    supplierName:  "Test Vendor",
    invoiceNo:     "INV-000",
    invoiceDate:   new Date("2026-05-01"),
    invoiceValue:  0,
    taxableValue:  0,
    igst: 0, cgst: 0, sgst: 0, cess: 0,
    itcEligible:       true,
    itcEligibleAmount: 0,
    itcReason:         null,
    supplyType:    "B2B",
    hsnCode:       null,
    placeOfSupply: "27",
    supplierFiledDate:   null,
    supplierFiledPeriod: null,
    _rowIndex: 0,
    _raw: {},
    ...overrides,
  };
}

describe("reconcileGlGstr2B", () => {
  it("matches a clean invoice with no gap", () => {
    const gl = [glRow({ reference_number: "INV-100", vendor_name: "Sharma Traders", net_amount: 5000 })];
    const doc = [gstr2bRow({ invoiceNo: "INV-100", supplierName: "Sharma Traders", taxableValue: 5000 })];

    const result = reconcileGlGstr2B(gl, doc, "conn-1");
    const codes = result.gaps.map((g) => g.code);
    expect(codes).not.toContain("G2BGL-002");
    expect(codes).not.toContain("G2BGL-003");
    expect(codes).not.toContain("G2BGL-004");
  });

  it("flags G2BGL-002 critical when a GL purchase above the threshold has no GSTR-2B entry", () => {
    const gl = [glRow({ reference_number: "INV-200", vendor_name: "Mehta Supplies", net_amount: 15000 })];
    const doc: Gstr2BRow[] = [];

    const result = reconcileGlGstr2B(gl, doc, "conn-1");
    const gap = result.gaps.find((g) => g.code === "G2BGL-002");
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe("critical");
    expect(gap?.party).toBe("Mehta Supplies");
    expect(gap?.glAmount).toBe(15000);
  });

  it("flags G2BGL-002 as review (not critical) below the threshold", () => {
    const gl = [glRow({ reference_number: "INV-201", vendor_name: "Small Vendor", net_amount: 2000 })];
    const result = reconcileGlGstr2B(gl, [], "conn-1");
    const gap = result.gaps.find((g) => g.code === "G2BGL-002");
    expect(gap?.severity).toBe("review");
  });

  it("flags G2BGL-003 when GSTR-2B has an invoice missing from GL", () => {
    const doc = [gstr2bRow({ invoiceNo: "INV-300", supplierName: "Kumar Co", taxableValue: 8000 })];
    const result = reconcileGlGstr2B([], doc, "conn-1");
    const gap = result.gaps.find((g) => g.code === "G2BGL-003");
    expect(gap).toBeDefined();
    expect(gap?.party).toBe("Kumar Co");
    expect(gap?.docAmount).toBe(8000);
  });

  it("flags G2BGL-004 when a matched invoice is marked ITC-ineligible", () => {
    const gl = [glRow({ reference_number: "INV-400", vendor_name: "Patel Industries", net_amount: 3000 })];
    const doc = [gstr2bRow({
      invoiceNo: "INV-400", supplierName: "Patel Industries", taxableValue: 3000,
      itcEligible: false, itcReason: "Return not filed",
    })];

    const result = reconcileGlGstr2B(gl, doc, "conn-1");
    const gap = result.gaps.find((g) => g.code === "G2BGL-004");
    expect(gap).toBeDefined();
    expect(gap?.description).toContain("Return not filed");
  });

  it("flags G2BGL-005 on supplier name mismatch between GL and GSTR-2B", () => {
    const gl = [glRow({ reference_number: "INV-500", vendor_name: "Acme Corp", net_amount: 4000 })];
    const doc = [gstr2bRow({ invoiceNo: "INV-500", supplierName: "Totally Different Enterprises", taxableValue: 4000 })];

    const result = reconcileGlGstr2B(gl, doc, "conn-1");
    const gap = result.gaps.find((g) => g.code === "G2BGL-005");
    expect(gap).toBeDefined();
  });

  it("computes overall purchase-vs-taxable variance (G2BGL-001) above tolerance", () => {
    const gl = [glRow({ reference_number: "INV-600", vendor_name: "Big Vendor", net_amount: 100_000 })];
    const doc = [gstr2bRow({ invoiceNo: "INV-600", supplierName: "Big Vendor", taxableValue: 40_000 })];

    const result = reconcileGlGstr2B(gl, doc, "conn-1");
    const gap = result.gaps.find((g) => g.code === "G2BGL-001");
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe("critical"); // variance of 60,000 > 50,000
  });

  it("returns type GL_GSTR2B and correct bySeverity totals", () => {
    const gl = [glRow({ reference_number: "INV-700", vendor_name: "Vendor X", net_amount: 15000 })];
    const result = reconcileGlGstr2B(gl, [], "conn-1");
    expect(result.type).toBe("GL_GSTR2B");
    expect(result.bySeverity.critical).toBeGreaterThanOrEqual(1);
    expect(result.totalGaps).toBe(result.gaps.length);
  });
});

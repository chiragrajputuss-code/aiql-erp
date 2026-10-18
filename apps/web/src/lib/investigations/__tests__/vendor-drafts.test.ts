import { describe, it, expect } from "vitest";
import { buildVendorDrafts, isDraftable } from "../vendor-drafts";

// Evidence shapes mirror what the engine actually emits:
//   gst-vendor-itc.ts  evidenceFromGap(): references = [invoiceRef, party].filter(Boolean),
//                      description embeds the invoice ref when present.
//   duplicate-payment.ts evidenceFor():   references = [payeeName, ...paymentRefs],
//                      rows = one entry per payment in the cluster.

function gapEvidence(ref: string | null, party: string | null, amountRs: number) {
  return {
    description: ref
      ? `GL records a purchase of ₹${amountRs}.00 against invoice ${ref}, but it does not appear in GSTR-2B.`
      : "GL records a purchase with no invoice reference, absent from GSTR-2B.",
    amountRs,
    references: [ref, party].filter((x): x is string => Boolean(x)),
    rows: [{}],
  };
}

describe("buildVendorDrafts — GST-ITC-002 (file-your-GSTR-1 reminder)", () => {
  it("groups invoices by vendor: one draft per vendor, not per invoice", () => {
    const drafts = buildVendorDrafts(
      {
        code: "GST-ITC-002",
        evidence: [
          gapEvidence("AGW-88", "Agarwal Stationery", 71000),
          gapEvidence("AGW-91", "Agarwal Stationery", 9000),
          gapEvidence("SRP-12", "Sindhwani Rubber", 94000),
        ],
      },
      { clientName: "Bharat Auto", periodLabel: "May 2026" },
    );

    expect(drafts).toHaveLength(2);
    const agarwal = drafts.find((d) => d.vendor === "Agarwal Stationery")!;
    expect(agarwal.amountRs).toBe(80000);
    expect(agarwal.message).toContain("Invoice AGW-88 — ₹71,000");
    expect(agarwal.message).toContain("Invoice AGW-91 — ₹9,000");
    expect(agarwal.message).toContain("GSTR-2B for May 2026");
    expect(agarwal.message).toContain("Bharat Auto");
    // plural agreement
    expect(agarwal.message).toContain("have not yet appeared");
    const sindhwani = drafts.find((d) => d.vendor === "Sindhwani Rubber")!;
    expect(sindhwani.message).toContain("has not yet appeared");
  });

  it("treats a single reference as the party when the description doesn't contain it", () => {
    const drafts = buildVendorDrafts({
      code: "GST-ITC-002",
      evidence: [gapEvidence(null, "Bright Tools", 50000)],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].vendor).toBe("Bright Tools");
    expect(drafts[0].message).toContain("Invoice (ref not available)");
  });

  it("treats a single reference as the invoice when the description does contain it", () => {
    const e = gapEvidence("INV-500", null, 12000);
    const drafts = buildVendorDrafts({ code: "GST-ITC-002", evidence: [e] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].vendor).toBe("");
    expect(drafts[0].message).toContain("Dear Supplier team");
    expect(drafts[0].message).toContain("Invoice INV-500");
  });
});

describe("buildVendorDrafts — duplicate payments", () => {
  it("builds a confirm-or-refund request from a cluster", () => {
    const drafts = buildVendorDrafts(
      {
        code: "DUP-PAY-001",
        evidence: [{
          description: "2 payments of ₹68,000 to Mehta Steel sharing the same invoice reference",
          amountRs: 68000,
          references: ["Mehta Steel", "INV-MSI-041"],
          rows: [{}, {}],
        }],
      },
      { clientName: "Bharat Auto", firmName: "Sharma & Associates" },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].vendor).toBe("Mehta Steel");
    expect(drafts[0].message).toContain("2 payments of ₹68,000 each");
    expect(drafts[0].message).toContain("ref: INV-MSI-041");
    expect(drafts[0].message).toContain("refund");
    expect(drafts[0].message).toContain("Sharma & Associates");
    expect(drafts[0].message).toContain("(for Bharat Auto)");
  });
});

describe("what is draftable", () => {
  it("never drafts a chase for the late-filer finding — its point is 'do not chase'", () => {
    expect(isDraftable("GST-ITC-006")).toBe(false);
    expect(buildVendorDrafts({ code: "GST-ITC-006", evidence: [gapEvidence("X-1", "Speedway", 19800)] })).toEqual([]);
  });

  it("drafts nothing for internal-action findings (unclaimed ITC, blocked credit, name mismatch)", () => {
    for (const code of ["GST-ITC-001", "GST-ITC-003", "GST-ITC-004", "GST-ITC-005"]) {
      expect(isDraftable(code)).toBe(false);
      expect(buildVendorDrafts({ code, evidence: [] })).toEqual([]);
    }
  });

  it("is deterministic — same finding in, same drafts out", () => {
    const f = {
      code: "GST-ITC-002",
      evidence: [gapEvidence("A-1", "V One", 100), gapEvidence("B-2", "V Two", 200)],
    };
    expect(buildVendorDrafts(f, { clientName: "C" })).toEqual(buildVendorDrafts(f, { clientName: "C" }));
  });
});

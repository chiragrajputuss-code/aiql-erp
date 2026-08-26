import { describe, it, expect } from "vitest";
import type { Gstr2BRow } from "@aiql/doc-parsers";
import { GST_VENDOR_ITC } from "../investigations/gst-vendor-itc";
import { runReport } from "../runner";
import { Capability } from "../capabilities";
import type { BusinessContext, InvestigationPeriod } from "../context";

// ─── Row builders (mirror packages/doc-parsers gl-gstr2b.test.ts) ─────────────

function glRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    transaction_date: "2026-05-15",
    account_name:     "Purchases",
    account_group:    "Direct Expenses",
    voucher_type:     "purchase",
    description:      "Purchase invoice",
    debit_amount:     0,
    credit_amount:    0,
    net_amount:       0,
    vendor_name:      null,
    party_name:       null,
    reference_number: null,
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

// ─── Fake immutable BusinessContext with in-memory accessors ──────────────────

const PERIOD: InvestigationPeriod = {
  month: 5, year: 2026, label: "05-2026",
  start: new Date("2026-05-01"), end: new Date("2026-05-31"),
};

function makeContext(opts: {
  glRows?:  Record<string, unknown>[];
  gstrRows?: Gstr2BRow[];
  withItc?: boolean;          // default true
}): BusinessContext {
  const withItc = opts.withItc ?? true;
  const capabilities = new Set<Capability>([Capability.GENERAL_LEDGER]);
  if (withItc) capabilities.add(Capability.INPUT_TAX_CREDIT);

  return Object.freeze({
    organizationId: "org-1",
    connectionId:   "conn-test",
    period:         PERIOD,
    snapshotId:     "CTX-TEST-001",
    resolvedAt:     new Date(),
    profileId:      "indian-sme-default",
    isStale:        false,
    dataAsOf:       new Date(),
    capabilities,
    gl: {
      getRawRows:      async () => opts.glRows ?? [],
      getConnectionId: () => "conn-gl",
      getPeriodStart:  () => PERIOD.start,
      getPeriodEnd:    () => PERIOD.end,
    },
    itc: withItc ? {
      getRows:         async () => opts.gstrRows ?? [],
      getConnectionId: () => "conn-itc",
    } : null,
    vendorCompliance: null,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GST Vendor ITC investigation", () => {
  it("flags a critical not-filed finding with materialized evidence, recommendation and resolvesWhen", async () => {
    const ctx = makeContext({
      glRows:  [glRow({ reference_number: "INV-200", vendor_name: "Mehta Supplies", net_amount: 15000 })],
      gstrRows: [],
    });

    const findings = await GST_VENDOR_ITC.run(ctx);
    const f = findings.find((x) => x.code === "GST-ITC-002");

    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.impactRs).toBe(15000);
    // Evidence is materialized (actual rows, not a reference)
    expect(f!.evidence.length).toBeGreaterThan(0);
    expect(f!.evidence[0].rows.length).toBeGreaterThan(0);
    // Five-question fields all present
    expect(f!.businessQuestion.length).toBeGreaterThan(0);
    expect(f!.recommendation.action.length).toBeGreaterThan(0);
    expect(f!.verificationSteps.length).toBeGreaterThan(0);
    expect(f!.resolvesWhen.length).toBeGreaterThan(0);
    expect(f!.recommendation.priority).toBe("today");
  });

  it("flags an opportunity finding when ITC is available but not booked", async () => {
    const ctx = makeContext({
      glRows:  [],
      gstrRows: [gstr2bRow({ invoiceNo: "INV-300", supplierName: "Kumar Co", taxableValue: 8000 })],
    });

    const findings = await GST_VENDOR_ITC.run(ctx);
    const f = findings.find((x) => x.code === "GST-ITC-003");

    expect(f).toBeDefined();
    expect(f!.severity).toBe("opportunity");
    expect(f!.category).toBe("opportunity");
    expect(f!.impactRs).toBe(8000);
  });

  it("flags an ITC-ineligible finding including the reason", async () => {
    const ctx = makeContext({
      glRows:  [glRow({ reference_number: "INV-400", vendor_name: "Patel Industries", net_amount: 3000 })],
      gstrRows: [gstr2bRow({
        invoiceNo: "INV-400", supplierName: "Patel Industries", taxableValue: 3000,
        itcEligible: false, itcReason: "Return not filed",
      })],
    });

    const findings = await GST_VENDOR_ITC.run(ctx);
    const f = findings.find((x) => x.code === "GST-ITC-004");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("produces no findings on clean, fully-matched data", async () => {
    const ctx = makeContext({
      glRows:  [glRow({ reference_number: "INV-100", vendor_name: "Sharma Traders", net_amount: 5000 })],
      gstrRows: [gstr2bRow({ invoiceNo: "INV-100", supplierName: "Sharma Traders", taxableValue: 5000 })],
    });

    const findings = await GST_VENDOR_ITC.run(ctx);
    expect(findings).toHaveLength(0);
  });
});

describe("runner", () => {
  it("skips the investigation when INPUT_TAX_CREDIT capability is absent", async () => {
    const ctx = makeContext({ glRows: [], gstrRows: [], withItc: false });
    const report = await runReport([GST_VENDOR_ITC], ctx);

    expect(report.findings).toHaveLength(0);
    expect(report.outcomes).toHaveLength(1);
    expect(report.outcomes[0].status).toBe("skipped");
    expect(report.outcomes[0].reason).toContain("INPUT_TAX_CREDIT");
  });

  it("runs the investigation and rolls up counts + a deterministic exec summary when capabilities are present", async () => {
    const ctx = makeContext({
      glRows:  [glRow({ reference_number: "INV-200", vendor_name: "Mehta Supplies", net_amount: 15000 })],
      gstrRows: [],
    });
    const report = await runReport([GST_VENDOR_ITC], ctx);

    expect(report.outcomes[0].status).toBe("completed");
    expect(report.criticalCount).toBeGreaterThanOrEqual(1);
    expect(report.totalImpactRs).toBeGreaterThanOrEqual(15000);
    expect(report.healthScore).toBeLessThan(100);
    // No llmFn injected → deterministic fallback summary is non-empty
    expect(report.executiveSummary.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { DUPLICATE_PAYMENT } from "../investigations/duplicate-payment";
import { runReport } from "../runner";
import { Capability } from "../capabilities";
import type { BusinessContext, InvestigationPeriod } from "../context";

// Raw GL payment row (keys match the canonical columns parseGlRows reads).
function pay(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    transaction_date: "2026-05-10",
    voucher_type:     "Payment",
    account_name:     "Bank",
    account_group:    "Bank Accounts",
    description:      "Vendor payment",
    vendor_name:      null,
    party_name:       null,
    reference_number: null,
    debit_amount:     0,
    credit_amount:    0,
    net_amount:       0,
    ...over,
  };
}

const PERIOD: InvestigationPeriod = {
  month: 5, year: 2026, label: "05-2026",
  start: new Date("2026-05-01"), end: new Date("2026-05-31"),
};

function makeContext(glRows: Record<string, unknown>[], withGl = true): BusinessContext {
  const capabilities = new Set<Capability>();
  if (withGl) capabilities.add(Capability.GENERAL_LEDGER);
  return Object.freeze({
    organizationId: "org-1", period: PERIOD, snapshotId: "CTX-TEST", resolvedAt: new Date(),
    profileId: "indian-sme-default", isStale: false, dataAsOf: new Date(), capabilities,
    gl: withGl ? {
      getRawRows: async () => glRows,
      getConnectionId: () => "conn-gl",
      getPeriodStart: () => PERIOD.start,
      getPeriodEnd: () => PERIOD.end,
    } : null,
    itc: null,
    vendorCompliance: null,
  });
}

describe("Duplicate Payment investigation", () => {
  it("produces no finding on clean, distinct payments", async () => {
    const ctx = makeContext([
      pay({ vendor_name: "Mehta Steel Industries", reference_number: "INV-MSI-041", net_amount: 68000 }),
      pay({ vendor_name: "Gupta Metal Works", reference_number: "GMW-334", net_amount: 42000 }),
    ]);
    const findings = await DUPLICATE_PAYMENT.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it("flags a critical duplicate when same vendor + amount + reference is paid twice", async () => {
    const ctx = makeContext([
      pay({ vendor_name: "Mehta Steel Industries", reference_number: "INV-MSI-041", net_amount: 68000, transaction_date: "2026-05-07" }),
      pay({ vendor_name: "Mehta Steel Industries", reference_number: "INV/MSI/041", net_amount: 68000, transaction_date: "2026-05-22" }),
    ]);
    const findings = await DUPLICATE_PAYMENT.run(ctx);
    const f = findings.find((x) => x.code === "DUP-PAY-001");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.impactRs).toBe(68000);           // one duplicate of 68k
    expect(f!.evidence[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(f!.evidence[0].rows.length).toBe(2); // materialized
  });

  it("lowers confidence when the payee match is fuzzy", async () => {
    const ctx = makeContext([
      pay({ vendor_name: "Mehta Steel Industries", reference_number: "INV-041", net_amount: 68000, transaction_date: "2026-05-07" }),
      pay({ vendor_name: "Mehta Steel Ind", reference_number: "INV-041", net_amount: 68000, transaction_date: "2026-05-09" }),
    ]);
    const findings = await DUPLICATE_PAYMENT.run(ctx);
    const f = findings.find((x) => x.code === "DUP-PAY-001");
    expect(f).toBeDefined();
    expect(f!.evidence[0].confidence).toBeLessThan(0.9);  // fuzzy → 0.75
  });

  it("flags a probable (warning) duplicate for same payee+amount within the window, no shared reference", async () => {
    const ctx = makeContext([
      pay({ vendor_name: "Sharma Traders", reference_number: "A-1", net_amount: 15000, transaction_date: "2026-05-05" }),
      pay({ vendor_name: "Sharma Traders", reference_number: "B-2", net_amount: 15000, transaction_date: "2026-05-15" }),
    ]);
    const findings = await DUPLICATE_PAYMENT.run(ctx);
    const f = findings.find((x) => x.code === "DUP-PAY-002");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("runner skips the investigation when GENERAL_LEDGER is absent", async () => {
    const ctx = makeContext([], false);
    const report = await runReport([DUPLICATE_PAYMENT], ctx);
    expect(report.findings).toHaveLength(0);
    expect(report.outcomes[0].status).toBe("skipped");
    expect(report.outcomes[0].reason).toContain("GENERAL_LEDGER");
  });
});

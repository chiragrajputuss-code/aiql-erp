import { prisma } from "@aiql/db";
import type { ReconGap } from "@aiql/doc-parsers";

// Persists per-vendor GST-filing risk from a GL ↔ GSTR-2B reconciliation run.
// Must happen at reconcile time because the raw WorkspaceDocument table this
// data comes from expires after 90 days — this is the only place the numbers
// can be captured before they're gone.
//
// v1 metric definition (intentionally simple, not a substitute for full
// invoice-level audit): for each vendor, count distinct invoice references
// that were flagged by this reconciliation run —
//   invoicesTotal  = G2BGL-002 (not in GSTR-2B) + G2BGL-004 (ITC ineligible)
//   invoicesAtRisk = G2BGL-002 only (vendor hasn't filed at all — the worst case)
// Invoices that matched cleanly produce no gap, so they aren't counted here;
// this number tracks "how many problems did we find for this vendor", not
// "this vendor's total purchase volume".

function periodKey(date: Date | null): string {
  const d = date ?? new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export async function upsertVendorComplianceRecords(
  connectionId: string,
  periodStart:  Date | null,
  gaps:         ReconGap[],
): Promise<void> {
  const period = periodKey(periodStart);

  const byVendor = new Map<string, { total: Set<string>; atRisk: Set<string>; amount: number }>();

  for (const gap of gaps) {
    if (gap.code !== "G2BGL-002" && gap.code !== "G2BGL-004") continue;
    const vendor = gap.party?.trim() || "Unknown vendor";
    const ref    = gap.reference ?? `${gap.code}-${vendor}`;

    const entry = byVendor.get(vendor) ?? { total: new Set(), atRisk: new Set(), amount: 0 };
    entry.total.add(ref);
    if (gap.code === "G2BGL-002") {
      entry.atRisk.add(ref);
      entry.amount += gap.variance;
    }
    byVendor.set(vendor, entry);
  }

  if (byVendor.size === 0) return;

  await Promise.all(
    Array.from(byVendor.entries()).map(([vendorName, stats]) =>
      prisma.vendorComplianceRecord.upsert({
        where: { connectionId_vendorName_period: { connectionId, vendorName, period } },
        create: {
          connectionId,
          vendorName,
          period,
          invoicesTotal:  stats.total.size,
          invoicesAtRisk: stats.atRisk.size,
          amountAtRisk:   stats.amount,
        },
        update: {
          invoicesTotal:  stats.total.size,
          invoicesAtRisk: stats.atRisk.size,
          amountAtRisk:   stats.amount,
        },
      })
    )
  );
}

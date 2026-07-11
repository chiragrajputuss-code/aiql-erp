import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { computeVendorRiskBand } from "@aiql/pulse-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { connectionId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Verify connection belongs to user's org
  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.connectionId, orgId: user.orgId },
    select: { id: true },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch all vendor compliance records for this connection
  const records = await prisma.vendorComplianceRecord.findMany({
    where: { connectionId: params.connectionId },
    orderBy: [{ period: "desc" }, { amountAtRisk: "desc" }],
  });

  if (records.length === 0) {
    return NextResponse.json({ vendors: [], periods: [], summary: null });
  }

  // Derive all unique periods and vendors
  const allPeriods = [...new Set(records.map((r) => r.period))].sort().reverse();
  const latestPeriod = allPeriods[0];

  // Build per-vendor summary with risk band (using all periods as trailing window)
  const byVendor = new Map<string, typeof records>();
  for (const r of records) {
    if (!byVendor.has(r.vendorName)) byVendor.set(r.vendorName, []);
    byVendor.get(r.vendorName)!.push(r);
  }

  const vendors = Array.from(byVendor.entries()).map(([vendorName, vendorRecords]) => {
    const riskBand = computeVendorRiskBand(vendorRecords);
    const latest = vendorRecords.find((r) => r.period === latestPeriod);
    const totalAmountAtRisk = vendorRecords.reduce((s, r) => s + r.amountAtRisk, 0);
    return {
      vendorName,
      vendorGstin: vendorRecords[0].vendorGstin ?? null,
      riskBand,
      latestPeriod: latest?.period ?? null,
      latestAmountAtRisk: latest?.amountAtRisk ?? 0,
      latestInvoicesAtRisk: latest?.invoicesAtRisk ?? 0,
      latestInvoicesTotal: latest?.invoicesTotal ?? 0,
      totalAmountAtRisk,
      periods: vendorRecords.map((r) => ({
        period: r.period,
        invoicesTotal: r.invoicesTotal,
        invoicesAtRisk: r.invoicesAtRisk,
        amountAtRisk: r.amountAtRisk,
      })),
    };
  });

  // Sort: red first, then amber, then green; within band by latestAmountAtRisk desc
  const bandOrder = { red: 0, amber: 1, green: 2 };
  vendors.sort((a, b) =>
    bandOrder[a.riskBand] - bandOrder[b.riskBand] ||
    b.latestAmountAtRisk - a.latestAmountAtRisk,
  );

  const summary = {
    latestPeriod,
    totalVendors: vendors.length,
    redCount: vendors.filter((v) => v.riskBand === "red").length,
    amberCount: vendors.filter((v) => v.riskBand === "amber").length,
    greenCount: vendors.filter((v) => v.riskBand === "green").length,
    totalAmountAtRisk: vendors.reduce((s, v) => s + v.latestAmountAtRisk, 0),
  };

  return NextResponse.json({ vendors, periods: allPeriods, summary });
}

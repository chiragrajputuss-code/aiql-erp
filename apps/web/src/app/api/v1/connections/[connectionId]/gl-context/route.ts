// GET /api/v1/connections/:id/gl-context
// Returns lightweight GL stats used for personalized chat onboarding and
// cross-period question generation. Reads at most a few aggregate queries.

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

type Ctx = { params: { connectionId: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: params.connectionId, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection?.uploadedFile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tableName = connection.uploadedFile.tableName;

  // Fetch table columns to know what's available
  let columnSet = new Set<string>();
  try {
    const colRows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName.replace(/'/g, "''")}'`
    );
    columnSet = new Set(colRows.map((r) => r.column_name));
  } catch { /* ignore */ }

  const has = (c: string) => columnSet.has(c);

  // Run all context queries in parallel — all are cheap aggregates
  const [dateRange, topAccounts, topVendors, voucherTypes, totalRows] = await Promise.all([
    // Date range
    has("transaction_date")
      ? prisma.$queryRawUnsafe<{ min_d: Date | null; max_d: Date | null }[]>(
          `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${tableName}"`
        ).catch(() => [])
      : Promise.resolve([]),

    // Top 5 accounts by transaction count
    has("account_name")
      ? prisma.$queryRawUnsafe<{ account_name: string; cnt: bigint }[]>(
          `SELECT account_name, COUNT(*) AS cnt FROM "${tableName}"
           WHERE account_name IS NOT NULL AND account_name <> ''
           GROUP BY account_name ORDER BY cnt DESC LIMIT 5`
        ).catch(() => [])
      : Promise.resolve([]),

    // Top 3 vendors/parties by total debit
    (has("vendor_name") || has("party_name"))
      ? prisma.$queryRawUnsafe<{ party: string; total: unknown }[]>(
          `SELECT COALESCE(${has("vendor_name") ? "vendor_name" : "party_name"}, '') AS party,
                  SUM(COALESCE(${has("debit_amount") ? "debit_amount" : "0"}::numeric, 0)) AS total
           FROM "${tableName}"
           WHERE COALESCE(${has("vendor_name") ? "vendor_name" : "party_name"}, '') <> ''
           GROUP BY party ORDER BY total DESC LIMIT 3`
        ).catch(() => [])
      : Promise.resolve([]),

    // Distinct voucher types
    has("voucher_type")
      ? prisma.$queryRawUnsafe<{ vt: string }[]>(
          `SELECT DISTINCT LOWER(COALESCE(voucher_type,'')) AS vt FROM "${tableName}"
           WHERE voucher_type IS NOT NULL AND voucher_type <> '' LIMIT 10`
        ).catch(() => [])
      : Promise.resolve([]),

    // Total row count
    prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*) AS cnt FROM "${tableName}"`
    ).catch(() => [{ cnt: BigInt(0) }]),
  ]);

  const dr = (dateRange as { min_d: Date | null; max_d: Date | null }[])[0];
  const minDate = dr?.min_d ? new Date(dr.min_d).toISOString().slice(0, 10) : null;
  const maxDate = dr?.max_d ? new Date(dr.max_d).toISOString().slice(0, 10) : null;

  // Determine number of full quarters in GL
  let quarters: { label: string; start: string; end: string }[] = [];
  if (minDate && maxDate) {
    const start = new Date(minDate);
    const end   = new Date(maxDate);
    // Indian FY quarters
    const fyStart = start.getMonth() >= 3
      ? start.getFullYear()
      : start.getFullYear() - 1;
    const quarterDefs = [
      { label: "Q1", start: `${fyStart}-04-01`,     end: `${fyStart}-06-30` },
      { label: "Q2", start: `${fyStart}-07-01`,     end: `${fyStart}-09-30` },
      { label: "Q3", start: `${fyStart}-10-01`,     end: `${fyStart}-12-31` },
      { label: "Q4", start: `${fyStart + 1}-01-01`, end: `${fyStart + 1}-03-31` },
    ];
    quarters = quarterDefs.filter(
      (q) => new Date(q.start) >= start && new Date(q.end) <= end
    );
  }

  return NextResponse.json({
    minDate,
    maxDate,
    totalRows: Number((totalRows as { cnt: bigint }[])[0]?.cnt ?? 0),
    topAccounts: (topAccounts as { account_name: string; cnt: bigint }[]).map((r) => ({
      name: r.account_name,
      count: Number(r.cnt),
    })),
    topVendors: (topVendors as { party: string; total: unknown }[]).map((r) => ({
      name: r.party,
      total: Number(r.total ?? 0),
    })),
    voucherTypes: (voucherTypes as { vt: string }[]).map((r) => r.vt).filter(Boolean),
    quarters,
    hasVendors:  has("vendor_name") || has("party_name"),
    hasAccounts: has("account_name"),
    hasVoucherType: has("voucher_type"),
  });
}

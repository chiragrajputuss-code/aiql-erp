import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

type Ctx = { params: { connectionId: string } };

async function ensureListerColumns(tableName: string): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "${tableName}"
      ADD COLUMN IF NOT EXISTS _row_id  BIGSERIAL,
      ADD COLUMN IF NOT EXISTS _excluded BOOLEAN DEFAULT FALSE
  `);
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { connectionId } = params;

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: connectionId, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection)              return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!connection.uploadedFile) return NextResponse.json({ error: "No uploaded file" }, { status: 400 });

  const tableName = connection.uploadedFile.tableName;
  try { await ensureListerColumns(tableName); } catch { /* ignore — table may be read-only in demo */ }

  const sp          = req.nextUrl.searchParams;
  const page        = Math.max(1,   parseInt(sp.get("page")     ?? "1",  10));
  const pageSize    = Math.min(200, parseInt(sp.get("pageSize") ?? "50", 10));
  const search      = sp.get("search")?.trim()      ?? "";
  const startDate   = sp.get("startDate")?.trim()   ?? "";
  const endDate     = sp.get("endDate")?.trim()      ?? "";
  const voucherType = sp.get("voucherType")?.trim()  ?? "";
  const flaggedOnly = sp.get("flaggedOnly") === "true";
  const refNosParam  = sp.get("refNos")?.trim()  ?? "";
  const acctNosParam = sp.get("acctNos")?.trim() ?? "";
  const offset       = (page - 1) * pageSize;

  // Fetch actual table columns FIRST — needed to build a safe WHERE clause
  // (different GL files may have different canonical columns present)
  let columns: string[]    = [];
  let columnSet = new Set<string>();
  try {
    const colRows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = '${tableName.replace(/'/g, "''")}'
       ORDER BY ordinal_position`,
    );
    columns   = colRows.map((r) => r.column_name);
    columnSet = new Set(columns);
  } catch { /* ignore */ }

  // Build WHERE clauses — only reference columns that actually exist
  const whereClauses: string[] = [];

  if (search) {
    const escaped  = search.replace(/'/g, "''");
    const searchable = ["party_name", "vendor_name", "customer_name", "account_name", "reference_number", "description"]
      .filter((c) => columnSet.has(c));
    if (searchable.length > 0) {
      whereClauses.push(`(${searchable.map((c) => `${c}::text ILIKE '%${escaped}%'`).join(" OR ")})`);
    }
  }
  if (startDate && columnSet.has("transaction_date")) {
    whereClauses.push(`transaction_date >= '${startDate.replace(/'/g, "''")}'::date`);
  }
  if (endDate && columnSet.has("transaction_date")) {
    whereClauses.push(`transaction_date <= '${endDate.replace(/'/g, "''")}'::date`);
  }
  if (voucherType && columnSet.has("voucher_type")) {
    const escaped = voucherType.replace(/'/g, "''");
    whereClauses.push(`LOWER(COALESCE(voucher_type, '')) = LOWER('${escaped}')`);
  }
  if (flaggedOnly && columnSet.has("_excluded")) {
    whereClauses.push(`_excluded IS TRUE`);
  }
  // Scan overlay filter — ref-level and account-level combined into one OR clause
  // so both per-voucher checks and account-level checks (debtors aging, sign anomalies)
  // show their rows together when "Show flagged only" is active.
  {
    const scanParts: string[] = [];

    if (refNosParam && columnSet.has("reference_number")) {
      const refList = refNosParam
        .split(",")
        .map((r) => r.trim().replace(/'/g, "''"))
        .filter((r) => r.length > 0)
        .slice(0, 300);
      if (refList.length > 0) {
        scanParts.push(`reference_number IN (${refList.map((r) => `'${r}'`).join(",")})`);
      }
    }

    if (acctNosParam) {
      const acctList = acctNosParam
        .split(",")
        .map((a) => a.trim().replace(/'/g, "''"))
        .filter((a) => a.length > 0)
        .slice(0, 100);
      if (acctList.length > 0) {
        const acctCols = ["account_name", "party_name", "vendor_name", "customer_name"]
          .filter((c) => columnSet.has(c));
        if (acctCols.length > 0) {
          const quoted = acctList.map((a) => `'${a}'`).join(",");
          scanParts.push(...acctCols.map((c) => `${c} IN (${quoted})`));
        }
      }
    }

    if (scanParts.length > 0) {
      whereClauses.push(`(${scanParts.join(" OR ")})`);
    }
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Count total rows matching filters
  let totalRows = 0;
  try {
    const countRows = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*) AS cnt FROM "${tableName}" ${whereStr}`,
    );
    totalRows = Number(countRows[0]?.cnt ?? 0);
  } catch { /* ignore */ }

  // Fetch distinct voucher types for the filter dropdown
  let voucherTypes: string[] = [];
  if (columnSet.has("voucher_type")) {
    try {
      const vtRows = await prisma.$queryRawUnsafe<{ vtype: string }[]>(
        `SELECT DISTINCT LOWER(voucher_type) AS vtype FROM "${tableName}"
         WHERE voucher_type IS NOT NULL AND voucher_type <> ''
         ORDER BY vtype LIMIT 30`,
      );
      voucherTypes = vtRows.map((r) => r.vtype);
    } catch { /* ignore */ }
  }

  // Fetch page of rows
  let rows: Record<string, unknown>[] = [];
  try {
    const orderCol = columnSet.has("_row_id") ? "COALESCE(_row_id, 0)" : "1";
    const orderDate = columnSet.has("transaction_date") ? ", transaction_date NULLS LAST" : "";
    const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${tableName}" ${whereStr}
       ORDER BY ${orderCol}${orderDate}
       LIMIT ${pageSize} OFFSET ${offset}`,
    );
    // Coerce BigInt → Number for JSON serialisation
    rows = raw.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return out;
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to query rows", detail: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    rows,
    columns: columns.filter((c) => c !== "_row_id"),
    voucherTypes,
    pagination: {
      page,
      pageSize,
      total: totalRows,
      totalPages: Math.ceil(totalRows / pageSize),
    },
  });
}

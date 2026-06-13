import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { z } from "zod";

type Ctx = { params: { connectionId: string; rowId: string } };

// Allowed editable canonical fields (prevents arbitrary column injection)
const EDITABLE_FIELDS = new Set([
  "transaction_date",
  "account_name",
  "party_name",
  "vendor_name",
  "customer_name",
  "debit_amount",
  "credit_amount",
  "net_amount",
  "reference_number",
  "voucher_type",
  "description",
  "account_code",
]);

const patchSchema = z.object({
  field: z.string().min(1),
  value: z.union([z.string(), z.number(), z.null()]),
});

// PATCH /api/v1/connections/:id/gl-rows/:rowId
// Body: { field: string, value: string | number | null }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { connectionId, rowId } = params;
  const rowIdNum = parseInt(rowId, 10);
  if (isNaN(rowIdNum)) return NextResponse.json({ error: "Invalid row ID" }, { status: 400 });

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: connectionId, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection || !connection.uploadedFile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { field, value } = parsed.data;

  if (!EDITABLE_FIELDS.has(field)) {
    return NextResponse.json({ error: `Field "${field}" is not editable` }, { status: 400 });
  }

  const tableName = connection.uploadedFile.tableName;

  // Build SET clause safely — field validated against allowlist above
  let sqlValue: string;
  if (value === null || value === undefined) {
    sqlValue = "NULL";
  } else if (typeof value === "number") {
    sqlValue = String(value);
  } else {
    sqlValue = `'${String(value).replace(/'/g, "''")}'`;
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "${tableName}" SET "${field}" = ${sqlValue} WHERE _row_id = ${rowIdNum}`,
    );
  } catch (err) {
    return NextResponse.json({ error: "Update failed", detail: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/v1/connections/:id/gl-rows/:rowId
// Toggles _excluded flag — body: { exclude: boolean }
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { connectionId, rowId } = params;
  const rowIdNum = parseInt(rowId, 10);
  if (isNaN(rowIdNum)) return NextResponse.json({ error: "Invalid row ID" }, { status: 400 });

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: connectionId, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection || !connection.uploadedFile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as { exclude?: boolean };
  const exclude = body.exclude !== false; // default true (exclude)

  const tableName = connection.uploadedFile.tableName;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "${tableName}" SET _excluded = ${exclude} WHERE _row_id = ${rowIdNum}`,
    );
  } catch (err) {
    return NextResponse.json({ error: "Exclude failed", detail: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, excluded: exclude });
}

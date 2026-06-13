import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { dropTempTable } from "@aiql/erp-connectors";
import { clearSummaryCache } from "@/lib/summary-cache";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(connection);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Drop temp table if it's a file upload
  if (connection.uploadedFile?.tableName) {
    await dropTempTable(connection.uploadedFile.tableName).catch(() => {});
  }

  await prisma.erpConnection.delete({ where: { id: params.id } });
  clearSummaryCache(user.orgId);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { createConnector } from "@aiql/erp-connectors";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (connection.erpType === "FILE_UPLOAD") {
    // File upload connections are always "connected" — just check table exists
    const { listOrgTables } = await import("@aiql/erp-connectors");
    const tables = await listOrgTables(user.orgId);
    const uploadFile = await prisma.uploadedFile.findUnique({ where: { connectionId: params.id } });
    const tableExists = uploadFile && tables.includes(uploadFile.tableName);
    return NextResponse.json({
      success: tableExists,
      message: tableExists ? "File data is available" : "Data table not found — please re-upload",
    });
  }

  // ERP connections — test via connector
  try {
    // TODO: resolve credentials from SSM using connection.credentialsArn before passing
    const connector = createConnector(connection.erpType as never, {});
    const result = await connector.testConnection();
    await prisma.erpConnection.update({
      where: { id: params.id },
      data: { status: result.success ? "ACTIVE" : "FAILED" },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ success: false, message: (e as Error).message });
  }
}

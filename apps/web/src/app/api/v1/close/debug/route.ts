import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

/**
 * GET /api/v1/close/debug?connectionId=xxx
 * Shows the accountTypeMap for a connection — use to verify automatic
 * account classification before running reconciliations.
 */
export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: connectionId, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const schema = connection.schemaCacheJson
    ? JSON.parse(connection.schemaCacheJson) as Record<string, unknown>
    : null;

  const accountTypeMap = (schema?.accountTypeMap ?? {}) as Record<string, string>;
  const columnMapping  = connection.uploadedFile?.columnMapping
    ? JSON.parse(connection.uploadedFile.columnMapping) as { sourceColumnName: string; canonicalField: string }[]
    : [];

  // Group accounts by type for readability
  const byType: Record<string, string[]> = {};
  for (const [name, type] of Object.entries(accountTypeMap)) {
    (byType[type] ??= []).push(name);
  }

  return NextResponse.json({
    connection: connection.displayName,
    accountsByType: byType,
    totalAccountsClassified: Object.keys(accountTypeMap).length,
    columnMappings: columnMapping,
  });
}

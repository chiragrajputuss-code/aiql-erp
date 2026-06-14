import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma, upsertOrgMappings, seedDefaultPinnedQueries } from "@aiql/db";
import { createTempTable, resolveRedundancy, validateMappings, getUploadEntityLists, buildUploadSchema } from "@aiql/erp-connectors";
import { uploadFile } from "@/lib/s3";
import { checkPlanAccess } from "@/lib/billing";

const schema = z.object({
  connectionId:     z.string(),
  confirmedMapping: z.array(z.object({
    originalName:    z.string(),
    canonicalName:   z.string().nullable(),
    confidence:      z.number(),
    detectionMethod: z.string(),
    skip:            z.boolean().optional(),
  })),
  // Document type metadata (from auto-detect + user confirm step)
  documentType:      z.enum(["GL", "TDS_RETURN_26Q", "GSTR_1", "GSTR_3B", "ITR", "OTHER"]).default("GL"),
  dataIntent:        z.enum(["CURRENT_OPERATIONAL", "HISTORICAL"]).default("CURRENT_OPERATIONAL"),
  userConfirmedType: z.boolean().default(false),
  periodStart:       z.string().nullable().optional(),  // ISO date string
  periodEnd:         z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // ── Plan / trial enforcement ──────────────────────────────────────────────
  const access = await checkPlanAccess(user.orgId, "import");
  if (!access.allowed) {
    return NextResponse.json({ error: access.message, reason: access.reason }, { status: 402 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { connectionId, confirmedMapping, documentType, dataIntent, userConfirmedType, periodStart, periodEnd } = parsed.data;

  const connection = await prisma.erpConnection.findFirst({
    where: { id: connectionId, orgId: user.orgId },
  });
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  if (connection.erpType !== "FILE_UPLOAD") return NextResponse.json({ error: "Not a file upload connection" }, { status: 400 });

  const cached = JSON.parse(connection.schemaCacheJson ?? "{}") as {
    _pending?: boolean;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    rowCount: number;
    rows: Record<string, unknown>[];
    headers: string[];
  };

  if (!cached._pending || !cached.rows) {
    return NextResponse.json({ error: "No pending upload data found — re-upload the file" }, { status: 400 });
  }

  // Apply mapping as ColumnMappingResult[] (non-skipped)
  const asColumnMappings = confirmedMapping
    .filter((m) => !m.skip)
    .map((m) => ({
      originalName:    m.originalName,
      canonicalName:   m.canonicalName,
      confidence:      m.confidence,
      detectionMethod: m.detectionMethod as never,
    }));

  // Redundancy + validation
  const resolved   = resolveRedundancy(asColumnMappings as never, "transaction");
  const validation = validateMappings(resolved);

  if (!validation.isValid) {
    return NextResponse.json({ error: "Invalid mapping", details: validation.errors }, { status: 422 });
  }

  // Create temp table
  const tableName = await createTempTable(user.orgId, connection.id, resolved, cached.rows);

  // Build schema + entity dictionary
  const rawSchema    = buildUploadSchema(tableName, resolved, cached.rows.length);
  const entityLists  = await getUploadEntityLists(tableName);

  // Expiry: 90 days
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  // Build org-level mappings to persist (only confirmed, non-skipped, with a canonical target)
  const mappingsToSave = confirmedMapping
    .filter((m) => !m.skip && m.canonicalName)
    .map((m) => ({ sourceColumnName: m.originalName, canonicalField: m.canonicalName! }));

  // Persist DB records + org column mappings in parallel
  await Promise.all([
    seedDefaultPinnedQueries(user.orgId, connectionId),
    prisma.$transaction([
      prisma.uploadedFile.upsert({
        where:  { connectionId },
        create: {
          connectionId,
          originalName:  cached.fileName,
          mimeType:      cached.mimeType,
          sizeBytes:     cached.sizeBytes,
          rowCount:      cached.rows.length,
          tableName,
          columnMapping: JSON.stringify(resolved),
          expiresAt,
          documentType:      documentType as never,
          dataIntent:        dataIntent as never,
          userConfirmedType,
          periodStart:       periodStart ? new Date(periodStart) : null,
          periodEnd:         periodEnd   ? new Date(periodEnd)   : null,
        },
        update: {
          rowCount:      cached.rows.length,
          tableName,
          columnMapping: JSON.stringify(resolved),
          expiresAt,
          documentType:      documentType as never,
          dataIntent:        dataIntent as never,
          userConfirmedType,
          periodStart:       periodStart ? new Date(periodStart) : null,
          periodEnd:         periodEnd   ? new Date(periodEnd)   : null,
        },
      }),
      prisma.erpConnection.update({
        where: { id: connectionId },
        data: {
          status:               "ACTIVE",
          schemaCacheJson:      JSON.stringify(rawSchema),
          schemaCachedAt:       new Date(),
          entityDictionaryJson: JSON.stringify(entityLists),
        },
      }),
    ]),
    mappingsToSave.length > 0
      ? upsertOrgMappings(user.orgId, mappingsToSave)
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    ok:               true,
    tableName,
    rowCount:         cached.rows.length,
    canonicalColumns: validation.canonicalColumns,
    droppedColumns:   validation.droppedColumns,
    warnings:         validation.warnings,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { parseExcel, parseCsv, mapColumn, shouldSkipColumn, dropTempTable } from "@aiql/erp-connectors";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection || connection.erpType !== "FILE_UPLOAD") {
    return NextResponse.json({ error: "FILE_UPLOAD connection not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Drop old temp table
  if (connection.uploadedFile?.tableName) {
    await dropTempTable(connection.uploadedFile.tableName).catch(() => {});
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = ext === "csv" || ext === "tsv" ? parseCsv(buffer) : parseExcel(buffer);

  const sampleSize = Math.min(parsed.rows.length, 100);
  const detectedMappings = parsed.headers.map((header: string) => {
    const sampleValues = parsed.rows.slice(0, sampleSize).map((r: Record<string, unknown>) => r[header]);
    const skipResult = shouldSkipColumn(header, sampleValues);
    if (skipResult.skip) {
      return { originalName: header, canonicalName: null, confidence: 0,
        detectionMethod: "skipped" as const, skip: true, skipReason: skipResult.reason };
    }
    return { ...mapColumn(header, sampleValues), skip: false };
  });

  // Store new file data as PENDING
  await prisma.erpConnection.update({
    where: { id: params.id },
    data: {
      status: "PENDING",
      schemaCacheJson: JSON.stringify({
        _pending: true, fileName: file.name, mimeType: file.type,
        sizeBytes: file.size, rowCount: parsed.rowCount, rows: parsed.rows, headers: parsed.headers,
      }),
    },
  });

  return NextResponse.json({ connectionId: params.id, detectedMappings, preview: parsed.rows.slice(0, 5), rowCount: parsed.rowCount });
}

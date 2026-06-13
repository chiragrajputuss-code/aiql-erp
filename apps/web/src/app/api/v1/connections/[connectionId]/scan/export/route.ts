/**
 * POST /api/v1/connections/[connectionId]/scan/export?format=pdf|csv
 *
 * Accepts a scan result (passed in the request body) and returns it as a
 * downloadable PDF or CSV. The scan itself is NOT re-run — we take whatever
 * the client just rendered. This avoids double work and ensures the export
 * matches exactly what the user saw on screen.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { scanResultToPdf, scanResultToCsv } from "@/lib/scan-export";
import type { ScanResult } from "@aiql/close-engine";

interface ExportBody {
  scan: {
    connectionId:  string;
    tableName:     string;
    startDate:     string;
    endDate:       string;
    scannedAt:     string;
    durationMs:    number;
    totalIssues:   number;
    bySeverity:    Record<"critical" | "review" | "info", number>;
    totalExposure: number;
    issues: Array<{
      code:         string;
      severity:     "critical" | "review" | "info";
      category:     string;
      title:        string;
      description:  string;
      affectedRows: number;
      exposure:     number | null;
      examples?:    Record<string, unknown>[];
    }>;
  };
}

function rehydrateScan(body: ExportBody["scan"]): ScanResult {
  // The client serialises Dates as ISO strings; pdfkit / our exporter expects Date objects.
  return {
    connectionId:  body.connectionId,
    tableName:     body.tableName,
    startDate:     new Date(body.startDate),
    endDate:       new Date(body.endDate),
    scannedAt:     new Date(body.scannedAt),
    durationMs:    body.durationMs,
    totalIssues:   body.totalIssues,
    bySeverity:    body.bySeverity,
    totalExposure: body.totalExposure,
    issues:        body.issues.map((i) => ({
      code:         i.code,
      severity:     i.severity,
      category:     i.category,
      title:        i.title,
      description:  i.description,
      affectedRows: i.affectedRows,
      exposure:     i.exposure,
      examples:     i.examples ?? [],
    })),
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { connectionId: string } },
): Promise<NextResponse | Response> {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Verify ownership of the connection
  const connection = await prisma.erpConnection.findFirst({
    where:  { id: params.connectionId, orgId: user.orgId },
    select: { displayName: true },
  });
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "csv") {
    return NextResponse.json({ error: "format must be pdf or csv" }, { status: 400 });
  }

  let body: ExportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.scan || !Array.isArray(body.scan.issues)) {
    return NextResponse.json({ error: "Body must include { scan: ScanResult }" }, { status: 400 });
  }

  const scan         = rehydrateScan(body.scan);
  const dateStamp    = new Date().toISOString().slice(0, 10);
  const safeName     = connection.displayName.replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 40);
  const baseFilename = `aiql_scan_${safeName}_${dateStamp}`;

  if (format === "csv") {
    const csv = scanResultToCsv(scan, connection.displayName);
    return new Response(csv, {
      status:  200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
      },
    });
  }

  try {
    const pdf = await scanResultToPdf(scan, connection.displayName);
    // Wrap in a Blob — runtime works fine with Node Buffer but TS types collide
    // (ArrayBufferLike vs ArrayBuffer in @types/node 22+). Cast suppresses the noise.
    const blob = new Blob([pdf as unknown as BlobPart], { type: "application/pdf" });
    return new Response(blob, {
      status:  200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${baseFilename}.pdf"`,
        "Content-Length":      String(pdf.length),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[scan/export] PDF generation failed:", err);
    return NextResponse.json(
      { error: `PDF generation failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

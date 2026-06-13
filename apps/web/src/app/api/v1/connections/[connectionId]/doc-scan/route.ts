import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import {
  parseForm26Q, scanForm26Q,
  parseGstr1, scanGstr1,
  parseGstr3B,
  parseItr,
} from "@aiql/doc-parsers";
import type { DocScanResult } from "@aiql/doc-parsers";

type Ctx = { params: { connectionId: string } };

// POST /api/v1/connections/:id/doc-scan
// Body (optional): { documentId?: string } — if omitted, scans the primary UploadedFile
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { connectionId } = ctx.params;

    const connection = await prisma.erpConnection.findFirst({
      where: { id: connectionId, orgId: user.orgId },
      include: { uploadedFile: true },
    });
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    let body: { documentId?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    let tableName: string;
    let documentType: string;
    let docConnectionId = connectionId;

    if (body.documentId) {
      // WorkspaceDocument path (Phase 2+ supplemental docs)
      const doc = await prisma.workspaceDocument.findFirst({
        where: { id: body.documentId, connectionId },
      });
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
      tableName = doc.tableName;
      documentType = doc.documentType;
    } else {
      // Primary UploadedFile path
      const file = connection.uploadedFile;
      if (!file) return NextResponse.json({ error: "No uploaded file found" }, { status: 404 });
      if (file.documentType === "GL") {
        return NextResponse.json(
          { error: "Use /scan for GL files, not /doc-scan" },
          { status: 400 }
        );
      }
      tableName = file.tableName;
      documentType = file.documentType;
    }

    // Fetch rows from the dynamic table
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${tableName}" ORDER BY ctid LIMIT 50000`
    );

    const t0 = Date.now();
    let result: DocScanResult | null = null;

    if (documentType === "FORM_26Q") {
      const parsed = parseForm26Q(rows);
      result = scanForm26Q(parsed, docConnectionId);
    } else if (documentType === "GSTR_1") {
      const parsed = parseGstr1(rows);
      result = scanGstr1(parsed, docConnectionId);
    } else if (documentType === "GSTR_3B") {
      const parsed = parseGstr3B(rows);
      if (!parsed) {
        return NextResponse.json(
          { error: "Could not parse GSTR-3B — check column format" },
          { status: 422 }
        );
      }
      // GSTR-3B is a summary return — no row-level scan issues, return summary
      result = {
        documentType: "GSTR_3B",
        connectionId: docConnectionId,
        scannedAt: new Date(),
        durationMs: Date.now() - t0,
        totalIssues: 0,
        bySeverity: { critical: 0, review: 0, info: 0 },
        totalExposure: 0,
        issues: [],
        summary: parsed,
      } as DocScanResult & { summary: typeof parsed };
    } else if (documentType === "ITR") {
      const parsed = parseItr(rows);
      if (!parsed) {
        return NextResponse.json(
          { error: "Could not parse ITR — check column format" },
          { status: 422 }
        );
      }
      result = {
        documentType: "ITR",
        connectionId: docConnectionId,
        scannedAt: new Date(),
        durationMs: Date.now() - t0,
        totalIssues: 0,
        bySeverity: { critical: 0, review: 0, info: 0 },
        totalExposure: 0,
        issues: [],
        summary: parsed,
      } as DocScanResult & { summary: typeof parsed };
    } else {
      return NextResponse.json(
        { error: `No scanner for document type: ${documentType}` },
        { status: 400 }
      );
    }

    const safe = JSON.parse(
      JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    );

    return NextResponse.json(safe);
  } catch (err) {
    console.error("[doc-scan POST]", err);
    return NextResponse.json(
      { error: "Scan failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

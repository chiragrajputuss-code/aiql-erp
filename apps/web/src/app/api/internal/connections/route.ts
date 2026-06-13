import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma, getOrgMappings } from "@aiql/db";
import { parseExcel, parseCsv, mapColumn, shouldSkipColumn } from "@aiql/erp-connectors";
import { detectDocumentType, extractPeriod } from "@aiql/document-types";
import { z } from "zod";

// ─── GET — list all connections for org ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connections = await prisma.erpConnection.findMany({
    where: { orgId: user.orgId },
    include: { uploadedFile: true },
    orderBy: { createdAt: "desc" },
  });

  // Enrich each FILE_UPLOAD connection with the actual GL date range so the
  // close wizard and connection detail page can show the data period and
  // auto-populate start/end dates correctly.
  const enriched = await Promise.all(
    connections.map(async (c) => {
      const tableName = c.uploadedFile?.tableName;
      if (!tableName) return { ...c, glMinDate: null as string | null, glMaxDate: null as string | null };
      try {
        const rows = await prisma.$queryRawUnsafe<{ min_d: Date | null; max_d: Date | null }[]>(
          `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${tableName}"`,
        );
        return {
          ...c,
          glMinDate: rows[0]?.min_d ? new Date(rows[0].min_d).toISOString().slice(0, 10) : null,
          glMaxDate: rows[0]?.max_d ? new Date(rows[0].max_d).toISOString().slice(0, 10) : null,
        };
      } catch {
        return { ...c, glMinDate: null as string | null, glMaxDate: null as string | null };
      }
    }),
  );

  return NextResponse.json(enriched);
}

// ─── POST — create connection (ERP or file upload) ───────────────────────────

const erpSchema = z.object({
  erpType:     z.enum(["TALLY", "ZOHO_BOOKS", "QUICKBOOKS", "XERO", "SAP", "ORACLE", "CUSTOM"]),
  displayName: z.string().min(1),
  credentials: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const ct = req.headers.get("content-type") ?? "";

  // ── File upload path ───────────────────────────────────────────────────────
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const displayName = form.get("displayName") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 413 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = ext === "csv" || ext === "tsv"
        ? parseCsv(buffer)
        : parseExcel(buffer);
    } catch (e) {
      return NextResponse.json({ error: `File parse error: ${(e as Error).message}` }, { status: 422 });
    }

    // Load prior confirmed mappings for this org (empty object if none saved yet)
    const priorMappings = await getOrgMappings(user.orgId);

    // Auto-detect columns — prior org mappings take precedence over heuristics
    const sampleSize = Math.min(parsed.rows.length, 100);
    const detectedMappings = parsed.headers.map((header: string) => {
      const sampleValues = parsed.rows.slice(0, sampleSize).map((r: Record<string, unknown>) => r[header]);
      const skipResult   = shouldSkipColumn(header, sampleValues);
      if (skipResult.skip) {
        return { originalName: header, canonicalName: null, confidence: 0,
          detectionMethod: "skipped" as const, skip: true, skipReason: skipResult.reason };
      }
      // Org-saved mapping wins — user confirmed this before, show it pre-filled at full confidence
      if (priorMappings[header]) {
        return {
          originalName:    header,
          canonicalName:   priorMappings[header],
          confidence:      1.0,
          detectionMethod: "org_saved" as const,
          skip:            false,
        };
      }
      const mapping = mapColumn(header, sampleValues);
      return { ...mapping, skip: false };
    });

    // Create PENDING connection — table not yet created
    const connection = await prisma.erpConnection.create({
      data: {
        orgId:       user.orgId,
        erpType:     "FILE_UPLOAD",
        displayName: displayName ?? file.name,
        status:      "PENDING",
        credentialsArn: "",
        // Store raw file bytes + parse result temporarily in cache
        schemaCacheJson: JSON.stringify({
          _pending: true,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          rowCount:  parsed.rowCount,
          rows:      parsed.rows,     // stored temporarily until confirm
          headers:   parsed.headers,
        }),
      },
    });

    // Auto-detect document type from column headers (deterministic heuristics, no LLM)
    const detection = detectDocumentType(parsed.headers, file.name);

    // Extract period from filename + date column sample
    const dateSample: Record<string, string[]> = {};
    const dateLikeCols = parsed.headers.filter((h: string) =>
      /date|period|month|quarter/i.test(h)
    );
    for (const col of dateLikeCols.slice(0, 3)) {
      dateSample[col] = parsed.rows
        .slice(0, 200)
        .map((r: Record<string, unknown>) => String(r[col] ?? ""))
        .filter(Boolean);
    }
    const period = extractPeriod({ filename: file.name, columns: parsed.headers, dateSample });

    return NextResponse.json({
      connectionId:     connection.id,
      detectedMappings,
      preview:          parsed.rows.slice(0, 5),
      headers:          parsed.headers,
      rowCount:         parsed.rowCount,
      fileName:         file.name,
      detection,
      period,
    });
  }

  // ── ERP connection path ────────────────────────────────────────────────────
  const body = await req.json();
  const parsed = erpSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { erpType, displayName, credentials } = parsed.data;

  const connection = await prisma.erpConnection.create({
    data: {
      orgId: user.orgId,
      erpType,
      displayName,
      status: "PENDING",
      credentialsArn: (credentials as Record<string, string>).credentialsArn ?? "",
    },
  });

  return NextResponse.json(connection, { status: 201 });
}

// ─── DELETE — remove all connections ─────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  // Bulk delete handled per-connection via [id] route
  return NextResponse.json({ error: "Use DELETE /connections/:id" }, { status: 405 });
}

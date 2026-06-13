/**
 * Demo data loader — sets up 3 sample company connections for a brand-new user
 * so they can see what AIQL does without uploading real client data first.
 *
 * Mirrors the production confirm-upload pipeline exactly:
 *   parseCsv → mapColumn → resolveRedundancy → createTempTable
 *     → buildUploadSchema → getUploadEntityLists → seedDefaultPinnedQueries
 *
 * Idempotent — re-running for the same orgId replaces existing demo connections
 * rather than duplicating.
 */

import * as fs from "fs";
import * as path from "path";
import { prisma, seedDefaultPinnedQueries } from "@aiql/db";
import {
  parseCsv,
  mapColumn,
  resolveRedundancy,
  createTempTable,
  buildUploadSchema,
  getUploadEntityLists,
  type ColumnMappingResult,
  type ResolvedMapping,
} from "@aiql/erp-connectors";
import { classifyByName } from "@aiql/schema-intel";

// Curated subset — 3 different industries so the user sees variety.
// All paths resolved from the monorepo root.
const SAMPLE_FILES = [
  { file: "kumar_textiles.csv",     label: "Demo: Kumar Textiles (Textile manufacturer)" },
  { file: "sharma_electronics.csv", label: "Demo: Sharma Electronics (Electronics retail)" },
  { file: "techvista.csv",          label: "Demo: TechVista (IT services, Hindi headers)" },
];

const SAMPLE_DIR = path.resolve(process.cwd(), "../../test-data/companies");

const CONNECTION_PREFIX = "demo_";

export interface DemoLoadResult {
  loaded:        Array<{ connectionId: string; displayName: string; rowCount: number; columnsMapped: number }>;
  durationMs:    number;
}

export async function loadDemoForOrg(orgId: string): Promise<DemoLoadResult> {
  const t0 = Date.now();
  const loaded: DemoLoadResult["loaded"] = [];

  for (const { file, label } of SAMPLE_FILES) {
    const filePath = path.join(SAMPLE_DIR, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Demo file missing: ${filePath} — check repository layout`);
    }
    const buffer = fs.readFileSync(filePath);
    const parsed = parseCsv(buffer);

    // Map every header to a canonical name
    const mappings: ColumnMappingResult[] = parsed.headers.map((h) => {
      const sampleValues = parsed.rows.slice(0, 30).map((r) => r[h]);
      return mapColumn(h, sampleValues);
    });
    const resolved: ResolvedMapping[] = resolveRedundancy(mappings);

    // Deterministic connection / file IDs so re-running for the same org
    // replaces rather than duplicates.
    const safeFile     = file.replace(/[^a-z0-9]/gi, "_").slice(0, 30);
    const connectionId = `${CONNECTION_PREFIX}${orgId.slice(0, 20)}_${safeFile}`;
    const fileId       = `${CONNECTION_PREFIX}file_${orgId.slice(0, 20)}_${safeFile}`;

    // ── Upsert ErpConnection ──────────────────────────────────────────────────
    await prisma.erpConnection.upsert({
      where:  { id: connectionId },
      update: { status: "ACTIVE", displayName: label },
      create: {
        id:             connectionId,
        orgId,
        erpType:        "FILE_UPLOAD",
        displayName:    label,
        status:         "ACTIVE",
        credentialsArn: "",
      },
    });

    // ── Create / replace the upload table ────────────────────────────────────
    const tableName = await createTempTable(orgId, fileId, resolved, parsed.rows);

    // ── columnMapping JSON for the scanner ───────────────────────────────────
    const columnMappingJson = JSON.stringify(
      resolved
        .filter((m) => m.canonicalName && !m.dropped)
        .map((m) => ({ sourceColumnName: m.originalName, canonicalField: m.canonicalName })),
    );

    // ── Upsert UploadedFile ───────────────────────────────────────────────────
    await prisma.uploadedFile.upsert({
      where:  { connectionId },
      update: { tableName, rowCount: parsed.rowCount, columnMapping: columnMappingJson },
      create: {
        id:             fileId,
        connectionId,
        originalName:   file,
        mimeType:       "text/csv",
        sizeBytes:      buffer.length,
        rowCount:       parsed.rowCount,
        tableName,
        columnMapping:  columnMappingJson,
        expiresAt:      new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    // ── Build full schema (tables + account classifications) ─────────────────
    const rawSchema = buildUploadSchema(tableName, resolved, parsed.rowCount);
    const distinctAccounts = await prisma.$queryRawUnsafe<{ account_name: string }[]>(
      `SELECT DISTINCT account_name FROM "${tableName}" WHERE account_name IS NOT NULL AND account_name <> ''`,
    );
    const accountTypeMap: Record<string, string> = {};
    for (const { account_name } of distinctAccounts) {
      accountTypeMap[account_name] = classifyByName(account_name);
    }
    const schemaWithAccounts = { ...rawSchema, accountTypeMap };
    const entityLists = await getUploadEntityLists(tableName);

    await prisma.erpConnection.update({
      where: { id: connectionId },
      data: {
        schemaCacheJson:      JSON.stringify(schemaWithAccounts),
        schemaCachedAt:       new Date(),
        entityDictionaryJson: JSON.stringify(entityLists),
      },
    });

    // ── Seed pinned queries for the Cash Dashboard cards ─────────────────────
    await seedDefaultPinnedQueries(orgId, connectionId);

    loaded.push({
      connectionId,
      displayName:   label,
      rowCount:      parsed.rowCount,
      columnsMapped: resolved.filter((m) => m.canonicalName && !m.dropped).length,
    });
  }

  return { loaded, durationMs: Date.now() - t0 };
}

/**
 * Remove all demo connections (and their tables) for an org. Used by the
 * "remove demo data" affordance once the user has uploaded their real data.
 */
export async function unloadDemoForOrg(orgId: string): Promise<{ removed: number }> {
  const demos = await prisma.erpConnection.findMany({
    where:  { orgId, id: { startsWith: CONNECTION_PREFIX } },
    select: { id: true, uploadedFile: { select: { tableName: true } } },
  });

  for (const c of demos) {
    if (c.uploadedFile?.tableName) {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${c.uploadedFile.tableName}" CASCADE`);
    }
    await prisma.erpConnection.delete({ where: { id: c.id } }).catch(() => {});
  }
  return { removed: demos.length };
}

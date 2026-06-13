import { PrismaClient } from "@prisma/client";
import { CANONICAL_SCHEMA } from "./canonical-schema";
import type { ResolvedMapping } from "./redundancy-resolver";

const prisma = new PrismaClient();

const PG_TYPE_MAP: Record<string, string> = {
  text:        "TEXT",
  numeric:     "NUMERIC(20,4)",
  date:        "DATE",
  timestamptz: "TIMESTAMPTZ",
  boolean:     "BOOLEAN",
};

/** Sanitise org/file IDs to safe PostgreSQL identifier characters. */
function safeId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 40);
}

/** Build a deterministic table name for an upload. */
export function buildTableName(orgId: string, fileId: string): string {
  return `upload_${safeId(orgId)}_${safeId(fileId)}`;
}

/**
 * Create a PostgreSQL table from the confirmed column mapping and insert rows.
 * - Table name: upload_{orgId}_{fileId}
 * - Columns:    ONLY canonical names from CANONICAL_SCHEMA (never raw Excel headers)
 * - Indexes:    transaction_date and account_name for query performance
 */
export async function createTempTable(
  orgId: string,
  fileId: string,
  mappings:  ResolvedMapping[],
  rows:      Record<string, unknown>[]
): Promise<string> {
  const tableName = buildTableName(orgId, fileId);

  // Only active canonical columns
  const activeCols = mappings.filter((m) => !m.dropped && m.canonicalName);

  // ── CREATE TABLE ──────────────────────────────────────────────────────────
  const colDefs = activeCols
    .map((m) => {
      const def = CANONICAL_SCHEMA[m.canonicalName!];
      const pgType = def ? PG_TYPE_MAP[def.pgType] ?? "TEXT" : "TEXT";
      return `"${m.canonicalName}" ${pgType}`;
    })
    .join(",\n  ");

  await prisma.$executeRawUnsafe(
    `DROP TABLE IF EXISTS "${tableName}"`
  );
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${tableName}" (\n  ${colDefs}\n)`
  );

  // ── INSERT rows in batches ────────────────────────────────────────────────
  const canonicalNames = activeCols.map((m) => m.canonicalName as string);
  const BATCH = 500; // 500 rows × ~8 cols = 4000 params, well under PG limit

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const row of batch) {
      const rowPlaceholders: string[] = [];
      for (const col of activeCols) {
        const val = row[col.originalName] ?? null;
        const def = CANONICAL_SCHEMA[col.canonicalName!];
        // PostgreSQL parameterized queries need explicit casts for non-text types
        const cast = def?.pgType === "date"    ? "::date"
                   : def?.pgType === "numeric" ? "::numeric"
                   : "";
        rowPlaceholders.push(`$${paramIdx++}${cast}`);
        values.push(normaliseValue(val, col.canonicalName!));
      }
      placeholders.push(`(${rowPlaceholders.join(",")})`);
    }

    const colList = canonicalNames.map((c) => `"${c}"`).join(",");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(",")}`,
      ...values
    );
  }

  // ── Indexes ───────────────────────────────────────────────────────────────
  if (canonicalNames.includes("transaction_date")) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${tableName}_date_idx" ON "${tableName}" ("transaction_date")`
    );
  }
  if (canonicalNames.includes("account_name")) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${tableName}_acct_idx" ON "${tableName}" ("account_name")`
    );
  }

  return tableName;
}

export async function dropTempTable(tableName: string): Promise<void> {
  const safe = `upload_${tableName.replace(/[^a-z0-9_]/gi, "")}`.slice(0, 63);
  // Only drop tables with our prefix to be safe
  if (!tableName.startsWith("upload_")) return;
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}"`);
}

export async function listOrgTables(orgId: string): Promise<string[]> {
  const prefix = `upload_${safeId(orgId)}_`;
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE $1`,
    `${prefix}%`
  );
  return rows.map((r) => r.tablename);
}

// ─── Value normalisation ──────────────────────────────────────────────────────

function normaliseValue(raw: unknown, canonicalName: string): unknown {
  if (raw === null || raw === undefined || raw === "") return null;
  const def = CANONICAL_SCHEMA[canonicalName];
  if (!def) return String(raw);

  if (def.pgType === "numeric") {
    const cleaned = String(raw).replace(/[₹$€£,\s]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  if (def.pgType === "date") {
    if (raw instanceof Date) return raw.toISOString().split("T")[0];
    // Try parse dd/mm/yyyy
    const s = String(raw).trim();
    const dm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dm) {
      const [, d, m, y] = dm;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return s || null;
  }

  return String(raw);
}

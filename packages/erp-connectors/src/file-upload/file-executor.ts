import { PrismaClient } from "@prisma/client";
import type { QueryResult } from "../types";

const prisma = new PrismaClient();

const WRITE_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i,
];

/**
 * Execute a read-only SQL SELECT against an uploaded data temp table.
 * The table name must start with "upload_" for safety.
 */
export async function executeUploadQuery(
  tableName: string,
  query: string
): Promise<QueryResult> {
  if (!tableName.startsWith("upload_")) {
    throw new Error("executeUploadQuery: invalid table name");
  }
  for (const re of WRITE_PATTERNS) {
    if (re.test(query)) throw new Error("Write operations are not permitted");
  }

  const t0 = Date.now();

  // Replace placeholder {{table}} with actual sanitised table name
  const sql = query.includes("{{table}}")
    ? query.replace(/\{\{table\}\}/g, `"${tableName}"`)
    : query;

  let rawRows: Record<string, unknown>[];
  try {
    rawRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
  } catch (err) {
    // Surface the failing SQL into the error so the query studio UI / logs
    // show exactly what was sent (vs. a generic Prisma stack trace).
    // eslint-disable-next-line no-console
    console.error("[executeUploadQuery] SQL failed:\n" + sql + "\n--- Error ---\n" + (err as Error).message);
    const e = new Error(`Query failed: ${(err as Error).message}\n--- Failing SQL ---\n${sql}`);
    (e as Error & { sql?: string }).sql = sql;
    throw e;
  }

  // Prisma $queryRawUnsafe returns PostgreSQL bigint (COUNT, etc.) as JS BigInt,
  // which JSON.stringify cannot serialize. Convert every BigInt to number.
  const rows = rawRows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out;
  });

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs: Date.now() - t0,
  };
}

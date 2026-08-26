import { PrismaClient } from "@prisma/client";
import type { QueryResult } from "../types";

const prisma = new PrismaClient();

const WRITE_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i,
];

/** Hard caps so a pathological generated query cannot hang or flood the app. */
export const QUERY_TIMEOUT_MS = 15_000;
export const QUERY_MAX_ROWS   = 5_000;

/**
 * Every table the SQL reads from, taken from FROM / JOIN clauses.
 * Quoted and unquoted identifiers both handled; subqueries (which open with
 * a parenthesis) are skipped because their own FROM clauses are matched too.
 */
function referencedTables(sql: string): string[] {
  const out: string[] = [];
  const re = /\b(?:FROM|JOIN)\s+(?!\()\s*("?)([A-Za-z_][A-Za-z0-9_$]*)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push(m[2]);
  return out;
}

/** CTE names declared by `WITH x AS (…)`, `, y AS (…)` — legal FROM targets. */
function cteNames(sql: string): Set<string> {
  const names = new Set<string>();
  const re = /(?:\bWITH\s+|,\s*)("?)([A-Za-z_][A-Za-z0-9_$]*)\1\s+AS\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) names.add(m[2].toLowerCase());
  return names;
}

/**
 * Execute a read-only SQL SELECT against an uploaded data temp table.
 *
 * Defence in depth — the SQL may be LLM-generated, so we never trust it:
 *   1. table name must be an upload_ table;
 *   2. no write keywords anywhere in the statement;
 *   3. TENANT ISOLATION — every table the SQL reads must be *this* upload
 *      table (or a CTE it declared). Without this, a hallucinated or
 *      injected table name could read another organisation's upload table,
 *      since Prisma runs with full DB privileges;
 *   4. statement timeout + row cap so a cartesian join cannot hang the app.
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

  // ── Tenant isolation: the query may only touch its own upload table ───────
  const allowed = new Set<string>([tableName.toLowerCase(), ...cteNames(sql)]);
  for (const t of referencedTables(sql)) {
    if (!allowed.has(t.toLowerCase())) {
      throw new Error(
        `Query references a table it is not allowed to read: ${t}. ` +
        `Only this connection's own uploaded data can be queried.`
      );
    }
  }

  let rawRows: Record<string, unknown>[];
  try {
    // SET LOCAL applies for the life of this transaction only.
    const [, result] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`),
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql),
    ]);
    rawRows = result as unknown as Record<string, unknown>[];
    if (rawRows.length > QUERY_MAX_ROWS) rawRows = rawRows.slice(0, QUERY_MAX_ROWS);
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

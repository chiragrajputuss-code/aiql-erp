import type { QueryResult } from "../types";
import type { TallyConnector } from "./auth";

// Tally uses EXPORTDATA for reads and IMPORTDATA for writes.
// We also block any SQL-like write keywords defensively.
const WRITE_PATTERNS = [
  /\bIMPORTDATA\b/i,
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i,
];

function assertReadOnly(query: string): void {
  for (const re of WRITE_PATTERNS) {
    if (re.test(query)) {
      throw new Error(
        "Write operations (IMPORTDATA / INSERT / UPDATE / DELETE) are not permitted on ERP connections"
      );
    }
  }
}

function isRawXml(query: string): boolean {
  return query.trim().startsWith("<");
}

/**
 * Execute a read-only query against Tally and return tabular results.
 *
 * `query` can be:
 *  - A Tally report name:  "Trial Balance", "List of Ledgers", etc.
 *  - A full TDL XML string starting with `<ENVELOPE>…</ENVELOPE>`
 *
 * IMPORTDATA (write) operations and SQL write keywords are rejected.
 */
export async function executeTallyQuery(
  connector: TallyConnector,
  query: string
): Promise<QueryResult> {
  assertReadOnly(query);

  const t0 = Date.now();
  let parsed: Record<string, unknown>;

  if (isRawXml(query)) {
    parsed = await connector.sendRawRequest(query);
  } else {
    parsed = await connector.sendRequest(query);
  }

  // ── Extract rows from COLLECTION ─────────────────────────────────────────
  const envelope   = (parsed as { ENVELOPE?: Record<string, unknown> }).ENVELOPE ?? {};
  const body       = (envelope.BODY       as Record<string, unknown>) ?? {};
  const data       = (body.DATA           as Record<string, unknown>) ?? {};
  const collection = (data.COLLECTION     as Record<string, unknown>) ?? {};

  const rows: Record<string, unknown>[] = [];

  for (const val of Object.values(collection)) {
    if (!val) continue;
    const arr = Array.isArray(val) ? val : [val];
    rows.push(...(arr as Record<string, unknown>[]));
    break; // only the first collection key
  }

  // Flatten XML attribute names (@_NAME → NAME) for clean column names
  const cleanRows = rows.map((row) => {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const key = k.startsWith("@_") ? k.slice(2) : k;
      clean[key] = v;
    }
    return clean;
  });

  const columns = cleanRows.length > 0 ? Object.keys(cleanRows[0]) : [];

  return {
    columns,
    rows:            cleanRows,
    rowCount:        cleanRows.length,
    executionTimeMs: Date.now() - t0,
  };
}

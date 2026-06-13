import { prisma } from "@aiql/db";
import { classifyByName } from "@aiql/schema-intel";

// SQL templates use short canonical names; column mapper produces longer ones.
const CANONICAL_ALIASES: Record<string, string> = {
  date:           "transaction_date",
  voucher_date:   "transaction_date",
  voucher_no:     "reference_number",
  voucher_number: "reference_number",
  net_amt:        "net_amount",
  amount:         "net_amount",
};

interface StoredMapping { sourceColumnName: string; canonicalField: string; }

/**
 * Build canonical-name aliases for a connection's UploadedFile.
 *
 * IMPORTANT: Upload tables are created with CANONICAL column names by
 * `createTempTable` (account_name, debit_amount, transaction_date, etc.).
 * Therefore SQL queries using canonical names work directly — NO source-header
 * translation is needed.
 *
 * This function only handles short-name aliases used inside our SQL templates
 * (e.g. `date` → `transaction_date`) so SQL can use either form.
 */
export async function buildColMap(connectionId: string): Promise<Map<string, string>> {
  const file = await prisma.uploadedFile.findUnique({ where: { connectionId } });
  if (!file?.columnMapping) return new Map();

  // Determine which canonical names ARE present in this upload's table.
  const mappings = JSON.parse(file.columnMapping) as StoredMapping[];
  const presentCanonicals = new Set(mappings.map((m) => m.canonicalField).filter(Boolean));

  // Map short-name aliases → canonical (only if canonical is present).
  // Output is canonical → canonical (no translation), so applyColMap is a no-op
  // for queries that already use canonical names. Aliases get rewritten to canonical.
  const map = new Map<string, string>();
  for (const [alias, canonical] of Object.entries(CANONICAL_ALIASES)) {
    if (presentCanonicals.has(canonical)) {
      map.set(alias, canonical);  // ← was: m.sourceColumnName (BUG)
    }
  }
  return map;
}

/**
 * Rewrite alias names in SQL to their canonical form (e.g. `date` → `transaction_date`).
 * No identifier quoting needed since canonical names are valid plain identifiers.
 *
 * Lookbehind `(?<!::)` prevents matching inside PostgreSQL type casts like
 * `'2025-01-01'::date` — without it, the `date` alias would corrupt the cast
 * to `'2025-01-01'::transaction_date`, which is not a valid type.
 */
export function applyColMap(sql: string, colMap: Map<string, string>): string {
  let result = sql;
  for (const [alias, canonical] of colMap) {
    if (alias === canonical) continue; // no-op
    // (?<!::) — don't match after `::` (type cast)
    // (?<![\w.])  — don't match when prefixed by word char or dot (alias qualifier)
    // \b${alias}\b — word-boundary on both sides
    result = result.replace(
      new RegExp(`(?<!::)(?<![\\w.])${alias}\\b`, "g"),
      canonical,
    );
  }
  // Defensively neutralise IS NOT NULL guards on optional columns
  // (vendor_name / customer_name might be null for non-party entries)
  result = result.replace(/\bvendor_name\s+IS\s+NOT\s+NULL\s+AND\s+vendor_name\s+<>\s+''\s*/gi, "TRUE ");
  result = result.replace(/\bcustomer_name\s+IS\s+NOT\s+NULL\s+AND\s+customer_name\s+<>\s+''\s*/gi, "TRUE ");
  return result;
}

/**
 * Check which columns actually exist in the upload table.
 * Used to make scanner/recon SQL defensive about optional columns
 * (vendor_name, customer_name, reference_number, etc.).
 */
export async function getTableColumns(tableName: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${tableName.replace(/'/g, "''")}'`
  );
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Strip references to columns that don't exist in the table by replacing them
 * with safe defaults. e.g. if vendor_name doesn't exist, references become NULL.
 *
 * Edge cases handled:
 *   - `a.vendor_name` (alias-prefixed) — lookbehind `(?<![.\w])` skips this
 *     because replacing it would produce `a.NULL`, which is invalid SQL
 *   - `GROUP BY vendor_name` — when the column is missing and gets replaced
 *     with NULL, the resulting `GROUP BY NULL` is rejected by PostgreSQL
 *     ("non-integer constant in GROUP BY"). We rewrite it to `GROUP BY 1`
 *     (group everything into one row) so the query at least returns something
 *     evaluable. The check downstream can decide whether the result is useful.
 */
export function makeSqlDefensive(sql: string, presentColumns: Set<string>): string {
  let result = sql;
  const optionalCols = ["vendor_name", "customer_name", "party_name", "reference_number", "voucher_type", "description", "account_code"];

  for (const col of optionalCols) {
    if (!presentColumns.has(col)) {
      // (?<![.\w]) — don't match after `.` (alias-prefix) or word char (would not be a real match)
      // (?![\w']) — don't match before word char or quote (avoid partial-name and string-literal hits)
      result = result.replace(new RegExp(`(?<![.\\w])${col}\\b(?![\\w'])`, "g"), "NULL");
    }
  }

  // GROUP BY NULL is invalid in PostgreSQL. Rewrite to GROUP BY 1 (single group).
  // Match GROUP BY NULL with optional trailing comma-separated NULLs.
  result = result.replace(/\bGROUP\s+BY\s+NULL(\s*,\s*NULL)*\b/gi, "GROUP BY 1");

  return result;
}

/** Get the actual table name for a connection's GL upload. */
export async function getTableName(connectionId: string): Promise<string | null> {
  const file = await prisma.uploadedFile.findUnique({
    where:  { connectionId },
    select: { tableName: true },
  });
  return file?.tableName ?? null;
}

/** Load merged accountTypeMap (auto-classified + confirmed mappings). */
export async function loadAccountTypeMap(connectionId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const conn = await prisma.erpConnection.findUnique({
    where:  { id: connectionId },
    select: { schemaCacheJson: true },
  });
  if (conn?.schemaCacheJson) {
    try {
      const parsed = JSON.parse(conn.schemaCacheJson) as { accountTypeMap?: Record<string, string> };
      for (const [name, type] of Object.entries(parsed.accountTypeMap ?? {})) {
        map.set(name, type);
      }
    } catch { /* ignore */ }
  }

  // Fill UNKNOWNs (or missing entries) using name-based pattern classifier
  const knownEntries = Array.from(map.entries());
  for (const [name, type] of knownEntries) {
    if (type === "UNKNOWN") {
      const inferred = classifyByName(name);
      if (inferred !== "UNKNOWN") map.set(name, inferred);
    }
  }

  // Confirmed mappings override everything
  const saved = await prisma.orgAccountMapping.findMany({
    where: { connectionId, isConfirmed: true },
  });
  for (const m of saved) map.set(m.accountName, m.accountType);

  return map;
}

export function accountsByType(typeMap: Map<string, string>): {
  bank:       string[];
  payable:    string[];
  receivable: string[];
  tax:        string[];
  inventory:  string[];
} {
  const result = { bank: [] as string[], payable: [] as string[], receivable: [] as string[], tax: [] as string[], inventory: [] as string[] };
  for (const [name, type] of typeMap) {
    if (type === "BANK" || type === "CASH")             result.bank.push(name);
    else if (type === "PAYABLE" || type === "CURRENT_LIABILITY") result.payable.push(name);
    else if (type === "RECEIVABLE")                     result.receivable.push(name);
    else if (type === "TAX")                            result.tax.push(name);
    else if (type === "INVENTORY")                      result.inventory.push(name);
  }
  return result;
}

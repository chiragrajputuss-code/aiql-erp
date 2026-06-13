import type { RawSchemaData }    from "@aiql/erp-connectors";
import type { ERPKnowledge }     from "./erp-knowledge/types";
import type { SchemaRelationship } from "./types";

// ─── Implicit relationship rules per ERP type ─────────────────────────────────

// Tally-specific implicit relationships not expressed as FK columns
const TALLY_IMPLICIT: SchemaRelationship[] = [
  {
    fromTable: "cost_centres", fromColumn: "parent",
    toTable:   "cost_centres", toColumn:   "name",
    type: "many-to-one", implicit: true, label: "Cost centre hierarchy",
  },
  {
    fromTable: "godowns", fromColumn: "parent",
    toTable:   "godowns", toColumn:   "name",
    type: "many-to-one", implicit: true, label: "Godown hierarchy",
  },
  {
    fromTable: "groups", fromColumn: "parent",
    toTable:   "groups", toColumn:   "name",
    type: "many-to-one", implicit: true, label: "Group hierarchy",
  },
];

const ZOHO_IMPLICIT: SchemaRelationship[] = [
  // Zoho uses explicit FKs in schema so no implicit ones needed currently
];

const IMPLICIT_BY_ERP: Record<string, SchemaRelationship[]> = {
  TALLY:      TALLY_IMPLICIT,
  ZOHO_BOOKS: ZOHO_IMPLICIT,
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Discover all relationships in the raw schema:
 *  1. Explicit foreign keys from column.references
 *  2. Implicit ERP-knowledge relationships (hierarchies, voucher-ledger links)
 *
 * Deduplicates by fromTable+fromColumn pair.
 */
export function discoverRelationships(
  rawSchema: RawSchemaData,
  erpKnowledge: ERPKnowledge
): SchemaRelationship[] {
  const seen = new Set<string>();
  const results: SchemaRelationship[] = [];

  function add(rel: SchemaRelationship) {
    const key = `${rel.fromTable}.${rel.fromColumn}→${rel.toTable}.${rel.toColumn}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(rel);
  }

  // ── 1. Explicit FK relationships from RawColumn.references ───────────────
  for (const table of rawSchema.tables) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.references) {
        add({
          fromTable:  table.name,
          fromColumn: col.name,
          toTable:    col.references.table,
          toColumn:   col.references.column,
          type:       "many-to-one",
          implicit:   false,
        });
      }
    }
  }

  // ── 2. Implicit ERP-knowledge relationships ───────────────────────────────
  const implicit = IMPLICIT_BY_ERP[rawSchema.erpType] ?? [];

  // Only add if both tables actually exist in the schema
  const tableNames = new Set(rawSchema.tables.map((t) => t.name));
  for (const rel of implicit) {
    if (tableNames.has(rel.fromTable) && tableNames.has(rel.toTable)) {
      add(rel);
    }
  }

  return results;
}

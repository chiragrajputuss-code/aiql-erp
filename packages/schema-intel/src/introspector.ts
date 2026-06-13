import type { ERPConnector }        from "@aiql/erp-connectors";
import type { RawSchemaData, RawTable, RawColumn } from "@aiql/erp-connectors";
import type { ERPKnowledge, AccountType }          from "./erp-knowledge/types";
import type { ERPSchema, SchemaTable, SchemaColumn, SchemaRelationship } from "./types";
import { classifyAccounts }    from "./account-classifier";
import { discoverRelationships } from "./relationship-mapper";
import { detectCurrencyConfig }  from "./currency-handler";

// ─── Column enrichment ────────────────────────────────────────────────────────

const AMOUNT_HINTS = /balance|amount|total|price|cost|revenue|expense|payment|outstanding|debit|credit|value/i;
const DATE_HINTS   = /date|time|at$|_on$/i;
const NAME_HINTS   = /name|description|title|label|narration|remarks/i;
const ID_HINTS     = /^(id|.*_id)$/i;

function enrichColumn(raw: RawColumn, tableAccountType?: AccountType): SchemaColumn {
  const n = raw.name.toLowerCase();
  return {
    name:        raw.name,
    displayName: raw.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    dataType:    raw.dataType === "currency" ? "currency" : ID_HINTS.test(n) ? "id" : raw.dataType,
    nullable:    raw.nullable,
    isPrimaryKey: raw.isPrimaryKey ?? false,
    isForeignKey: raw.isForeignKey ?? false,
    references:  raw.references,
    accountType: tableAccountType,
    isAmount:    raw.dataType === "currency" || AMOUNT_HINTS.test(n),
    isDate:      raw.dataType === "date"    || DATE_HINTS.test(n),
    isName:      NAME_HINTS.test(n),
    description: raw.description,
  };
}

function enrichTable(raw: RawTable, accountTypes?: AccountType[]): SchemaTable {
  const cols = raw.columns.map((c) => enrichColumn(c));
  return {
    name:        raw.name,
    displayName: raw.displayName,
    columns:     cols,
    category:    raw.category,
    accountTypes,
  };
}

// ─── Main introspector ────────────────────────────────────────────────────────

/**
 * Three-layer schema enrichment:
 *  1. Raw schema from connector (tables, columns, FKs)
 *  2. ERP knowledge layer (account classification, implicit relationships)
 *  3. Customer-specific overrides (from ErpConnection.schemaCacheJson)
 */
export async function introspectSchema(
  connector: ERPConnector,
  erpKnowledge: ERPKnowledge,
  customerOverrides?: Record<string, unknown>
): Promise<ERPSchema> {
  // ── Layer 1: Raw schema from connector ────────────────────────────────────
  const raw = await connector.introspectSchema();

  // ── Layer 2: ERP knowledge enrichment ────────────────────────────────────

  // 2a. Build account type map from ledger/account tables
  const accountTypeMap: Record<string, AccountType> = {};
  for (const table of raw.tables) {
    if (table.category === "ledger" || table.category === "account") {
      const rows = table.sampleData ?? [];
      const accounts = rows
        .filter((r) => r.name && r.parent)
        .map((r) => ({ name: r.name as string, group: r.parent as string }));
      const classified = classifyAccounts(accounts, erpKnowledge);
      Object.assign(accountTypeMap, classified);
    }
  }

  // 2b. Enrich tables
  const tables: SchemaTable[] = raw.tables.map((t) => {
    const types = t.sampleData
      ?.map((r) => accountTypeMap[r.name as string])
      .filter((v): v is AccountType => !!v);
    const uniqueTypes = types ? [...new Set(types)] : undefined;
    return enrichTable(t, uniqueTypes);
  });

  // 2c. Discover relationships
  const relationships: SchemaRelationship[] = discoverRelationships(raw, erpKnowledge);

  // 2d. Detect dimensions from ERP knowledge
  const dimensions: string[] = [];
  if (erpKnowledge.dimensions.costCentreDimension) {
    dimensions.push(erpKnowledge.dimensions.costCentreDimension);
  }
  // Add any table names that look like dimension tables
  for (const t of tables) {
    if (["cost-centre", "godown", "project", "department"].includes(t.category ?? "")) {
      dimensions.push(t.name);
    }
  }

  // 2e. Currency config
  const currency = detectCurrencyConfig(raw);

  // ── Layer 3: Customer-specific overrides ──────────────────────────────────
  if (customerOverrides) {
    // Override account types for specific accounts (e.g. customer re-classified an account)
    const customAccountTypes = customerOverrides.accountTypes as Record<string, AccountType> | undefined;
    if (customAccountTypes) Object.assign(accountTypeMap, customAccountTypes);

    // Override currency
    if (customerOverrides.currency) currency.baseCurrency = customerOverrides.currency as string;
  }

  return {
    erpType:       raw.erpType,
    tables,
    relationships,
    accountTypeMap,
    dimensions,
    currency,
    metadata:      { ...raw.metadata, ...(customerOverrides?.metadata as object ?? {}) },
    introspectedAt: new Date(),
  };
}

import type { RawSchemaData, RawTable, RawRelationship } from "../types";
import type { TallyConnector } from "./auth";
import { extractCollection } from "./utils";

// ─── Tally XML entity shapes ──────────────────────────────────────────────────

interface TallyLedger {
  "@_NAME"?: string;
  NAME?: string;
  PARENT?: string;
  OPENINGBALANCE?: string;
  ISBILLWISEON?: string;
  ISCOSTCENTRESON?: string;
}

interface TallyGroup {
  "@_NAME"?: string;
  NAME?: string;
  PARENT?: string;
  ISSUBLEDGER?: string;
  AFFECTSSTOCK?: string;
}

interface TallyVoucherType {
  "@_NAME"?: string;
  NAME?: string;
  PARENT?: string;
  NUMBERINGMETHOD?: string;
}

interface TallyCostCentre {
  "@_NAME"?: string;
  NAME?: string;
  PARENT?: string;
}

interface TallyGodown {
  "@_NAME"?: string;
  NAME?: string;
  PARENT?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function getName(item: Record<string, unknown>): string {
  return ((item["@_NAME"] ?? item["NAME"]) as string | undefined) ?? "";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function introspectTallySchema(connector: TallyConnector): Promise<RawSchemaData> {
  // Run all queries concurrently
  const [ledgerRes, groupRes, voucherRes, ccRes, godownRes] = await Promise.all([
    connector.sendRequest("List of Ledgers"),
    connector.sendRequest("List of Groups"),
    connector.sendRequest("List of Voucher Types"),
    connector.sendRequest("List of Cost Centres"),
    connector.sendRequest("List of Godowns"),
  ]);

  const ledgers     = extractCollection<TallyLedger>(ledgerRes, "LEDGER");
  const groups      = extractCollection<TallyGroup>(groupRes, "GROUP");
  const vouchers    = extractCollection<TallyVoucherType>(voucherRes, "VOUCHERTYPE");
  const costCentres = extractCollection<TallyCostCentre>(ccRes, "COSTCENTRE");
  const godowns     = extractCollection<TallyGodown>(godownRes, "GODOWN");

  // ── Build normalised tables ────────────────────────────────────────────────

  const tables: RawTable[] = [
    {
      name: "ledgers",
      displayName: "Ledgers (Chart of Accounts)",
      category: "ledger",
      columns: [
        { name: "name",           dataType: "string",   nullable: false, isPrimaryKey: true  },
        { name: "parent",         dataType: "string",   nullable: true,  isForeignKey: true,
          references: { table: "groups", column: "name" } },
        { name: "openingBalance", dataType: "currency", nullable: true  },
        { name: "isBillWise",     dataType: "boolean",  nullable: true  },
        { name: "isCostCentres",  dataType: "boolean",  nullable: true  },
      ],
      sampleData: ledgers.slice(0, 5).map((l) => ({
        name:   getName(l as Record<string, unknown>),
        parent: l.PARENT ?? "",
      })),
    },
    {
      name: "groups",
      displayName: "Groups (Account Categories)",
      category: "group",
      columns: [
        { name: "name",         dataType: "string",  nullable: false, isPrimaryKey: true },
        { name: "parent",       dataType: "string",  nullable: true  },
        { name: "isSubledger",  dataType: "boolean", nullable: true  },
        { name: "affectsStock", dataType: "boolean", nullable: true  },
      ],
      sampleData: groups.slice(0, 5).map((g) => ({
        name:   getName(g as Record<string, unknown>),
        parent: g.PARENT ?? "",
      })),
    },
    {
      name: "voucher_types",
      displayName: "Voucher Types (Transaction Types)",
      category: "voucher",
      columns: [
        { name: "name",             dataType: "string", nullable: false, isPrimaryKey: true },
        { name: "parent",           dataType: "string", nullable: true  },
        { name: "numberingMethod",  dataType: "string", nullable: true  },
      ],
      sampleData: vouchers.slice(0, 5).map((v) => ({
        name:   getName(v as Record<string, unknown>),
        parent: v.PARENT ?? "",
      })),
    },
    {
      name: "cost_centres",
      displayName: "Cost Centres (Departments)",
      category: "cost-centre",
      columns: [
        { name: "name",   dataType: "string", nullable: false, isPrimaryKey: true },
        { name: "parent", dataType: "string", nullable: true  },
      ],
      sampleData: costCentres.slice(0, 5).map((c) => ({
        name:   getName(c as Record<string, unknown>),
        parent: c.PARENT ?? "",
      })),
    },
    {
      name: "godowns",
      displayName: "Godowns (Inventory Locations)",
      category: "godown",
      columns: [
        { name: "name",   dataType: "string", nullable: false, isPrimaryKey: true },
        { name: "parent", dataType: "string", nullable: true  },
      ],
      sampleData: godowns.slice(0, 5).map((g) => ({
        name:   getName(g as Record<string, unknown>),
        parent: g.PARENT ?? "",
      })),
    },
  ];

  const relationships: RawRelationship[] = [
    {
      fromTable: "ledgers", fromColumn: "parent",
      toTable:   "groups",  toColumn:   "name",
      type: "many-to-one",
    },
    {
      fromTable: "cost_centres", fromColumn: "parent",
      toTable:   "cost_centres", toColumn:   "name",
      type: "many-to-one",
    },
    {
      fromTable: "godowns", fromColumn: "parent",
      toTable:   "godowns", toColumn:   "name",
      type: "many-to-one",
    },
  ];

  return {
    erpType: "TALLY",
    tables,
    relationships,
    metadata: {
      currency:        "INR",
      fiscalYearStart: "04-01", // April 1 — standard Indian fiscal year
      ledgerCount:     ledgers.length,
      groupCount:      groups.length,
      voucherTypeCount: vouchers.length,
      costCentreCount: costCentres.length,
      godownCount:     godowns.length,
    },
  };
}

import type { RawSchemaData, RawTable, RawRelationship } from "../types";
import type { ZohoBooksConnector } from "./auth";

interface ZohoAccount {
  account_id:   string;
  account_name: string;
  account_type: string;
  account_code?: string;
  description?: string;
  is_active:   boolean;
}

interface ZohoAccountsResponse {
  chartofaccounts: ZohoAccount[];
}

export async function introspectZohoSchema(connector: ZohoBooksConnector): Promise<RawSchemaData> {
  const [accountsData] = await Promise.all([
    connector.get<ZohoAccountsResponse>("/chartofaccounts"),
  ]);

  const accounts = accountsData.chartofaccounts ?? [];

  // Build a summary of account types present
  const typeGroups: Record<string, string[]> = {};
  for (const acct of accounts) {
    const t = acct.account_type ?? "unknown";
    if (!typeGroups[t]) typeGroups[t] = [];
    typeGroups[t].push(acct.account_name);
  }

  const tables: RawTable[] = [
    {
      name:        "chart_of_accounts",
      displayName: "Chart of Accounts",
      category:    "account",
      columns: [
        { name: "account_id",   dataType: "string",  nullable: false, isPrimaryKey: true },
        { name: "account_name", dataType: "string",  nullable: false },
        { name: "account_type", dataType: "string",  nullable: false },
        { name: "account_code", dataType: "string",  nullable: true  },
        { name: "description",  dataType: "string",  nullable: true  },
        { name: "is_active",    dataType: "boolean", nullable: false },
      ],
      sampleData: accounts.slice(0, 5).map((a) => ({
        account_id:   a.account_id,
        account_name: a.account_name,
        account_type: a.account_type,
      })),
    },
    {
      name:        "contacts",
      displayName: "Contacts (Vendors & Customers)",
      category:    "contact",
      columns: [
        { name: "contact_id",   dataType: "string",  nullable: false, isPrimaryKey: true },
        { name: "contact_name", dataType: "string",  nullable: false },
        { name: "contact_type", dataType: "string",  nullable: false }, // "vendor" | "customer"
        { name: "email",        dataType: "string",  nullable: true  },
        { name: "phone",        dataType: "string",  nullable: true  },
        { name: "gstin",        dataType: "string",  nullable: true  }, // GST number (India)
        { name: "status",       dataType: "string",  nullable: false },
      ],
    },
    {
      name:        "invoices",
      displayName: "Sales Invoices",
      category:    "transaction",
      columns: [
        { name: "invoice_id",     dataType: "string",   nullable: false, isPrimaryKey: true },
        { name: "invoice_number", dataType: "string",   nullable: false },
        { name: "customer_id",    dataType: "string",   nullable: false, isForeignKey: true,
          references: { table: "contacts", column: "contact_id" } },
        { name: "date",           dataType: "date",     nullable: false },
        { name: "due_date",       dataType: "date",     nullable: true  },
        { name: "total",          dataType: "currency", nullable: false },
        { name: "balance",        dataType: "currency", nullable: false },
        { name: "status",         dataType: "string",   nullable: false },
      ],
    },
    {
      name:        "bills",
      displayName: "Vendor Bills",
      category:    "transaction",
      columns: [
        { name: "bill_id",     dataType: "string",   nullable: false, isPrimaryKey: true },
        { name: "bill_number", dataType: "string",   nullable: false },
        { name: "vendor_id",   dataType: "string",   nullable: false, isForeignKey: true,
          references: { table: "contacts", column: "contact_id" } },
        { name: "date",        dataType: "date",     nullable: false },
        { name: "due_date",    dataType: "date",     nullable: true  },
        { name: "total",       dataType: "currency", nullable: false },
        { name: "balance",     dataType: "currency", nullable: false },
        { name: "status",      dataType: "string",   nullable: false },
      ],
    },
  ];

  const relationships: RawRelationship[] = [
    { fromTable: "invoices", fromColumn: "customer_id", toTable: "contacts", toColumn: "contact_id", type: "many-to-one" },
    { fromTable: "bills",    fromColumn: "vendor_id",   toTable: "contacts", toColumn: "contact_id", type: "many-to-one" },
  ];

  return {
    erpType: "ZOHO_BOOKS",
    tables,
    relationships,
    metadata: {
      accountCount: accounts.length,
      accountTypes: Object.keys(typeGroups),
      currency:     "INR",
      gstEnabled:   true, // Zoho Books India always has GST
    },
  };
}

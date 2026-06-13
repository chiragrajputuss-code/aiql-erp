// ─── ERP Types ────────────────────────────────────────────────────────────────

export type ErpType =
  | "TALLY"
  | "ZOHO_BOOKS"
  | "QUICKBOOKS"
  | "XERO"
  | "SAP"
  | "ORACLE"
  | "FILE_UPLOAD"
  | "CUSTOM";

// ─── Credentials ──────────────────────────────────────────────────────────────

/** Raw credentials passed to createConnector() after being resolved from SSM. */
export interface ERPCredentials {
  // Tally Prime (cloud VPS)
  host?: string;
  port?: number;
  companyName?: string;

  // OAuth (Zoho Books, QuickBooks, Xero)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  clientId?: string;
  clientSecret?: string;
  organisationId?: string; // Zoho org id

  // API key based (custom)
  apiKey?: string;
  apiEndpoint?: string;
}

// ─── Schema types ──────────────────────────────────────────────────────────────

export interface RawColumn {
  name: string;
  dataType: "string" | "number" | "boolean" | "date" | "currency";
  nullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: { table: string; column: string };
  description?: string;
}

export interface RawTable {
  name: string;
  displayName: string;
  columns: RawColumn[];
  /** e.g. 'ledger' | 'group' | 'voucher' | 'cost-centre' | 'godown' */
  category?: string;
  /** Sample rows for schema-intel context */
  sampleData?: Record<string, unknown>[];
}

export interface RawRelationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: "many-to-one" | "one-to-many" | "many-to-many";
}

export interface RawSchemaData {
  erpType: ErpType;
  tables: RawTable[];
  relationships: RawRelationship[];
  metadata: {
    companyName?: string;
    version?: string;
    currency?: string;
    /** "04-01" for Indian fiscal year start (April) */
    fiscalYearStart?: string;
    [key: string]: unknown;
  };
}

// ─── Query result ──────────────────────────────────────────────────────────────

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs?: number;
}

// ─── Entity dictionary ────────────────────────────────────────────────────────

export interface EntityLists {
  vendors: string[];
  customers: string[];
  employees: string[];
}

// ─── Connector interface ──────────────────────────────────────────────────────

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  version?: string;
}

export interface ERPConnector {
  readonly erpType: ErpType;

  /** Verify the connection is reachable and credentials are valid. */
  testConnection(): Promise<TestConnectionResult>;

  /** Pull raw schema metadata from the ERP. */
  introspectSchema(): Promise<RawSchemaData>;

  /**
   * Execute a read-only query and return tabular results.
   * Implementations MUST reject queries containing write operations.
   */
  executeQuery(query: string): Promise<QueryResult>;

  /** Pull vendor, customer, and employee name lists for the tokeniser. */
  getEntityLists(): Promise<EntityLists>;
}

// ─── Pulse alert severity ─────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "review" | "info";

// ─── Alert categories ─────────────────────────────────────────────────────────

export type AlertCategory =
  | "tds_deadline"
  | "tds_calculator"
  | "gstr1_deadline"
  | "gstr3b_deadline"
  | "vendor_gst_filing"
  | "advance_tax"
  | "itr_deadline"
  | "unresolved_scan"
  | "snapshot"
  | "anomaly";

// ─── A single pulse alert ─────────────────────────────────────────────────────

export interface PulseAlertPayload {
  category:   AlertCategory;
  severity:   AlertSeverity;
  title:      string;
  detail?:    string;
  actionUrl?: string;
  /** Structured data for richer UI rendering */
  detailJson?: Record<string, unknown>;
}

// ─── Workspace context passed to pulse generators ────────────────────────────

export type DocumentTypeKey = "GL" | "TDS_RETURN_26Q" | "GSTR_1" | "GSTR_3B" | "ITR" | "OTHER";

export interface WorkspaceContext {
  connectionId:   string;
  connectionName: string;
  orgId:          string;
  /** Document types currently uploaded in this workspace */
  documentTypes:  DocumentTypeKey[];
  /** Operational = current fiscal year data; Historical = past period audit data */
  dataIntent:     "CURRENT_OPERATIONAL" | "HISTORICAL";
  /** ISO date of most recent GL entry (from uploaded data) */
  glMaxDate:      string | null;
  /** Dynamic table name for the primary GL upload */
  glTableName:    string | null;
  /** Snoozed alert categories for this workspace's subscription */
  snoozedCategories: string[];
}

// ─── Snapshot numbers ─────────────────────────────────────────────────────────

export interface FinancialSnapshot {
  cashAndBankBalance:  number | null;
  totalReceivables:    number | null;
  totalPayables:       number | null;
  glPeriodStart:       string | null;
  glPeriodEnd:         string | null;
  computedAt:          string;
}

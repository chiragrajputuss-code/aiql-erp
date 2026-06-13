// ─── Cross-document reconciliation types ─────────────────────────────────────

export type ReconSeverity = "critical" | "review" | "info";

export interface ReconGap {
  code:        string;           // Stable check ID e.g. "GL26Q-001"
  severity:    ReconSeverity;
  title:       string;
  description: string;
  glAmount:    number | null;    // Amount per GL (null if not in GL)
  docAmount:   number | null;    // Amount per Form 26Q / GSTR-1 (null if not in doc)
  variance:    number;           // |glAmount - docAmount|, or full amount if one side missing
  party:       string | null;    // Deductee / customer name if available
  reference:   string | null;    // PAN / GSTIN / invoice number
  glRows:      Record<string, unknown>[];
  docRows:     Record<string, unknown>[];
}

export interface ReconResult {
  type:             "GL_26Q" | "GL_GSTR1";
  connectionId:     string;
  reconciledAt:     Date;
  durationMs:       number;

  // Summary totals
  glTotal:          number;
  docTotal:         number;
  matchedTotal:     number;      // Amount reconciled (within tolerance)
  unmatchedTotal:   number;      // Total variance across all gaps

  totalGaps:        number;
  bySeverity:       Record<ReconSeverity, number>;

  gaps:             ReconGap[];
}

// GL row shape after reading from the dynamic table (canonical columns)
export interface GlRow {
  transaction_date: Date | null;
  account_name:     string | null;
  account_group:    string | null;
  party_name:       string | null;
  vendor_name:      string | null;
  customer_name:    string | null;
  debit_amount:     number;
  credit_amount:    number;
  net_amount:       number;
  description:      string | null;
  reference_number: string | null;
  voucher_type:     string | null;
  _raw:             Record<string, unknown>;
}

// ─── Investigation core contracts ───────────────────────────────────────────────
//
// These types are the frozen heart of the platform. Every investigation,
// whether GST, Vendor, Cash or Fraud, produces the same shapes. Once this
// contract is stable, every UI component, every persistence call and every
// LLM prompt knows exactly what it receives.
//
// Governing principles (see the Playbook):
//   5. The LLM explains evidence — it never generates it. `llmSummary` is the
//      ONLY field an LLM is allowed to write. Everything else is deterministic.
//   6. Evidence is materialized at run time, not referenced. `Evidence.rows`
//      holds the actual data, so a Finding is self-contained forever — even
//      after the raw GL/GSTR-2B table is dropped at 90 days.
//   8. Every Finding declares its resolution condition (`resolvesWhen`).

import type { Capability } from "./capabilities";
import type { BusinessContext } from "./context";

export type InvestigationCategory =
  | "compliance"        // GST, TDS, filings
  | "financial_health"  // profit, expenses, cash
  | "operations"        // vendors, receivables, inventory
  | "risk"              // fraud, duplicate payments, unusual activity
  | "opportunity";      // ITC recovery, savings, working capital

export type FindingSeverity = "critical" | "warning" | "opportunity" | "info";

export type Priority = "today" | "this_week" | "this_month" | "fyi";

export type FindingStatus = "open" | "resolved" | "snoozed";

// ─── Evidence ────────────────────────────────────────────────────────────────
// A traceable, structured proof point. Cannot be inferred — must come from a
// real query or stored record. `confidence` is deterministic: 1.0 for a direct
// SQL result, lower (e.g. 0.6–0.8) when fuzzy-matching was involved.

export interface Evidence {
  source:      string;                      // "gl_table" | "gstr2b" | "reconciliation" | ...
  description: string;                      // human-readable: "Invoice INV-200 booked in GL, absent from GSTR-2B"
  query:       string;                      // the SQL/lookup that produced this (auditability)
  rows:        Record<string, unknown>[];   // MATERIALIZED raw data (Principle 6)
  amountRs:    number | null;               // ₹ this evidence point represents, null if N/A
  confidence:  number;                      // 0–1, deterministic
  references:  string[];                    // invoice numbers, vendor names, voucher refs
}

// ─── Recommendation ──────────────────────────────────────────────────────────
// A specific business action. Business logic, not AI text. Every Finding has
// exactly one (no finding without an action).

export interface Recommendation {
  action:          string;          // "Hold payment to these vendors until they file GSTR-1"
  owner:           string;          // "Finance Manager"
  priority:        Priority;
  expectedBenefit: string;          // "Protect ₹1.8L ITC from reversal"
  deadline:        string | null;   // "Before GSTR-3B filing on the 20th", or null
}

// ─── Finding ─────────────────────────────────────────────────────────────────
// The atomic output of one Investigation. The five "must-answer" questions are
// REQUIRED fields (no optionals) so an incomplete finding cannot type-check.

export interface Finding {
  code:             string;          // "GST-ITC-002" — stable check id
  category:         InvestigationCategory;
  severity:         FindingSeverity;
  title:            string;          // "3 vendors haven't filed GSTR-1 this month"
  impactRs:         number | null;   // ₹ impact; null = real but not quantifiable; 0 = no ₹ impact

  // The five questions every finding must answer:
  businessQuestion: string;          // 1. "Which vendors are putting ITC at risk?"
  evidence:         Evidence[];      // 2. proof
  // 3. impact → impactRs above
  recommendation:   Recommendation;  // 4. what to do
  verificationSteps: string[];       // 5. how the user verifies the conclusion

  conclusion:       string;          // deterministic plain-English summary
  resolvesWhen:     string;          // Principle 8: what makes this finding go away
  status:           FindingStatus;

  llmSummary?:      string;          // OPTIONAL, LLM-written phrasing. The only AI-authored field.
}

// ─── Investigation Definition (the plugin — lives in code, never in the DB) ────
// Pure: run() reads only through the BusinessContext accessors and calls pure
// doc-parsers functions. It MUST NOT call the LLM (the runner does that after)
// and MUST NOT write to the DB.

export interface InvestigationDefinition {
  id:                   string;             // "gst-vendor-itc"
  version:              string;             // "1.0"
  title:                string;             // "GST Vendor ITC Risk"
  category:             InvestigationCategory;
  businessQuestion:     string;             // exactly one
  requiredCapabilities: Capability[];
  run:                  (ctx: BusinessContext) => Promise<Finding[]>;
}

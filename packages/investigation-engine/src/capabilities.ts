// ─── Capabilities ──────────────────────────────────────────────────────────────
//
// The contract the whole architecture hangs on (Principle 2: investigations
// declare CAPABILITIES, not connectors). An investigation says "I need
// GENERAL_LEDGER and INPUT_TAX_CREDIT" — it never says "I need a Tally file"
// or "I need a GSTR-2B PDF". The ContextResolver maps real data sources to
// these capabilities, so adding SAP / Zoho / a live GSTN API later changes
// only the resolver, never an investigation.
//
// This list is versioned. Adding a value is a minor bump; removing one is a
// breaking change. Only the three marked "wired" are resolved today — the rest
// are declared so investigations authored now can target them as they come
// online.

export enum Capability {
  // ── Core financial data ──
  GENERAL_LEDGER          = "GENERAL_LEDGER",          // wired — GL upload
  PURCHASE_REGISTER       = "PURCHASE_REGISTER",
  SALES_REGISTER          = "SALES_REGISTER",
  BANK_STATEMENT          = "BANK_STATEMENT",

  // ── GST ──
  INPUT_TAX_CREDIT        = "INPUT_TAX_CREDIT",        // wired — GSTR-2B
  OUTWARD_SUPPLIES        = "OUTWARD_SUPPLIES",        // GSTR-1
  GST_SUMMARY             = "GST_SUMMARY",             // GSTR-3B

  // ── TDS / direct tax ──
  TDS_FILING              = "TDS_FILING",              // Form 26Q
  ITR_DATA                = "ITR_DATA",

  // ── Derived / persisted (survive the 90-day raw-table expiry) ──
  VENDOR_COMPLIANCE_HISTORY = "VENDOR_COMPLIANCE_HISTORY", // wired — VendorComplianceRecord
  PERIOD_COMPARISON         = "PERIOD_COMPARISON",         // requires 2+ GL periods
}

export type CapabilitySet = ReadonlySet<Capability>;

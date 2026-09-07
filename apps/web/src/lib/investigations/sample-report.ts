// ─── Sample Investigation Report (demo / wow asset) ──────────────────────────
//
// A hand-crafted, realistic investigation report for a fictional Indian auto-
// ancillary SME. Used by the public /sample-report page so a prospect can SEE
// the product's output before signing up — no upload, no login.
//
// HONESTY RULE (do not break this):
//   Every finding in `FINDINGS` must correspond to a finding code the engine
//   actually emits today — i.e. one of the codes in
//   `packages/investigation-engine/src/investigations/*.ts`. As of now that is
//   GST-ITC-001…006 (gst-vendor-itc) and DUP-PAY-001/002 (duplicate-payment).
//   Anything we can't yet produce belongs in `ROADMAP` below, which the page
//   renders as a clearly-labelled "not yet available" list — never as a
//   finding card with fabricated evidence. A prospect who signs up after
//   seeing this page must get the report they were shown.
//
// Numbers are illustrative but internally consistent (ITC = 18% of taxable,
// and the headline totals are computed from the findings, not hand-typed).
// This is marketing/demo data — clearly labelled as a sample in the UI.

export type SampleSeverity = "critical" | "warning" | "opportunity" | "info";
export type SampleCategory =
  | "compliance" | "risk" | "financial_health" | "operations" | "opportunity";

export interface SampleEvidence {
  description: string;
  columns:     string[];
  rows:        (string | number)[][];
  amountRs:    number | null;
  confidence:  number;
  references:  string[];
}

export interface SampleFinding {
  code:             string;
  investigation:    string;          // which investigation produced it
  category:         SampleCategory;
  severity:         SampleSeverity;
  title:            string;
  impactRs:         number | null;
  businessQuestion: string;
  conclusion:       string;
  evidence:         SampleEvidence[];
  recommendation: {
    action:          string;
    owner:           string;
    priority:        "today" | "this_week" | "this_month" | "fyi";
    expectedBenefit: string;
    deadline:        string | null;
  };
  verificationSteps: string[];
  resolvesWhen:      string;
}

export interface SampleReport {
  company:          string;
  period:           string;
  snapshotId:       string;
  resolvedAt:       string;
  healthScore:      number;
  totalImpactRs:    number;
  criticalCount:    number;
  warningCount:     number;
  opportunityCount: number;
  executiveSummary: string;
  findings:         SampleFinding[];
}

// ─── Source files (shown as "detected" before analysis) ──────────────────────
export interface SampleSource {
  kind:       string;          // friendly type
  icon:       string;
  fileName:   string;
  sizeLabel:  string;
  rows:       number;
  detectedAs: string;          // what the system recognised it as
  confidence: number;          // detection confidence (0-1) — shown as a quality signal
  recognised: string[];        // recognised fields/sections (no method, just what)
}

export const SAMPLE_SOURCES: SampleSource[] = [
  {
    kind: "General Ledger",
    icon: "📊",
    fileName: "bharat-auto-GL-may2026.xlsx",
    sizeLabel: "412 KB",
    rows: 1284,
    detectedAs: "General Ledger (Tally export)",
    confidence: 0.98,
    recognised: ["transaction date", "voucher type", "party name", "debit / credit", "reference no", "account group"],
  },
  {
    kind: "GSTR-2B",
    icon: "📥",
    fileName: "GSTR2B_27ABCDE_052026.json",
    sizeLabel: "88 KB",
    rows: 47,
    detectedAs: "GSTR-2B inward supply statement",
    confidence: 0.99,
    recognised: ["supplier GSTIN", "invoice no", "taxable value", "IGST / CGST / SGST", "ITC eligibility"],
  },
];

// ─── Live-analysis steps ──────────────────────────────────────────────────────
//
// One step per check the engine genuinely runs today. If you add a step here,
// there must be a real investigation behind it.
export interface AnalysisStep {
  label:   string;
  detail:  string;          // what it's working over
  result:  string;          // the outcome chip shown when done
  tone:    "neutral" | "alert" | "good";
}

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { label: "Reading General Ledger",                    detail: "1,284 transactions", result: "14 columns mapped",  tone: "neutral" },
  { label: "Identifying purchase invoices",              detail: "across vouchers",    result: "47 invoices",        tone: "neutral" },
  { label: "Cross-checking purchases against GSTR-2B",   detail: "47 invoices",        result: "3 vendors flagged",  tone: "alert"   },
  { label: "Checking ITC eligibility flags",             detail: "47 invoices",        result: "1 blocked credit",   tone: "alert"   },
  { label: "Reviewing 6 months of vendor filing history", detail: "23 vendors",        result: "1 habitual late filer", tone: "neutral" },
  { label: "Matching supplier names GL ↔ GSTR-2B",       detail: "23 vendors",         result: "2 mismatches",       tone: "neutral" },
  { label: "Scanning payments for duplicates",           detail: "312 payments",       result: "1 duplicate found",  tone: "alert"   },
  { label: "Looking for ITC you haven't claimed",         detail: "GSTR-2B vs GL",     result: "₹4,500 unclaimed",   tone: "good"    },
];

// Headline counters shown during/after analysis.
export const ANALYSIS_STATS = {
  transactionsScanned: 1284,
  purchaseInvoices:    47,
  paymentsScanned:     312,
  vendorsAnalysed:     23,
};

const FINDINGS: SampleFinding[] = [
  // ── 1. GST ITC at risk (engine: GST-ITC-002) — the headline ──
  {
    code: "GST-ITC-002",
    investigation: "GST Vendor ITC Risk",
    category: "compliance",
    severity: "critical",
    title: "3 purchase invoices not in GSTR-2B — ₹1,24,020 of ITC at risk",
    impactRs: 124020,
    businessQuestion: "Which vendors are putting my Input Tax Credit at risk?",
    conclusion:
      "Three vendors with invoices booked in your GL for May 2026 do not appear in GSTR-2B, and none of them has a history of filing late — so this is a genuine gap, not a timing lag. ₹1,24,020 of ITC you've assumed is at risk of being blocked or reversed with interest.",
    evidence: [{
      description: "GL purchase invoices with no matching GSTR-2B entry",
      columns: ["Vendor", "Invoice", "Date", "Taxable ₹", "ITC at risk ₹"],
      rows: [
        ["Agarwal Stationery Mart", "AGW-B2026-88", "2026-05-10", 71000, 12780],
        ["Sindhwani Rubber Products", "SRP-2026-0091", "2026-05-29", 94000, 16920],
        ["Bright Tools & Hardware", "BTH-2026-204", "2026-05-18", 524000, 94320],
      ],
      amountRs: 124020,
      confidence: 1,
      references: ["AGW-B2026-88", "SRP-2026-0091", "BTH-2026-204"],
    }],
    recommendation: {
      action: "Hold pending payments to Agarwal Stationery, Sindhwani Rubber and Bright Tools until their invoices appear in GSTR-2B. Send each a filing-reminder today.",
      owner: "Finance Manager",
      priority: "today",
      expectedBenefit: "Protect ₹1,24,020 of ITC from reversal — and use payment as leverage to get them to file.",
      deadline: "Before GSTR-3B filing on the 20th",
    },
    verificationSteps: [
      "On the GSTN portal → Returns → GSTR-2B for May 2026, search each invoice number.",
      "Confirm each supplier's GSTIN is Active and their GSTR-1 for the period is unfiled.",
    ],
    resolvesWhen: "All three invoices appear in GSTR-2B for May 2026 (suppliers file GSTR-1).",
  },

  // ── 2. Duplicate payment (engine: DUP-PAY-001) ──
  {
    code: "DUP-PAY-001",
    investigation: "Duplicate Payment Detection",
    category: "risk",
    severity: "critical",
    title: "Possible duplicate payment of ₹68,000 to Mehta Steel Industries",
    impactRs: 68000,
    businessQuestion: "Have we paid any invoice more than once?",
    conclusion:
      "Invoice INV-MSI-2026-041 from Mehta Steel Industries appears to have been paid twice — once on 07-May and again on 22-May — for the same ₹68,000. The second payment has no corresponding new invoice.",
    evidence: [{
      description: "Two payment vouchers referencing the same supplier invoice",
      columns: ["Date", "Voucher", "Vendor", "Invoice Ref", "Amount ₹"],
      rows: [
        ["2026-05-07", "PV-2026-118", "Mehta Steel Industries", "INV-MSI-2026-041", 68000],
        ["2026-05-22", "PV-2026-149", "Mehta Steel Industries", "INV-MSI-2026-041", 68000],
      ],
      amountRs: 68000,
      confidence: 0.9,
      references: ["PV-2026-118", "PV-2026-149", "INV-MSI-2026-041"],
    }],
    recommendation: {
      action: "Confirm with Mehta Steel and recover ₹68,000 as a refund or adjust against the next purchase. Add a duplicate-invoice-reference check to your payment approval.",
      owner: "Accounts Payable",
      priority: "today",
      expectedBenefit: "Recover ₹68,000 of cash paid in error.",
      deadline: "This week",
    },
    verificationSteps: [
      "Open both payment vouchers and confirm they reference the same invoice number.",
      "Check the bank statement for two debits of ₹68,000 to the same vendor.",
    ],
    resolvesWhen: "The duplicate ₹68,000 is refunded or adjusted, or confirmed as two genuine invoices.",
  },

  // ── 3. ITC marked ineligible in GSTR-2B (engine: GST-ITC-004) ──
  {
    code: "GST-ITC-004",
    investigation: "GST Vendor ITC Risk",
    category: "compliance",
    severity: "warning",
    title: "1 booked invoice marked ITC-ineligible in GSTR-2B — ₹8,640 wrongly claimed",
    impactRs: 8640,
    businessQuestion: "Am I claiming credit the law doesn't allow?",
    conclusion:
      "The ₹48,000 car-repair bill from Sai Motors is flagged ITC-ineligible in GSTR-2B (section 17(5) blocked credit on passenger vehicles), but ₹8,640 of ITC has been taken on it in your books. Claiming it invites a reversal with interest at assessment.",
    evidence: [{
      description: "GL invoices where GSTR-2B marks the credit ineligible",
      columns: ["Vendor", "Invoice", "Taxable ₹", "ITC claimed ₹", "2B eligibility"],
      rows: [
        ["Sai Motors & Service", "SM-2026-0338", 48000, 8640, "Ineligible — 17(5)"],
      ],
      amountRs: 8640,
      confidence: 1,
      references: ["SM-2026-0338"],
    }],
    recommendation: {
      action: "Reverse the ₹8,640 of ITC in this month's GSTR-3B and re-post the amount to repairs expense.",
      owner: "Accountant",
      priority: "this_week",
      expectedBenefit: "Avoid a ₹8,640 reversal plus interest at assessment.",
      deadline: "Before GSTR-3B filing on the 20th",
    },
    verificationSteps: [
      "Open GSTR-2B for May 2026 and confirm the eligibility flag on SM-2026-0338.",
      "Confirm the vehicle is a passenger car not used for further supply or driver training.",
    ],
    resolvesWhen: "The ₹8,640 is reversed in GSTR-3B and the ledger entry corrected.",
  },

  // ── 4. Unclaimed ITC (engine: GST-ITC-003) — opportunity ──
  {
    code: "GST-ITC-003",
    investigation: "GST Vendor ITC Risk",
    category: "opportunity",
    severity: "opportunity",
    title: "₹25,000 invoice sitting in GSTR-2B but not booked — ₹4,500 ITC unclaimed",
    impactRs: 4500,
    businessQuestion: "Am I claiming all the ITC I'm entitled to?",
    conclusion:
      "GSTR-2B shows an invoice from Vishwas Trading Company (₹25,000 taxable) eligible for ITC that you haven't booked in your GL. That's ₹4,500 of credit you're entitled to but currently leaving unclaimed.",
    evidence: [{
      description: "GSTR-2B invoice with no matching GL entry",
      columns: ["Vendor", "Invoice", "Taxable ₹", "ITC available ₹"],
      rows: [
        ["Vishwas Trading Company", "VTC-MAY-2026-12", 25000, 4500],
      ],
      amountRs: 4500,
      confidence: 1,
      references: ["VTC-MAY-2026-12"],
    }],
    recommendation: {
      action: "Locate the Vishwas Trading bill, confirm it's yours, book it, and claim the ₹4,500 ITC in this month's GSTR-3B.",
      owner: "Accountant",
      priority: "this_week",
      expectedBenefit: "Claim ₹4,500 of ITC that is currently unrecorded.",
      deadline: "Before GSTR-3B filing",
    },
    verificationSteps: [
      "Match VTC-MAY-2026-12 to a purchase bill in your records.",
      "Confirm the goods/services were genuinely received.",
    ],
    resolvesWhen: "The invoice is booked and the ITC claimed.",
  },

  // ── 5. Habitual late filer — do NOT chase (engine: GST-ITC-006) ──
  {
    code: "GST-ITC-006",
    investigation: "GST Vendor ITC Risk",
    category: "operations",
    severity: "info",
    title: "1 invoice not yet in GSTR-2B — expected next period, not at risk",
    impactRs: 19800,
    businessQuestion: "Which missing invoices actually need chasing?",
    conclusion:
      "Speedway Logistics is missing from May's GSTR-2B, but they've filed GSTR-1 late in 5 of the last 6 months and the invoice has always shown up in the following period. This ₹19,800 of ITC is delayed, not lost — no chase needed, and it should not be rejected in IMS.",
    evidence: [{
      description: "Missing invoice from a vendor with a consistent late-filing pattern",
      columns: ["Vendor", "Invoice", "Taxable ₹", "ITC pending ₹", "Filing pattern (6 mo)"],
      rows: [
        ["Speedway Logistics Pvt Ltd", "SLP-2026-1140", 110000, 19800, "Late 5 of 6 · avg 24 days"],
      ],
      amountRs: 19800,
      confidence: 0.9,
      references: ["SLP-2026-1140"],
    }],
    recommendation: {
      action: "No action needed. Leave SLP-2026-1140 pending in IMS rather than rejecting it, and re-check next month's GSTR-2B.",
      owner: "Accountant",
      priority: "this_month",
      expectedBenefit: "Avoid rejecting a genuine invoice in IMS, or chasing a vendor who hasn't done anything wrong.",
      deadline: null,
    },
    verificationSteps: [
      "Check GSTR-2B for the last 6 periods and confirm Speedway's invoices appear one period late each time.",
      "Confirm Speedway's GSTIN is Active on the GSTN portal.",
    ],
    resolvesWhen: "SLP-2026-1140 appears in a later GSTR-2B, or the vendor's pattern changes to non-filing.",
  },

  // ── 6. Supplier name mismatches (engine: GST-ITC-005) — data quality ──
  {
    code: "GST-ITC-005",
    investigation: "GST Vendor ITC Risk",
    category: "operations",
    severity: "info",
    title: "2 supplier name mismatches between GL and GSTR-2B",
    impactRs: 0,
    businessQuestion: "Is my ledger clean enough to reconcile reliably?",
    conclusion:
      "Two suppliers are spelled differently in your ledger than in GSTR-2B. The GSTINs match, so nothing is at risk this month — but every future reconciliation has to work around it, and a name-only match would miss these.",
    evidence: [{
      description: "Same GSTIN, different supplier name",
      columns: ["GSTIN", "Name in GL", "Name in GSTR-2B"],
      rows: [
        ["27AABCG1234H1Z5", "Gupta Metal", "Gupta Metal Works Pvt Ltd"],
        ["27AAECS7788L1ZK", "Sharma Packg.", "Sharma Packaging Private Limited"],
      ],
      amountRs: null,
      confidence: 1,
      references: ["27AABCG1234H1Z5", "27AAECS7788L1ZK"],
    }],
    recommendation: {
      action: "Rename these two ledgers in Tally to match the GSTIN registration exactly, and record the GSTIN on the ledger master.",
      owner: "Accountant",
      priority: "this_month",
      expectedBenefit: "Cleaner reconciliation every month; fewer false 'missing invoice' flags.",
      deadline: null,
    },
    verificationSteps: [
      "Look up each GSTIN on the GST portal and copy the registered legal name.",
      "Update the ledger master in Tally and confirm the GSTIN field is filled.",
    ],
    resolvesWhen: "Both ledger names match the GSTIN registration.",
  },
];

// ─── On the roadmap ───────────────────────────────────────────────────────────
//
// Investigations we intend to ship but have NOT built. Rendered as a plain
// "not yet available" list, never as a finding — no fabricated evidence, no
// rupee figures, nothing that counts toward the report totals. When one of
// these ships, move it into FINDINGS with real evidence and delete it here.
export interface RoadmapItem {
  title:            string;
  businessQuestion: string;
  willFind:         string;
}

export const ROADMAP: RoadmapItem[] = [
  {
    title: "Receivables & cash",
    businessQuestion: "Where is my cash stuck?",
    willFind: "Debtors aged past their terms, ranked by how much collecting them would move this month's cash position.",
  },
  {
    title: "Expense anomalies",
    businessQuestion: "Which expenses changed abnormally this month?",
    willFind: "Expense heads that jumped against their own trailing average, with the vendor and vouchers behind the spike.",
  },
  {
    title: "TDS compliance",
    businessQuestion: "Did we deduct TDS everywhere it was due?",
    willFind: "Payments over a section threshold with no TDS entry, and the disallowance exposure that creates.",
  },
  {
    title: "Vendor concentration",
    businessQuestion: "Am I over-dependent on any single vendor?",
    willFind: "Purchase share by vendor, and where a single supply disruption would hit production.",
  },
  {
    title: "Working capital & payment terms",
    businessQuestion: "Where can I save money I'm already entitled to?",
    willFind: "Early-payment discounts being left on the table, and the payment re-sequencing that captures them.",
  },
  {
    title: "Profit & margin bridge",
    businessQuestion: "Why did my profit change this month?",
    willFind: "A margin bridge attributing the movement to input cost, freight, mix and price.",
  },
];

export const SAMPLE_REPORT: SampleReport = {
  company: "Bharat Auto Components Pvt Ltd",
  period: "May 2026",
  snapshotId: "CTX-05-2026-SAMPLE",
  resolvedAt: "2026-06-01T08:00:00+05:30",
  healthScore: 68,
  totalImpactRs: FINDINGS.reduce((s, f) => s + (f.impactRs ?? 0), 0),
  criticalCount: FINDINGS.filter((f) => f.severity === "critical").length,
  warningCount: FINDINGS.filter((f) => f.severity === "warning").length,
  opportunityCount: FINDINGS.filter((f) => f.severity === "opportunity").length,
  executiveSummary:
    "For May 2026 we found 2 critical issues, 1 warning and 1 opportunity, with ₹2,25,000 of input tax credit and cash in play. The most urgent: ₹1,24,020 of ITC is at risk because three vendors haven't filed GSTR-1, and a ₹68,000 payment to Mehta Steel appears to be a duplicate. A ₹8,640 blocked credit has been claimed and needs reversing before the 20th, while ₹4,500 of ITC sits in GSTR-2B unbooked. One further missing invoice is from a habitual late filer and needs no action at all.",
  findings: FINDINGS,
};

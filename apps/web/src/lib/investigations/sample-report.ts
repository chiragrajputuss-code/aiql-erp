// ─── Sample Investigation Report (demo / wow asset) ──────────────────────────
//
// A hand-crafted, realistic investigation report for a fictional Indian auto-
// ancillary SME. Used by the public /sample-report page so a prospect can SEE
// the product's output before signing up — no upload, no login. It mirrors the
// exact shape the real engine produces (findings + evidence + recommendation +
// resolves-when), and showcases the full investigation library, not just the
// one investigation wired today.
//
// Numbers are illustrative but internally consistent. This is marketing/demo
// data — clearly labelled as a sample in the UI.

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

// ─── Live-analysis steps (each shows a real-feeling result as it completes) ────
export interface AnalysisStep {
  label:   string;
  detail:  string;          // what it's working over
  result:  string;          // the outcome chip shown when done
  tone:    "neutral" | "alert" | "good";
}

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { label: "Reading General Ledger",                detail: "1,284 transactions", result: "14 columns mapped",     tone: "neutral" },
  { label: "Identifying purchase invoices",          detail: "across vouchers",    result: "47 invoices",           tone: "neutral" },
  { label: "Cross-checking purchases against GSTR-2B", detail: "47 invoices",      result: "3 vendors flagged",     tone: "alert" },
  { label: "Scanning payments for duplicates",       detail: "312 payments",       result: "1 duplicate found",     tone: "alert" },
  { label: "Aging receivables",                      detail: "18 customers",       result: "₹4.7L overdue",         tone: "alert" },
  { label: "Comparing expenses to 3-month trend",    detail: "9 expense heads",    result: "1 anomaly",             tone: "alert" },
  { label: "Assessing vendor concentration",         detail: "23 vendors",         result: "1 supply risk",         tone: "alert" },
  { label: "Explaining margin movement",             detail: "April vs May",       result: "-3.2 pts explained",    tone: "neutral" },
  { label: "Checking TDS deductions",                detail: "professional fees",  result: "1 short deduction",     tone: "alert" },
  { label: "Finding savings opportunities",          detail: "vendor terms + ITC", result: "₹43K recoverable",      tone: "good" },
];

// Headline counters shown during/after analysis.
export const ANALYSIS_STATS = {
  transactionsScanned: 1284,
  purchaseInvoices:    47,
  paymentsScanned:     312,
  vendorsAnalysed:     23,
  customersAged:       18,
};

const FINDINGS: SampleFinding[] = [
  // ── 1. GST ITC at risk — the headline ──
  {
    code: "GST-ITC-002",
    investigation: "GST Vendor ITC Risk",
    category: "compliance",
    severity: "critical",
    title: "₹1,24,500 of Input Tax Credit at risk — 3 vendors haven't filed GSTR-1",
    impactRs: 124500,
    businessQuestion: "Which vendors are putting my Input Tax Credit at risk?",
    conclusion:
      "Three vendors with invoices booked in your GL for May 2026 do not appear in GSTR-2B. The likely cause is that they have not filed their GSTR-1 — so ₹1,24,500 of ITC you've assumed is at risk of being blocked or reversed with interest.",
    evidence: [{
      description: "GL purchase invoices with no matching GSTR-2B entry",
      columns: ["Vendor", "Invoice", "Date", "Taxable ₹", "ITC at risk ₹"],
      rows: [
        ["Agarwal Stationery Mart", "AGW-B2026-88", "2026-05-10", 71000, 12780],
        ["Sindhwani Rubber Products", "SRP-2026-0091", "2026-05-29", 94000, 16920],
        ["Bright Tools & Hardware", "BTH-2026-204", "2026-05-18", 524000, 94300],
      ],
      amountRs: 124500,
      confidence: 1,
      references: ["AGW-B2026-88", "SRP-2026-0091", "BTH-2026-204"],
    }],
    recommendation: {
      action: "Hold pending payments to Agarwal Stationery, Sindhwani Rubber and Bright Tools until their invoices appear in GSTR-2B. Send each a filing-reminder today.",
      owner: "Finance Manager",
      priority: "today",
      expectedBenefit: "Protect ₹1,24,500 of ITC from reversal — and use payment as leverage to get them to file.",
      deadline: "Before GSTR-3B filing on the 20th",
    },
    verificationSteps: [
      "On the GSTN portal → Returns → GSTR-2B for May 2026, search each invoice number.",
      "Confirm each supplier's GSTIN is Active and their GSTR-1 for the period is unfiled.",
    ],
    resolvesWhen: "All three invoices appear in GSTR-2B for May 2026 (suppliers file GSTR-1).",
  },

  // ── 2. Duplicate payment ──
  {
    code: "RISK-DUP-001",
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

  // ── 3. Receivables overdue ──
  {
    code: "CASH-AR-001",
    investigation: "Receivables & Cash",
    category: "financial_health",
    severity: "warning",
    title: "₹4,70,000 overdue beyond 60 days across 4 customers",
    impactRs: 470000,
    businessQuestion: "Where is my cash stuck?",
    conclusion:
      "₹4,70,000 of receivables are more than 60 days overdue. Rajesh Auto Components alone accounts for ₹2,10,000 — collecting even half would materially ease this month's cash position.",
    evidence: [{
      description: "Debtors aged beyond 60 days",
      columns: ["Customer", "Invoice", "Days overdue", "Amount ₹"],
      rows: [
        ["Rajesh Auto Components Pvt Ltd", "SI-2026-004", 74, 210000],
        ["Krishna Trading Co", "SI-2026-006", 68, 134000],
        ["Mahindra Component Works", "SI-2026-003", 63, 86000],
        ["Bharat Forge Supplies", "SI-2026-009", 61, 40000],
      ],
      amountRs: 470000,
      confidence: 1,
      references: ["SI-2026-004", "SI-2026-006", "SI-2026-003", "SI-2026-009"],
    }],
    recommendation: {
      action: "Call Rajesh Auto and Krishna Trading this week with a payment plan; put the other two on a reminder cycle.",
      owner: "Collections",
      priority: "this_week",
      expectedBenefit: "Unlock up to ₹4,70,000 of stuck cash; ₹3,44,000 from the top two alone.",
      deadline: null,
    },
    verificationSteps: [
      "Confirm the invoice dates and that no payment has been received since.",
      "Check for any disputes or credit notes against these invoices.",
    ],
    resolvesWhen: "Overdue balance beyond 60 days falls below ₹1,00,000.",
  },

  // ── 4. Expense anomaly ──
  {
    code: "EXP-TREND-001",
    investigation: "Expense Investigation",
    category: "financial_health",
    severity: "warning",
    title: "Marketing spend up 181% vs 3-month average (₹42K → ₹1.18L)",
    impactRs: 76000,
    businessQuestion: "Which expenses changed abnormally this month?",
    conclusion:
      "Marketing & advertising rose to ₹1,18,000 in May against a ₹42,000 three-month average — a ₹76,000 spike, almost entirely to Pixel Ads Agency. Worth confirming this was a planned campaign and not a misposting.",
    evidence: [{
      description: "Marketing & advertising by month",
      columns: ["Month", "Vendor", "Amount ₹"],
      rows: [
        ["Feb 2026", "Pixel Ads Agency", 22000],
        ["Mar 2026", "Pixel Ads Agency", 38000],
        ["Apr 2026", "Pixel Ads Agency", 66000],
        ["May 2026", "Pixel Ads Agency", 118000],
      ],
      amountRs: 76000,
      confidence: 1,
      references: ["Pixel Ads Agency"],
    }],
    recommendation: {
      action: "Confirm the May campaign was approved and budgeted; if not, investigate the posting. Set a monthly marketing budget alert.",
      owner: "Finance Manager",
      priority: "this_week",
      expectedBenefit: "Avoid ₹76,000+ of unbudgeted spend recurring next month.",
      deadline: null,
    },
    verificationSteps: [
      "Match the May Pixel Ads invoices to an approved campaign / PO.",
      "Confirm the amount wasn't a duplicate or wrong-account posting.",
    ],
    resolvesWhen: "May marketing spend is confirmed as budgeted, or corrected.",
  },

  // ── 5. Vendor concentration ──
  {
    code: "VENDOR-CONC-001",
    investigation: "Vendor Investigation",
    category: "operations",
    severity: "warning",
    title: "61% of purchases concentrated with a single vendor",
    impactRs: null, // real risk, not directly quantifiable
    businessQuestion: "Am I over-dependent on any single vendor?",
    conclusion:
      "Mehta Steel Industries accounts for 61% of May purchase value. A price hike, quality issue or supply disruption from one vendor would hit production directly. Consider qualifying a second source for steel.",
    evidence: [{
      description: "Purchase value by vendor (May 2026)",
      columns: ["Vendor", "Purchases ₹", "Share %"],
      rows: [
        ["Mehta Steel Industries", 156000, 61],
        ["Gupta Metal Works", 42000, 16],
        ["Kumar Electrical Stores", 31200, 12],
        ["Others", 27300, 11],
      ],
      amountRs: null,
      confidence: 1,
      references: ["Mehta Steel Industries"],
    }],
    recommendation: {
      action: "Qualify a second steel supplier and shift 15–20% of volume to reduce single-vendor dependency.",
      owner: "Procurement",
      priority: "this_month",
      expectedBenefit: "Lower supply risk and stronger price negotiation.",
      deadline: null,
    },
    verificationSteps: [
      "Review the purchase register grouped by vendor for the quarter.",
      "Assess switching cost and lead time for an alternate steel supplier.",
    ],
    resolvesWhen: "No single vendor exceeds 45% of purchase value.",
  },

  // ── 6. TDS not deducted ──
  {
    code: "TDS-001",
    investigation: "TDS Compliance",
    category: "compliance",
    severity: "warning",
    title: "TDS not deducted on ₹45,000 professional fees (Desai & Associates)",
    impactRs: 2200,
    businessQuestion: "Did we deduct TDS everywhere it was due?",
    conclusion:
      "A ₹45,000 professional-fee payment to Desai & Associates Advocates has no TDS deducted. Under section 194J, ₹4,500 (10%) was due. Non-deduction can mean a ₹2,200 disallowance plus interest.",
    evidence: [{
      description: "Professional-fee payment with no TDS entry",
      columns: ["Date", "Vendor", "Section", "Gross ₹", "TDS due ₹", "TDS deducted ₹"],
      rows: [
        ["2026-05-28", "Desai & Associates Advocates", "194J", 45000, 4500, 0],
      ],
      amountRs: 2200,
      confidence: 1,
      references: ["DA-INV-2605"],
    }],
    recommendation: {
      action: "Deduct and deposit the ₹4,500 TDS before filing, and issue a corrected entry. Add a 194J check on professional-fee vouchers.",
      owner: "Finance Manager",
      priority: "this_week",
      expectedBenefit: "Avoid a ₹2,200 expense disallowance plus interest and penalty.",
      deadline: "Before the TDS deposit due date (7th of next month)",
    },
    verificationSteps: [
      "Confirm the payment exceeds the ₹30,000 194J threshold.",
      "Check whether a lower-deduction certificate exists for this vendor.",
    ],
    resolvesWhen: "TDS of ₹4,500 is deducted and deposited, with the challan recorded.",
  },

  // ── 7. Unclaimed ITC — opportunity ──
  {
    code: "GST-ITC-003",
    investigation: "GST Vendor ITC Risk",
    category: "opportunity",
    severity: "opportunity",
    title: "₹25,000 ITC available in GSTR-2B but not booked in your GL",
    impactRs: 25000,
    businessQuestion: "Am I claiming all the ITC I'm entitled to?",
    conclusion:
      "GSTR-2B shows an invoice from Vishwas Trading Company (₹25,000 taxable) eligible for ITC that you haven't booked in your GL. That's credit you're entitled to but currently leaving unclaimed.",
    evidence: [{
      description: "GSTR-2B invoice with no matching GL entry",
      columns: ["Vendor", "Invoice", "Taxable ₹", "ITC available ₹"],
      rows: [
        ["Vishwas Trading Company", "VTC-MAY-2026-12", 25000, 4500],
      ],
      amountRs: 25000,
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

  // ── 8. Early-payment discount opportunity ──
  {
    code: "OPP-DISC-001",
    investigation: "Working Capital",
    category: "opportunity",
    severity: "opportunity",
    title: "₹18,000/yr of early-payment discounts going unused",
    impactRs: 18000,
    businessQuestion: "Where can I save money I'm already entitled to?",
    conclusion:
      "Two vendors offer 2% discounts for payment within 10 days that you're not taking — while paying others early with no discount. Re-sequencing payments would capture roughly ₹18,000 a year at no cost.",
    evidence: [{
      description: "Vendors offering unused early-payment terms",
      columns: ["Vendor", "Terms", "Annual spend ₹", "Discount available ₹"],
      rows: [
        ["Gupta Metal Works", "2% / 10 days", 540000, 10800],
        ["Sharma Packaging Pvt Ltd", "2% / 10 days", 360000, 7200],
      ],
      amountRs: 18000,
      confidence: 0.85,
      references: ["Gupta Metal Works", "Sharma Packaging Pvt Ltd"],
    }],
    recommendation: {
      action: "Prioritise these two vendors in the payment run to capture the early-payment discount.",
      owner: "Accounts Payable",
      priority: "this_month",
      expectedBenefit: "Capture ~₹18,000/yr of discounts at no extra cost.",
      deadline: null,
    },
    verificationSteps: [
      "Confirm the discount terms on the vendor agreements.",
      "Check your cash runway supports paying these two earlier.",
    ],
    resolvesWhen: "Early-payment discounts are being captured each cycle.",
  },

  // ── 9. Profit change explained — info ──
  {
    code: "PROFIT-001",
    investigation: "Profit Investigation",
    category: "financial_health",
    severity: "info",
    title: "Gross margin down 3.2 points — driven by steel + freight costs",
    impactRs: null,
    businessQuestion: "Why did my profit change this month?",
    conclusion:
      "Gross margin fell from 31.4% to 28.2%. The change is almost entirely cost-side: steel input cost rose 14% and inward freight 8% versus April, while selling prices held flat. Revenue itself was steady.",
    evidence: [{
      description: "Margin bridge — April vs May",
      columns: ["Driver", "Impact on margin"],
      rows: [
        ["Steel input cost +14%", "-2.1 pts"],
        ["Inward freight +8%", "-0.8 pts"],
        ["Product mix", "-0.3 pts"],
        ["Selling price", "0.0 pts"],
      ],
      amountRs: null,
      confidence: 0.9,
      references: ["Mehta Steel Industries", "Speedway Logistics Pvt Ltd"],
    }],
    recommendation: {
      action: "Review steel pricing with Mehta Steel (also flagged for over-concentration) and consider a price revision or surcharge to protect margin.",
      owner: "Management",
      priority: "this_month",
      expectedBenefit: "Recover up to 3 points of gross margin.",
      deadline: null,
    },
    verificationSteps: [
      "Compare per-unit steel cost April vs May from the purchase register.",
      "Confirm selling prices were unchanged over the period.",
    ],
    resolvesWhen: "Gross margin recovers toward the 31% trend, or the new cost base is accepted in pricing.",
  },
];

export const SAMPLE_REPORT: SampleReport = {
  company: "Bharat Auto Components Pvt Ltd",
  period: "May 2026",
  snapshotId: "CTX-05-2026-SAMPLE",
  resolvedAt: "2026-06-01T08:00:00+05:30",
  healthScore: 62,
  totalImpactRs: FINDINGS.reduce((s, f) => s + (f.impactRs ?? 0), 0),
  criticalCount: FINDINGS.filter((f) => f.severity === "critical").length,
  warningCount: FINDINGS.filter((f) => f.severity === "warning").length,
  opportunityCount: FINDINGS.filter((f) => f.severity === "opportunity").length,
  executiveSummary:
    "For May 2026 we found 2 critical issues, 4 warnings and 2 opportunities worth ₹8.5L in total. The most urgent: ₹1,24,500 of Input Tax Credit is at risk because three vendors haven't filed GSTR-1, and a ₹68,000 payment to Mehta Steel appears to be a duplicate. ₹4.7L of receivables are stuck beyond 60 days. On the upside, ₹25,000 of ITC and ₹18,000 of vendor discounts are sitting unclaimed.",
  findings: FINDINGS,
};

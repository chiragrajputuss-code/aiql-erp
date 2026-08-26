// ─── Investigation: GST Vendor ITC Risk ──────────────────────────────────────
//
// Business question: "Which vendors are putting my Input Tax Credit at risk?"
//
// The single highest-value, least-served pain point for Indian SMEs: a purchase
// is booked in the GL and ITC is assumed, but if the vendor never filed their
// GSTR-1, GSTN's GSTR-2B won't show that credit — and it gets reversed weeks
// later. This investigation wraps the existing reconcileGlGstr2B engine and
// translates its gaps into Findings with evidence, recommendations and a
// resolution condition.
//
// Pure: reads only via ctx accessors + the pure reconcileGlGstr2B function.
// No LLM, no DB (Principles 5 & "pure engine").

import {
  reconcileGlGstr2B, buildFilingProfiles, lookupProfile, isLikelyLateNotMissing,
} from "@aiql/doc-parsers";
import type { ReconGap, SupplierFilingProfile } from "@aiql/doc-parsers";
import type { BusinessContext } from "../context";
import { Capability } from "../capabilities";
import type { Finding, FindingSeverity, InvestigationDefinition } from "../types";

const BUSINESS_QUESTION = "Which vendors are putting my Input Tax Credit at risk?";

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function sumVariance(gaps: ReconGap[]): number {
  return gaps.reduce((s, g) => s + (g.variance || 0), 0);
}

function evidenceFromGap(gap: ReconGap, source: string) {
  return {
    source,
    description: gap.description,
    query:      `reconcileGlGstr2B → ${gap.code}`,
    rows:       [...gap.glRows, ...gap.docRows],
    amountRs:   gap.glAmount ?? gap.docAmount ?? gap.variance ?? null,
    confidence: 1,                                   // direct reconciliation result
    references: [gap.reference, gap.party].filter((x): x is string => Boolean(x)),
  };
}

// ── Finding 1: vendors who haven't filed (G2BGL-002) — the headline ───────────
function buildNotFiledFinding(gaps: ReconGap[], period: string): Finding | null {
  const relevant = gaps.filter((g) => g.code === "G2BGL-002");
  if (relevant.length === 0) return null;

  const totalAtRisk = sumVariance(relevant);
  const vendors = [...new Set(relevant.map((g) => g.party).filter(Boolean))] as string[];
  const anyCritical = relevant.some((g) => g.severity === "critical");
  const severity: FindingSeverity = anyCritical ? "critical" : "warning";

  const vendorLabel = vendors.length > 0 ? vendors.slice(0, 3).join(", ") : "one or more vendors";

  return {
    code:     "GST-ITC-002",
    category: "compliance",
    severity,
    title:    `${relevant.length} purchase invoice${relevant.length > 1 ? "s" : ""} not in GSTR-2B — ${rupees(totalAtRisk)} ITC at risk`,
    impactRs: totalAtRisk,
    businessQuestion: BUSINESS_QUESTION,
    evidence: relevant.map((g) => evidenceFromGap(g, "gl_vs_gstr2b")),
    recommendation: {
      action:          `Follow up with ${vendorLabel} to file their GSTR-1 for ${period}; hold further payments until the invoices appear in GSTR-2B.`,
      owner:           "Finance Manager",
      priority:        anyCritical ? "today" : "this_week",
      expectedBenefit: `Protect ${rupees(totalAtRisk)} of Input Tax Credit from being blocked or reversed.`,
      deadline:        "Before this month's GSTR-3B filing",
    },
    verificationSteps: [
      "Open the GSTN portal → Returns → GSTR-2B for the period and search each invoice number.",
      "Confirm the supplier's GSTIN status is Active and their GSTR-1 for the period is filed.",
    ],
    conclusion:   `${relevant.length} invoice${relevant.length > 1 ? "s" : ""} booked in your GL (${vendorLabel}) do not appear in GSTR-2B for ${period}. The likely cause is that the supplier has not filed GSTR-1, putting ${rupees(totalAtRisk)} of ITC at risk.`,
    resolvesWhen: `All listed invoices appear in GSTR-2B for ${period} (i.e. the suppliers file their GSTR-1).`,
    status:       "open",
  };
}

// ── Finding 1b: invoices from habitually-late filers — a timing note, not a
// risk (Phase 3.4). A vendor who files after the 11th every month is not a
// defaulter; their invoice simply lands in a LATER GSTR-2B. Without this, a
// "not filed, ITC at risk" alert fires on the same vendor every month even
// though nothing is actually wrong — the exact false positive that trains a
// CA to ignore the tool. Only fires with >=2 trailing periods of evidence
// (isLikelyLateNotMissing degrades to false otherwise, so with a thin history
// every gap still goes through buildNotFiledFinding above, unchanged). ─────
function buildExpectedLaterFinding(
  gaps:     ReconGap[],
  profiles: Map<string, SupplierFilingProfile>,
  period:   string,
): Finding | null {
  if (gaps.length === 0) return null;

  const totalPending = sumVariance(gaps);
  const vendors = [...new Set(gaps.map((g) => g.party).filter(Boolean))] as string[];
  const vendorLabel = vendors.length > 0 ? vendors.slice(0, 3).join(", ") : "these suppliers";
  const plural = vendors.length > 1;

  const evidence = gaps.map((g) => {
    const base = evidenceFromGap(g, "gl_vs_gstr2b_filing_pattern");
    const profile = lookupProfile(profiles, null, g.party);
    return profile ? { ...base, description: `${base.description} ${profile.summary}` } : base;
  });

  return {
    code:     "GST-ITC-006",
    category: "operations",
    severity: "info",
    title:    `${gaps.length} invoice${gaps.length > 1 ? "s" : ""} not yet in GSTR-2B — expected next period, not at risk`,
    impactRs: totalPending,
    businessQuestion: BUSINESS_QUESTION,
    evidence,
    recommendation: {
      action:          `No action needed yet for ${vendorLabel} — based on the last several months, they consistently file after the due date and this invoice should appear once they do. Do not reject ${gaps.length > 1 ? "these" : "it"} in IMS.`,
      owner:           "Finance Manager",
      priority:        "this_month",
      expectedBenefit: `Avoid mistakenly rejecting a genuine invoice in IMS, or chasing a vendor who hasn't actually done anything wrong.`,
      deadline:        null,
    },
    verificationSteps: [
      "Check next month's GSTR-2B to confirm the invoice appears once the supplier files.",
      "If it still hasn't appeared after two further periods, treat it as a genuine non-filer instead.",
    ],
    conclusion: `${gaps.length} invoice${gaps.length > 1 ? "s are" : " is"} missing from GSTR-2B for ${period}, but ${vendorLabel} ${plural ? "have" : "has"} historically filed late — based on your recent filing history, this credit is expected to appear once ${plural ? "they" : "they"} do.`,
    resolvesWhen: `The invoice(s) appear in a later GSTR-2B, or the filing pattern breaks and this should be re-classified as at risk.`,
    status:       "open",
  };
}

// ── Finding 2: ITC explicitly marked ineligible (G2BGL-004) ───────────────────
function buildIneligibleFinding(gaps: ReconGap[], period: string): Finding | null {
  const relevant = gaps.filter((g) => g.code === "G2BGL-004");
  if (relevant.length === 0) return null;

  const totalBlocked = sumVariance(relevant);
  const vendors = [...new Set(relevant.map((g) => g.party).filter(Boolean))] as string[];
  const vendorLabel = vendors.length > 0 ? vendors.slice(0, 3).join(", ") : "the supplier";

  return {
    code:     "GST-ITC-004",
    category: "compliance",
    severity: "warning",
    title:    `${relevant.length} booked invoice${relevant.length > 1 ? "s" : ""} marked ITC-ineligible in GSTR-2B`,
    impactRs: totalBlocked,
    businessQuestion: BUSINESS_QUESTION,
    evidence: relevant.map((g) => evidenceFromGap(g, "gl_vs_gstr2b")),
    recommendation: {
      action:          `Review the ineligibility reason for each invoice with ${vendorLabel}; do not claim ITC on these until resolved.`,
      owner:           "Finance Manager",
      priority:        "this_week",
      expectedBenefit: `Avoid claiming ${rupees(totalBlocked)} of ineligible ITC that would be reversed with interest.`,
      deadline:        "Before this month's GSTR-3B filing",
    },
    verificationSteps: [
      "Check the ITC eligibility flag and reason against the invoice in GSTR-2B.",
      "Confirm whether ITC was already claimed on these invoices in your GSTR-3B.",
    ],
    conclusion:   `${relevant.length} invoice${relevant.length > 1 ? "s" : ""} are booked in the GL but GSTR-2B marks the credit ineligible. Do not claim ITC on these until the reason is resolved.`,
    resolvesWhen: `GSTR-2B reports these invoices as ITC-eligible, or the invoices are written off.`,
    status:       "open",
  };
}

// ── Finding 3: ITC available but not booked (G2BGL-003) — opportunity ─────────
function buildUnbookedFinding(gaps: ReconGap[], period: string): Finding | null {
  const relevant = gaps.filter((g) => g.code === "G2BGL-003");
  if (relevant.length === 0) return null;

  const totalAvailable = sumVariance(relevant);
  const vendors = [...new Set(relevant.map((g) => g.party).filter(Boolean))] as string[];
  const vendorLabel = vendors.length > 0 ? vendors.slice(0, 3).join(", ") : "suppliers";

  return {
    code:     "GST-ITC-003",
    category: "opportunity",
    severity: "opportunity",
    title:    `${rupees(totalAvailable)} ITC available in GSTR-2B but not booked in GL`,
    impactRs: totalAvailable,
    businessQuestion: BUSINESS_QUESTION,
    evidence: relevant.map((g) => evidenceFromGap(g, "gl_vs_gstr2b")),
    recommendation: {
      action:          `Book the missing purchase invoices from ${vendorLabel} so the available ITC can be claimed.`,
      owner:           "Accountant",
      priority:        "this_week",
      expectedBenefit: `Claim ${rupees(totalAvailable)} of Input Tax Credit currently left on the table.`,
      deadline:        "Before this month's GSTR-3B filing",
    },
    verificationSteps: [
      "Match each GSTR-2B invoice to a purchase bill and confirm it is genuinely yours.",
      "Enter the bill in the books and claim the ITC in GSTR-3B.",
    ],
    conclusion:   `GSTR-2B shows ${relevant.length} invoice${relevant.length > 1 ? "s" : ""} (${rupees(totalAvailable)} taxable) available for ITC that are not booked in your GL. This credit may be going unclaimed.`,
    resolvesWhen: `The invoices are booked in the GL and the ITC is claimed.`,
    status:       "open",
  };
}

// ── Finding 4: supplier name mismatches (G2BGL-005) — data quality ────────────
function buildNameMismatchFinding(gaps: ReconGap[]): Finding | null {
  const relevant = gaps.filter((g) => g.code === "G2BGL-005");
  if (relevant.length === 0) return null;

  return {
    code:     "GST-ITC-005",
    category: "operations",
    severity: "info",
    title:    `${relevant.length} supplier name mismatch${relevant.length > 1 ? "es" : ""} between GL and GSTR-2B`,
    impactRs: 0,   // data-quality finding — real, but no direct ₹ impact
    businessQuestion: BUSINESS_QUESTION,
    evidence: relevant.map((g) => evidenceFromGap(g, "gl_vs_gstr2b")),
    recommendation: {
      action:          "Standardise the supplier names / GSTINs in your ledger to match GSTR-2B.",
      owner:           "Accountant",
      priority:        "this_month",
      expectedBenefit: "Cleaner reconciliation and fewer false mismatches in future months.",
      deadline:        null,
    },
    verificationSteps: [
      "Compare the GL party name and the GSTR-2B supplier name for each invoice.",
      "Confirm the GSTIN matches; if so, align the ledger name to the registered name.",
    ],
    conclusion:   `${relevant.length} matched invoice${relevant.length > 1 ? "s have" : " has"} a supplier-name mismatch between the GL and GSTR-2B. Likely a data-entry inconsistency rather than a financial issue.`,
    resolvesWhen: "Supplier names/GSTINs in the GL match the registered names in GSTR-2B.",
    status:       "open",
  };
}

// ── Finding 5: overall purchase vs taxable variance (G2BGL-001) ───────────────
function buildOverallVarianceFinding(gaps: ReconGap[], period: string): Finding | null {
  const gap = gaps.find((g) => g.code === "G2BGL-001");
  if (!gap) return null;

  return {
    code:     "GST-ITC-001",
    category: "compliance",
    severity: gap.severity === "critical" ? "warning" : "info",
    title:    `Overall GL purchases differ from GSTR-2B taxable value by ${rupees(gap.variance)}`,
    impactRs: gap.variance,
    businessQuestion: BUSINESS_QUESTION,
    evidence: [evidenceFromGap(gap, "gl_vs_gstr2b")],
    recommendation: {
      action:          "Reconcile total purchases against GSTR-2B to locate the source of the variance (the invoice-level findings above usually explain it).",
      owner:           "Finance Manager",
      priority:        "this_week",
      expectedBenefit: "Confidence that total ITC claimed ties to GSTR-2B.",
      deadline:        "Before this month's GSTR-3B filing",
    },
    verificationSteps: [
      `Compare GL purchase total (${rupees(gap.glAmount ?? 0)}) with GSTR-2B taxable value (${rupees(gap.docAmount ?? 0)}).`,
      "Drill into the invoice-level findings to account for the difference.",
    ],
    conclusion:   `Total purchases booked in the GL differ from the GSTR-2B taxable value by ${rupees(gap.variance)} for ${period}.`,
    resolvesWhen: "GL purchase total ties to GSTR-2B taxable value within tolerance.",
    status:       "open",
  };
}

export const GST_VENDOR_ITC: InvestigationDefinition = {
  id:               "gst-vendor-itc",
  version:          "1.0",
  title:            "GST Vendor ITC Risk",
  category:         "compliance",
  businessQuestion: BUSINESS_QUESTION,
  requiredCapabilities: [Capability.GENERAL_LEDGER, Capability.INPUT_TAX_CREDIT],

  async run(ctx: BusinessContext): Promise<Finding[]> {
    // The runner guarantees both capabilities are present before calling run().
    const gl  = ctx.gl!;
    const itc = ctx.itc!;

    const [glRows, gstrRows, trailingRows] = await Promise.all([
      gl.getRawRows(), itc.getRows(), itc.getTrailingRows(6),
    ]);
    const recon = reconcileGlGstr2B(glRows, gstrRows, gl.getConnectionId());
    const period = ctx.period.label;

    // Split "not filed" gaps by filing pattern: a vendor with a habitual-late
    // history should not re-trigger the same critical alert every month (see
    // buildExpectedLaterFinding above). Only G2BGL-002 gaps carry a GL-only
    // party name (nothing matched in GSTR-2B for these), so lookup is by name.
    const filingProfiles = buildFilingProfiles(trailingRows);
    const notFiledGaps = recon.gaps.filter((g) => g.code === "G2BGL-002");
    const atRiskGaps: ReconGap[] = [];
    const likelyLateGaps: ReconGap[] = [];
    for (const g of notFiledGaps) {
      const profile = lookupProfile(filingProfiles, null, g.party);
      (isLikelyLateNotMissing(profile) ? likelyLateGaps : atRiskGaps).push(g);
    }

    const findings = [
      buildNotFiledFinding(atRiskGaps, period),
      buildExpectedLaterFinding(likelyLateGaps, filingProfiles, period),
      buildIneligibleFinding(recon.gaps, period),
      buildUnbookedFinding(recon.gaps, period),
      buildNameMismatchFinding(recon.gaps),
      buildOverallVarianceFinding(recon.gaps, period),
    ].filter((f): f is Finding => f !== null);

    return findings;
  },
};

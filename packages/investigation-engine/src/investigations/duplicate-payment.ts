// ─── Investigation: Duplicate Payment ────────────────────────────────────────
//
// Business question: "Have we paid any invoice / vendor more than once?"
//
// One of the highest-₹, least-watched leaks: with manual entry across plants,
// the same bill gets paid twice — caught (if ever) at year-end. This scans the
// GL's payment vouchers and flags clusters that look like the same money going
// out twice.
//
// Pure & computed (Principles 5 & "pure engine"): reads only via ctx accessors +
// pure doc-parsers helpers. No LLM, no DB. Confidence is deterministic — lower
// when the payee match relied on fuzzy name similarity.

import { parseGlRows, filterPaymentRows, effectiveAmount, nameSimilarity, normaliseName, normalizeInvoiceNo } from "@aiql/doc-parsers";
import type { GlRow } from "@aiql/doc-parsers";
import type { BusinessContext } from "../context";
import { Capability } from "../capabilities";
import type { Finding, InvestigationDefinition } from "../types";

const BUSINESS_QUESTION = "Have we paid any invoice or vendor more than once?";
const NAME_SIM_THRESHOLD = 0.6;   // merge near-identical payee spellings
const WINDOW_DAYS = 30;           // same amount+payee within this window = probable dup

function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

interface Pmt {
  payee: string;   // normalised
  raw:   GlRow;
  amount: number;
  ref:   string;   // normalised invoice/reference
  date:  Date | null;
}

interface Cluster {
  payee:   string;
  amount:  number;
  rows:    Pmt[];
  fuzzy:   boolean;   // merged via similarity < 1
  exactRef: boolean;  // ≥2 rows share the same non-empty reference
  within:  boolean;   // dates within WINDOW_DAYS
}

// Greedy-cluster payments of the SAME amount whose payees are similar.
function clusterByAmount(pmts: Pmt[]): Cluster[] {
  const byAmount = new Map<number, Pmt[]>();
  for (const p of pmts) {
    const key = Math.round(p.amount);
    (byAmount.get(key) ?? byAmount.set(key, []).get(key)!).push(p);
  }

  const clusters: Cluster[] = [];
  for (const [amount, group] of byAmount) {
    if (group.length < 2) continue;
    const used = new Array(group.length).fill(false);
    for (let i = 0; i < group.length; i++) {
      if (used[i]) continue;
      const members: Pmt[] = [group[i]];
      used[i] = true;
      let fuzzy = false;
      for (let j = i + 1; j < group.length; j++) {
        if (used[j]) continue;
        const sim = nameSimilarity(group[i].payee, group[j].payee);
        if (sim >= NAME_SIM_THRESHOLD) {
          members.push(group[j]);
          used[j] = true;
          if (sim < 1) fuzzy = true;
        }
      }
      if (members.length < 2) continue;

      const refs = members.map((m) => m.ref).filter(Boolean);
      const exactRef = refs.length >= 2 && new Set(refs).size < refs.length;

      const dates = members.map((m) => m.date?.getTime()).filter((t): t is number => typeof t === "number");
      const within = dates.length >= 2 && (Math.max(...dates) - Math.min(...dates)) / 86_400_000 <= WINDOW_DAYS;

      clusters.push({ payee: members[0].payee, amount, rows: members, fuzzy, exactRef, within });
    }
  }
  return clusters;
}

function evidenceFor(c: Cluster) {
  const displayPayee = c.rows[0].raw.vendor_name ?? c.rows[0].raw.party_name ?? c.payee;
  return {
    source:      "gl_payments",
    description: `${c.rows.length} payments of ${rupees(c.amount)} to ${displayPayee}${c.exactRef ? " sharing the same invoice reference" : " within a short window"}`,
    query:       "duplicate-payment: same payee + amount" + (c.exactRef ? " + reference" : " + date window"),
    rows:        c.rows.map((r) => r.raw._raw),
    amountRs:    c.amount,
    confidence:  c.exactRef ? (c.fuzzy ? 0.75 : 0.9) : (c.fuzzy ? 0.6 : 0.75),
    references:  [displayPayee, ...c.rows.map((r) => r.raw.reference_number).filter((x): x is string => Boolean(x))],
  };
}

function payeeLabel(c: Cluster): string {
  return c.rows[0].raw.vendor_name ?? c.rows[0].raw.party_name ?? c.payee;
}

// Build one aggregate Finding for a set of clusters at a given severity.
function buildFinding(
  clusters: Cluster[],
  kind: "confirmed" | "probable",
): Finding | null {
  if (clusters.length === 0) return null;
  const dupAmount = clusters.reduce((s, c) => s + (c.rows.length - 1) * c.amount, 0);
  const vendors = [...new Set(clusters.map(payeeLabel))];
  const vendorLabel = vendors.slice(0, 3).join(", ");

  const confirmed = kind === "confirmed";
  return {
    code:     confirmed ? "DUP-PAY-001" : "DUP-PAY-002",
    category: "risk",
    severity: confirmed ? "critical" : "warning",
    title:    confirmed
      ? `${clusters.length} likely duplicate payment${clusters.length > 1 ? "s" : ""} — ${rupees(dupAmount)} paid twice`
      : `${clusters.length} possible duplicate payment${clusters.length > 1 ? "s" : ""} — ${rupees(dupAmount)} to review`,
    impactRs: dupAmount,
    businessQuestion: BUSINESS_QUESTION,
    evidence: clusters.map(evidenceFor),
    recommendation: {
      action:          confirmed
        ? `Confirm with ${vendorLabel} and recover the duplicate ${rupees(dupAmount)} (refund or adjust against the next bill).`
        : `Review these same-amount payments to ${vendorLabel}; confirm whether each is a genuine separate payment before the next payment run.`,
      owner:           "Accounts Payable",
      priority:        confirmed ? "today" : "this_week",
      expectedBenefit: `Recover / avoid ${rupees(dupAmount)} paid in error.`,
      deadline:        confirmed ? "This week" : null,
    },
    verificationSteps: [
      "Open each flagged payment voucher and confirm they reference the same bill.",
      "Check the bank statement for two debits of the same amount to the same vendor.",
      "Add a duplicate-invoice-reference check to your payment approval to prevent recurrence.",
    ],
    conclusion: confirmed
      ? `${clusters.length} payment cluster${clusters.length > 1 ? "s" : ""} show the same vendor and amount paid more than once against the same reference — ${rupees(dupAmount)} appears to have gone out twice.`
      : `${clusters.length} cluster${clusters.length > 1 ? "s" : ""} of same-vendor, same-amount payments occurred close together with no shared reference — worth confirming they aren't accidental duplicates (${rupees(dupAmount)}).`,
    resolvesWhen: "Each flagged duplicate is reversed/recovered, or confirmed as a legitimate separate payment.",
    status:       "open",
  };
}

export const DUPLICATE_PAYMENT: InvestigationDefinition = {
  id:               "duplicate-payment",
  version:          "1.0",
  title:            "Duplicate Payment Detection",
  category:         "risk",
  businessQuestion: BUSINESS_QUESTION,
  requiredCapabilities: [Capability.GENERAL_LEDGER],

  async run(ctx: BusinessContext): Promise<Finding[]> {
    const glRows = await ctx.gl!.getRawRows();
    const payments = filterPaymentRows(parseGlRows(glRows));

    const pmts: Pmt[] = payments
      .map((r) => ({
        payee:  normaliseName(r.vendor_name ?? r.party_name ?? ""),
        raw:    r,
        amount: effectiveAmount(r),
        ref:    normalizeInvoiceNo(r.reference_number),
        date:   r.transaction_date,
      }))
      .filter((p) => p.payee.length > 0 && p.amount > 0);

    const clusters = clusterByAmount(pmts);
    const confirmed = clusters.filter((c) => c.exactRef);
    const probable  = clusters.filter((c) => !c.exactRef && c.within);

    return [
      buildFinding(confirmed, "confirmed"),
      buildFinding(probable, "probable"),
    ].filter((f): f is Finding => f !== null);
  },
};

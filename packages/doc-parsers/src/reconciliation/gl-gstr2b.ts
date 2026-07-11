// GL ↔ GSTR-2B Reconciliation
// Unlike GL ↔ GSTR-1 (which checks the business's own outward filing),
// this checks whether the business is actually getting the Input Tax
// Credit its books assume it's getting — which depends on whether each
// *vendor* filed their own GSTR-1 in time. A purchase booked in the GL
// with no matching GSTR-2B entry means the vendor hasn't filed and the
// credit is at risk of being blocked or reversed.

import type { Gstr2BRow } from "../types";
import type { ReconGap, ReconResult } from "./types";
import { parseGlRows, filterPurchaseRows, effectiveAmount, sumAmount, nameSimilarity, normalizeInvoiceNo } from "./gl-utils";

const TOLERANCE = 100; // ₹100 — invoices can round differently
const CRITICAL_THRESHOLD = 10_000; // ITC at risk above this is critical, not just a review item

interface InvoiceSummary {
  invoiceNo:    string;
  taxableValue: number;
  totalTax:     number;
  itcEligible:  boolean;
  rows:         Gstr2BRow[];
}

function groupByInvoice(rows: Gstr2BRow[]): Map<string, InvoiceSummary> {
  const map = new Map<string, InvoiceSummary>();
  for (const row of rows) {
    const key = normalizeInvoiceNo(row.invoiceNo);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.taxableValue += row.taxableValue;
      existing.totalTax     += row.igst + row.cgst + row.sgst + row.cess;
      existing.itcEligible   = existing.itcEligible && row.itcEligible;
      existing.rows.push(row);
    } else {
      map.set(key, {
        invoiceNo:    key,
        taxableValue: row.taxableValue,
        totalTax:     row.igst + row.cgst + row.sgst + row.cess,
        itcEligible:  row.itcEligible,
        rows:         [row],
      });
    }
  }
  return map;
}

export function reconcileGlGstr2B(
  glRawRows:    Record<string, unknown>[],
  gstr2bRows:   Gstr2BRow[],
  connectionId: string,
): ReconResult {
  const t0 = Date.now();
  const gaps: ReconGap[] = [];

  const glRows   = filterPurchaseRows(parseGlRows(glRawRows));
  const glTotal  = sumAmount(glRows);
  const docTotal = gstr2bRows.reduce((acc, r) => acc + r.taxableValue, 0);

  // ── Check 1: Overall GL purchases vs GSTR-2B taxable total ───────────────
  const overallVariance = Math.abs(glTotal - docTotal);
  if (overallVariance > TOLERANCE) {
    gaps.push({
      code:        "G2BGL-001",
      severity:    overallVariance > 50_000 ? "critical" : "review",
      title:       "Purchases booked in GL differ from GSTR-2B taxable value",
      description: `GL purchase total: ₹${glTotal.toFixed(2)}, GSTR-2B taxable value: ₹${docTotal.toFixed(2)}. Difference: ₹${overallVariance.toFixed(2)}.`,
      glAmount:    glTotal,
      docAmount:   docTotal,
      variance:    overallVariance,
      party:       null,
      reference:   null,
      glRows:      glRows.map((r) => r._raw),
      docRows:     gstr2bRows.map((r) => r._raw),
    });
  }

  const invoiceMap = groupByInvoice(gstr2bRows);

  // ── Check 2: GL purchase invoices with no GSTR-2B entry at all ────────────
  // This is the headline bucket: the business claimed/booked the purchase,
  // but the vendor hasn't filed, so GSTN shows nothing — ITC is at risk.
  for (const gl of glRows) {
    const ref = normalizeInvoiceNo(gl.reference_number);
    if (!ref) continue;
    if (!invoiceMap.has(ref)) {
      const amount = effectiveAmount(gl);
      gaps.push({
        code:        "G2BGL-002",
        severity:    amount > CRITICAL_THRESHOLD ? "critical" : "review",
        title:       `Invoice ${ref} in GL not found in GSTR-2B — vendor may not have filed`,
        description: `GL records a purchase of ₹${amount.toFixed(2)} against invoice ${ref}, but it does not appear in GSTR-2B. The supplier has likely not filed their GSTR-1 for this period — the related ITC is at risk of being blocked or reversed.`,
        glAmount:    amount,
        docAmount:   null,
        variance:    amount,
        party:       gl.vendor_name ?? gl.party_name,
        reference:   ref,
        glRows:      [gl._raw],
        docRows:     [],
      });
    }
  }

  // ── Check 3: GSTR-2B invoices with no GL entry — ITC available but unclaimed
  const glRefSet = new Set(
    glRows.map((r) => normalizeInvoiceNo(r.reference_number)).filter(Boolean)
  );
  for (const [invoiceNo, inv] of invoiceMap) {
    if (!glRefSet.has(invoiceNo)) {
      gaps.push({
        code:        "G2BGL-003",
        severity:    "review",
        title:       `Invoice ${invoiceNo} in GSTR-2B not found in GL`,
        description: `GSTR-2B shows invoice ${invoiceNo} (taxable ₹${inv.taxableValue.toFixed(2)}) as available for ITC, but it has not been booked in the GL. This credit may be going unclaimed.`,
        glAmount:    null,
        docAmount:   inv.taxableValue,
        variance:    inv.taxableValue,
        party:       inv.rows[0]?.supplierName ?? null,
        reference:   invoiceNo,
        glRows:      [],
        docRows:     inv.rows.map((r) => r._raw),
      });
    }
  }

  // ── Check 4: Matched invoices where ITC is marked ineligible ──────────────
  for (const gl of glRows) {
    const ref = normalizeInvoiceNo(gl.reference_number);
    if (!ref) continue;
    const inv = invoiceMap.get(ref);
    if (!inv || inv.itcEligible) continue;
    const reason = inv.rows[0]?.itcReason;
    gaps.push({
      code:        "G2BGL-004",
      severity:    "review",
      title:       `ITC ineligible for invoice ${ref} despite being booked`,
      description: `Invoice ${ref} is booked in the GL but GSTR-2B marks the credit as ineligible${reason ? ` (${reason})` : ""}. Verify whether ITC was claimed on this invoice.`,
      glAmount:    effectiveAmount(gl),
      docAmount:   inv.taxableValue,
      variance:    inv.totalTax,
      party:       gl.vendor_name ?? gl.party_name,
      reference:   ref,
      glRows:      [gl._raw],
      docRows:     inv.rows.map((r) => r._raw),
    });
  }

  // ── Check 5: Party name mismatches on matched invoices ────────────────────
  for (const gl of glRows) {
    const ref = normalizeInvoiceNo(gl.reference_number);
    if (!ref) continue;
    const inv = invoiceMap.get(ref);
    if (!inv) continue;
    const glParty  = gl.vendor_name ?? gl.party_name ?? "";
    const docParty = inv.rows[0]?.supplierName ?? "";
    if (glParty && docParty && nameSimilarity(glParty, docParty) < 0.4) {
      gaps.push({
        code:        "G2BGL-005",
        severity:    "info",
        title:       `Supplier name mismatch for invoice ${ref}`,
        description: `GL: "${glParty}" vs GSTR-2B: "${docParty}". May indicate a data entry error or GSTIN mismatch.`,
        glAmount:    effectiveAmount(gl),
        docAmount:   inv.taxableValue,
        variance:    0,
        party:       glParty,
        reference:   ref,
        glRows:      [gl._raw],
        docRows:     inv.rows.map((r) => r._raw),
      });
    }
  }

  // ── Build result ───────────────────────────────────────────────────────────
  const bySeverity = { critical: 0, review: 0, info: 0 };
  let totalVariance = 0;
  for (const g of gaps) {
    bySeverity[g.severity]++;
    totalVariance += g.variance;
  }

  return {
    type:           "GL_GSTR2B",
    connectionId,
    reconciledAt:   new Date(),
    durationMs:     Date.now() - t0,
    glTotal,
    docTotal,
    matchedTotal:   Math.max(0, Math.min(glTotal, docTotal) - overallVariance),
    unmatchedTotal: totalVariance,
    totalGaps:      gaps.length,
    bySeverity,
    gaps,
  };
}

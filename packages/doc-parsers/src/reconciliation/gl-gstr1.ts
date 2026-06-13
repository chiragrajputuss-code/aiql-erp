// GL ↔ GSTR-1 Reconciliation
// Checks: total sales in GL vs total taxable value in GSTR-1,
//         per-invoice matching, GST rate coverage.

import type { Gstr1Row } from "../types";
import type { ReconGap, ReconResult } from "./types";
import { parseGlRows, filterSalesRows, effectiveAmount, sumAmount, nameSimilarity } from "./gl-utils";

const TOLERANCE    = 100; // ₹100 — invoices can round differently
const RATE_TOLERANCE = 0.01; // 1% tolerance on implied GST rate

// ─── Implied GST rate from a GL amount and GST amount ────────────────────────

function impliedGstRate(taxableValue: number, gst: number): number | null {
  if (taxableValue <= 0) return null;
  return gst / taxableValue;
}

// ─── Group GSTR-1 rows by invoice number ─────────────────────────────────────

interface InvoiceSummary {
  invoiceNo:    string;
  taxableValue: number;
  totalTax:     number;
  rows:         Gstr1Row[];
}

function groupByInvoice(rows: Gstr1Row[]): Map<string, InvoiceSummary> {
  const map = new Map<string, InvoiceSummary>();
  for (const row of rows) {
    const key = row.invoiceNo.trim().toUpperCase();
    const existing = map.get(key);
    if (existing) {
      existing.taxableValue += row.taxableValue;
      existing.totalTax     += row.igst + row.cgst + row.sgst + row.cess;
      existing.rows.push(row);
    } else {
      map.set(key, {
        invoiceNo:    key,
        taxableValue: row.taxableValue,
        totalTax:     row.igst + row.cgst + row.sgst + row.cess,
        rows:         [row],
      });
    }
  }
  return map;
}

// ─── Main reconciliation ──────────────────────────────────────────────────────

export function reconcileGlGstr1(
  glRawRows:    Record<string, unknown>[],
  gstr1Rows:    Gstr1Row[],
  connectionId: string,
): ReconResult {
  const t0 = Date.now();
  const gaps: ReconGap[] = [];

  const glRows  = filterSalesRows(parseGlRows(glRawRows));
  const glTotal = sumAmount(glRows);
  const docTotal = gstr1Rows.reduce((acc, r) => acc + r.taxableValue, 0);

  // ── Check 1: Overall GL sales vs GSTR-1 total ────────────────────────────
  const overallVariance = Math.abs(glTotal - docTotal);
  if (overallVariance > TOLERANCE) {
    gaps.push({
      code:        "G1GL-001",
      severity:    overallVariance > 50_000 ? "critical" : "review",
      title:       "Sales booked in GL differ from GSTR-1 taxable value",
      description: `GL sales total: ₹${glTotal.toFixed(2)}, GSTR-1 taxable value: ₹${docTotal.toFixed(2)}. Difference: ₹${overallVariance.toFixed(2)}.`,
      glAmount:    glTotal,
      docAmount:   docTotal,
      variance:    overallVariance,
      party:       null,
      reference:   null,
      glRows:      glRows.map((r) => r._raw),
      docRows:     gstr1Rows.map((r) => r._raw),
    });
  }

  // ── Check 2: Invoice-level matching (GL reference_number vs GSTR-1 invoice)
  const invoiceMap = groupByInvoice(gstr1Rows);

  // GL invoices without GSTR-1 entry
  for (const gl of glRows) {
    const ref = gl.reference_number?.trim().toUpperCase();
    if (!ref) continue;
    if (!invoiceMap.has(ref)) {
      gaps.push({
        code:        "G1GL-002",
        severity:    "review",
        title:       `Invoice ${ref} in GL not found in GSTR-1`,
        description: `GL records invoice ${ref} (₹${effectiveAmount(gl).toFixed(2)}) but it is missing from GSTR-1 outward supplies. Risk of under-reporting.`,
        glAmount:    effectiveAmount(gl),
        docAmount:   null,
        variance:    effectiveAmount(gl),
        party:       gl.customer_name ?? gl.party_name,
        reference:   ref,
        glRows:      [gl._raw],
        docRows:     [],
      });
    }
  }

  // GSTR-1 invoices without GL entry
  const glRefSet = new Set(
    glRows.map((r) => r.reference_number?.trim().toUpperCase()).filter(Boolean)
  );
  for (const [invoiceNo, inv] of invoiceMap) {
    if (!glRefSet.has(invoiceNo)) {
      gaps.push({
        code:        "G1GL-003",
        severity:    "review",
        title:       `Invoice ${invoiceNo} in GSTR-1 not found in GL`,
        description: `GSTR-1 records invoice ${invoiceNo} (taxable ₹${inv.taxableValue.toFixed(2)}) but no matching GL entry found. May be omitted from books.`,
        glAmount:    null,
        docAmount:   inv.taxableValue,
        variance:    inv.taxableValue,
        party:       inv.rows[0]?.receiverName ?? null,
        reference:   invoiceNo,
        glRows:      [],
        docRows:     inv.rows.map((r) => r._raw),
      });
    }
  }

  // ── Check 3: IGST-only B2B invoices that should have CGST+SGST ───────────
  // IGST applies to inter-state, CGST+SGST for intra-state. If all invoices
  // are tagged same state (B2B) but only IGST shown → wrong place of supply.
  const b2bRows = gstr1Rows.filter((r) => r.supplyType === "B2B" && r.receiverGstin);
  const mixedTax = b2bRows.filter((r) => r.igst > 0 && (r.cgst > 0 || r.sgst > 0));
  if (mixedTax.length > 0) {
    gaps.push({
      code:        "G1GL-004",
      severity:    "review",
      title:       `${mixedTax.length} B2B invoice(s) have both IGST and CGST/SGST`,
      description: `An invoice should have EITHER IGST (inter-state) OR CGST+SGST (intra-state). Both together suggests a data entry error.`,
      glAmount:    null,
      docAmount:   mixedTax.reduce((a, r) => a + r.taxableValue, 0),
      variance:    mixedTax.reduce((a, r) => a + r.igst + r.cgst + r.sgst, 0),
      party:       null,
      reference:   null,
      glRows:      [],
      docRows:     mixedTax.map((r) => r._raw),
    });
  }

  // ── Check 4: Zero-GST large invoices (potential exempt flag error) ────────
  const zeroGstLarge = gstr1Rows.filter(
    (r) => r.taxableValue > 100_000 && (r.igst + r.cgst + r.sgst) === 0 && r.supplyType !== "NIL"
  );
  if (zeroGstLarge.length > 0) {
    const exposure = zeroGstLarge.reduce((a, r) => a + r.taxableValue, 0);
    gaps.push({
      code:        "G1GL-005",
      severity:    "info",
      title:       `${zeroGstLarge.length} high-value invoice(s) with zero GST in GSTR-1`,
      description: `Invoices above ₹1L with zero GST and non-NIL supply type. Verify these are genuinely exempt/zero-rated and not a data entry error.`,
      glAmount:    null,
      docAmount:   exposure,
      variance:    0,
      party:       null,
      reference:   null,
      glRows:      [],
      docRows:     zeroGstLarge.map((r) => r._raw),
    });
  }

  // ── Check 5: Party name mismatches between GL and GSTR-1 ─────────────────
  for (const gl of glRows) {
    const ref = gl.reference_number?.trim().toUpperCase();
    if (!ref) continue;
    const inv = invoiceMap.get(ref);
    if (!inv) continue;
    const glParty = gl.customer_name ?? gl.party_name ?? "";
    const docParty = inv.rows[0]?.receiverName ?? "";
    if (glParty && docParty && nameSimilarity(glParty, docParty) < 0.4) {
      gaps.push({
        code:        "G1GL-006",
        severity:    "info",
        title:       `Party name mismatch for invoice ${ref}`,
        description: `GL: "${glParty}" vs GSTR-1: "${docParty}". May cause GSTIN validation failure.`,
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

  // ── Build result ──────────────────────────────────────────────────────────
  const bySeverity = { critical: 0, review: 0, info: 0 };
  let totalVariance = 0;
  for (const g of gaps) {
    bySeverity[g.severity]++;
    totalVariance += g.variance;
  }

  return {
    type:           "GL_GSTR1",
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

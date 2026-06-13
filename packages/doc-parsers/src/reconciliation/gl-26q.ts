// GL ↔ Form 26Q Reconciliation
// Checks: total TDS booked in GL vs total TDS deposited per Form 26Q,
//         per-deductee breakdown, section coverage.

import type { Form26QRow } from "../types";
import type { ReconGap, ReconResult } from "./types";
import {
  parseGlRows, filterTdsRows, effectiveAmount, sumAmount, nameSimilarity,
} from "./gl-utils";

const TOLERANCE = 1; // ₹1 — floating point noise in INR

// ─── Aggregate Form 26Q by deductee name (normalised) ────────────────────────

interface DeducteeTotal {
  name:       string;
  pan:        string;
  deducted:   number;
  deposited:  number;
  rows:       Form26QRow[];
}

function groupByDeductee(rows: Form26QRow[]): Map<string, DeducteeTotal> {
  const map = new Map<string, DeducteeTotal>();
  for (const row of rows) {
    const key = row.deducteePan || row.deducteeName.toLowerCase().trim();
    const existing = map.get(key);
    if (existing) {
      existing.deducted  += row.tdsDeducted;
      existing.deposited += row.tdsDeposited;
      existing.rows.push(row);
    } else {
      map.set(key, {
        name:      row.deducteeName,
        pan:       row.deducteePan,
        deducted:  row.tdsDeducted,
        deposited: row.tdsDeposited,
        rows:      [row],
      });
    }
  }
  return map;
}

// ─── Main reconciliation ──────────────────────────────────────────────────────

export function reconcileGl26Q(
  glRawRows:   Record<string, unknown>[],
  form26QRows: Form26QRow[],
  connectionId: string,
): ReconResult {
  const t0 = Date.now();
  const gaps: ReconGap[] = [];

  const glRows   = filterTdsRows(parseGlRows(glRawRows));
  const glTotal  = sumAmount(glRows);
  const docTotal = form26QRows.reduce((acc, r) => acc + r.tdsDeducted, 0);

  // ── Check 1: Overall GL TDS vs 26Q total ─────────────────────────────────
  const overallVariance = Math.abs(glTotal - docTotal);
  if (overallVariance > TOLERANCE) {
    gaps.push({
      code:        "GL26Q-001",
      severity:    overallVariance > 10_000 ? "critical" : "review",
      title:       "TDS booked in GL differs from Form 26Q total",
      description: `GL shows ₹${glTotal.toFixed(2)} TDS vs ₹${docTotal.toFixed(2)} in Form 26Q. Difference: ₹${overallVariance.toFixed(2)}.`,
      glAmount:    glTotal,
      docAmount:   docTotal,
      variance:    overallVariance,
      party:       null,
      reference:   null,
      glRows:      glRows.map((r) => r._raw),
      docRows:     form26QRows.map((r) => r._raw),
    });
  }

  // ── Check 2: Per-deductee match ───────────────────────────────────────────
  const deducteeMap = groupByDeductee(form26QRows);

  for (const [, deductee] of deducteeMap) {
    // Find matching GL rows by name similarity or party_name
    const matched = glRows.filter((gl) => {
      const party = gl.party_name ?? gl.vendor_name ?? gl.customer_name ?? "";
      return nameSimilarity(party, deductee.name) > 0.5;
    });
    const glDeducteeAmount = matched.reduce((acc, r) => acc + effectiveAmount(r), 0);

    if (matched.length === 0) {
      // 26Q entry has no GL counterpart
      gaps.push({
        code:        "GL26Q-002",
        severity:    "review",
        title:       `No GL entries found for deductee: ${deductee.name}`,
        description: `Form 26Q records ₹${deductee.deducted.toFixed(2)} TDS for ${deductee.name} (PAN: ${deductee.pan || "N/A"}) but no matching GL entries were found.`,
        glAmount:    null,
        docAmount:   deductee.deducted,
        variance:    deductee.deducted,
        party:       deductee.name,
        reference:   deductee.pan || null,
        glRows:      [],
        docRows:     deductee.rows.map((r) => r._raw),
      });
      continue;
    }

    const variance = Math.abs(glDeducteeAmount - deductee.deducted);
    if (variance > TOLERANCE) {
      gaps.push({
        code:        "GL26Q-003",
        severity:    variance > 5_000 ? "critical" : "review",
        title:       `TDS mismatch for ${deductee.name}`,
        description: `GL: ₹${glDeducteeAmount.toFixed(2)} vs Form 26Q: ₹${deductee.deducted.toFixed(2)} (diff: ₹${variance.toFixed(2)}).`,
        glAmount:    glDeducteeAmount,
        docAmount:   deductee.deducted,
        variance,
        party:       deductee.name,
        reference:   deductee.pan || null,
        glRows:      matched.map((r) => r._raw),
        docRows:     deductee.rows.map((r) => r._raw),
      });
    }
  }

  // ── Check 3: GL TDS rows with no 26Q match ───────────────────────────────
  for (const gl of glRows) {
    const party = gl.party_name ?? gl.vendor_name ?? gl.customer_name ?? "";
    if (!party) continue;
    const hasMatch = [...deducteeMap.values()].some(
      (d) => nameSimilarity(party, d.name) > 0.5
    );
    if (!hasMatch) {
      gaps.push({
        code:        "GL26Q-004",
        severity:    "info",
        title:       `GL TDS entry not found in Form 26Q: ${party || "Unknown"}`,
        description: `GL row for "${party}" (₹${effectiveAmount(gl).toFixed(2)}) has no matching deductee in Form 26Q. May be a GL classification or party name mismatch.`,
        glAmount:    effectiveAmount(gl),
        docAmount:   null,
        variance:    effectiveAmount(gl),
        party:       party || null,
        reference:   gl.reference_number,
        glRows:      [gl._raw],
        docRows:     [],
      });
    }
  }

  // ── Check 4: Deducted vs deposited gap in 26Q ────────────────────────────
  const totalDeducted  = form26QRows.reduce((acc, r) => acc + r.tdsDeducted, 0);
  const totalDeposited = form26QRows.reduce((acc, r) => acc + r.tdsDeposited, 0);
  const depositGap     = totalDeducted - totalDeposited;
  if (depositGap > TOLERANCE) {
    gaps.push({
      code:        "GL26Q-005",
      severity:    depositGap > 5_000 ? "critical" : "review",
      title:       "TDS deducted but not fully deposited (Form 26Q)",
      description: `₹${depositGap.toFixed(2)} was deducted from vendors but not yet deposited with the government. This may attract interest under section 201.`,
      glAmount:    null,
      docAmount:   depositGap,
      variance:    depositGap,
      party:       null,
      reference:   null,
      glRows:      [],
      docRows:     form26QRows.filter((r) => r.tdsDeducted > r.tdsDeposited).map((r) => r._raw),
    });
  }

  // ── Build result ──────────────────────────────────────────────────────────
  const bySeverity = { critical: 0, review: 0, info: 0 };
  let totalVariance = 0;
  for (const g of gaps) {
    bySeverity[g.severity]++;
    totalVariance += g.variance;
  }

  const matchedTotal = Math.min(glTotal, docTotal) - Math.max(0, overallVariance);

  return {
    type:           "GL_26Q",
    connectionId,
    reconciledAt:   new Date(),
    durationMs:     Date.now() - t0,
    glTotal,
    docTotal,
    matchedTotal:   Math.max(0, matchedTotal),
    unmatchedTotal: totalVariance,
    totalGaps:      gaps.length,
    bySeverity,
    gaps,
  };
}

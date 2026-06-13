import type { Form26QRow, ScanIssue, DocScanResult } from "../types";
import { getSection, isKnownSection, expectedTdsRate } from "./sections";

// ─── Validation helpers ───────────────────────────────────────────────────────

const PAN_REGEX   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const BSR_REGEX   = /^\d{7}$/;

function isValidPan(pan: string): boolean {
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

function isValidBsr(bsr: string): boolean {
  return BSR_REGEX.test(bsr.trim());
}

// Tolerance for floating point / rounding differences (0.5%)
const RATE_TOLERANCE    = 0.005;
// If deducted differs from deposited by more than this amount → flag
const DEPOSIT_GAP_LIMIT = 1;    // ₹1 (accounts for paise rounding)

// ─── Individual checks ────────────────────────────────────────────────────────

function checkPanFormat(rows: Form26QRow[]): ScanIssue | null {
  const invalid = rows.filter((r) => r.deducteePan && !isValidPan(r.deducteePan));
  if (invalid.length === 0) return null;

  return {
    code:         "26Q-PAN-001",
    severity:     "critical",
    category:     "PAN Validation",
    title:        `${invalid.length} deductee PAN${invalid.length !== 1 ? "s" : ""} invalid format`,
    description:  "PAN must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F). Invalid PANs will be rejected by TRACES.",
    affectedRows: invalid.length,
    exposure:     invalid.reduce((s, r) => s + r.tdsDeducted, 0),
    examples:     invalid.slice(0, 5).map((r) => ({
      row:          r._rowIndex + 1,
      deductee:     r.deducteeName,
      pan:          r.deducteePan,
      tdsDeducted:  r.tdsDeducted,
    })),
  };
}

function checkMissingPan(rows: Form26QRow[]): ScanIssue | null {
  const missing = rows.filter((r) => !r.deducteePan || r.deducteePan === "PANNOTAVBL" || r.deducteePan === "PANINVALID");
  if (missing.length === 0) return null;

  return {
    code:         "26Q-PAN-002",
    severity:     "review",
    category:     "PAN Validation",
    title:        `${missing.length} deductee${missing.length !== 1 ? "s" : ""} missing or invalid PAN`,
    description:  "TDS rate is 20% when PAN is not available. Verify these deductees and obtain valid PANs to avoid higher deduction.",
    affectedRows: missing.length,
    exposure:     missing.reduce((s, r) => s + r.grossAmount * 0.20 - r.tdsDeducted, 0),
    examples:     missing.slice(0, 5).map((r) => ({
      row:         r._rowIndex + 1,
      deductee:    r.deducteeName,
      pan:         r.deducteePan,
      grossAmount: r.grossAmount,
    })),
  };
}

function checkBsrFormat(rows: Form26QRow[]): ScanIssue | null {
  const invalid = rows.filter((r) => r.bsrCode && !isValidBsr(r.bsrCode));
  if (invalid.length === 0) return null;

  return {
    code:         "26Q-BSR-001",
    severity:     "critical",
    category:     "Challan Validation",
    title:        `${invalid.length} challan${invalid.length !== 1 ? "s" : ""} with invalid BSR code`,
    description:  "BSR code must be exactly 7 digits. Invalid BSR codes cause challan mismatch on TRACES and delays in credit.",
    affectedRows: invalid.length,
    exposure:     invalid.reduce((s, r) => s + r.tdsDeposited, 0),
    examples:     invalid.slice(0, 5).map((r) => ({
      row:      r._rowIndex + 1,
      bsrCode:  r.bsrCode,
      deductee: r.deducteeName,
      amount:   r.tdsDeposited,
    })),
  };
}

function checkUnknownSection(rows: Form26QRow[]): ScanIssue | null {
  const unknown = rows.filter((r) => r.section && !isKnownSection(r.section));
  if (unknown.length === 0) return null;

  return {
    code:         "26Q-SEC-001",
    severity:     "review",
    category:     "Section Validation",
    title:        `${unknown.length} entr${unknown.length !== 1 ? "ies" : "y"} with unrecognised TDS section`,
    description:  "Section codes should match known Income Tax Act sections (194C, 194J, 194H, etc.). Verify these entries.",
    affectedRows: unknown.length,
    exposure:     null,
    examples:     unknown.slice(0, 5).map((r) => ({
      row:     r._rowIndex + 1,
      section: r.section,
      nature:  r.natureOfPayment,
      amount:  r.grossAmount,
    })),
  };
}

function checkTdsRateDeviation(rows: Form26QRow[]): ScanIssue | null {
  const deviations: Array<{ row: Form26QRow; expectedRate: number; actualRate: number }> = [];

  for (const row of rows) {
    if (row.grossAmount <= 0) continue;
    const sectionDef = getSection(row.section);
    if (!sectionDef) continue;

    const expectedRate = expectedTdsRate(sectionDef, row.deducteeType);
    if (expectedRate === 0) continue;  // Variable rate (e.g. salary)

    const actualRate = row.tdsDeducted / row.grossAmount;

    // Allow for lower deduction certificate
    if (row.certificateNo) continue;

    // Flag if actual rate is significantly lower than expected
    if (actualRate < expectedRate - RATE_TOLERANCE && row.tdsDeducted > 0) {
      deviations.push({ row, expectedRate, actualRate });
    }

    // Flag if NO TDS deducted when threshold exceeded
    if (row.tdsDeducted === 0 && row.grossAmount >= sectionDef.threshold) {
      deviations.push({ row, expectedRate, actualRate: 0 });
    }
  }

  if (deviations.length === 0) return null;

  const exposure = deviations.reduce((s, { row, expectedRate }) => {
    return s + Math.max(0, row.grossAmount * expectedRate - row.tdsDeducted);
  }, 0);

  return {
    code:         "26Q-RATE-001",
    severity:     "review",
    category:     "TDS Rate Check",
    title:        `${deviations.length} entr${deviations.length !== 1 ? "ies" : "y"} with lower-than-expected TDS rate`,
    description:  "TDS deducted is below the standard rate for the section. If no lower deduction certificate exists, this may result in interest liability.",
    affectedRows: deviations.length,
    exposure,
    examples:     deviations.slice(0, 5).map(({ row, expectedRate, actualRate }) => ({
      row:          row._rowIndex + 1,
      deductee:     row.deducteeName,
      section:      row.section,
      grossAmount:  row.grossAmount,
      expectedRate: `${(expectedRate * 100).toFixed(1)}%`,
      actualRate:   `${(actualRate * 100).toFixed(2)}%`,
      shortfall:    row.grossAmount * expectedRate - row.tdsDeducted,
    })),
  };
}

function checkDeductedVsDeposited(rows: Form26QRow[]): ScanIssue | null {
  // Group by challan to check if total deducted matches deposited
  const challanMap = new Map<string, { deducted: number; deposited: number; rows: Form26QRow[] }>();

  for (const row of rows) {
    const key = `${row.bsrCode}-${row.challanDate?.toISOString().slice(0, 10)}-${row.challanSerialNo}`;
    const existing = challanMap.get(key);
    if (existing) {
      existing.deducted  += row.tdsDeducted;
      existing.deposited  = row.tdsDeposited; // Same challan, deposited is constant
      existing.rows.push(row);
    } else {
      challanMap.set(key, {
        deducted:  row.tdsDeducted,
        deposited: row.tdsDeposited,
        rows:      [row],
      });
    }
  }

  const gaps: Array<{ key: string; deducted: number; deposited: number; gap: number; rows: Form26QRow[] }> = [];

  for (const [key, data] of challanMap.entries()) {
    if (data.deposited > 0) {
      const gap = Math.abs(data.deducted - data.deposited);
      if (gap > DEPOSIT_GAP_LIMIT) {
        gaps.push({ key, ...data, gap });
      }
    }
  }

  if (gaps.length === 0) return null;

  const totalGap = gaps.reduce((s, g) => s + g.gap, 0);

  return {
    code:         "26Q-DEP-001",
    severity:     "critical",
    category:     "Deducted vs Deposited",
    title:        `₹${(totalGap / 100).toFixed(0)} gap between TDS deducted and deposited`,
    description:  "TDS deducted from deductees should match amount deposited via challan. Gaps indicate potential under-deposit which attracts interest at 1.5% per month.",
    affectedRows: gaps.reduce((s, g) => s + g.rows.length, 0),
    exposure:     totalGap,
    examples:     gaps.slice(0, 5).map((g) => ({
      challan:   g.key,
      deducted:  g.deducted,
      deposited: g.deposited,
      gap:       g.gap,
    })),
  };
}

function checkMissingChallanDetails(rows: Form26QRow[]): ScanIssue | null {
  const missing = rows.filter(
    (r) => r.tdsDeducted > 0 && (!r.bsrCode || !r.challanSerialNo || !r.challanDate),
  );
  if (missing.length === 0) return null;

  return {
    code:         "26Q-CHN-001",
    severity:     "review",
    category:     "Challan Validation",
    title:        `${missing.length} TDS entr${missing.length !== 1 ? "ies" : "y"} missing challan details`,
    description:  "BSR code, challan serial number, and deposit date are required for each TDS entry. Missing details may cause mismatch on TRACES.",
    affectedRows: missing.length,
    exposure:     missing.reduce((s, r) => s + r.tdsDeducted, 0),
    examples:     missing.slice(0, 5).map((r) => ({
      row:      r._rowIndex + 1,
      deductee: r.deducteeName,
      amount:   r.tdsDeducted,
      bsr:      r.bsrCode || "(missing)",
      serial:   r.challanSerialNo || "(missing)",
    })),
  };
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export function scanForm26Q(
  rows:         Form26QRow[],
  connectionId: string,
): DocScanResult {
  const startMs = Date.now();

  const checks = [
    checkPanFormat,
    checkMissingPan,
    checkBsrFormat,
    checkUnknownSection,
    checkTdsRateDeviation,
    checkDeductedVsDeposited,
    checkMissingChallanDetails,
  ];

  const issues: ScanIssue[] = checks
    .map((fn) => fn(rows))
    .filter((i): i is ScanIssue => i !== null);

  const bySeverity = { critical: 0, review: 0, info: 0 };
  for (const issue of issues) bySeverity[issue.severity]++;

  const totalExposure = issues.reduce((s, i) => s + (i.exposure ?? 0), 0);

  return {
    documentType:  "TDS_RETURN_26Q",
    connectionId,
    scannedAt:     new Date(),
    durationMs:    Date.now() - startMs,
    totalIssues:   issues.length,
    bySeverity,
    totalExposure,
    issues,
  };
}

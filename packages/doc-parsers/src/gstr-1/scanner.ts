import type { Gstr1Row, ScanIssue, DocScanResult } from "../types";

// ─── Validation constants ─────────────────────────────────────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
// Valid Indian state codes (01–37 + special territories 97, 99)
const VALID_STATE_CODES = new Set([
  "01","02","03","04","05","06","07","08","09","10",
  "11","12","13","14","15","16","17","18","19","20",
  "21","22","23","24","25","26","27","28","29","30",
  "31","32","33","34","35","36","37","97","99",
]);
// Tolerance for tax calculation check (0.5%)
const TAX_TOLERANCE = 0.005;

// Known GST rates as multipliers of taxable value
const KNOWN_GST_RATES = [0, 0.05, 0.12, 0.18, 0.28];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidGstin(g: string): boolean {
  return GSTIN_REGEX.test(g.trim().toUpperCase());
}

function isIntraState(supplierStateCode: string, placeOfSupply: string): boolean {
  // Extract state code from place of supply (first 2 chars if numeric)
  const pos = placeOfSupply.trim().slice(0, 2);
  return pos === supplierStateCode.trim();
}

// ─── Checks ───────────────────────────────────────────────────────────────────

function checkGstinFormat(rows: Gstr1Row[]): ScanIssue | null {
  const invalid = rows.filter(
    (r) => r.receiverGstin && !isValidGstin(r.receiverGstin),
  );
  if (invalid.length === 0) return null;

  return {
    code:         "G1-GSTIN-001",
    severity:     "critical",
    category:     "GSTIN Validation",
    title:        `${invalid.length} invoice${invalid.length !== 1 ? "s" : ""} with invalid receiver GSTIN`,
    description:  "GSTIN must be 15 characters: 2-digit state + 10-char PAN + entity indicator + Z + checksum. Invalid GSTINs will be rejected by GSTN.",
    affectedRows: invalid.length,
    exposure:     invalid.reduce((s, r) => s + r.invoiceValue, 0),
    examples:     invalid.slice(0, 5).map((r) => ({
      row:      r._rowIndex + 1,
      invoice:  r.invoiceNo,
      gstin:    r.receiverGstin,
      value:    r.invoiceValue,
    })),
  };
}

function checkPlaceOfSupply(rows: Gstr1Row[]): ScanIssue | null {
  const invalid = rows.filter((r) => {
    if (!r.placeOfSupply) return true;
    const code = r.placeOfSupply.trim().slice(0, 2);
    return !VALID_STATE_CODES.has(code);
  });
  if (invalid.length === 0) return null;

  return {
    code:         "G1-POS-001",
    severity:     "review",
    category:     "Place of Supply",
    title:        `${invalid.length} invoice${invalid.length !== 1 ? "s" : ""} with invalid place of supply code`,
    description:  "Place of supply should start with a valid 2-digit state code (01–37). Incorrect POS affects IGST/CGST/SGST split.",
    affectedRows: invalid.length,
    exposure:     null,
    examples:     invalid.slice(0, 5).map((r) => ({
      row:     r._rowIndex + 1,
      invoice: r.invoiceNo,
      pos:     r.placeOfSupply,
    })),
  };
}

function checkTaxSplit(rows: Gstr1Row[], supplierStateCode = "27"): ScanIssue | null {
  // For intra-state: should have CGST+SGST, not IGST
  // For inter-state: should have IGST, not CGST+SGST
  const wrongSplit: Gstr1Row[] = [];

  for (const row of rows) {
    if (row.reverseCharge) continue;  // RCM invoices handled differently
    if (row.supplyType === "EXPORT") continue;

    const hasIgst    = row.igst > 0;
    const hasCgstSgst = row.cgst > 0 || row.sgst > 0;
    const intraState = isIntraState(supplierStateCode, row.placeOfSupply);

    if (intraState && hasIgst && !hasCgstSgst) {
      wrongSplit.push(row);
    } else if (!intraState && !hasIgst && hasCgstSgst) {
      wrongSplit.push(row);
    }
  }

  if (wrongSplit.length === 0) return null;

  return {
    code:         "G1-TAX-001",
    severity:     "critical",
    category:     "Tax Split",
    title:        `${wrongSplit.length} invoice${wrongSplit.length !== 1 ? "s" : ""} with incorrect IGST/CGST+SGST split`,
    description:  "Intra-state supplies must use CGST+SGST. Inter-state supplies must use IGST. Incorrect split will cause ITC mismatch at recipient.",
    affectedRows: wrongSplit.length,
    exposure:     wrongSplit.reduce((s, r) => s + r.igst + r.cgst + r.sgst, 0),
    examples:     wrongSplit.slice(0, 5).map((r) => ({
      row:     r._rowIndex + 1,
      invoice: r.invoiceNo,
      pos:     r.placeOfSupply,
      igst:    r.igst,
      cgst:    r.cgst,
      sgst:    r.sgst,
    })),
  };
}

function checkTaxCalculation(rows: Gstr1Row[]): ScanIssue | null {
  const wrong: Array<{ row: Gstr1Row; expected: number; actual: number }> = [];

  for (const row of rows) {
    if (row.taxableValue <= 0) continue;

    const totalTax  = row.igst + row.cgst + row.sgst;
    const effectiveRate = totalTax / row.taxableValue;

    // Check if total tax is consistent with a known GST rate
    const closestRate = KNOWN_GST_RATES.reduce((prev, curr) =>
      Math.abs(curr - effectiveRate) < Math.abs(prev - effectiveRate) ? curr : prev,
    );

    if (Math.abs(effectiveRate - closestRate) > TAX_TOLERANCE && totalTax > 100) {
      wrong.push({ row, expected: row.taxableValue * closestRate, actual: totalTax });
    }
  }

  if (wrong.length === 0) return null;

  return {
    code:         "G1-TAX-002",
    severity:     "review",
    category:     "Tax Calculation",
    title:        `${wrong.length} invoice${wrong.length !== 1 ? "s" : ""} with unexpected tax amount`,
    description:  "Tax amount doesn't match standard GST rates (0%, 5%, 12%, 18%, 28%). Verify these invoices for data entry errors.",
    affectedRows: wrong.length,
    exposure:     wrong.reduce((s, { row }) => s + row.taxableValue, 0),
    examples:     wrong.slice(0, 5).map(({ row, expected, actual }) => ({
      row:          row._rowIndex + 1,
      invoice:      row.invoiceNo,
      taxableValue: row.taxableValue,
      expectedTax:  expected.toFixed(2),
      actualTax:    actual.toFixed(2),
    })),
  };
}

function checkDuplicateInvoices(rows: Gstr1Row[]): ScanIssue | null {
  const seen   = new Map<string, Gstr1Row[]>();

  for (const row of rows) {
    const key = row.invoiceNo.trim().toLowerCase();
    const existing = seen.get(key) ?? [];
    existing.push(row);
    seen.set(key, existing);
  }

  const duplicates = [...seen.values()].filter((g) => g.length > 1);
  if (duplicates.length === 0) return null;

  const affectedRows = duplicates.reduce((s, g) => s + g.length, 0);

  return {
    code:         "G1-DUP-001",
    severity:     "critical",
    category:     "Duplicate Invoices",
    title:        `${duplicates.length} duplicate invoice number${duplicates.length !== 1 ? "s" : ""} found`,
    description:  "Duplicate invoice numbers in GSTR-1 will be rejected by GSTN and may inflate reported turnover.",
    affectedRows,
    exposure:     duplicates.flat().reduce((s, r) => s + r.invoiceValue, 0),
    examples:     duplicates.slice(0, 5).map((group) => ({
      invoiceNo: group[0].invoiceNo,
      count:     group.length,
      rows:      group.map((r) => r._rowIndex + 1),
      totalValue: group.reduce((s, r) => s + r.invoiceValue, 0),
    })),
  };
}

function checkMissingHsn(rows: Gstr1Row[]): ScanIssue | null {
  const missing = rows.filter((r) => r.invoiceValue >= 50000 && !r.hsnCode);
  if (missing.length === 0) return null;

  return {
    code:         "G1-HSN-001",
    severity:     "info",
    category:     "HSN/SAC Code",
    title:        `${missing.length} invoice${missing.length !== 1 ? "s" : ""} above ₹50K missing HSN/SAC code`,
    description:  "HSN/SAC code is mandatory for invoices above ₹50,000 (mandatory for taxpayers with turnover above ₹5Cr in all invoices). Add codes to avoid GSTN query.",
    affectedRows: missing.length,
    exposure:     null,
    examples:     missing.slice(0, 5).map((r) => ({
      row:     r._rowIndex + 1,
      invoice: r.invoiceNo,
      value:   r.invoiceValue,
    })),
  };
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export function scanGstr1(
  rows:              Gstr1Row[],
  connectionId:      string,
  supplierStateCode?: string,
): DocScanResult {
  const startMs = Date.now();

  const checks = [
    (r: Gstr1Row[]) => checkGstinFormat(r),
    (r: Gstr1Row[]) => checkPlaceOfSupply(r),
    (r: Gstr1Row[]) => checkTaxSplit(r, supplierStateCode),
    (r: Gstr1Row[]) => checkTaxCalculation(r),
    (r: Gstr1Row[]) => checkDuplicateInvoices(r),
    (r: Gstr1Row[]) => checkMissingHsn(r),
  ];

  const issues: ScanIssue[] = checks
    .map((fn) => fn(rows))
    .filter((i): i is ScanIssue => i !== null);

  const bySeverity = { critical: 0, review: 0, info: 0 };
  for (const issue of issues) bySeverity[issue.severity]++;

  return {
    documentType:  "GSTR_1",
    connectionId,
    scannedAt:     new Date(),
    durationMs:    Date.now() - startMs,
    totalIssues:   issues.length,
    bySeverity,
    totalExposure: issues.reduce((s, i) => s + (i.exposure ?? 0), 0),
    issues,
  };
}

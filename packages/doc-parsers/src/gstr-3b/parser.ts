import type { Gstr3BSummary } from "../types";

// GSTR-3B is a summary return — rows contain aggregate figures per field.
// Different software exports it differently; we scan for known field labels.

type Field = keyof Omit<Gstr3BSummary, "period">;

const FIELD_ALIASES: Record<Field, string[]> = {
  outwardTaxableValue: [
    "taxable_value", "outward_taxable_value", "total_taxable_value",
    "3.1 outward taxable", "outward supplies",
  ],
  outwardTaxableIgst: [
    "igst", "integrated_tax", "outward_igst", "3.1 igst",
  ],
  outwardTaxableCgst: [
    "cgst", "central_tax", "outward_cgst", "3.1 cgst",
  ],
  outwardTaxableSgst: [
    "sgst", "state_tax", "outward_sgst", "3.1 sgst", "utgst",
  ],
  itcIgst: [
    "itc_igst", "input_igst", "eligible_itc_igst", "4 itc igst",
  ],
  itcCgst: [
    "itc_cgst", "input_cgst", "eligible_itc_cgst", "4 itc cgst",
  ],
  itcSgst: [
    "itc_sgst", "input_sgst", "eligible_itc_sgst", "4 itc sgst", "utgst_itc",
  ],
  taxPayableIgst: [
    "tax_payable_igst", "payable_igst", "6 payable igst",
  ],
  taxPayableCgst: [
    "tax_payable_cgst", "payable_cgst", "6 payable cgst",
  ],
  taxPayableSgst: [
    "tax_payable_sgst", "payable_sgst", "6 payable sgst",
  ],
  taxPaidIgst: [
    "tax_paid_igst", "paid_igst", "6 paid igst", "cash_igst",
  ],
  taxPaidCgst: [
    "tax_paid_cgst", "paid_cgst", "6 paid cgst", "cash_cgst",
  ],
  taxPaidSgst: [
    "tax_paid_sgst", "paid_sgst", "6 paid sgst", "cash_sgst",
  ],
};

function num(v: unknown): number {
  if (!v && v !== 0) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function scanRow(
  row:     Record<string, unknown>,
  aliases: string[],
): number {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const normalised = alias.toLowerCase().trim().replace(/\s+/g, "_");
    const found = keys.find((k) => k.toLowerCase().trim().replace(/\s+/g, "_") === normalised);
    if (found !== undefined) return num(row[found]);

    // Also check if label column contains the alias (pivot-style exports)
    const labelKey = keys.find((k) => /label|field|description|name/i.test(k));
    if (labelKey) {
      const labelVal = String(row[labelKey] ?? "").toLowerCase().trim();
      if (aliases.some((a) => labelVal.includes(a.toLowerCase()))) {
        const valueKey = keys.find((k) => k !== labelKey);
        if (valueKey) return num(row[valueKey]);
      }
    }
  }
  return 0;
}

function extractPeriod(rows: Record<string, unknown>[]): string {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (/period|month|return_period/i.test(key)) {
        const val = String(row[key] ?? "").trim();
        // Match MM-YYYY or MM/YYYY
        if (/^\d{2}[\/\-]\d{4}$/.test(val)) return val.replace("/", "-");
        // Match MMYYYY
        if (/^\d{6}$/.test(val)) return `${val.slice(0, 2)}-${val.slice(2)}`;
      }
    }
  }
  return "";
}

export function parseGstr3B(rows: Record<string, unknown>[]): Gstr3BSummary | null {
  if (rows.length === 0) return null;

  // GSTR-3B can be a single aggregate row or a key-value pivot table
  // Aggregate all rows (in case it's multi-row pivot)
  const summary: Gstr3BSummary = {
    outwardTaxableValue: 0,
    outwardTaxableIgst:  0,
    outwardTaxableCgst:  0,
    outwardTaxableSgst:  0,
    itcIgst:             0,
    itcCgst:             0,
    itcSgst:             0,
    taxPayableIgst:      0,
    taxPayableCgst:      0,
    taxPayableSgst:      0,
    taxPaidIgst:         0,
    taxPaidCgst:         0,
    taxPaidSgst:         0,
    period:              extractPeriod(rows),
  };

  for (const row of rows) {
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [Field, string[]][]) {
      summary[field] += scanRow(row, aliases);
    }
  }

  // If all values are 0, parsing failed (wrong format)
  const hasData = Object.values(summary).some((v) => typeof v === "number" && v !== 0);
  return hasData ? summary : null;
}

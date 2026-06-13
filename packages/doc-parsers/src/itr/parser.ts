import type { ItrSummary } from "../types";

const FIELD_ALIASES: Record<keyof Omit<ItrSummary, "filingDate" | "assessmentYear" | "itrForm">, string[]> = {
  grossTotalIncome: [
    "gross_total_income", "gross total income", "total_income_before_deduction",
    "income_before_deduction", "part_b_gti",
  ],
  taxableIncome: [
    "taxable_income", "total_income", "net_income",
    "income_chargeable_to_tax",
  ],
  taxPayable: [
    "tax_payable", "total_tax_payable", "tax_on_total_income",
    "net_tax_payable",
  ],
  taxPaid: [
    "tax_paid", "advance_tax", "tds_amount", "tax_already_paid",
    "taxes_paid",
  ],
  refundDue: [
    "refund_due", "refund_amount", "tax_refundable",
    "excess_tax_paid",
  ],
};

function num(v: unknown): number {
  if (!v && v !== 0) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function findField(rows: Record<string, unknown>[], aliases: string[]): number {
  for (const row of rows) {
    for (const alias of aliases) {
      const normalised = alias.toLowerCase().trim().replace(/\s+/g, "_");
      const key = Object.keys(row).find(
        (k) => k.toLowerCase().trim().replace(/\s+/g, "_") === normalised,
      );
      if (key && row[key] !== null && row[key] !== undefined) {
        const v = num(row[key]);
        if (v !== 0) return v;
      }
    }
  }
  return 0;
}

function findMeta(rows: Record<string, unknown>[], aliases: string[]): string {
  for (const row of rows) {
    for (const alias of aliases) {
      const normalised = alias.toLowerCase().trim().replace(/\s+/g, "_");
      const key = Object.keys(row).find(
        (k) => k.toLowerCase().trim().replace(/\s+/g, "_") === normalised,
      );
      if (key && row[key]) return String(row[key]).trim();
    }
  }
  return "";
}

function parseDate(rows: Record<string, unknown>[]): Date | null {
  const val = findMeta(rows, [
    "filing_date", "date_of_filing", "acknowledgement_date", "filed_on",
  ]);
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function parseItr(rows: Record<string, unknown>[]): ItrSummary | null {
  if (rows.length === 0) return null;

  const grossTotalIncome = findField(rows, FIELD_ALIASES.grossTotalIncome);
  const taxableIncome    = findField(rows, FIELD_ALIASES.taxableIncome);
  const taxPayable       = findField(rows, FIELD_ALIASES.taxPayable);
  const taxPaid          = findField(rows, FIELD_ALIASES.taxPaid);
  const refundDue        = findField(rows, FIELD_ALIASES.refundDue);

  // Must have at least income data
  if (grossTotalIncome === 0 && taxableIncome === 0) return null;

  return {
    assessmentYear:   findMeta(rows, ["assessment_year", "ay", "a_y"]) || "",
    itrForm:          findMeta(rows, ["itr_form", "form_type", "itr_type"]) || "ITR",
    grossTotalIncome,
    taxableIncome:    taxableIncome || grossTotalIncome,
    taxPayable,
    taxPaid,
    refundDue:        refundDue || Math.max(0, taxPaid - taxPayable),
    filingDate:       parseDate(rows),
  };
}

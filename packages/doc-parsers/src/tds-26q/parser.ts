import type { Form26QRow } from "../types";

// ─── Column alias map ─────────────────────────────────────────────────────────
// Multiple source column names → one canonical field.
// Priority: first match wins.

const ALIASES: Record<keyof Omit<Form26QRow, "_rowIndex" | "_raw">, string[]> = {
  deducteeName: [
    "deductee_name", "deductee name", "party_name", "vendor_name",
    "name_of_deductee", "name of deductee",
  ],
  deducteePan: [
    "deductee_pan", "deductee pan", "pan", "pan_of_deductee",
    "pan of deductee", "pan_no", "pan_number",
  ],
  deducteeType: [
    "deductee_type", "deductee type", "deductee_code",
    "type_of_deductee", "type of deductee",
  ],
  section: [
    "tds_section", "section", "section_code", "nature_of_payment_code",
    "tds section", "section of act",
  ],
  natureOfPayment: [
    "nature_of_payment", "nature of payment", "payment_nature",
    "description", "particulars",
  ],
  grossAmount: [
    "gross_amount", "amount_paid", "amount_credited",
    "amount paid", "amount credited", "payment_amount",
    "total_amount", "gross amount",
  ],
  tdsDeducted: [
    "tds_deducted", "tds deducted", "tax_deducted",
    "tax deducted", "tds_amount", "deducted_amount",
  ],
  tdsDeposited: [
    "tds_deposited", "tds deposited", "tax_deposited",
    "tax deposited", "deposited_amount", "challan_tds_amount",
  ],
  bsrCode: [
    "bsr_code", "bsr code", "bsr", "bank_bsr",
    "challan_bsr_code", "bsr_of_bank",
  ],
  challanDate: [
    "challan_date", "challan date", "date_of_deposit",
    "date of deposit", "deposit_date",
  ],
  challanSerialNo: [
    "challan_serial_no", "challan_serial_number", "challan serial no",
    "challan_no", "challan no", "serial_no",
  ],
  challanAmount: [
    "challan_amount", "challan amount", "challan_total_amount",
    "total_challan_amount",
  ],
  dateOfPayment: [
    "date_of_payment", "date of payment", "payment_date",
    "transaction_date",
  ],
  dateOfDeduction: [
    "date_of_deduction", "date of deduction", "deduction_date",
  ],
  certificateNo: [
    "certificate_no", "certificate no", "lower_deduction_certificate",
    "lower deduction certificate", "cert_no",
  ],
  remarks: [
    "remarks", "remark", "notes", "note", "comment",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildLookup(raw: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(raw)) {
    map.set(key.toLowerCase().trim().replace(/\s+/g, "_"), key);
  }
  return map;
}

function pick(
  raw: Record<string, unknown>,
  lookup: Map<string, string>,
  aliases: string[],
): unknown {
  for (const alias of aliases) {
    const normalised = alias.toLowerCase().trim().replace(/\s+/g, "_");
    const actualKey  = lookup.get(normalised);
    if (actualKey !== undefined && raw[actualKey] !== undefined && raw[actualKey] !== null && raw[actualKey] !== "") {
      return raw[actualKey];
    }
  }
  return null;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(
      parseInt(ddmmyyyy[3]),
      parseInt(ddmmyyyy[2]) - 1,
      parseInt(ddmmyyyy[1]),
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD (ISO)
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseForm26Q(
  rows: Record<string, unknown>[],
): Form26QRow[] {
  if (rows.length === 0) return [];

  // Build column lookup from first row
  const lookup = buildLookup(rows[0]);

  return rows
    .map((raw, idx): Form26QRow | null => {
      const section = str(pick(raw, lookup, ALIASES.section));

      // Skip header-repeat rows (some NSDL exports repeat headers mid-file)
      if (section.toLowerCase() === "section" || section.toLowerCase() === "tds_section") return null;

      const grossAmount = num(pick(raw, lookup, ALIASES.grossAmount));
      const tdsDeducted = num(pick(raw, lookup, ALIASES.tdsDeducted));
      // If deposited not present, assume same as deducted (common in simplified exports)
      const depositedRaw = pick(raw, lookup, ALIASES.tdsDeposited);
      const tdsDeposited = depositedRaw !== null ? num(depositedRaw) : tdsDeducted;

      const challanAmountRaw = pick(raw, lookup, ALIASES.challanAmount);
      const challanAmount    = challanAmountRaw !== null ? num(challanAmountRaw) : tdsDeposited;

      return {
        deducteeName:    str(pick(raw, lookup, ALIASES.deducteeName)) || "Unknown",
        deducteePan:     str(pick(raw, lookup, ALIASES.deducteePan)).toUpperCase(),
        deducteeType:    str(pick(raw, lookup, ALIASES.deducteeType)) || "P",
        section:         section.toUpperCase().replace(/\s+/g, ""),
        natureOfPayment: str(pick(raw, lookup, ALIASES.natureOfPayment)),
        grossAmount,
        tdsDeducted,
        tdsDeposited,
        bsrCode:         str(pick(raw, lookup, ALIASES.bsrCode)).replace(/\s+/g, ""),
        challanDate:     parseDate(pick(raw, lookup, ALIASES.challanDate)),
        challanSerialNo: str(pick(raw, lookup, ALIASES.challanSerialNo)),
        challanAmount,
        dateOfPayment:   parseDate(pick(raw, lookup, ALIASES.dateOfPayment)),
        dateOfDeduction: parseDate(pick(raw, lookup, ALIASES.dateOfDeduction)),
        certificateNo:   str(pick(raw, lookup, ALIASES.certificateNo)) || null,
        remarks:         str(pick(raw, lookup, ALIASES.remarks)) || null,
        _rowIndex:       idx,
        _raw:            raw,
      };
    })
    .filter((r): r is Form26QRow => r !== null);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface Form26QSummary {
  totalRows:         number;
  totalGross:        number;
  totalTdsDeducted:  number;
  totalTdsDeposited: number;
  gap:               number;          // deducted - deposited
  uniqueDeductees:   number;
  uniqueSections:    string[];
  uniqueChallans:    number;
  periodStart:       Date | null;
  periodEnd:         Date | null;
}

export function summariseForm26Q(rows: Form26QRow[]): Form26QSummary {
  if (rows.length === 0) {
    return {
      totalRows: 0, totalGross: 0, totalTdsDeducted: 0, totalTdsDeposited: 0,
      gap: 0, uniqueDeductees: 0, uniqueSections: [], uniqueChallans: 0,
      periodStart: null, periodEnd: null,
    };
  }

  const deductees = new Set(rows.map((r) => r.deducteePan));
  const sections  = [...new Set(rows.map((r) => r.section).filter(Boolean))].sort();
  const challans  = new Set(rows.map((r) => `${r.bsrCode}-${r.challanSerialNo}`).filter((k) => k !== "-"));

  const dates = rows
    .map((r) => r.dateOfPayment ?? r.challanDate)
    .filter((d): d is Date => d !== null);
  const periodStart = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  const periodEnd   = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;

  const totalGross        = rows.reduce((s, r) => s + r.grossAmount,    0);
  const totalTdsDeducted  = rows.reduce((s, r) => s + r.tdsDeducted,    0);
  const totalTdsDeposited = rows.reduce((s, r) => s + r.tdsDeposited,   0);

  return {
    totalRows:         rows.length,
    totalGross,
    totalTdsDeducted,
    totalTdsDeposited,
    gap:               totalTdsDeducted - totalTdsDeposited,
    uniqueDeductees:   deductees.size,
    uniqueSections:    sections,
    uniqueChallans:    challans.size,
    periodStart,
    periodEnd,
  };
}

import type { Gstr1Row } from "../types";

// ─── Column aliases ───────────────────────────────────────────────────────────

type Gstr1Field = keyof Omit<Gstr1Row, "_rowIndex" | "_raw">;

const ALIASES: Record<Gstr1Field, string[]> = {
  invoiceNo: [
    "invoice_no", "invoice_number", "invoice no", "bill_no", "doc_no",
    "invoice_num", "inv_no",
  ],
  invoiceDate: [
    "invoice_date", "invoice date", "bill_date", "doc_date", "date",
  ],
  invoiceValue: [
    "invoice_value", "invoice value", "total_invoice_value", "total_value",
    "gross_value", "inv_value",
  ],
  receiverGstin: [
    "receiver_gstin", "buyer_gstin", "gstin_of_recipient", "gstin",
    "customer_gstin", "party_gstin",
  ],
  receiverName: [
    "receiver_name", "buyer_name", "customer_name", "party_name",
    "recipient_name",
  ],
  placeOfSupply: [
    "place_of_supply", "pos", "place of supply", "supply_state",
    "state_code", "state",
  ],
  taxableValue: [
    "taxable_value", "taxable value", "assessable_value",
    "net_amount", "base_amount",
  ],
  igst: [
    "igst", "igst_amount", "integrated_tax", "igst_amt",
  ],
  cgst: [
    "cgst", "cgst_amount", "central_tax", "cgst_amt",
  ],
  sgst: [
    "sgst", "sgst_amount", "state_tax", "sgst_amt", "utgst", "utgst_amount",
  ],
  cess: [
    "cess", "cess_amount", "compensation_cess", "cess_amt",
  ],
  supplyType: [
    "supply_type", "type", "invoice_type", "transaction_type",
    "b2b_b2c", "type_of_supply",
  ],
  hsnCode: [
    "hsn_code", "hsn", "sac_code", "sac", "hsn_sac",
    "hsn_sac_code",
  ],
  reverseCharge: [
    "reverse_charge", "rcm", "is_reverse_charge",
    "reverse charge applicable",
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
  raw:     Record<string, unknown>,
  lookup:  Map<string, string>,
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
  return v === null || v === undefined ? "" : String(v).trim();
}

function num(v: unknown): number {
  if (!v && v !== 0) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function bool(v: unknown): boolean {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

function inferSupplyType(row: Record<string, unknown>, lookup: Map<string, string>): string {
  const explicit = str(pick(row, lookup, ALIASES.supplyType));
  if (explicit) return explicit.toUpperCase();

  // Infer from GSTIN presence
  const gstin = str(pick(row, lookup, ALIASES.receiverGstin));
  if (gstin && gstin.length === 15) return "B2B";
  return "B2C";
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseGstr1(rows: Record<string, unknown>[]): Gstr1Row[] {
  if (rows.length === 0) return [];
  const lookup = buildLookup(rows[0]);

  return rows
    .map((raw, idx): Gstr1Row | null => {
      const invoiceNo = str(pick(raw, lookup, ALIASES.invoiceNo));
      // Skip blank rows
      if (!invoiceNo) return null;
      // Skip header-repeat rows
      if (invoiceNo.toLowerCase() === "invoice_no" || invoiceNo.toLowerCase() === "invoice no") return null;

      const receiverGstin = str(pick(raw, lookup, ALIASES.receiverGstin));

      return {
        invoiceNo,
        invoiceDate:   parseDate(pick(raw, lookup, ALIASES.invoiceDate)),
        invoiceValue:  num(pick(raw, lookup, ALIASES.invoiceValue)),
        receiverGstin: receiverGstin || null,
        receiverName:  str(pick(raw, lookup, ALIASES.receiverName)) || null,
        placeOfSupply: str(pick(raw, lookup, ALIASES.placeOfSupply)),
        taxableValue:  num(pick(raw, lookup, ALIASES.taxableValue)),
        igst:          num(pick(raw, lookup, ALIASES.igst)),
        cgst:          num(pick(raw, lookup, ALIASES.cgst)),
        sgst:          num(pick(raw, lookup, ALIASES.sgst)),
        cess:          num(pick(raw, lookup, ALIASES.cess)),
        supplyType:    inferSupplyType(raw, lookup),
        hsnCode:       str(pick(raw, lookup, ALIASES.hsnCode)) || null,
        reverseCharge: bool(pick(raw, lookup, ALIASES.reverseCharge)),
        _rowIndex:     idx,
        _raw:          raw,
      };
    })
    .filter((r): r is Gstr1Row => r !== null);
}

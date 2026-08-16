import type { Gstr2BRow } from "../types";
import { parseNum, parseIndianDate } from "../coerce";

// ─── Column aliases (for Excel exports — already-flat rows) ──────────────────

type Gstr2BField = keyof Omit<Gstr2BRow, "_rowIndex" | "_raw">;

const ALIASES: Record<Gstr2BField, string[]> = {
  supplierGstin: [
    "supplier_gstin", "gstin_of_supplier", "seller_gstin", "ctin", "gstin",
  ],
  supplierName: [
    "supplier_name", "seller_name", "trade_name", "trdnm", "vendor_name", "party_name",
  ],
  invoiceNo: [
    "invoice_no", "invoice_number", "invoice num", "bill_no", "doc_no",
    "inv_no", "inum", "reference_no",
  ],
  invoiceDate: [
    "invoice_date", "invoice date", "bill_date", "doc_date", "idt", "date",
  ],
  invoiceValue: [
    "invoice_value", "invoice value", "total_invoice_value", "total_value",
    "gross_value", "inv_value", "val",
  ],
  taxableValue: [
    "taxable_value", "taxable value", "assessable_value",
    "net_amount", "base_amount", "txval",
  ],
  igst: ["igst", "igst_amount", "integrated_tax", "igst_amt"],
  cgst: ["cgst", "cgst_amount", "central_tax", "cgst_amt"],
  sgst: ["sgst", "sgst_amount", "state_tax", "sgst_amt", "utgst"],
  cess: ["cess", "cess_amount", "compensation_cess", "cess_amt"],
  itcEligible: [
    "itc_eligible", "eligible_for_itc", "is_itc_eligible", "itc_eligibility",
    "itcavl", "credit_eligibility",
  ],
  itcEligibleAmount: [
    "itc_eligible_amount", "itc_amount", "eligible_itc", "itc_credit_amount",
  ],
  itcReason: [
    "itc_reason", "rejection_reason", "ineligibility_reason", "rsn", "remarks",
  ],
  supplyType: [
    "supply_type", "type", "document_type", "invoice_type", "transaction_type",
  ],
  hsnCode: ["hsn_code", "hsn", "sac_code", "sac", "hsn_sac"],
  placeOfSupply: ["place_of_supply", "pos", "supply_state", "state_code", "state"],
  // GSTN carries the supplier's actual GSTR-1 filing date and period on every
  // 2B record. Most tools ignore these; they are what distinguishes "vendor
  // never filed" from "vendor always files late".
  supplierFiledDate: [
    "supfildt", "supplier_filing_date", "supplier_filed_date", "gstr1_filing_date",
    "filing_date", "date_of_filing", "supplier_gstr1_filed_on",
  ],
  supplierFiledPeriod: [
    "supprd", "supplier_filing_period", "supplier_period", "gstr1_period",
    "return_period", "filing_period",
  ],
};

// ─── Helpers (shared parsing primitives — same pattern as gstr-1/parser.ts) ──

function buildLookup(raw: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(raw)) {
    map.set(key.toLowerCase().trim().replace(/\s+/g, "_"), key);
  }
  return map;
}

function pick(raw: Record<string, unknown>, lookup: Map<string, string>, aliases: string[]): unknown {
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

const num = parseNum;

// Kept as a named wrapper so existing call sites read unchanged. Robust to
// GSTN-portal date formats, Tally "d-Mon-yyyy", and Indian day-first ordering.
function parseDate(v: unknown): Date | null {
  return parseIndianDate(v);
}

function bool(v: unknown): boolean {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

// ─── JSON flattening ──────────────────────────────────────────────────────────
// GSTN's GSTR-2B JSON export nests invoices three levels deep:
//   data.docdata.b2b[] (one per supplier) -> inv[] (one per invoice) -> items[] (tax lines)
// Flatten to one row per invoice (summing tax across items) using the same
// field names as the Excel export, so the alias table above applies to both.

interface Gstr2bJsonItem {
  txval?: number; igst?: number; cgst?: number; sgst?: number; cess?: number;
}
interface Gstr2bJsonInvoice {
  inum?: string; idt?: string; val?: number; pos?: string;
  itcavl?: string; rsn?: string; typ?: string;
  items?: Gstr2bJsonItem[];
}
interface Gstr2bJsonSupplier {
  ctin?: string; trdnm?: string;
  inv?: Gstr2bJsonInvoice[];
}

function isNestedJson(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null) return false;
  const obj = input as Record<string, unknown>;
  const docdata = (obj.docdata ?? (obj.data as Record<string, unknown> | undefined)?.docdata) as
    | Record<string, unknown>
    | undefined;
  return Array.isArray(docdata?.b2b);
}

function flattenGstr2bJson(input: Record<string, unknown>): Record<string, unknown>[] {
  const docdata = (input.docdata ?? (input.data as Record<string, unknown>).docdata) as Record<string, unknown>;
  const suppliers = (docdata.b2b ?? []) as Gstr2bJsonSupplier[];
  const flat: Record<string, unknown>[] = [];

  for (const supplier of suppliers) {
    for (const inv of supplier.inv ?? []) {
      const items = inv.items ?? [];
      const taxable = items.reduce((s, i) => s + (i.txval ?? 0), 0);
      const igst    = items.reduce((s, i) => s + (i.igst ?? 0), 0);
      const cgst    = items.reduce((s, i) => s + (i.cgst ?? 0), 0);
      const sgst    = items.reduce((s, i) => s + (i.sgst ?? 0), 0);
      const cess    = items.reduce((s, i) => s + (i.cess ?? 0), 0);

      flat.push({
        ctin:   supplier.ctin,
        trdnm:  supplier.trdnm,
        inum:   inv.inum,
        idt:    inv.idt,
        val:    inv.val,
        pos:    inv.pos,
        itcavl: inv.itcavl,
        rsn:    inv.rsn,
        type:   inv.typ ?? "B2B",
        txval:  taxable,
        igst, cgst, sgst, cess,
      });
    }
  }

  return flat;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseGstr2B(rows: Record<string, unknown>[] | Record<string, unknown>): Gstr2BRow[] {
  const flatRows = isNestedJson(rows)
    ? flattenGstr2bJson(rows)
    : (rows as Record<string, unknown>[]);

  if (flatRows.length === 0) return [];
  const lookup = buildLookup(flatRows[0]);

  return flatRows
    .map((raw, idx): Gstr2BRow | null => {
      const invoiceNo = str(pick(raw, lookup, ALIASES.invoiceNo));
      if (!invoiceNo) return null;
      if (invoiceNo.toLowerCase() === "invoice_no" || invoiceNo.toLowerCase() === "invoice no") return null;

      const supplierGstin = str(pick(raw, lookup, ALIASES.supplierGstin));
      const itcRaw = pick(raw, lookup, ALIASES.itcEligible);
      // GSTN JSON uses itcavl: "Y"/"N"; treat missing as eligible (Excel
      // exports without this column are assumed to be eligible by default)
      const itcEligible = itcRaw === null ? true : bool(itcRaw);

      const taxableValue = num(pick(raw, lookup, ALIASES.taxableValue));
      const totalTax = num(pick(raw, lookup, ALIASES.igst))
        + num(pick(raw, lookup, ALIASES.cgst))
        + num(pick(raw, lookup, ALIASES.sgst))
        + num(pick(raw, lookup, ALIASES.cess));

      return {
        supplierGstin: supplierGstin || null,
        supplierName:  str(pick(raw, lookup, ALIASES.supplierName)) || null,
        invoiceNo,
        invoiceDate:   parseDate(pick(raw, lookup, ALIASES.invoiceDate)),
        invoiceValue:  num(pick(raw, lookup, ALIASES.invoiceValue)),
        taxableValue,
        igst:          num(pick(raw, lookup, ALIASES.igst)),
        cgst:          num(pick(raw, lookup, ALIASES.cgst)),
        sgst:          num(pick(raw, lookup, ALIASES.sgst)),
        cess:          num(pick(raw, lookup, ALIASES.cess)),
        itcEligible,
        itcEligibleAmount: itcEligible ? totalTax : num(pick(raw, lookup, ALIASES.itcEligibleAmount)),
        itcReason:     str(pick(raw, lookup, ALIASES.itcReason)) || null,
        supplyType:    str(pick(raw, lookup, ALIASES.supplyType)) || "B2B",
        hsnCode:       str(pick(raw, lookup, ALIASES.hsnCode)) || null,
        placeOfSupply: str(pick(raw, lookup, ALIASES.placeOfSupply)),
        supplierFiledDate:   parseDate(pick(raw, lookup, ALIASES.supplierFiledDate)),
        supplierFiledPeriod: str(pick(raw, lookup, ALIASES.supplierFiledPeriod)) || null,
        _rowIndex:     idx,
        _raw:          raw,
      };
    })
    .filter((r): r is Gstr2BRow => r !== null);
}

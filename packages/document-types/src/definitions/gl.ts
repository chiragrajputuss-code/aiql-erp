import type { DocumentTypeDefinition } from "../types";

export const GL_DEFINITION: DocumentTypeDefinition = {
  id:          "GL",
  displayName: "General Ledger",
  description: "Transaction register with debits, credits, vouchers, and account entries",
  icon:        "📒",

  detection: {
    requiredColumns: [
      // Must have at least one of these date columns
    ],
    discriminatorColumns: [
      // Strong GL signals — unique to ledger exports
      "voucher_type", "voucher_no", "voucher_number",
      "debit", "credit", "dr", "cr", "dr_amount", "cr_amount",
      "debit_amount", "credit_amount",
      "transaction_date", "date", "posting_date",
      "narration", "particulars", "description",
      "ledger_name", "account_name", "party_name",
      // Tally specific
      "vch_type", "vch_no",
      // Zoho specific
      "journal_date", "account_code",
    ],
    antiSignalColumns: [
      // These suggest it is NOT a plain GL (but a tax document instead)
      "bsr_code", "challan_serial_no", "deductee_pan",
      "gstin_of_supplier", "invoice_value", "igst", "cgst", "sgst",
      "assessment_year", "itr_form",
    ],
    schemaVersions: [],
  },

  exampleColumns: ["transaction_date", "voucher_type", "debit", "credit", "narration"],

  activePulseCategories: [
    "tds_deadline",
    "gstr1_deadline",
    "gstr3b_deadline",
    "advance_tax",
    "itr_deadline",
    "unresolved_scan",
    "snapshot",
  ],

  chatEnabled: true,
};

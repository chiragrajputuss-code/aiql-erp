import type { DocumentTypeDefinition } from "../types";

export const GSTR_3B_DEFINITION: DocumentTypeDefinition = {
  id:          "GSTR_3B",
  displayName: "GSTR-3B (Monthly Summary)",
  description: "Monthly self-assessed GST return with tax liability and ITC summary",
  icon:        "📊",

  detection: {
    requiredColumns: [],
    discriminatorColumns: [
      // GSTR-3B is summary-level — fewer row-granular fields
      "outward_taxable_supplies", "outward_zero_rated",
      "inward_supplies_liable", "itc_available", "itc_reversed",
      "net_itc", "tax_payable", "tax_paid",
      "interest_paid", "late_fee_paid",
      "igst_payable", "cgst_payable", "sgst_payable",
      "electronic_cash_ledger", "electronic_credit_ledger",
      "return_period", "filing_date",
      // Common GSTR-3B export column patterns
      "3.1", "3.2", "4.a", "4.b",  // table references in some exports
      "supplies_made",
    ],
    antiSignalColumns: [
      "voucher_type", "narration", "deductee_pan", "bsr_code",
      "gstin_of_recipient", "invoice_number",
      "itr_form", "assessment_year",
    ],
    schemaVersions: [],
  },

  exampleColumns: ["return_period", "outward_taxable_supplies", "itc_available", "net_itc", "tax_paid"],

  activePulseCategories: [
    "gstr3b_deadline",
    "unresolved_scan",
  ],

  chatEnabled: false, // v2
};

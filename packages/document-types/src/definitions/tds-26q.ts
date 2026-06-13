import type { DocumentTypeDefinition } from "../types";

export const TDS_26Q_DEFINITION: DocumentTypeDefinition = {
  id:          "TDS_RETURN_26Q",
  displayName: "TDS Return — Form 26Q",
  description: "Quarterly TDS return for non-salary payments (contractors, professionals, rent)",
  icon:        "📋",

  detection: {
    requiredColumns: [],
    discriminatorColumns: [
      // Uniquely identify Form 26Q — these don't appear in GL exports
      "bsr_code", "challan_serial_no", "challan_serial_number",
      "deductee_pan", "deductee_name", "deductee_type",
      "tds_section", "section_code", "nature_of_payment",
      "certificate_no", "lower_deduction_certificate",
      "date_of_payment", "date_of_deduction",
      "amount_paid", "amount_credited",
      "tds_deducted", "tds_deposited",
      "challan_amount", "challan_date",
      "tan", "tan_of_deductor",
      // NSDL format fields
      "batch_no", "deductor_tan",
    ],
    antiSignalColumns: [
      "voucher_type", "narration", "particulars",
      "gstin", "invoice_value", "igst",
      "itr_form", "assessment_year",
    ],
    schemaVersions: [
      {
        version:      "FY24",
        uniqueColumns: ["lower_deduction_certificate", "certificate_no"],
      },
    ],
  },

  exampleColumns: ["deductee_pan", "bsr_code", "challan_serial_no", "tds_deducted", "tds_section"],

  activePulseCategories: [
    "tds_deadline",
    "unresolved_scan",
  ],

  chatEnabled: false, // v2 — scanner not fully wired yet
};

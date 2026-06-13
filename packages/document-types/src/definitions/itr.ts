import type { DocumentTypeDefinition } from "../types";

export const ITR_DEFINITION: DocumentTypeDefinition = {
  id:          "ITR",
  displayName: "Income Tax Return (ITR)",
  description: "Annual income tax return filed with the Income Tax department",
  icon:        "🏛️",

  detection: {
    requiredColumns: [],
    discriminatorColumns: [
      // ITR JSON/XML specific fields
      "itr_form", "assessment_year", "form_name",
      "pan", "pan_of_assessee",
      "gross_total_income", "total_income", "total_tax_payable",
      "advance_tax_paid", "tds_claimed", "self_assessment_tax",
      "refund_amount", "tax_payable_after_relief",
      "schedule_bp", "schedule_hp", "schedule_cg",  // ITR schedule references
      "acknowledgement_no", "ack_no", "filing_date",
      // ITR-3 / ITR-4 specific
      "business_income", "presumptive_income",
      "net_worth", "capital_account",
    ],
    antiSignalColumns: [
      "voucher_type", "narration", "deductee_pan", "bsr_code",
      "gstin_of_recipient", "invoice_number", "outward_taxable_supplies",
    ],
    schemaVersions: [
      { version: "ITR1", uniqueColumns: ["salary_income", "house_property_income"] },
      { version: "ITR3", uniqueColumns: ["schedule_bp", "capital_account", "net_worth"] },
      { version: "ITR4", uniqueColumns: ["presumptive_income", "scheme_44ad"] },
    ],
  },

  exampleColumns: ["assessment_year", "pan", "gross_total_income", "total_tax_payable", "acknowledgement_no"],

  activePulseCategories: [
    "itr_deadline",
    "advance_tax",
    "unresolved_scan",
  ],

  chatEnabled: false, // v2
};

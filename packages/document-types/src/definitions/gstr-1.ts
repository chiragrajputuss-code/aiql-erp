import type { DocumentTypeDefinition } from "../types";

export const GSTR_1_DEFINITION: DocumentTypeDefinition = {
  id:          "GSTR_1",
  displayName: "GSTR-1 (Outward Supplies)",
  description: "Monthly / quarterly return of outward supplies filed with GST portal",
  icon:        "🧾",

  detection: {
    requiredColumns: [],
    discriminatorColumns: [
      // GSTR-1 specific fields
      "gstin_of_recipient", "receiver_gstin", "counterparty_gstin",
      "invoice_number", "invoice_date", "invoice_value",
      "taxable_value", "place_of_supply",
      "igst_amount", "cgst_amount", "sgst_amount",
      "hsn_code", "hsn", "sac_code",
      "document_type",   // B2B, B2C, EXP, etc.
      "reverse_charge",
      // GSTR-1 table references
      "b2b", "b2cl", "b2cs", "cdn", "exp",
    ],
    antiSignalColumns: [
      "voucher_type", "narration", "deductee_pan", "bsr_code",
      "itr_form", "assessment_year",
    ],
    schemaVersions: [],
  },

  exampleColumns: ["gstin_of_recipient", "invoice_number", "taxable_value", "igst_amount", "place_of_supply"],

  activePulseCategories: [
    "gstr1_deadline",
    "unresolved_scan",
  ],

  chatEnabled: false, // v2
};

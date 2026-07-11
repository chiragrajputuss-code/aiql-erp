export const GSTR_2B_DEFINITION = {
    id: "GSTR_2B",
    displayName: "GSTR-2B (Inward Supplies / ITC Statement)",
    description: "Auto-drafted monthly statement of input tax credit, based on what your vendors have filed",
    icon: "📥",
    detection: {
        requiredColumns: [],
        discriminatorColumns: [
            // GSTR-2B specific fields — inward/supplier side
            "supplier_gstin", "gstin_of_supplier", "seller_gstin",
            "itc_eligibility", "itc_eligible", "eligible_for_itc", "itc_eligible_amount",
            "invoice_number", "invoice_date", "invoice_value",
            "taxable_value", "place_of_supply",
            "igst_amount", "cgst_amount", "sgst_amount",
            "hsn_code", "hsn", "sac_code",
            "document_type",
            // GSTR-2B section references
            "b2b", "b2ba", "cdnr", "isd",
        ],
        antiSignalColumns: [
            // GSTR-1 is the outward/recipient-side mirror of this document
            "gstin_of_recipient", "receiver_gstin", "counterparty_gstin",
            // Form 26Q / ITR signals
            "voucher_type", "narration", "deductee_pan", "bsr_code",
            "itr_form", "assessment_year",
        ],
        schemaVersions: [],
    },
    exampleColumns: ["supplier_gstin", "invoice_number", "taxable_value", "igst_amount", "itc_eligibility"],
    activePulseCategories: [
        "vendor_gst_filing",
        "unresolved_scan",
    ],
    chatEnabled: false, // v2
};

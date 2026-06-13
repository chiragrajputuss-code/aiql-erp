// ─── TDS Section registry ─────────────────────────────────────────────────────
// Standard rates as per Income Tax Act. Rates may vary by deductee type.
// Used for: scanner rate validation, pulse alerts, reconciliation context.

export interface TdsSection {
  code:             string;
  description:      string;
  threshold:        number;         // Annual threshold (₹) — deduct only above this
  rateCompany:      number;         // Rate for companies (0–1)
  rateIndividual:   number;         // Rate for individuals/HUF
  surchargeApplies: boolean;
}

const SECTIONS: TdsSection[] = [
  {
    code:            "192",
    description:     "Salary",
    threshold:       250000,
    rateCompany:     0,
    rateIndividual:  0,             // Slab-rate — variable
    surchargeApplies: true,
  },
  {
    code:            "193",
    description:     "Interest on securities",
    threshold:       10000,
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194",
    description:     "Dividend",
    threshold:       5000,
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194A",
    description:     "Interest (other than securities)",
    threshold:       40000,         // ₹50K for senior citizens
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194C",
    description:     "Contractors / sub-contractors",
    threshold:       30000,         // ₹30K per payment; ₹1L annual aggregate
    rateCompany:     0.02,
    rateIndividual:  0.01,
    surchargeApplies: false,
  },
  {
    code:            "194D",
    description:     "Insurance commission",
    threshold:       15000,
    rateCompany:     0.10,
    rateIndividual:  0.05,
    surchargeApplies: false,
  },
  {
    code:            "194G",
    description:     "Commission / brokerage on lottery tickets",
    threshold:       15000,
    rateCompany:     0.05,
    rateIndividual:  0.05,
    surchargeApplies: false,
  },
  {
    code:            "194H",
    description:     "Commission / brokerage",
    threshold:       15000,
    rateCompany:     0.05,
    rateIndividual:  0.05,
    surchargeApplies: false,
  },
  {
    code:            "194I",
    description:     "Rent (land/building/furniture)",
    threshold:       240000,        // ₹2.4L per year
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194IA",
    description:     "Transfer of immovable property",
    threshold:       5000000,       // ₹50L
    rateCompany:     0.01,
    rateIndividual:  0.01,
    surchargeApplies: false,
  },
  {
    code:            "194J",
    description:     "Professional / technical services",
    threshold:       30000,
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194K",
    description:     "Income from mutual fund units",
    threshold:       5000,
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194LA",
    description:     "Compensation on acquisition of immovable property",
    threshold:       250000,
    rateCompany:     0.10,
    rateIndividual:  0.10,
    surchargeApplies: false,
  },
  {
    code:            "194Q",
    description:     "Purchase of goods",
    threshold:       5000000,       // ₹50L
    rateCompany:     0.001,
    rateIndividual:  0.001,
    surchargeApplies: false,
  },
  {
    code:            "206C",
    description:     "Tax collected at source",
    threshold:       0,
    rateCompany:     0.01,
    rateIndividual:  0.01,
    surchargeApplies: false,
  },
];

const BY_CODE = new Map<string, TdsSection>(
  SECTIONS.map((s) => [s.code, s]),
);

export function getSection(code: string): TdsSection | undefined {
  // Normalise: "194 C" → "194C", "sec194C" → "194C"
  const normalised = code.replace(/\s+/g, "").replace(/^[Ss]ec\.?/i, "").toUpperCase();
  return BY_CODE.get(normalised);
}

export function isKnownSection(code: string): boolean {
  return getSection(code) !== undefined;
}

export function expectedTdsRate(
  section: TdsSection,
  deducteeType: string,
): number {
  const isCompany = /^[Cc]|company|pvt|ltd|llp/i.test(deducteeType);
  return isCompany ? section.rateCompany : section.rateIndividual;
}

export { SECTIONS };

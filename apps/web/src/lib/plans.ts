/**
 * Centralised plan definitions. Used by the pricing page and billing logic.
 * Annual price = monthly × 10 (equivalent to 2 months free).
 */

export interface PlanFeature {
  text:      string;
  included:  boolean;
  highlight?: boolean; // shown in bold on the card
}

export interface Plan {
  id:              string;
  name:            string;
  tagline:         string;
  monthlyPrice:    number; // INR per month
  annualMonthly:   number; // effective monthly when billed annually
  connections:     number | "unlimited";
  queryLimit:      number | "unlimited";
  features:        PlanFeature[];
  recommended:     boolean;
  ctaLabel:        string;
  ctaHref:         string;
}

export const PLANS: Plan[] = [
  {
    id:            "starter",
    name:          "Starter",
    tagline:       "Perfect for solo CAs and small practices",
    monthlyPrice:  999,
    annualMonthly: 832,  // 999 × 10 / 12 ≈ 832
    connections:   3,
    queryLimit:    500,
    recommended:   false,
    ctaLabel:      "Start free trial",
    ctaHref:       "/signup?plan=starter",
    features: [
      { text: "3 client connections",                     included: true  },
      { text: "500 queries / month",                      included: true  },
      { text: "GL data-quality scanner (8 checks)",       included: true  },
      { text: "Adaptive GL close (STANDARD template)",    included: true  },
      { text: "Query Studio — plain English to SQL",      included: true  },
      { text: "PII masking before LLM calls",             included: true  },
      { text: "PDF export of findings",                   included: true  },
      { text: "Adaptive close (custom intent)",           included: false },
      { text: "Bank reconciliation engine",               included: false },
      { text: "GSTN auto-reconciliation",                 included: false },
      { text: "Priority support",                         included: false },
    ],
  },
  {
    id:            "professional",
    name:          "Professional",
    tagline:       "For growing CA firms handling multiple clients",
    monthlyPrice:  2999,
    annualMonthly: 2499,
    connections:   20,
    queryLimit:    2000,
    recommended:   true,
    ctaLabel:      "Start free trial",
    ctaHref:       "/signup?plan=professional",
    features: [
      { text: "20 client connections",                          included: true, highlight: true },
      { text: "2,000 queries / month",                         included: true  },
      { text: "GL data-quality scanner (11 checks incl. TDS)", included: true, highlight: true },
      { text: "Adaptive GL close — full intent parsing",       included: true, highlight: true },
      { text: "Query Studio + RAG learning",                   included: true  },
      { text: "PII masking before LLM calls",                  included: true  },
      { text: "PDF + Excel export",                            included: true  },
      { text: "Knowledge base — auto-resolve patterns",        included: true, highlight: true },
      { text: "Bank reconciliation engine",                    included: false },
      { text: "GSTN auto-reconciliation",                      included: false },
      { text: "Priority email support",                        included: true  },
    ],
  },
  {
    id:            "business",
    name:          "Business",
    tagline:       "For large CA firms and CFO offices",
    monthlyPrice:  6999,
    annualMonthly: 5832,
    connections:   "unlimited",
    queryLimit:    "unlimited",
    recommended:   false,
    ctaLabel:      "Talk to us",
    ctaHref:       "mailto:sales@aiql.com?subject=AIQL Business Plan",
    features: [
      { text: "Unlimited connections",                          included: true, highlight: true },
      { text: "Unlimited queries",                              included: true, highlight: true },
      { text: "All 11 scanner checks + custom rules",          included: true  },
      { text: "Adaptive GL close — full intent parsing",       included: true  },
      { text: "Bank reconciliation (HDFC/ICICI/SBI/Axis)",     included: true, highlight: true },
      { text: "GSTN auto-reconciliation (2B vs. books)",       included: true, highlight: true },
      { text: "Tally Live Sync desktop agent",                 included: true, highlight: true },
      { text: "Knowledge base — auto-resolve patterns",        included: true  },
      { text: "PDF + Excel export",                            included: true  },
      { text: "Team management + role-based access",           included: true  },
      { text: "Dedicated onboarding + priority support",       included: true  },
    ],
  },
];

/** Format INR price for display — always shows ₹ and ,000 separator. */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

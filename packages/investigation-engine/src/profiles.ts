// ─── Investigation Profiles ──────────────────────────────────────────────────
//
// A profile is a named, ordered bundle of investigations for a company type.
// Lives in code (no DB table). The runner reads the profile to know which
// investigations to run. MVP ships one default profile; industry-specific
// variants (manufacturing, SaaS, retail) come later without touching the engine.

export interface InvestigationProfile {
  id:               string;
  name:             string;
  investigationIds: string[];   // ordered
}

export const INDIAN_SME_DEFAULT: InvestigationProfile = {
  id:   "indian-sme-default",
  name: "Indian SME — Default",
  investigationIds: [
    "gst-vendor-itc",
    "duplicate-payment",
    // "vendor-risk", "cash-health" … appended as they ship
  ],
};

const PROFILES: InvestigationProfile[] = [INDIAN_SME_DEFAULT];

const BY_ID = new Map<string, InvestigationProfile>(PROFILES.map((p) => [p.id, p]));

export function getProfile(id: string): InvestigationProfile | undefined {
  return BY_ID.get(id);
}

export function getDefaultProfile(): InvestigationProfile {
  return INDIAN_SME_DEFAULT;
}

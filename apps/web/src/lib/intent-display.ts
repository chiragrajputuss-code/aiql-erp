/**
 * Display helpers for intent-parser output. Translates raw machine values
 * (confidence numbers, source codes) into language a CA can read.
 */

export interface ConfidenceDisplay {
  label: string;
  tone:  "high" | "medium" | "low" | "very-low";
  /** Whether to suggest the user double-check the parse */
  suggestReview: boolean;
}

/**
 * Map a 0–1 confidence score to a short descriptor + tone.
 * Buckets are calibrated for the intent parser specifically:
 *  - ≥ 0.85: heuristic match on a short clear prompt → trust it
 *  - 0.65–0.85: LLM extracted with reasonable certainty → mostly trust
 *  - 0.40–0.65: LLM extracted but unsure → flag for review
 *  - < 0.40: unsure or fallback → highlight for review
 */
export function describeConfidence(value: number | null | undefined): ConfidenceDisplay {
  const v = typeof value === "number" ? value : 0;
  if (v >= 0.85) return { label: "AI is very confident", tone: "high",     suggestReview: false };
  if (v >= 0.65) return { label: "AI is fairly confident", tone: "medium", suggestReview: false };
  if (v >= 0.40) return { label: "AI is somewhat unsure",  tone: "low",    suggestReview: true  };
  return                 { label: "AI is uncertain",       tone: "very-low", suggestReview: true };
}

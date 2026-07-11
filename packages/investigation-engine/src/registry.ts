// ─── Investigation Registry ──────────────────────────────────────────────────
//
// Central map of id → InvestigationDefinition, same pattern as the
// document-types registry. Adding investigation #N means adding one file and
// one import here — the runner iterates whatever the profile selects, nothing
// else changes.

import type { InvestigationDefinition } from "./types";
import { GST_VENDOR_ITC } from "./investigations/gst-vendor-itc";
import { DUPLICATE_PAYMENT } from "./investigations/duplicate-payment";

const REGISTRY: InvestigationDefinition[] = [
  GST_VENDOR_ITC,
  DUPLICATE_PAYMENT,
  // vendor-risk, cash-health … appended here as they ship
];

const BY_ID = new Map<string, InvestigationDefinition>(REGISTRY.map((d) => [d.id, d]));

export function getInvestigation(id: string): InvestigationDefinition | undefined {
  return BY_ID.get(id);
}

export function getInvestigations(ids: string[]): InvestigationDefinition[] {
  return ids.map((id) => BY_ID.get(id)).filter((d): d is InvestigationDefinition => Boolean(d));
}

export function getAllInvestigations(): InvestigationDefinition[] {
  return REGISTRY;
}

export { REGISTRY };

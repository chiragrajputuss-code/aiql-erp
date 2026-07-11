// ─── Business Context ────────────────────────────────────────────────────────
//
// The resolved, immutable execution context an investigation runs against
// (Principles 1 & 4). It is NOT a database entity — the web app's
// ContextResolver builds it on demand from whatever connections exist, maps
// them to capabilities, and freezes it. Every investigation in a single run
// sees the exact same snapshot.
//
// Accessors are typed and lazy. They return null when the corresponding
// capability is absent, so an investigation that passed the runner's capability
// check can safely use `ctx.gl!`. Implementations MUST load-once-and-memoize so
// repeated calls within a run return identical data (snapshot isolation).

import type { Gstr2BRow } from "@aiql/doc-parsers";
import type { Capability, CapabilitySet } from "./capabilities";
import type { VendorComplianceInput } from "@aiql/pulse-engine";

export interface InvestigationPeriod {
  month: number;   // 1–12
  year:  number;   // e.g. 2026
  label: string;   // "MM-YYYY" e.g. "05-2026"
  start: Date;
  end:   Date;
}

// ─── Accessors ──────────────────────────────────────────────────────────────
// One per capability that exposes data. Each owns its own query; investigations
// never touch the DB or write SQL themselves.

export interface GlAccessor {
  getRawRows():      Promise<Record<string, unknown>[]>;  // memoized
  getConnectionId(): string;
  getPeriodStart():  Date | null;
  getPeriodEnd():    Date | null;
}

export interface ItcAccessor {
  getRows():         Promise<Gstr2BRow[]>;  // already parsed via parseGstr2B, memoized
  getConnectionId(): string;
}

export interface VendorComplianceAccessor {
  getLatestPeriod():            Promise<VendorComplianceInput[]>;
  getTrailing(periods: number): Promise<VendorComplianceInput[]>;
}

// ─── The context itself ────────────────────────────────────────────────────────

export interface BusinessContext {
  // Identity — immutable
  readonly organizationId: string;
  readonly period:         InvestigationPeriod;
  readonly snapshotId:     string;   // "CTX-20260701-001"
  readonly resolvedAt:     Date;
  readonly profileId:      string;   // which InvestigationProfile drove this run

  // Staleness flag — true if the underlying data is older than the freshness
  // window. The investigation still runs; the report surfaces the warning.
  readonly isStale:        boolean;
  readonly dataAsOf:       Date | null;

  // What's available — resolved before any investigation runs
  readonly capabilities:   CapabilitySet;

  // Typed accessors — null when the capability is absent
  readonly gl:              GlAccessor | null;
  readonly itc:             ItcAccessor | null;
  readonly vendorCompliance: VendorComplianceAccessor | null;
}

export function hasCapability(ctx: BusinessContext, cap: Capability): boolean {
  return ctx.capabilities.has(cap);
}

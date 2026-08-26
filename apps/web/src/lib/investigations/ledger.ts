// ─── Resolved-value ledger (Phase 3.7) ───────────────────────────────────────
//
// "found_total / resolved_total / open_total" — the honest version of the
// value claim, computed from the customer's own run history rather than
// asserted from sample files.
//
// Every distinct issue (identified by matchKey) is counted exactly once:
//   - resolvedTotalRs: sums impactRs on rows with status="resolved". A
//     finding's status/resolvedAt transitions exactly once, on exactly the
//     one row where it was last "open" before disappearing (see run-diff.ts
//     + persist.ts) — so this is a plain SUM with no risk of double-counting
//     the same issue across the many periods it may have been open for.
//   - openTotalRs: the latest CURRENT run's totalImpactRs. A run's own
//     findings are always freshly created with status="open" (only a PRIOR
//     run's rows ever become "resolved"), so this is exactly "what's open
//     right now" — again no double counting across periods.
//   - foundTotalRs: openTotalRs + resolvedTotalRs. Every distinct issue is in
//     exactly one bucket — currently open, or resolved at some point — so
//     this never double-counts a carried finding that spans several periods.
//
// Wording discipline (see docs/PLAN-PRACTICE-MODE.md 3.7): "resolved" or "no
// longer appears", never "recovered" — that requires the human confirmation
// in InvestigationFinding.disposition.

import { prisma } from "@aiql/db";

export interface LedgerTotals {
  foundTotalRs:    number;
  resolvedTotalRs: number;
  openTotalRs:     number;
  firstRunAt:      Date | null;
}

export interface LedgerScope {
  // Omit entirely for a firm-wide aggregate across every client. Pass a real
  // id for one client. Pass null for the legacy pre-practice-mode scope.
  connectionId?: string | null;
  // Restrict resolvedTotalRs (and firstRunAt) to runs/resolutions from this
  // date onward — the "trailing 12 months" variant from the plan. openTotalRs
  // is always "right now" — there is no meaningful trailing window for a
  // point-in-time snapshot of what's currently open.
  sinceDate?: Date;
}

export async function computeLedger(orgId: string, scope: LedgerScope = {}): Promise<LedgerTotals> {
  const connFilter = "connectionId" in scope ? { connectionId: scope.connectionId } : {};

  const [resolvedAgg, latestCurrentRun, firstRun] = await Promise.all([
    prisma.investigationFinding.aggregate({
      where: {
        status: "resolved",
        ...(scope.sinceDate ? { resolvedAt: { gte: scope.sinceDate } } : {}),
        run: { orgId, ...connFilter },
      },
      _sum: { impactRs: true },
    }),
    prisma.investigationRun.findFirst({
      where:   { orgId, status: "CURRENT", ...connFilter },
      orderBy: { startedAt: "desc" },
      select:  { totalImpactRs: true },
    }),
    prisma.investigationRun.findFirst({
      where:   { orgId, ...connFilter, ...(scope.sinceDate ? { startedAt: { gte: scope.sinceDate } } : {}) },
      orderBy: { startedAt: "asc" },
      select:  { startedAt: true },
    }),
  ]);

  const resolvedTotalRs = resolvedAgg._sum.impactRs ?? 0;
  const openTotalRs     = latestCurrentRun?.totalImpactRs ?? 0;

  return {
    foundTotalRs:    openTotalRs + resolvedTotalRs,
    resolvedTotalRs,
    openTotalRs,
    firstRunAt: firstRun?.startedAt ?? null,
  };
}

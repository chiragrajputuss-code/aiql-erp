/**
 * GET /api/v1/insights/summary
 *
 * Aggregates data-quality scans across ALL active connections in the org and
 * computes the "AIQL ROI" headline numbers shown in the value-summary banner
 * on the home dashboard:
 *   - Time saved (hours) vs. a manual close baseline
 *   - Total ₹ exposure flagged
 *   - Auto-resolved patterns (compounding moat — currently a placeholder)
 *
 * Caching: results are cached in-memory per-org for 5 minutes. The first user
 * to load the dashboard pays the scan cost; subsequent loads within the window
 * get the cached result instantly.
 */

import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { runDataQualityScan, type ScanResult } from "@aiql/close-engine";
import { CACHE, CACHE_TTL_MS, type CachedSummaryEntry } from "@/lib/summary-cache";

// ─── Time-saved benchmarks ────────────────────────────────────────────────────
// These come from the CA panel surveys used to build tools/ca-comparison.
// Numbers represent minutes a CA / article would spend on each task manually.

const MANUAL_MIN = {
  perVoucherImbalance: 1.5,
  perDuplicate:        0.8,
  perDateOutlier:      1.0,
  perMissingField:     0.6,
  perGstMismatch:      2.0,
  perSignAnomaly:      3.0,
  perUnclassifiedAcct: 0.5,
  perReconciliation:   45,   // bank / AP / AR / GST recon, each
  perCloseOverhead:    30,   // CSV → Excel → pivot, etc.
} as const;

const AIQL_MIN = {
  // CA opens one summary card per issue-type (not per row). Scanner aggregates
  // 2,674 outlier dates into a single "verify N entries dated outside period"
  // task — the CA reviews that task once, not 2,674 times.
  perIssueReview:   2.0,
  perAutoResolved:  0.1,    // near-instant
  perReconReview:   0.5,    // glance at variance + AI explanation
  perCloseOverhead: 8,      // log-in, dialog, sign-off
} as const;

// ─── Cache type alias ─────────────────────────────────────────────────────────

type CachedSummary = CachedSummaryEntry<SummaryPayload>;

// ─── Response shape ───────────────────────────────────────────────────────────

interface SummaryPayload {
  hasConnections:     boolean;
  /** True when at least one connection with the "demo_" prefix is active. */
  hasDemoConnections: boolean;
  connectionCount:    number;
  totalAnomalies:     number;
  totalExposureInr:   number;
  totalReconciliations: number;
  autoResolvedCount:  number;
  timeSavedHours:     number;
  topIssueTypes:      Array<{ code: string; count: number; exposure: number }>;
  /** ISO timestamp when this summary was computed (server-side). */
  computedAt:         string;
  /** Source: "cache" or "fresh" — useful for debugging stale issues. */
  source:             "cache" | "fresh";
}

// ─── Time saved calculation ───────────────────────────────────────────────────

function calculateTimeSaved(args: {
  imbalances:      number;
  duplicates:      number;
  dateOutliers:    number;
  missingFields:   number;
  gstMismatches:   number;
  signAnomalies:   number;
  unclassified:    number;
  /** Number of issue cards the CA reviews (one per check per connection). */
  totalIssueCards: number;
  reconciliations: number;
  autoResolved:    number;
  closeCycles:     number;
}): number {
  // Manual time = how long it takes a CA / article to FIND each individual row
  // by scrolling Tally/Excel. Scales with `affectedRows` since they have to
  // look at every entry. This is what AIQL replaces.
  const manual =
    args.imbalances      * MANUAL_MIN.perVoucherImbalance +
    args.duplicates      * MANUAL_MIN.perDuplicate        +
    args.dateOutliers    * MANUAL_MIN.perDateOutlier      +
    args.missingFields   * MANUAL_MIN.perMissingField     +
    args.gstMismatches   * MANUAL_MIN.perGstMismatch      +
    args.signAnomalies   * MANUAL_MIN.perSignAnomaly      +
    args.unclassified    * MANUAL_MIN.perUnclassifiedAcct +
    args.reconciliations * MANUAL_MIN.perReconciliation   +
    args.closeCycles     * MANUAL_MIN.perCloseOverhead;

  // AIQL time = how long the CA spends reviewing AIQL's findings. Scales with
  // `issue cards` (one summary per check per connection), NOT per row, because
  // the scanner pre-aggregates. e.g. "Verify 2,674 entries dated outside the
  // period" is ONE card the CA opens once, not 2,674 separate reviews.
  const aiql =
    args.totalIssueCards * AIQL_MIN.perIssueReview   +
    args.autoResolved    * AIQL_MIN.perAutoResolved  +
    args.reconciliations * AIQL_MIN.perReconReview   +
    args.closeCycles     * AIQL_MIN.perCloseOverhead;

  return Math.max(0, manual - aiql) / 60;
}

// ─── Compute summary fresh (no cache) ─────────────────────────────────────────

async function computeSummaryForOrg(orgId: string): Promise<SummaryPayload> {
  const connections = await prisma.erpConnection.findMany({
    where:  { orgId, status: "ACTIVE" },
    include: { uploadedFile: true },
  });

  const withTable = connections.filter((c) => c.uploadedFile?.tableName);

  const hasDemoConnections = connections.some((c) => c.id.startsWith("demo_"));

  if (withTable.length === 0) {
    return {
      hasConnections:       false,
      hasDemoConnections,
      connectionCount:      0,
      totalAnomalies:       0,
      totalExposureInr:     0,
      totalReconciliations: 0,
      autoResolvedCount:    0,
      timeSavedHours:       0,
      topIssueTypes:        [],
      computedAt:           new Date().toISOString(),
      source:               "fresh",
    };
  }

  // Run scans in parallel. For each connection, infer the close period from
  // the data: last 90 days from the most recent transaction.
  const scanResults: Array<ScanResult | null> = await Promise.all(
    withTable.map(async (conn) => {
      try {
        const tableName = conn.uploadedFile!.tableName;
        const dateRows = await prisma.$queryRawUnsafe<{ d: Date | string }[]>(
          `SELECT MAX(transaction_date) AS d FROM "${tableName}"`,
        );
        const maxDate = dateRows[0]?.d ? new Date(dateRows[0].d as string) : new Date();
        const start = new Date(maxDate);
        start.setDate(start.getDate() - 90);
        return await runDataQualityScan(conn.id, start, maxDate);
      } catch (err) {
        // Don't fail the entire summary if one connection scan errors
        console.error(`[insights] scan failed for connection ${conn.id}:`, err);
        return null;
      }
    }),
  );

  // ─── Aggregate ──────────────────────────────────────────────────────────────
  const issuesByCode = new Map<string, { count: number; exposure: number }>();
  let totalAnomalies   = 0;
  let totalExposure    = 0;
  let totalIssueCards  = 0; // one card per (check × connection) — drives AIQL review time
  let totalReconciliations = 0;

  const counters = {
    imbalances:    0,
    duplicates:    0,
    dateOutliers:  0,
    missingFields: 0,
    gstMismatches: 0,
    signAnomalies: 0,
    unclassified:  0,
  };

  for (const scan of scanResults) {
    if (!scan) continue;
    totalIssueCards += scan.issues.length;
    for (const issue of scan.issues) {
      totalAnomalies += issue.affectedRows;
      totalExposure  += issue.exposure ?? 0;

      const existing = issuesByCode.get(issue.code) ?? { count: 0, exposure: 0 };
      existing.count    += issue.affectedRows;
      existing.exposure += issue.exposure ?? 0;
      issuesByCode.set(issue.code, existing);

      switch (issue.code) {
        case "voucher_imbalance":      counters.imbalances    += issue.affectedRows; break;
        case "duplicate_transactions": counters.duplicates    += issue.affectedRows; break;
        case "date_outliers":          counters.dateOutliers  += issue.affectedRows; break;
        case "missing_fields":         counters.missingFields += issue.affectedRows; break;
        case "gst_mismatch":           counters.gstMismatches += issue.affectedRows; break;
        case "sign_anomalies":         counters.signAnomalies += issue.affectedRows; break;
        case "unclassified_accounts":  counters.unclassified  += issue.affectedRows; break;
      }
    }
  }

  // Reconciliation count: each connection typically generates ~4 recons (bank/AP/AR/GST).
  // For now we use a conservative estimate — once we persist real recon runs we'll
  // count those instead.
  totalReconciliations = withTable.length * 4;

  // Auto-resolved: sum appliedCount across knowledge entries that were applied
  // in the last 30 days. Each application = one task that AIQL closed without
  // human intervention because it matched a previously-captured pattern.
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const recentlyAppliedKnowledge = await prisma.orgBusinessKnowledge.findMany({
    where: {
      orgId,
      lastAppliedAt: { gte: THIRTY_DAYS_AGO },
    },
    select: { appliedCount: true },
  });
  // Conservative: each knowledge entry's count is capped at "applications
  // within the window" — but we don't track per-application timestamps yet.
  // For now we treat any recently-applied knowledge as contributing 1+ to the count.
  // (Once we add a KnowledgeApplication audit log, switch to that.)
  const autoResolvedCount = recentlyAppliedKnowledge.length;

  const timeSavedHours = calculateTimeSaved({
    ...counters,
    totalIssueCards,
    reconciliations: totalReconciliations,
    autoResolved:    autoResolvedCount,
    closeCycles:     withTable.length,
  });

  // Top 5 issue types by ₹ exposure
  const topIssueTypes = Array.from(issuesByCode.entries())
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 5);

  return {
    hasConnections:       true,
    hasDemoConnections,
    connectionCount:      withTable.length,
    totalAnomalies,
    totalExposureInr:     Math.round(totalExposure),
    totalReconciliations,
    autoResolvedCount,
    timeSavedHours:       Math.round(timeSavedHours * 10) / 10,
    topIssueTypes,
    computedAt:           new Date().toISOString(),
    source:               "fresh",
  };
}

// ─── Cache wrapper ────────────────────────────────────────────────────────────

async function getCachedSummary(orgId: string): Promise<SummaryPayload> {
  const hit = CACHE.get(orgId) as CachedSummary | undefined;
  if (hit && Date.now() - hit.computedAt.getTime() < CACHE_TTL_MS) {
    return { ...hit.data, source: "cache" };
  }
  const fresh = await computeSummaryForOrg(orgId);
  CACHE.set(orgId, { data: fresh, computedAt: new Date() });
  return fresh;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const summary = await getCachedSummary(user.orgId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[insights/summary] unhandled error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { computeLedger } from "@/lib/investigations/ledger";

// Returns one investigation run, shaped as the Investigation Report (JSON
// fields parsed back to objects). Three ways to select which run:
//   ?runId=        — that exact run, CURRENT or SUPERSEDED (a period doesn't
//                    stop existing once a later run supersedes it) — the
//                    period selector on the investigations page uses this.
//   ?connectionId= — the latest CURRENT run for that client.
//   (neither)      — the latest CURRENT run for the org, for backward
//                    compatibility with the legacy single-business path.
// Every path verifies the run/connection belongs to user.orgId before
// returning anything — a run belonging to another org 404s, same as an
// unowned connectionId. Returns { run: null } if nothing has been run yet
// for the requested scope.
export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const runId        = url.searchParams.get("runId");
  const connectionId = url.searchParams.get("connectionId");

  let run;
  if (runId) {
    run = await prisma.investigationRun.findFirst({
      where:   { id: runId, orgId: user.orgId },
      include: { findings: { orderBy: { createdAt: "asc" } } },
    });
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  } else {
    if (connectionId) {
      const owned = await prisma.erpConnection.findFirst({
        where:  { id: connectionId, orgId: user.orgId },
        select: { id: true },
      });
      if (!owned) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    run = await prisma.investigationRun.findFirst({
      where:   { orgId: user.orgId, status: "CURRENT", ...(connectionId ? { connectionId } : {}) },
      orderBy: { startedAt: "desc" },
      include: { findings: { orderBy: { createdAt: "asc" } } },
    });
    if (!run) return NextResponse.json({ run: null });
  }

  // Findings this run's diff marked resolved on the PRIOR run (absence-as-
  // evidence — see run-diff.ts) — "no longer appears since this run." A
  // finding's status/resolvedAt is set exactly once, by the single run whose
  // comparedToRunId points at it, so this is unambiguous even for a run
  // several periods in the past.
  const [resolvedFindings, ledger] = await Promise.all([
    run.comparedToRunId
      ? prisma.investigationFinding.findMany({
          where:   { runId: run.comparedToRunId, status: "resolved" },
          orderBy: { resolvedAt: "asc" },
          select:  {
            id: true, code: true, title: true, category: true, impactRs: true, resolvedAt: true,
            disposition: true, dispositionAt: true,
          },
        })
      : Promise.resolve([]),
    computeLedger(user.orgId, { connectionId: run.connectionId }),
  ]);

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };

  const findings = run.findings
    .map((f) => ({
      id:               f.id,
      investigationId:  f.investigationId,
      code:             f.code,
      category:         f.category,
      severity:         f.severity,
      title:            f.title,
      impactRs:         f.impactRs,
      businessQuestion: f.businessQuestion,
      conclusion:       f.conclusion,
      llmSummary:       f.llmSummary,
      resolvesWhen:     f.resolvesWhen,
      status:           f.status,
      changeStatus:     f.changeStatus,
      firstSeenPeriod:  f.firstSeenPeriod,
      evidence:        safeParse(f.evidenceJson, []),
      recommendation:  safeParse(f.recommendationJson, null),
      verificationSteps: safeParse(f.verificationJson, []),
    }))
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || (b.impactRs ?? 0) - (a.impactRs ?? 0));

  return NextResponse.json({
    run: {
      id:               run.id,
      connectionId:     run.connectionId,
      period:           run.period,
      status:           run.status,
      snapshotId:       run.snapshotId,
      resolvedAt:       run.resolvedAt.toISOString(),
      completedAt:      run.completedAt?.toISOString() ?? null,
      healthScore:      run.healthScore,
      totalImpactRs:    run.totalImpactRs,
      criticalCount:    run.criticalCount,
      warningCount:     run.warningCount,
      opportunityCount: run.opportunityCount,
      executiveSummary: run.executiveSummary,
      outcomes:         safeParse(run.investigationsJson, []),
      proactiveObservation: run.proactiveObservationJson ? safeParse(run.proactiveObservationJson, null) : null,
      boardBrief:           run.boardBriefJson ? safeParse(run.boardBriefJson, null) : null,
      counts:     { new: run.newCount, carried: run.carriedCount, resolved: run.resolvedCount },
      resolvedRs: run.resolvedRs,
      ledger: {
        foundTotalRs:    ledger.foundTotalRs,
        resolvedTotalRs: ledger.resolvedTotalRs,
        openTotalRs:     ledger.openTotalRs,
        firstRunAt:      ledger.firstRunAt?.toISOString() ?? null,
      },
      findings,
      resolvedFindings: resolvedFindings.map((f) => ({
        id: f.id, code: f.code, title: f.title, category: f.category,
        impactRs: f.impactRs, resolvedAt: f.resolvedAt?.toISOString() ?? null,
        disposition: f.disposition, dispositionAt: f.dispositionAt?.toISOString() ?? null,
      })),
    },
  });
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

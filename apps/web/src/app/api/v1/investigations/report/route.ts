import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

// Returns the latest CURRENT investigation run for the org, shaped as the
// Investigation Report (JSON fields parsed back to objects). Returns
// { run: null } if no investigation has been run yet.
export async function GET(_req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const run = await prisma.investigationRun.findFirst({
    where:   { orgId: user.orgId, status: "CURRENT" },
    orderBy: { startedAt: "desc" },
    include: { findings: { orderBy: { createdAt: "asc" } } },
  });

  if (!run) return NextResponse.json({ run: null });

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
      evidence:        safeParse(f.evidenceJson, []),
      recommendation:  safeParse(f.recommendationJson, null),
      verificationSteps: safeParse(f.verificationJson, []),
    }))
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || (b.impactRs ?? 0) - (a.impactRs ?? 0));

  return NextResponse.json({
    run: {
      id:               run.id,
      period:           run.period,
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
      findings,
    },
  });
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ─── Investigation persistence (web side) ────────────────────────────────────
//
// Writes one InvestigationRun + its findings, and supersedes the prior CURRENT
// run for the same (orgId, connectionId, period) — findings are SUPERSEDED,
// never deleted (Principle 7). Evidence/recommendation/verification are
// serialised to JSON (materialized, Principle 6).
//
// Scoping the supersede by connectionId (not just orgId+period) is what makes
// practice mode work: without it, running client B's investigation would mark
// client A's still-open findings as superseded, even though nothing about
// client A changed. With ctx.connectionId === null (the pre-practice-mode
// legacy path), Prisma's exact-null filter matches `connectionId IS NULL`,
// so single-business behaviour is unchanged.
//
// Historical continuity (Phase 3): before writing the new run, this diffs its
// findings against the client's most recent prior CURRENT run — whatever
// period that was, not just this exact period, so both "did May's issue get
// fixed by June" and "re-running May after fixing something" count as
// resolution (see run-diff.ts). Findings the prior run had that no longer
// appear are marked resolved on THAT prior row (absence-as-evidence,
// Principle 8) — never deleted. New findings are stamped new/carried plus a
// matchKey so a later run can diff against them in turn.

import { prisma } from "@aiql/db";
import { diffRuns } from "@aiql/investigation-engine";
import type { BusinessContext, ReportResult, PriorFindingRef } from "@aiql/investigation-engine";

export async function persistRun(
  ctx:        BusinessContext,
  report:     ReportResult,
  triggeredBy: "user" | "cron",
  startedAt:  Date,
): Promise<{ runId: string }> {
  const durationMs = Date.now() - startedAt.getTime();

  const runId = await prisma.$transaction(async (tx) => {
    // The most recent prior CURRENT run for this client, any period — this is
    // what gets diffed against and what resolved findings are written back
    // onto. Read BEFORE the supersede step below so a same-period re-run
    // still finds its own predecessor.
    const priorRun = await tx.investigationRun.findFirst({
      where:   { orgId: ctx.organizationId, connectionId: ctx.connectionId, status: "CURRENT" },
      orderBy: { startedAt: "desc" },
      include: { findings: { select: { matchKey: true, code: true, impactRs: true, firstSeenPeriod: true } } },
    });

    const priorFindings: PriorFindingRef[] = (priorRun?.findings ?? []).map((f) => ({
      matchKey:        f.matchKey,
      code:            f.code,
      impactRs:        f.impactRs,
      firstSeenPeriod: f.firstSeenPeriod,
    }));

    const diff = diffRuns(report.findings, priorFindings, ctx.period.label);

    // Supersede prior CURRENT runs for this client (connection) + period only.
    await tx.investigationRun.updateMany({
      where: {
        orgId:        ctx.organizationId,
        connectionId: ctx.connectionId,
        period:       ctx.period.label,
        status:       "CURRENT",
      },
      data: { status: "SUPERSEDED" },
    });

    // Findings that no longer appear are resolved on the prior run's own
    // rows — that run stays SUPERSEDED (or CURRENT, if it covered a
    // different period), its findings are never deleted, only marked.
    if (diff.resolved.length > 0 && priorRun) {
      await tx.investigationFinding.updateMany({
        where: { runId: priorRun.id, matchKey: { in: diff.resolved.map((r) => r.matchKey) } },
        data:  { status: "resolved", resolvedAt: new Date() },
      });
    }

    const run = await tx.investigationRun.create({
      data: {
        orgId:           ctx.organizationId,
        connectionId:    ctx.connectionId,
        comparedToRunId: priorRun?.id ?? null,
        period:      ctx.period.label,
        snapshotId:  ctx.snapshotId,
        resolvedAt:  ctx.resolvedAt,
        status:      "CURRENT",
        triggeredBy,
        startedAt,
        completedAt: new Date(),
        durationMs,
        healthScore:      report.healthScore,
        totalImpactRs:    report.totalImpactRs,
        criticalCount:    report.criticalCount,
        warningCount:     report.warningCount,
        opportunityCount: report.opportunityCount,
        executiveSummary: report.executiveSummary,
        investigationsJson: JSON.stringify(report.outcomes),
        proactiveObservationJson: report.proactiveObservation ? JSON.stringify(report.proactiveObservation) : null,
        boardBriefJson: report.boardBrief ? JSON.stringify(report.boardBrief) : null,
        findings: {
          create: diff.findings.map((f) => ({
            investigationId:    findingInvestigationId(f.code),
            code:               f.code,
            category:           f.category,
            severity:           f.severity,
            title:              f.title,
            impactRs:           f.impactRs,
            businessQuestion:   f.businessQuestion,
            conclusion:         f.conclusion,
            llmSummary:         f.llmSummary ?? null,
            evidenceJson:       JSON.stringify(f.evidence),
            recommendationJson: JSON.stringify(f.recommendation),
            verificationJson:   JSON.stringify(f.verificationSteps),
            resolvesWhen:       f.resolvesWhen,
            status:             f.status,
            changeStatus:       f.changeStatus,
            firstSeenPeriod:    f.firstSeenPeriod,
            matchKey:           f.matchKey,
          })),
        },
      },
    });
    return run.id;
  });

  return { runId };
}

// All GST-ITC-* findings belong to the gst-vendor-itc investigation. As more
// investigations ship, derive this from a code→id prefix map.
function findingInvestigationId(code: string): string {
  if (code.startsWith("GST-ITC")) return "gst-vendor-itc";
  return "unknown";
}

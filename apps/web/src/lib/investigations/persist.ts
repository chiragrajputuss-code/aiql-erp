// ─── Investigation persistence (web side) ────────────────────────────────────
//
// Writes one InvestigationRun + its findings, and supersedes the prior CURRENT
// run for the same (orgId, period) — findings are SUPERSEDED, never deleted
// (Principle 7). Evidence/recommendation/verification are serialised to JSON
// (materialized, Principle 6).

import { prisma } from "@aiql/db";
import type { BusinessContext, ReportResult } from "@aiql/investigation-engine";

export async function persistRun(
  ctx:        BusinessContext,
  report:     ReportResult,
  triggeredBy: "user" | "cron",
  startedAt:  Date,
): Promise<{ runId: string }> {
  const durationMs = Date.now() - startedAt.getTime();

  const runId = await prisma.$transaction(async (tx) => {
    // Supersede prior CURRENT runs for this org+period.
    await tx.investigationRun.updateMany({
      where: { orgId: ctx.organizationId, period: ctx.period.label, status: "CURRENT" },
      data:  { status: "SUPERSEDED" },
    });

    const run = await tx.investigationRun.create({
      data: {
        orgId:       ctx.organizationId,
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
          create: report.findings.map((f) => ({
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

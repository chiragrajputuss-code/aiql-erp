import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { runReport, getInvestigations, getDefaultProfile } from "@aiql/investigation-engine";
import { buildBusinessContext } from "@/lib/investigations/context-resolver";
import { makeInvestigationLlmFn } from "@/lib/investigations/llm-fn";
import { persistRun } from "@/lib/investigations/persist";

const bodySchema = z.object({
  year:  z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    let body: z.infer<typeof bodySchema> = {};
    try { body = bodySchema.parse(await req.json()); } catch { /* no body — use defaults */ }

    const startedAt = new Date();

    // Resolve the immutable Business Context snapshot for the org.
    const ctx = await buildBusinessContext({
      orgId: user.orgId,
      year:  body.year,
      month: body.month,
    });

    // Run the profile's investigations against the snapshot.
    const profile     = getDefaultProfile();
    const definitions = getInvestigations(profile.investigationIds);
    const report      = await runReport(definitions, ctx, { llmFn: makeInvestigationLlmFn() });

    // Persist (supersedes the prior CURRENT run for this period).
    const { runId } = await persistRun(ctx, report, "user", startedAt);

    return NextResponse.json({
      runId,
      snapshotId:       ctx.snapshotId,
      period:           ctx.period.label,
      resolvedAt:       ctx.resolvedAt.toISOString(),
      isStale:          ctx.isStale,
      capabilities:     [...ctx.capabilities],
      healthScore:      report.healthScore,
      criticalCount:    report.criticalCount,
      warningCount:     report.warningCount,
      opportunityCount: report.opportunityCount,
      totalImpactRs:    report.totalImpactRs,
      outcomes:         report.outcomes,
    });
  } catch (err) {
    console.error("[investigations/run]", err);
    return NextResponse.json(
      { error: "Investigation run failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}

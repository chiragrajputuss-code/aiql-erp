import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@aiql/db";
import { validateRequest } from "@/lib/auth";
import { runReport, getInvestigations, getDefaultProfile } from "@aiql/investigation-engine";
import { buildBusinessContext, AmbiguousItcSourceError } from "@/lib/investigations/context-resolver";
import { makeInvestigationLlmFn } from "@/lib/investigations/llm-fn";
import { persistRun } from "@/lib/investigations/persist";

const bodySchema = z.object({
  connectionId: z.string().optional(), // which client book (GL connection) to investigate
  year:  z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    let body: z.infer<typeof bodySchema> = {};
    try { body = bodySchema.parse(await req.json()); } catch { /* no body — use defaults */ }

    // Never trust a client-supplied connectionId without checking ownership —
    // otherwise an org could run (and read back) another org's investigation.
    if (body.connectionId) {
      const owned = await prisma.erpConnection.findFirst({
        where:  { id: body.connectionId, orgId: user.orgId },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }
    }

    const startedAt = new Date();

    // Resolve the immutable Business Context snapshot for this client book.
    const ctx = await buildBusinessContext({
      orgId:        user.orgId,
      connectionId: body.connectionId,
      year:         body.year,
      month:        body.month,
    });

    // Run the profile's investigations against the snapshot.
    const profile     = getDefaultProfile();
    const definitions = getInvestigations(profile.investigationIds);
    const report      = await runReport(definitions, ctx, { llmFn: makeInvestigationLlmFn() });

    // Persist (supersedes the prior CURRENT run for this period).
    const { runId } = await persistRun(ctx, report, "user", startedAt);

    return NextResponse.json({
      runId,
      connectionId:     ctx.connectionId,
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
    if (err instanceof AmbiguousItcSourceError) {
      // Not a server failure — a data-ambiguity condition the user can act
      // on (archive the stale connection). 409 = the request conflicts with
      // the current state of the org's uploaded data.
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[investigations/run]", err);
    return NextResponse.json(
      { error: "Investigation run failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}

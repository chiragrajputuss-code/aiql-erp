import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT      = 50;

interface RunRow {
  id: string; connectionId: string; period: string; startedAt: Date;
  healthScore: number | null; totalImpactRs: number;
  criticalCount: number; warningCount: number; opportunityCount: number;
}

function periodsOverlap(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null): boolean {
  if (!aStart || !bStart) return false;
  const aE = aEnd ?? aStart, bE = bEnd ?? bStart;
  return aStart <= bE && bStart <= aE;
}

// GET /api/v1/practice/overview?page=&limit=
// One row per client book (an ACTIVE connection holding a GL upload — the
// same definition of "client" used throughout practice mode) for the CA's
// weekly-habit screen. Deliberately bounded to a handful of aggregate
// queries regardless of client count — no N+1 across connections:
//   1. every ACTIVE connection + its documents (org-scoped, one query)
//   2. latest CURRENT InvestigationRun per connection (one raw DISTINCT ON)
//   3. open finding counts for just those runs (one groupBy)
// hasGstr2b is a simple period-overlap check against the org's GSTR-2B
// uploads — a lighter version of context-resolver's ambiguity resolution,
// good enough for a dashboard glance (the investigation run itself is the
// source of truth on whether ITC capability was actually available).
export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const pageParam  = Number(url.searchParams.get("page"));
  const limitParam = Number(url.searchParams.get("limit"));
  const page  = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const connections = await prisma.erpConnection.findMany({
    where: { orgId: user.orgId, status: "ACTIVE" },
    select: {
      id: true, displayName: true,
      uploadedFile:       { select: { documentType: true, periodStart: true, periodEnd: true } },
      workspaceDocuments: { select: { documentType: true, periodStart: true, periodEnd: true } },
    },
  });

  const glConnections = connections.filter((c) => c.uploadedFile?.documentType === "GL");
  const gstr2bRanges = connections
    .flatMap((c) => [c.uploadedFile, ...c.workspaceDocuments])
    .filter((d) => d !== null && d.documentType === "GSTR_2B")
    .map((d) => ({ periodStart: d!.periodStart, periodEnd: d!.periodEnd }));

  const runs = glConnections.length > 0
    ? await prisma.$queryRaw<RunRow[]>`
        SELECT DISTINCT ON ("connectionId")
          "id", "connectionId", "period", "startedAt", "healthScore", "totalImpactRs",
          "criticalCount", "warningCount", "opportunityCount"
        FROM "investigation_runs"
        WHERE "orgId" = ${user.orgId} AND status = 'CURRENT' AND "connectionId" IS NOT NULL
        ORDER BY "connectionId", "startedAt" DESC
      `
    : [];
  const runByConnection = new Map(runs.map((r) => [r.connectionId, r]));

  const runIds = runs.map((r) => r.id);
  const openCounts = runIds.length > 0
    ? await prisma.investigationFinding.groupBy({
        by: ["runId"], where: { runId: { in: runIds }, status: "open" }, _count: { _all: true },
      })
    : [];
  const openCountByRun = new Map(openCounts.map((c) => [c.runId, c._count._all]));

  const rows = glConnections.map((c) => {
    const run = runByConnection.get(c.id);
    const gl  = c.uploadedFile!;
    const hasGstr2b = gstr2bRanges.some((g) => periodsOverlap(gl.periodStart, gl.periodEnd, g.periodStart, g.periodEnd));

    return {
      connectionId:      c.id,
      clientName:        c.displayName,
      lastRunAt:         run?.startedAt.toISOString() ?? null,
      period:            run?.period ?? null,
      healthScore:       run?.healthScore ?? null,
      criticalCount:     run?.criticalCount ?? 0,
      warningCount:      run?.warningCount ?? 0,
      opportunityCount:  run?.opportunityCount ?? 0,
      totalImpactRs:     run?.totalImpactRs ?? 0,
      openFindingsCount: run ? (openCountByRun.get(run.id) ?? 0) : 0,
      hasGl:             true,
      hasGstr2b,
    };
  });

  rows.sort((a, b) => b.criticalCount - a.criticalCount || b.totalImpactRs - a.totalImpactRs);

  const totalClients   = rows.length;
  const neverRunCount  = rows.filter((r) => r.lastRunAt === null).length;
  const totalAtRiskRs  = rows.reduce((s, r) => s + r.totalImpactRs, 0);

  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);

  return NextResponse.json({
    clients: paged,
    summary: { totalClients, neverRunCount, totalAtRiskRs },
    pagination: { page, limit, total: totalClients },
  });
}

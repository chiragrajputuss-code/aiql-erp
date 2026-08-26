import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT      = 60;

// GET /api/v1/investigations/history?connectionId=&limit=
// Every past run for a client (CURRENT and SUPERSEDED — a period doesn't
// stop having happened once a later run supersedes it), newest first, for
// the period selector + trend view on the investigations page. Without
// connectionId: every run for the org (legacy single-business path).
export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const connectionId = url.searchParams.get("connectionId");
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (connectionId) {
    const owned = await prisma.erpConnection.findFirst({
      where:  { id: connectionId, orgId: user.orgId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const runs = await prisma.investigationRun.findMany({
    where:   { orgId: user.orgId, ...(connectionId ? { connectionId } : {}) },
    orderBy: { startedAt: "desc" },
    take:    limit,
    select: {
      id: true, period: true, startedAt: true, status: true,
      healthScore: true, totalImpactRs: true, criticalCount: true,
      newCount: true, carriedCount: true, resolvedCount: true, resolvedRs: true,
    },
  });

  return NextResponse.json({
    runs: runs.map((r) => ({
      runId:         r.id,
      period:        r.period,
      startedAt:     r.startedAt.toISOString(),
      status:        r.status,
      healthScore:   r.healthScore,
      totalImpactRs: r.totalImpactRs,
      criticalCount: r.criticalCount,
      counts: { new: r.newCount, carried: r.carriedCount, resolved: r.resolvedCount },
      resolvedRs: r.resolvedRs,
    })),
  });
}

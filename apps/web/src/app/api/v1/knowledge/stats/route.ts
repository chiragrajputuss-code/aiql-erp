import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { telemetryStart } from "@/lib/telemetry";

/**
 * GET /api/v1/knowledge/stats
 *
 * Aggregates this org's knowledge-base usage:
 *   - rowsTotal             how many knowledge entries exist
 *   - rowsByVerdict         breakdown {NORMAL, INVESTIGATE, ANNOTATED, REJECTED}
 *   - rowsBySource          breakdown {SCAN_ISSUE, RECONCILIATION, ...}
 *   - rowsWithEmbedding     how many are embeddable (Ollama-ready)
 *   - proxyCalls            { last30d: total, withKnowledge: n, hitRate: pct }
 *   - savedFromAutoResolve  how many close-period anomaly tasks were auto-resolved
 *
 * Powers the Knowledge dashboard. The "hit rate" graph is the cost-curve
 * pitch — the longer you've used AIQL, the more LLM calls get answered
 * from your own knowledge instead of fresh inference.
 */

export async function GET() {
  const t = telemetryStart("knowledge.stats");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const since = new Date(Date.now() - 30 * 86_400_000);

    const [
      rowsTotal,
      verdictRows,
      sourceRows,
      embeddedCountRows,
      proxyTotal,
      proxyWithKnowledge,
    ] = await Promise.all([
      prisma.orgBusinessKnowledge.count({ where: { orgId: user.orgId } }),
      prisma.orgBusinessKnowledge.groupBy({
        by:    ["verdict"],
        where: { orgId: user.orgId },
        _count: { _all: true },
      }),
      prisma.orgBusinessKnowledge.groupBy({
        by:    ["source"],
        where: { orgId: user.orgId },
        _count: { _all: true },
      }),
      // Raw count of rows where embedding is not null. Prisma can't filter
      // on Unsupported types, so we use raw SQL.
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "org_business_knowledge"
         WHERE "orgId" = $1 AND "embedding" IS NOT NULL`,
        user.orgId
      ),
      prisma.llmProxyAuditLog.count({
        where: { orgId: user.orgId, createdAt: { gte: since } },
      }),
      prisma.llmProxyAuditLog.count({
        where: { orgId: user.orgId, createdAt: { gte: since }, knowledgeApplied: { gt: 0 } },
      }),
    ]);

    const rowsByVerdict: Record<string, number> = {};
    for (const r of verdictRows) rowsByVerdict[r.verdict] = r._count._all;

    const rowsBySource: Record<string, number> = {};
    for (const r of sourceRows) rowsBySource[r.source] = r._count._all;

    const rowsWithEmbedding = Number(embeddedCountRows[0]?.count ?? 0n);

    const hitRate = proxyTotal > 0 ? proxyWithKnowledge / proxyTotal : 0;

    t.done({
      status: 200,
      rowsTotal, rowsWithEmbedding,
      proxyTotal, proxyWithKnowledge,
    });

    return NextResponse.json({
      rowsTotal,
      rowsByVerdict,
      rowsBySource,
      rowsWithEmbedding,
      embeddingCoverage: rowsTotal > 0 ? rowsWithEmbedding / rowsTotal : 0,
      proxy: {
        last30d: {
          total:         proxyTotal,
          withKnowledge: proxyWithKnowledge,
          hitRate,                     // 0..1
          hitRatePct:    Math.round(hitRate * 100),
        },
      },
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[knowledge/stats GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

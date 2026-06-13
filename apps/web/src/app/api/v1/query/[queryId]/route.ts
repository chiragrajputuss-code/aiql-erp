import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

// ─── GET /api/v1/query/:queryId ───────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { queryId: string } }
) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const log = await prisma.queryLog.findFirst({
    where: { id: params.queryId, orgId: user.orgId },
  });

  if (!log) return NextResponse.json({ error: "Query log not found" }, { status: 404 });

  return NextResponse.json({
    id:                   log.id,
    question:             log.question,
    tokenisedQuestion:    log.tokenisedQuestion,
    generatedSql:         log.generatedSql,
    confidence:           log.confidence,
    verdict:              log.verdict,
    provider:             log.llmProvider,
    model:                log.llmModel,
    cost:                 log.estimatedCostUsd,
    executionTimeMs:      log.executionTimeMs,
    fromTemplate:         log.fromTemplate,
    status:               log.status,
    rowCount:             log.rowCount,
    errorMessage:         log.errorMessage,
    auditLog:             log.tokenisationAuditJson
                            ? JSON.parse(log.tokenisationAuditJson)
                            : [],
    createdAt:            log.createdAt,
  });
}

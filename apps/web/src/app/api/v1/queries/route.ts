import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

// ─── Query param schema ───────────────────────────────────────────────────────

const VALID_STATUSES = ["PENDING", "COMPLETED", "FAILED", "LOW_CONFIDENCE"] as const;
const VALID_VERDICTS = ["execute", "execute_with_warning", "needs_clarification"] as const;

const queryParamsSchema = z.object({
  status:       z.enum(VALID_STATUSES).optional(),
  verdict:      z.enum(VALID_VERDICTS).optional(),
  connectionId: z.string().optional(),
  from:         z.string().datetime({ offset: true }).optional(),
  to:           z.string().datetime({ offset: true }).optional(),
  limit:        z.coerce.number().int().min(1).max(200).default(50),
  cursor:       z.string().optional(),
});

// ─── GET /api/v1/queries ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = queryParamsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { status, verdict, connectionId, from, to, limit, cursor } = parsed.data;

  const where = {
    orgId: user.orgId,
    ...(status       && { status }),
    ...(verdict      && { verdict }),
    ...(connectionId && { connectionId }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to)   }),
      },
    }),
    // cursor-based pagination: only rows older than the cursor row
    ...(cursor && { id: { lt: cursor } }),
  };

  // Fetch limit+1 to detect whether a next page exists
  const rows = await prisma.queryLog.findMany({
    where,
    select: {
      id:               true,
      connectionId:     true,
      question:         true,
      generatedSql:     true,
      confidence:       true,
      verdict:          true,
      status:           true,
      llmProvider:      true,
      llmModel:         true,
      estimatedCostUsd: true,
      executionTimeMs:  true,
      fromTemplate:     true,
      fromCache:        true,
      rowCount:         true,
      errorMessage:     true,
      createdAt:        true,
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasNextPage = rows.length > limit;
  const data        = hasNextPage ? rows.slice(0, limit) : rows;
  const nextCursor  = hasNextPage ? data[data.length - 1]?.id ?? null : null;

  return NextResponse.json({ data, nextCursor, limit });
}

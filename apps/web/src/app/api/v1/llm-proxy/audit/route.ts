import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { telemetryStart } from "@/lib/telemetry";

/**
 * GET /api/v1/llm-proxy/audit
 *
 * Returns the org's recent proxy calls — what was masked, how big the prompt
 * was, what status the upstream returned. Powers the demo page "what left
 * your box" view and the compliance audit trail.
 */

export async function GET(req: NextRequest) {
  const t = telemetryStart("llm_proxy.audit.list");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);

    const logs = await prisma.llmProxyAuditLog.findMany({
      where:   { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });

    // Parse maskedJson eagerly so the client doesn't have to
    const items = logs.map((l) => {
      let masked: Array<{ category: string; count: number }> = [];
      try {
        const parsed = JSON.parse(l.maskedJson) as unknown;
        if (Array.isArray(parsed)) masked = parsed as Array<{ category: string; count: number }>;
      } catch { /* malformed — leave empty */ }
      return {
        id:               l.id,
        provider:         l.provider,
        model:            l.model,
        masked,
        maskedTotal:      masked.reduce((sum, m) => sum + m.count, 0),
        promptChars:      l.promptChars,
        responseChars:    l.responseChars,
        tokensIn:         l.tokensIn,
        tokensOut:        l.tokensOut,
        upstreamStatus:   l.upstreamStatus,
        knowledgeApplied: l.knowledgeApplied,
        durationMs:       l.durationMs,
        errorMessage:     l.errorMessage,
        createdAt:        l.createdAt,
      };
    });

    t.done({ status: 200, count: items.length });
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

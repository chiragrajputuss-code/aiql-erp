import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { runFluxAnalysis } from "@aiql/close-engine";

type Ctx = { params: { connectionId: string } };

const bodySchema = z.object({
  startDate:     z.string().datetime({ offset: true }),
  endDate:       z.string().datetime({ offset: true }),
  withAI:        z.boolean().optional(),
  maxAIAnalyses: z.number().int().min(0).max(30).optional(),
});

// POST /api/v1/connections/:id/flux — run period-over-period flux analysis
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { connectionId } = ctx.params;

    const connection = await prisma.erpConnection.findFirst({
      where: { id: connectionId, orgId: user.orgId },
    });
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await runFluxAnalysis(
      connectionId,
      new Date(parsed.data.startDate),
      new Date(parsed.data.endDate),
      { withAI: parsed.data.withAI, maxAIAnalyses: parsed.data.maxAIAnalyses }
    );

    // BigInt safety
    const safe = JSON.parse(
      JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    );
    return NextResponse.json(safe);
  } catch (err) {
    console.error("[flux POST]", err);
    return NextResponse.json(
      { error: "Flux analysis failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { computeReadinessScore } from "@aiql/close-engine";

type Ctx = { params: { periodId: string } };

// GET /api/v1/close/periods/:periodId/readiness — compute close readiness score
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { periodId } = ctx.params;

    const period = await prisma.closePeriod.findFirst({
      where: { id: periodId, orgId: user.orgId },
      select: { id: true },
    });
    if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const readiness = await computeReadinessScore(periodId);
    return NextResponse.json(readiness);
  } catch (err) {
    console.error("[readiness GET]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

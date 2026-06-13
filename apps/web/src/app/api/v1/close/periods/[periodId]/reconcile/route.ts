import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { runAllReconciliations } from "@aiql/close-engine";

type Ctx = { params: { periodId: string } };

// POST /api/v1/close/periods/:periodId/reconcile — run all pending recons for a period
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { periodId } = ctx.params;

    const period = await prisma.closePeriod.findFirst({
      where: { id: periodId, orgId: user.orgId },
    });
    if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });

    const results = await runAllReconciliations(periodId);
    return NextResponse.json({ ran: results.length, results });
  } catch (err) {
    console.error("[close/periods reconcile POST]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

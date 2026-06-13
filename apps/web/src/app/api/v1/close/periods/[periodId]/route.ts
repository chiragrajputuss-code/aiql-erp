import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { getPeriodWithTasks, calculateProgress } from "@aiql/close-engine";

type Ctx = { params: { periodId: string } };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { periodId } = ctx.params;

    const meta = await prisma.closePeriod.findFirst({
      where: { id: periodId, orgId: user.orgId },
    });
    if (!meta) return NextResponse.json({ error: "Period not found" }, { status: 404 });

    const [period, progress] = await Promise.all([
      getPeriodWithTasks(periodId),
      calculateProgress(periodId),
    ]);

    return NextResponse.json({ period, progress });
  } catch (err) {
    console.error("[close/periods/:id GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { runReconciliation, getReconciliationDetail } from "@aiql/close-engine";

type Ctx = { params: { reconId: string } };

// POST /api/v1/close/reconcile/:reconId — trigger a single reconciliation run
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { reconId } = ctx.params;

    // Verify recon belongs to this org
    const recon = await prisma.reconciliation.findFirst({
      where: { id: reconId },
      include: { task: { include: { period: true } } },
    });
    if (!recon || recon.task.period.orgId !== user.orgId) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 });
    }

    const detail = await runReconciliation(reconId);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[close/reconcile POST]", err);
    return NextResponse.json(
      { error: "Reconciliation failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/v1/close/reconcile/:reconId — fetch detail (including variance items)
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { reconId } = ctx.params;

    const recon = await prisma.reconciliation.findFirst({
      where: { id: reconId },
      include: { task: { include: { period: true } } },
    });
    if (!recon || recon.task.period.orgId !== user.orgId) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 });
    }

    const detail = await getReconciliationDetail(reconId);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[close/reconcile GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

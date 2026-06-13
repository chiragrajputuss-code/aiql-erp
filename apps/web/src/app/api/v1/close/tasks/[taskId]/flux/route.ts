import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { runFluxForTask, getFluxRunForTask } from "@aiql/close-engine";

type Ctx = { params: { taskId: string } };

async function verifyTaskOwnership(taskId: string, orgId: string) {
  const task = await prisma.closeTask.findFirst({
    where:   { id: taskId },
    include: { period: true },
  });
  if (!task || task.period.orgId !== orgId) return null;
  return task;
}

// POST /api/v1/close/tasks/:taskId/flux — run (or re-run) flux for the task's period
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;
    const task = await verifyTaskOwnership(taskId, user.orgId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const run = await runFluxForTask(taskId);

    // BigInt safety
    const safe = JSON.parse(
      JSON.stringify(run, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    );
    return NextResponse.json(safe);
  } catch (err) {
    console.error("[task flux POST]", err);
    return NextResponse.json(
      { error: "Flux analysis failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/v1/close/tasks/:taskId/flux — fetch the latest persisted run for this task
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;
    const task = await verifyTaskOwnership(taskId, user.orgId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const run = await getFluxRunForTask(taskId);
    if (!run) return NextResponse.json({ run: null });

    const safe = JSON.parse(
      JSON.stringify(run, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    );
    return NextResponse.json({ run: safe });
  } catch (err) {
    console.error("[task flux GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

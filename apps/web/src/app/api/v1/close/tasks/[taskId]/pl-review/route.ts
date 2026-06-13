import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import {
  startPlReview,
  submitPlAnswers,
  getPlSessionForTask,
} from "@aiql/close-engine";

type Ctx = { params: { taskId: string } };

async function verifyTaskOwnership(taskId: string, orgId: string) {
  const task = await prisma.closeTask.findFirst({
    where:   { id: taskId },
    include: { period: { include: { connection: true } } },
  });
  if (!task || task.period.orgId !== orgId) return null;
  return task;
}

// GET /api/v1/close/tasks/:taskId/pl-review — fetch existing session for this task
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;
    const task = await verifyTaskOwnership(taskId, user.orgId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const session = await getPlSessionForTask(taskId);
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[pl-review GET]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/v1/close/tasks/:taskId/pl-review — start (or restart) P&L review
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;
    const task = await verifyTaskOwnership(taskId, user.orgId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const result = await startPlReview({
      orgId:        user.orgId,
      connectionId: task.period.connectionId,
      startDate:    task.period.startDate,
      endDate:      task.period.endDate,
      taskId,
    });

    const safe = JSON.parse(JSON.stringify(result, (_k, v) => typeof v === "bigint" ? Number(v) : v));
    return NextResponse.json(safe);
  } catch (err) {
    console.error("[pl-review POST]", err);
    return NextResponse.json(
      { error: "P&L review failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/close/tasks/:taskId/pl-review — submit user answers to questions
const answerSchema = z.object({
  sessionId: z.string(),
  answers:   z.array(z.object({
    questionId: z.string(),
    answer:     z.string(),
    skipped:    z.boolean(),
  })),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;
    const task = await verifyTaskOwnership(taskId, user.orgId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const body = await req.json();
    const parsed = answerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const result = await submitPlAnswers(parsed.data.sessionId, parsed.data.answers);
    const safe = JSON.parse(JSON.stringify(result, (_k, v) => typeof v === "bigint" ? Number(v) : v));
    return NextResponse.json(safe);
  } catch (err) {
    console.error("[pl-review PATCH]", err);
    return NextResponse.json(
      { error: "Submit failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

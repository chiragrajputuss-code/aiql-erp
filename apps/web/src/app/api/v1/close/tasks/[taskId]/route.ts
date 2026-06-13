import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { updateTaskStatus } from "@aiql/close-engine";
import { bumpUsage } from "@/lib/close-preferences";

type Ctx = { params: { taskId: string } };

// GET /api/v1/close/tasks/:taskId
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;
    const task = await prisma.closeTask.findFirst({
      where:   { id: taskId },
      include: { period: true, reconciliations: true },
    });
    if (!task || task.period.orgId !== user.orgId)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });

    return NextResponse.json(task);
  } catch (err) {
    console.error("[close/tasks GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  status:     z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED"]).optional(),
  notes:      z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate:    z.string().datetime({ offset: true }).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { taskId } = ctx.params;

    // Verify task belongs to this org
    const task = await prisma.closeTask.findFirst({
      where:   { id: taskId },
      include: { period: true },
    });
    if (!task || task.period.orgId !== user.orgId)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { status, notes, assigneeId, dueDate } = parsed.data;

    // Update assignee / dueDate directly (don't go through status cascade)
    if (assigneeId !== undefined || dueDate !== undefined) {
      await prisma.closeTask.update({
        where: { id: taskId },
        data: {
          assigneeId: assigneeId ?? undefined,
          dueDate:    dueDate ? new Date(dueDate) : dueDate === null ? null : undefined,
        },
      });
    }

    let updated;
    if (status) {
      // Capture period status BEFORE update so we can detect a transition to COMPLETED
      const periodBefore = await prisma.closePeriod.findUnique({
        where:  { id: task.periodId },
        select: { status: true, closeProfile: true, orgId: true },
      });

      updated = await updateTaskStatus(taskId, status, notes);

      // If this update completed the period, bump the org's usage count for
      // its profile. We bump on completion (not creation) so abandoned periods
      // don't inflate the "what profile is most useful" stat.
      if (periodBefore && periodBefore.status !== "COMPLETED") {
        const periodAfter = await prisma.closePeriod.findUnique({
          where:  { id: task.periodId },
          select: { status: true },
        });
        if (periodAfter?.status === "COMPLETED") {
          try {
            const prefs = await prisma.orgClosePreferences.findUnique({
              where: { orgId: periodBefore.orgId },
            });
            await prisma.orgClosePreferences.upsert({
              where:  { orgId: periodBefore.orgId },
              update: {
                lastClosedAt:   new Date(),
                usageCountJson: bumpUsage(prefs?.usageCountJson, periodBefore.closeProfile),
              },
              create: {
                orgId:          periodBefore.orgId,
                lastClosedAt:   new Date(),
                usageCountJson: bumpUsage(null, periodBefore.closeProfile),
              },
            });
          } catch (err) {
            console.warn("[close/tasks PATCH] failed to bump usage:", (err as Error).message);
          }
        }
      }
    } else {
      updated = await prisma.closeTask.findUniqueOrThrow({
        where:   { id: taskId },
        include: { reconciliations: true },
      });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[close/tasks/:id PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

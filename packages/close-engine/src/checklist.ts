import { prisma, type CloseProfile as DbCloseProfile } from "@aiql/db";
import type { CloseTemplate, PeriodWithTasks, ProgressSummary, TaskWithRecon } from "./types";

export interface CreatePeriodMeta {
  closeProfile?:        DbCloseProfile;
  userIntent?:          string | null;
  intentSummaryJson?:   string | null;
  customWatchItems?:    string[];
  profileSnapshotJson?: string | null;
}

// ─── Period creation ──────────────────────────────────────────────────────────

export async function createClosePeriodFromTemplate(
  orgId:         string,
  connectionId:  string,
  connectionIds: string[],
  periodName:    string,
  startDate:     Date,
  endDate:       Date,
  template:      CloseTemplate,
  targetCompletionDate?: Date,
  tableName?:    string,
  scanResultJson?: string,
  meta?:         CreatePeriodMeta
): Promise<PeriodWithTasks> {
  const periodId = await prisma.$transaction(async (tx) => {
    // 1. Create the period
    const period = await tx.closePeriod.create({
      data: {
        orgId,
        connectionId,
        connectionIds,
        name:        periodName,
        periodType:  template.periodType,
        startDate,
        endDate,
        targetCompletionDate: targetCompletionDate ?? null,
        scanResultJson:       scanResultJson ?? null,
        closeProfile:         meta?.closeProfile ?? "STANDARD",
        userIntent:           meta?.userIntent ?? null,
        intentSummaryJson:    meta?.intentSummaryJson ?? null,
        customWatchItems:     meta?.customWatchItems ?? [],
        profileSnapshotJson:  meta?.profileSnapshotJson ?? null,
      },
    });

    // 2. Create all tasks (without dependencies — we resolve after IDs are known)
    const createdTasks = await Promise.all(
      template.tasks.map((t) =>
        tx.closeTask.create({
          data: {
            periodId:    period.id,
            title:       t.title,
            category:    t.category,
            autoComplete: t.autoComplete,
            sortOrder:   t.sortOrder,
            dependsOnIds: [], // filled in next step
          },
        })
      )
    );

    // 3. Build key → DB ID map
    const keyToId = new Map<string, string>(
      template.tasks.map((t, i) => [t.key, createdTasks[i]!.id])
    );

    // 4. Patch each task with resolved dependency IDs
    await Promise.all(
      template.tasks.map((t, i) => {
        const resolvedDeps = t.dependsOnKeys
          .map((k) => keyToId.get(k))
          .filter((id): id is string => !!id);

        return tx.closeTask.update({
          where: { id: createdTasks[i]!.id },
          data:  { dependsOnIds: resolvedDeps },
        });
      })
    );

    // 5. Create Reconciliation records for auto-complete tasks
    const startIso = startDate.toISOString().slice(0, 10);
    const endIso   = endDate.toISOString().slice(0, 10);
    const table    = tableName ?? "gl_entries";

    await Promise.all(
      template.tasks
        .filter((t) => t.reconciliation)
        .map((t) => {
          const r    = t.reconciliation!;
          const taskId = keyToId.get(t.key)!;

          const interpolate = (sql: string) =>
            sql
              .replace(/{tableName}/g, table)
              .replace(/{startDate}/g, startIso)
              .replace(/{endDate}/g, endIso)
              .trim();

          return tx.reconciliation.create({
            data: {
              taskId,
              name:              r.name,
              sourceQuery:       interpolate(r.sourceQuery),
              targetQuery:       interpolate(r.targetQuery),
              detailQuery:       r.detailQuery ? interpolate(r.detailQuery) : null,
              paramsJson:        JSON.stringify(r.params ?? []),
              varianceThreshold: r.varianceThreshold,
            },
          });
        })
    );

    return period.id;
  });

  // Set initial BLOCKED state for tasks whose dependencies aren't met yet
  await resolveDependencies(periodId);

  return getPeriodWithTasks(periodId);
}

// ─── Dependency resolution ────────────────────────────────────────────────────

export async function resolveDependencies(periodId: string): Promise<void> {
  const tasks = await prisma.closeTask.findMany({ where: { periodId } });

  // Compute new statuses iteratively until stable. BLOCKED propagates downstream
  // through the dependency graph — task A blocked → task B (depends on A) blocked too.
  const statusById = new Map<string, string>(tasks.map((t) => [t.id, t.status]));
  const updates    = new Map<string, string>();

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;

    for (const task of tasks) {
      if (task.status === "COMPLETED" || task.status === "FAILED") continue;

      const current = statusById.get(task.id)!;

      const anyDepFailedOrBlocked = task.dependsOnIds.some((id) => {
        const s = statusById.get(id);
        return s === "FAILED" || s === "BLOCKED";
      });

      const allDepsDone = task.dependsOnIds.every(
        (id) => statusById.get(id) === "COMPLETED"
      );

      let next = current;
      if (anyDepFailedOrBlocked) {
        next = "BLOCKED";
      } else if (current === "BLOCKED" && allDepsDone) {
        next = "PENDING"; // unblock
      } else if (current === "BLOCKED" && task.dependsOnIds.length === 0) {
        next = "PENDING"; // task with no deps shouldn't be blocked
      }

      if (next !== current) {
        statusById.set(task.id, next);
        updates.set(task.id, next);
        changed = true;
      }
    }
  }

  // Persist all changes
  await Promise.all(
    Array.from(updates.entries()).map(([id, status]) =>
      prisma.closeTask.update({ where: { id }, data: { status: status as never } })
    )
  );
}

// ─── Task status update ───────────────────────────────────────────────────────

export async function updateTaskStatus(
  taskId:    string,
  newStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "BLOCKED",
  notes?:    string
): Promise<TaskWithRecon> {
  await prisma.closeTask.update({
    where: { id: taskId },
    data: {
      status:      newStatus,
      notes:       notes ?? undefined,
      completedAt: newStatus === "COMPLETED" ? new Date() : undefined,
    },
  });

  // Re-resolve dependencies across the whole period
  const task = await prisma.closeTask.findUniqueOrThrow({ where: { id: taskId } });
  await resolveDependencies(task.periodId);
  await recalculateProgress(task.periodId);

  return getTaskWithRecon(taskId);
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function recalculateProgress(periodId: string): Promise<void> {
  const tasks = await prisma.closeTask.findMany({ where: { periodId } });
  const total     = tasks.length;
  if (total === 0) return;

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const pct       = Math.round((completed / total) * 100);

  const allDone   = completed === total;

  await prisma.closePeriod.update({
    where: { id: periodId },
    data: {
      completionPct: pct,
      status:        allDone ? "COMPLETED" : pct > 0 ? "IN_PROGRESS" : "PENDING",
      completedAt:   allDone ? new Date() : null,
    },
  });
}

export async function calculateProgress(periodId: string): Promise<ProgressSummary> {
  const tasks = await prisma.closeTask.findMany({ where: { periodId } });
  const total      = tasks.length;
  const completed  = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const failed     = tasks.filter((t) => t.status === "FAILED").length;
  const blocked    = tasks.filter((t) => t.status === "BLOCKED").length;
  const pending    = tasks.filter((t) => t.status === "PENDING").length;

  return {
    periodId,
    total,
    completed,
    inProgress,
    failed,
    blocked,
    pending,
    pct: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// ─── Blockers ─────────────────────────────────────────────────────────────────

export async function getBlockers(periodId: string): Promise<TaskWithRecon[]> {
  const tasks = await prisma.closeTask.findMany({
    where:   { periodId, status: "FAILED" },
    include: { reconciliations: true },
    orderBy: { sortOrder: "asc" },
  });

  return tasks.map(toTaskWithRecon);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPeriodWithTasks(periodId: string): Promise<PeriodWithTasks> {
  const period = await prisma.closePeriod.findUniqueOrThrow({
    where:   { id: periodId },
    include: {
      tasks: {
        orderBy: { sortOrder: "asc" },
        include: { reconciliations: true },
      },
    },
  });

  return {
    id:                    period.id,
    orgId:                 period.orgId,
    connectionId:          period.connectionId,
    connectionIds:         period.connectionIds,
    name:                  period.name,
    periodType:            period.periodType,
    status:                period.status,
    startDate:             period.startDate,
    endDate:               period.endDate,
    targetCompletionDate:  period.targetCompletionDate,
    completionPct:         period.completionPct,
    completedAt:           period.completedAt,
    closeProfile:          period.closeProfile,
    userIntent:            period.userIntent,
    intentSummaryJson:     period.intentSummaryJson,
    customWatchItems:      period.customWatchItems,
    profileSnapshotJson:   period.profileSnapshotJson,
    tasks:                 period.tasks.map(toTaskWithRecon),
  };
}

export async function getTaskWithRecon(taskId: string): Promise<TaskWithRecon> {
  const task = await prisma.closeTask.findUniqueOrThrow({
    where:   { id: taskId },
    include: { reconciliations: true },
  });
  return toTaskWithRecon(task);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

type TaskRow = {
  id: string; periodId: string; title: string; category: string;
  autoComplete: boolean; status: string; assigneeId: string | null;
  dueDate: Date | null; notes: string | null; sortOrder: number;
  dependsOnIds: string[]; completedAt: Date | null;
  reconciliations: {
    id: string; name: string; status: string;
    sourceBalance: number | null; targetBalance: number | null;
    variance: number | null; aiExplanation: string | null; lastRunAt: Date | null;
  }[];
};

function toTaskWithRecon(task: TaskRow): TaskWithRecon {
  return {
    id:              task.id,
    periodId:        task.periodId,
    title:           task.title,
    category:        task.category as TaskWithRecon["category"],
    autoComplete:    task.autoComplete,
    status:          task.status as TaskWithRecon["status"],
    assigneeId:      task.assigneeId,
    dueDate:         task.dueDate,
    notes:           task.notes,
    sortOrder:       task.sortOrder,
    dependsOnIds:    task.dependsOnIds,
    completedAt:     task.completedAt,
    reconciliations: task.reconciliations.map((r) => ({
      id:            r.id,
      name:          r.name,
      status:        r.status as TaskWithRecon["reconciliations"][number]["status"],
      sourceBalance: r.sourceBalance,
      targetBalance: r.targetBalance,
      variance:      r.variance,
      aiExplanation: r.aiExplanation,
      lastRunAt:     r.lastRunAt,
    })),
  };
}

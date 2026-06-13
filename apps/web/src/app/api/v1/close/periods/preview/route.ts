import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma, type CloseProfile } from "@aiql/db";
import {
  generateAdaptiveTemplate,
  parseUserIntent,
  prepareCloseContext,
  type CloseIntent,
} from "@aiql/close-engine";
import { telemetryStart } from "@/lib/telemetry";

/**
 * POST /api/v1/close/periods/preview
 *
 * Returns the task list that WOULD be generated for the given profile + intent,
 * without persisting anything. Powers the wizard preview screen.
 *
 * For non-STANDARD profiles, also returns a `diff` against the STANDARD baseline
 * so the user can see exactly what their choice changed (added / removed tasks).
 */

const previewSchema = z.object({
  connectionId:  z.string().min(1),
  startDate:     z.string().datetime({ offset: true }),
  endDate:       z.string().datetime({ offset: true }),
  profile:       z.enum(["STANDARD", "QUICK", "YEAR_END", "ADAPTIVE"]),
  userIntent:    z.string().max(2000).optional(),
});

interface TaskSummary {
  key: string;
  title: string;
  description: string;
  category: string;
  autoComplete: boolean;
  dependsOnKeys: string[];
  sortOrder: number;
  hasReconciliation: boolean;
}

export async function POST(req: NextRequest) {
  const t = telemetryStart("close.periods.preview");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const body = await req.json();
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400, reason: "invalid_body" });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { connectionId, startDate, endDate, profile, userIntent } = parsed.data;
    t.tag({ profile, hadIntent: !!userIntent });

    const conn = await prisma.erpConnection.findFirst({
      where: { id: connectionId, orgId: user.orgId },
    });
    if (!conn) {
      t.done({ status: 404, reason: "connection_not_found" });
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Require confirmed account mappings before previewing — same gate the
    // wizard applies in goToStep2(). Without this, /preview would happily
    // produce AP/AR/GST recon tasks for auto-classified-but-unconfirmed
    // accounts, then those tasks would silently disappear after the user
    // confirms mappings + creates the period (because the create flow
    // re-runs generation post-confirmation). Preview must match reality.
    const mappings = await prisma.orgAccountMapping.findMany({
      where:  { connectionId, orgId: user.orgId },
      select: { isConfirmed: true },
    });
    if (mappings.length > 0 && !mappings.every((m) => m.isConfirmed)) {
      t.done({ status: 412, reason: "mappings_unconfirmed" });
      return NextResponse.json(
        {
          error: "Account mappings not confirmed",
          detail: "All account mappings must be confirmed before previewing the close.",
          code:  "MAPPINGS_UNCONFIRMED",
        },
        { status: 412 }
      );
    }

    let intent: CloseIntent | null = null;
    if (profile === "ADAPTIVE" && userIntent && userIntent.trim().length > 0) {
      intent = await parseUserIntent(userIntent);
    }

    // Fetch the expensive context (scan + accountTypeMap) ONCE, then reuse for
    // both the chosen-profile generation and (when needed) the STANDARD baseline.
    // Pre-W3.1 this ran the scan twice for non-STANDARD profiles.
    const context = await prepareCloseContext(
      connectionId,
      new Date(startDate),
      new Date(endDate)
    );

    const [adaptive, baseline] = await Promise.all([
      generateAdaptiveTemplate(
        connectionId,
        new Date(startDate),
        new Date(endDate),
        { profile: profile as CloseProfile, intent, context }
      ),
      profile === "STANDARD"
        ? Promise.resolve(null)  // skip baseline if user already chose STANDARD
        : generateAdaptiveTemplate(
            connectionId,
            new Date(startDate),
            new Date(endDate),
            { profile: "STANDARD", intent: null, context }
          ),
    ]);

    const tasks: TaskSummary[] = adaptive.template.tasks.map((t) => ({
      key:           t.key,
      title:         t.title,
      description:   t.description ?? "",
      category:      t.category,
      autoComplete:  t.autoComplete,
      dependsOnKeys: t.dependsOnKeys,
      sortOrder:     t.sortOrder,
      hasReconciliation: !!t.reconciliation,
    }));

    const diff = baseline ? computeDiff(baseline.template.tasks, adaptive.template.tasks) : null;

    t.done({
      status: 200,
      taskCount:    tasks.length,
      criticals:    adaptive.scanResult.issues.filter((i) => i.severity === "critical").length,
      diffAdded:    diff?.addedCount ?? 0,
      diffRemoved:  diff?.removedCount ?? 0,
      intentSource: intent?.source ?? "none",
    });

    return NextResponse.json({
      profile,
      intent,
      template: {
        name:       adaptive.template.name,
        periodType: adaptive.template.periodType,
        tasks,
      },
      scanSummary: {
        criticalCount: adaptive.scanResult.issues.filter((i) => i.severity === "critical").length,
        reviewCount:   adaptive.scanResult.issues.filter((i) => i.severity === "review").length,
        infoCount:     adaptive.scanResult.issues.filter((i) => i.severity === "info").length,
      },
      reasoning: adaptive.reasoning,
      diff,
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[close/periods/preview POST]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

interface TaskTemplate { key: string; title: string; category: string }

function computeDiff(
  baseline: TaskTemplate[],
  chosen:   TaskTemplate[]
) {
  const baseKeys = new Set(baseline.map((t) => t.key));
  const chosenKeys = new Set(chosen.map((t) => t.key));

  const added = chosen
    .filter((t) => !baseKeys.has(t.key))
    .map((t) => ({ key: t.key, title: t.title, category: t.category }));

  const removed = baseline
    .filter((t) => !chosenKeys.has(t.key))
    .map((t) => ({ key: t.key, title: t.title, category: t.category }));

  return {
    added,
    removed,
    addedCount:     added.length,
    removedCount:   removed.length,
    unchangedCount: chosen.length - added.length,
    baselineCount:  baseline.length,
    chosenCount:    chosen.length,
  };
}

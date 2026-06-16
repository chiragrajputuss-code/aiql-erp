import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { checkCloseRunCap, incrementCloseRunCount } from "@/lib/anti-abuse";
import { prisma, type CloseProfile } from "@aiql/db";
import {
  createClosePeriodFromTemplate,
  MONTHLY_CLOSE_TEMPLATE,
  generateAdaptiveTemplate,
  parseUserIntent,
  patternKeyForScanIssue,
  type CloseIntent,
} from "@aiql/close-engine";
import { updateRecurringPatterns } from "@/lib/close-preferences";
import { telemetryStart } from "@/lib/telemetry";

// ─── POST /api/v1/close/periods ───────────────────────────────────────────────

const createSchema = z.object({
  connectionIds:         z.array(z.string().min(1)).min(1).optional(),
  connectionId:          z.string().min(1).optional(),
  name:                  z.string().min(1),
  startDate:             z.string().datetime({ offset: true }),
  endDate:               z.string().datetime({ offset: true }),
  targetCompletionDate:  z.string().datetime({ offset: true }).optional(),
  /** "adaptive" generates tasks from data; "static" uses the fixed 14-task template */
  mode:                  z.enum(["adaptive", "static"]).default("adaptive"),
  /** Profile shape: STANDARD (default), QUICK, YEAR_END, ADAPTIVE */
  profile:               z.enum(["STANDARD", "QUICK", "YEAR_END", "ADAPTIVE"]).optional(),
  /** Free-text user prompt — required for ADAPTIVE, ignored otherwise */
  userIntent:            z.string().max(2000).optional(),
  /** Pre-parsed intent (skips LLM re-parse if user already saw a preview) */
  intentSummary:         z.unknown().optional(),
}).refine((d) => d.connectionIds?.length || d.connectionId, {
  message: "connectionIds or connectionId is required",
});

export async function POST(req: NextRequest) {
  const t = telemetryStart("close.periods.create");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const closeCheck = await checkCloseRunCap(user.orgId);
    if (!closeCheck.allowed) {
      return NextResponse.json({ error: closeCheck.reason, reason: "close_run_cap" }, { status: 402 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400, reason: "invalid_body" });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const {
      connectionIds, connectionId, name, startDate, endDate,
      targetCompletionDate, mode, profile: rawProfile, userIntent, intentSummary,
    } = parsed.data;

    const ids = connectionIds && connectionIds.length > 0
      ? connectionIds
      : [connectionId!];

    const connections = await prisma.erpConnection.findMany({
      where:   { id: { in: ids }, orgId: user.orgId },
      include: { uploadedFile: true },
    });
    if (connections.length !== ids.length) {
      return NextResponse.json({ error: "One or more connections not found" }, { status: 404 });
    }

    const primary = connections.find((c) => c.id === ids[0]) ?? connections[0]!;
    const tableName = primary.uploadedFile?.tableName ?? "gl_entries";

    const profile: CloseProfile = rawProfile ?? "STANDARD";
    t.tag({ profile, hadIntent: !!userIntent, mode });

    // Resolve intent for ADAPTIVE profile (LLM call if not pre-parsed).
    let resolvedIntent: CloseIntent | null = null;
    if (profile === "ADAPTIVE" && userIntent && userIntent.trim().length > 0) {
      if (intentSummary && typeof intentSummary === "object") {
        resolvedIntent = intentSummary as CloseIntent;
      } else {
        resolvedIntent = await parseUserIntent(userIntent);
      }
    }

    let template = MONTHLY_CLOSE_TEMPLATE;
    let reasoning: string[] | null = null;
    let scanResultJson: string | undefined = undefined;
    let profileSnapshot: { profile: CloseProfile; intent: CloseIntent | null } | null = null;

    if (mode === "adaptive") {
      try {
        const adaptive = await generateAdaptiveTemplate(
          primary.id,
          new Date(startDate),
          new Date(endDate),
          { profile, intent: resolvedIntent }
        );
        template = adaptive.template;
        reasoning = adaptive.reasoning;
        scanResultJson = JSON.stringify(adaptive.scanResult);
        profileSnapshot = { profile, intent: resolvedIntent };
      } catch (err) {
        console.warn("[close/periods] adaptive generation failed, falling back to static:", (err as Error).message);
      }
    }

    const customWatchItems = resolvedIntent?.watchAccounts ?? [];

    const period = await createClosePeriodFromTemplate(
      user.orgId,
      primary.id,
      ids,
      name,
      new Date(startDate),
      new Date(endDate),
      template,
      targetCompletionDate ? new Date(targetCompletionDate) : undefined,
      tableName,
      scanResultJson,
      {
        closeProfile:        profile,
        userIntent:          userIntent ?? null,
        intentSummaryJson:   resolvedIntent ? JSON.stringify(resolvedIntent) : null,
        customWatchItems,
        profileSnapshotJson: profileSnapshot ? JSON.stringify(profileSnapshot) : null,
      }
    );

    // Update org-level memory (last close preferences) — fire-and-forget.
    // NOTE: usageCountJson is NOT bumped here. It's bumped on period
    // *completion* (see task PATCH handler), so the count reflects "what
    // profiles were actually completed" — not "what was started + abandoned".
    // We still capture lastProfile/Intent/WatchItems on creation because
    // those are intent signals, not utility signals.
    try {
      const existingPrefs = await prisma.orgClosePreferences.findUnique({
        where: { orgId: user.orgId },
      });
      const recurringPatterns = updateRecurringPatterns(
        existingPrefs?.recurringPatternsJson,
        customWatchItems
      );

      await prisma.orgClosePreferences.upsert({
        where:  { orgId: user.orgId },
        update: {
          lastProfile:           profile,
          lastIntent:            userIntent ?? null,
          lastIntentSummaryJson: resolvedIntent ? JSON.stringify(resolvedIntent) : null,
          lastCustomWatchItems:  customWatchItems,
          recurringPatternsJson: recurringPatterns,
        },
        create: {
          orgId:                 user.orgId,
          lastProfile:           profile,
          lastIntent:            userIntent ?? null,
          lastIntentSummaryJson: resolvedIntent ? JSON.stringify(resolvedIntent) : null,
          lastCustomWatchItems:  customWatchItems,
          recurringPatternsJson: recurringPatterns,
        },
      });
    } catch (err) {
      console.warn("[close/periods] failed to update preferences:", (err as Error).message);
    }

    // Auto-resolve anomaly tasks against the org's knowledge base.
    // Two outcomes: silent auto-complete (similar scale to last time) or
    // pending-with-hint (scale changed, user must review). See
    // applyKnowledgeBase docstring + scaleDecision for the precision contract.
    const currentScanIssues = scanResultJson
      ? (() => {
          try {
            const parsed = JSON.parse(scanResultJson) as { issues?: Array<{ code: string; affectedRows: number; exposure: number | null }> };
            return parsed.issues ?? [];
          } catch { return []; }
        })()
      : [];
    const kbResult = await applyKnowledgeBase(
      user.orgId, primary.id, period.tasks ?? [], currentScanIssues
    );

    t.done({
      status:        201,
      taskCount:     period.tasks?.length ?? 0,
      autoResolved:  kbResult.resolved.length,
      knowledgeHinted: kbResult.hinted.length,
      intentSource:  resolvedIntent?.source ?? "none",
      watchItemCount: customWatchItems.length,
    });
    incrementCloseRunCount(user.orgId).catch(() => {});
    return NextResponse.json(
      {
        ...period, mode, profile, reasoning, intent: resolvedIntent,
        autoResolved:    kbResult.resolved,
        knowledgeHinted: kbResult.hinted,
      },
      { status: 201 }
    );
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[close/periods POST]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}


// ─── Knowledge-base auto-resolve ────────────────────────────────────────────

interface CreatedTask {
  id:    string;
  title: string;
  category: string;
  status: string;
}

interface AutoResolved {
  taskId:     string;
  title:      string;
  patternKey: string;
  answer:     string;
  knowledgeId: string;
}

interface KnowledgeHinted {
  taskId:      string;
  title:       string;
  patternKey:  string;
  reason:      string;   // why we didn't auto-apply (scale mismatch description)
  knowledgeId: string;
}

interface KbApplyResult {
  resolved: AutoResolved[];
  hinted:   KnowledgeHinted[];
}

interface ScanIssueLite {
  code:         string;
  affectedRows: number;
  exposure:     number | null;
}

/**
 * For each anomaly task the wizard generated, look up whether this org has
 * confirmed knowledge that this anomaly is normal.
 *
 * Two outcomes per match:
 *
 *   1. SILENT AUTO-RESOLVE — task → COMPLETED, prior answer in notes.
 *      Only applied when the new occurrence's scale (affectedRows + exposure)
 *      is similar or smaller than what was previously confirmed normal.
 *
 *   2. PENDING WITH HINT — task stays PENDING but `notes` gets prepended with
 *      "Last time you said X. This time the scale is bigger — please review."
 *      Triggered when current scale is materially larger than stored scale.
 *
 * Legacy knowledge (captured before scale was tracked) falls back to silent
 * auto-resolve since we have no signal to gate on.
 */
async function applyKnowledgeBase(
  orgId:        string,
  connectionId: string,
  tasks:        CreatedTask[],
  scanIssues:   ScanIssueLite[]
): Promise<KbApplyResult> {
  const anomalyTasks = tasks.filter((t) => t.title && t.category === "CUSTOM");
  if (anomalyTasks.length === 0) return { resolved: [], hinted: [] };

  const resolved: AutoResolved[]   = [];
  const hinted:   KnowledgeHinted[] = [];

  // Index current scan by code for O(1) lookup
  const issuesByCode = new Map<string, ScanIssueLite>();
  for (const i of scanIssues) issuesByCode.set(i.code, i);

  for (const t of anomalyTasks) {
    const issueCode = inferIssueCode(t.title);
    if (!issueCode) continue;

    const k = patternKeyForScanIssue({ issueCode });
    const match = await prisma.orgBusinessKnowledge.findFirst({
      where: { orgId, connectionId, patternKey: k.patternKey },
    });
    if (!match) continue;
    if (match.verdict !== "NORMAL" || match.autoApply !== "ALWAYS") continue;

    const current = issuesByCode.get(issueCode) ?? null;
    const stored  = parseStoredScale(match.sourceRefJson);
    const decision = scaleDecision(stored, current);

    try {
      if (decision.kind === "auto") {
        await prisma.closeTask.update({
          where: { id: t.id },
          data: {
            status:    "COMPLETED",
            completedAt: new Date(),
            notes:     formatAutoNotes(match),
          },
        });
        resolved.push({
          taskId: t.id, title: t.title, patternKey: k.patternKey,
          answer: match.answer, knowledgeId: match.id,
        });
        // Track that this knowledge auto-resolved a task — powers the
        // "auto-resolved this month" counter on the dashboard insights banner.
        // Truly best-effort: if this fails (e.g. older deployment without the
        // tracking columns), we still consider the resolution successful.
        try {
          await prisma.orgBusinessKnowledge.update({
            where: { id: match.id },
            data: {
              lastAppliedAt: new Date(),
              appliedCount:  { increment: 1 },
            },
          });
        } catch { /* best-effort tracking */ }
      } else {
        // Scale mismatch — leave PENDING but surface the prior answer in notes
        // so the user sees "we saw something like this before" without us
        // silently closing it.
        await prisma.closeTask.update({
          where: { id: t.id },
          data: {
            notes: formatHintNotes(match, decision.reason),
          },
        });
        hinted.push({
          taskId: t.id, title: t.title, patternKey: k.patternKey,
          reason: decision.reason, knowledgeId: match.id,
        });
      }
    } catch {
      // best-effort — failure to auto-resolve should not block period creation
    }
  }
  return { resolved, hinted };
}

// ─── Scale-match decision ──────────────────────────────────────────────────

interface StoredScale { affectedRows: number | null; exposure: number | null }

function parseStoredScale(json: string | null): StoredScale {
  if (!json) return { affectedRows: null, exposure: null };
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const ar = typeof parsed.affectedRows === "number" ? parsed.affectedRows : null;
    const ex = typeof parsed.exposure     === "number" ? parsed.exposure     : null;
    return { affectedRows: ar, exposure: ex };
  } catch {
    return { affectedRows: null, exposure: null };
  }
}

type ScaleDecision =
  | { kind: "auto" }
  | { kind: "hint"; reason: string };

/**
 * Decide whether to silent-auto-resolve.
 *
 * - Both stored and current must be present to gate. If stored has no scale
 *   (legacy entry) → auto. If current has no data (shouldn't happen) → auto.
 * - If current ≤ 2× stored on rows AND exposure within 2× stored + ₹50k buffer
 *   → auto. Otherwise → hint.
 */
function scaleDecision(stored: StoredScale, current: ScanIssueLite | null): ScaleDecision {
  // Legacy: no stored scale → preserve previous silent behaviour
  if (stored.affectedRows === null && stored.exposure === null) return { kind: "auto" };
  // Defensive: no current scan → just auto (we'd have no basis to refuse)
  if (!current) return { kind: "auto" };

  const reasons: string[] = [];

  if (stored.affectedRows !== null) {
    const rowsRatio = stored.affectedRows === 0
      ? (current.affectedRows > 0 ? Infinity : 1)
      : current.affectedRows / stored.affectedRows;
    if (rowsRatio > 2) {
      reasons.push(
        `${current.affectedRows} affected rows now vs ${stored.affectedRows} previously confirmed`
      );
    }
  }

  if (stored.exposure !== null && current.exposure !== null) {
    const buffer = 50_000;  // ₹50k absolute buffer for small-amount cases
    if (current.exposure > stored.exposure * 2 + buffer) {
      reasons.push(
        `₹${formatINR(current.exposure)} exposure now vs ₹${formatINR(stored.exposure)} previously`
      );
    }
  }

  if (reasons.length > 0) {
    return { kind: "hint", reason: reasons.join("; ") };
  }
  return { kind: "auto" };
}

function formatINR(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

function formatAutoNotes(match: { answer: string; annotation: string | null }): string {
  return `Auto-resolved from knowledge base.\n\nPrior answer: ${match.answer}` +
    (match.annotation ? `\n\nAnnotation: ${match.annotation}` : "");
}

function formatHintNotes(
  match: { answer: string; annotation: string | null },
  reason: string
): string {
  return `⚠ Knowledge match found, but scale has changed — please review.\n\n` +
    `Prior answer: ${match.answer}\n` +
    (match.annotation ? `Annotation: ${match.annotation}\n` : "") +
    `\nWhy review: ${reason}`;
}

/**
 * Recover the issue code from a generated task title. The task generator
 * produces titles like:
 *   "Resolve N voucher(s) where Dr ≠ Cr"          → voucher_imbalance
 *   "Review N possible duplicate transactions"    → duplicate_transactions
 *   "Verify N entries dated outside the period"   → date_outliers
 *   "Fill in N entries with missing fields"       → missing_fields
 *   "Classify N unmapped account(s)"              → unclassified_accounts
 *   "Fix N voucher(s) with CGST ≠ SGST"           → gst_mismatch
 *   "Investigate N account(s) with unusual sign"  → sign_anomalies
 *   "Verify period coverage..."                   → period_completeness
 */
function inferIssueCode(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("dr ≠ cr") || t.includes("voucher") && t.includes("balance"))    return "voucher_imbalance";
  if (t.includes("duplicate"))                                                     return "duplicate_transactions";
  if (t.includes("dated outside") || t.includes("date outlier"))                   return "date_outliers";
  if (t.includes("missing fields") || t.includes("missing field"))                 return "missing_fields";
  if (t.includes("unmapped account") || t.includes("classify"))                    return "unclassified_accounts";
  if (t.includes("cgst") && t.includes("sgst"))                                    return "gst_mismatch";
  if (t.includes("unusual sign") || t.includes("sign anomal"))                     return "sign_anomalies";
  if (t.includes("period coverage") || t.includes("period complete"))              return "period_completeness";
  return null;
}

// ─── GET /api/v1/close/periods ────────────────────────────────────────────────

export async function GET() {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const periods = await prisma.closePeriod.findMany({
      where:   { orgId: user.orgId },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ periods });
  } catch (err) {
    console.error("[close/periods GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

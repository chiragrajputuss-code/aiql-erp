import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { runDataQualityScan } from "@aiql/close-engine";
import { telemetryStart } from "@/lib/telemetry";

/**
 * GET /api/v1/close/data-context-hints?connectionId=...&startDate=...&endDate=...
 *
 * Returns lightweight signals about the customer's data shape that the wizard
 * uses to suggest profile + watch items:
 *   - account counts by type
 *   - top scan issue codes
 *   - whether year-end-ish heuristics apply
 *   - recurring patterns observed in past closes (if any)
 */

const querySchema = z.object({
  connectionId: z.string().min(1),
  startDate:    z.string().datetime({ offset: true }).optional(),
  endDate:      z.string().datetime({ offset: true }).optional(),
});

export async function GET(req: NextRequest) {
  const t = telemetryStart("close.data_context_hints");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      connectionId: url.searchParams.get("connectionId") ?? "",
      startDate:    url.searchParams.get("startDate") ?? undefined,
      endDate:      url.searchParams.get("endDate") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { connectionId, startDate, endDate } = parsed.data;

    const conn = await prisma.erpConnection.findFirst({
      where: { id: connectionId, orgId: user.orgId },
    });
    if (!conn) {
      t.done({ status: 404 });
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const accounts = await prisma.orgAccountMapping.findMany({
      where: { connectionId, orgId: user.orgId },
      select: { accountType: true },
    });

    const counts = { bank: 0, ar: 0, ap: 0, tax: 0, inventory: 0, other: 0 };
    for (const a of accounts) {
      switch (a.accountType.toUpperCase()) {
        case "BANK":
        case "CASH":        counts.bank++;      break;
        case "RECEIVABLE":  counts.ar++;        break;
        case "PAYABLE":     counts.ap++;        break;
        case "TAX":         counts.tax++;       break;
        case "INVENTORY":   counts.inventory++; break;
        default:            counts.other++;     break;
      }
    }

    let topIssues: string[] = [];
    let scanError: string | null = null;
    if (startDate && endDate) {
      try {
        const scan = await runDataQualityScan(connectionId, new Date(startDate), new Date(endDate));
        topIssues = scan.issues
          .filter((i) => i.severity !== "info")
          .slice(0, 5)
          .map((i) => i.code);
      } catch (err) {
        scanError = (err as Error).message;
      }
    }

    // Year-end heuristic: end date is March 31 (Indian financial year close).
    const endDt = endDate ? new Date(endDate) : null;
    const yearEndLikely = endDt
      ? (endDt.getUTCMonth() === 2 && endDt.getUTCDate() >= 28)
      : false;

    const prefs = await prisma.orgClosePreferences.findUnique({
      where: { orgId: user.orgId },
    });

    // High-confidence recurring patterns: count ≥ 2 across past closes.
    // These are surfaced more prominently than just "last close" items.
    let highConfidencePatterns: Array<{ pattern: string; count: number }> = [];
    if (prefs?.recurringPatternsJson) {
      try {
        const parsed = JSON.parse(prefs.recurringPatternsJson) as unknown;
        if (Array.isArray(parsed)) {
          highConfidencePatterns = parsed
            .filter((p): p is { pattern: string; count: number } =>
              typeof p === "object" && p !== null &&
              typeof (p as { pattern: unknown }).pattern === "string" &&
              typeof (p as { count: unknown }).count === "number" &&
              (p as { count: number }).count >= 2
            )
            .slice(0, 5);
        }
      } catch { highConfidencePatterns = []; }
    }

    // Fallback to last-close watch items only if no high-confidence patterns.
    let recurringWatchItems: string[] = [];
    if (highConfidencePatterns.length > 0) {
      recurringWatchItems = highConfidencePatterns.map((p) => p.pattern);
    } else if (prefs?.lastCustomWatchItems) {
      recurringWatchItems = prefs.lastCustomWatchItems.slice(0, 5);
    }

    // Build human-readable suggestions.
    const suggestions: Array<{ kind: string; label: string; hint: string }> = [];
    if (yearEndLikely) {
      suggestions.push({
        kind:  "profile",
        label: "Use the Year-End profile",
        hint:  "Your end date is March 31 — likely a financial-year close.",
      });
    }
    if (topIssues.includes("voucher_imbalance")) {
      suggestions.push({
        kind:  "watch",
        label: "Watch unbalanced vouchers",
        hint:  "Detected entries where Dr ≠ Cr.",
      });
    }
    if (topIssues.includes("missing_fields")) {
      suggestions.push({
        kind:  "watch",
        label: "Review entries with missing fields",
        hint:  "Several rows are missing party / reference data.",
      });
    }
    if (counts.bank > 1) {
      suggestions.push({
        kind:  "watch",
        label: `Reconcile all ${counts.bank} bank accounts`,
        hint:  "Multi-bank operations — recommend per-bank check.",
      });
    }
    if (highConfidencePatterns.length > 0) {
      const top = highConfidencePatterns[0]!;
      suggestions.unshift({
        kind:  "pattern",
        label: `You've watched "${top.pattern}" in ${top.count} previous close${top.count > 1 ? "s" : ""}`,
        hint:  highConfidencePatterns.length > 1
          ? `+${highConfidencePatterns.length - 1} other recurring item(s) — add them all`
          : "Recurring pattern detected — likely worth watching again",
      });
    } else if (recurringWatchItems.length > 0) {
      suggestions.push({
        kind:  "watch",
        label: `Re-add last close's ${recurringWatchItems.length} watch item(s)`,
        hint:  recurringWatchItems.slice(0, 3).join(", "),
      });
    }

    t.done({
      status: 200,
      yearEndLikely,
      suggestionCount: suggestions.length,
      recurringPatternCount: highConfidencePatterns.length,
    });
    return NextResponse.json({
      accountCounts: counts,
      topIssues,
      scanError,
      yearEndLikely,
      recurringWatchItems,
      recurringPatterns: highConfidencePatterns,
      suggestions,
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[close/data-context-hints GET]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

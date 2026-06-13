import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { telemetryStart } from "@/lib/telemetry";

/**
 * GET /api/v1/close/preferences
 *
 * Returns the org's last-close memory: profile, intent, watch items.
 * Used by the wizard to power "Same as last close" + smart suggestions.
 */

export async function GET() {
  const t = telemetryStart("close.preferences");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const prefs = await prisma.orgClosePreferences.findUnique({
      where: { orgId: user.orgId },
    });

    if (!prefs) {
      t.done({ status: 200, hasPrevious: false });
      return NextResponse.json({
        hasPrevious:           false,
        lastProfile:           null,
        lastIntent:            null,
        lastIntentSummary:     null,
        lastCustomWatchItems:  [],
        lastClosedAt:          null,
        usageCount:            {},
        recurringPatterns:     [],
      });
    }

    let lastIntentSummary: unknown = null;
    if (prefs.lastIntentSummaryJson) {
      try { lastIntentSummary = JSON.parse(prefs.lastIntentSummaryJson); } catch { lastIntentSummary = null; }
    }

    let usageCount: Record<string, number> = {};
    try { usageCount = JSON.parse(prefs.usageCountJson) as Record<string, number>; } catch { usageCount = {}; }

    let recurringPatterns: unknown = [];
    try { recurringPatterns = JSON.parse(prefs.recurringPatternsJson); } catch { recurringPatterns = []; }

    t.done({ status: 200, hasPrevious: true, lastProfile: prefs.lastProfile });
    return NextResponse.json({
      hasPrevious:           true,
      lastProfile:           prefs.lastProfile,
      lastIntent:            prefs.lastIntent,
      lastIntentSummary,
      lastCustomWatchItems:  prefs.lastCustomWatchItems,
      lastClosedAt:          prefs.lastClosedAt,
      usageCount,
      recurringPatterns,
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[close/preferences GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

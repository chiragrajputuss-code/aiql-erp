/**
 * POST /api/v1/onboarding/load-demo
 *
 * Loads 3 sample company GL files into the current user's org so they can
 * explore AIQL without uploading real client data first. Idempotent —
 * re-running replaces the existing demo data.
 */

import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { loadDemoForOrg } from "@/lib/demo-loader";
import { clearSummaryCache } from "@/lib/summary-cache";

export async function POST(): Promise<NextResponse> {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const result = await loadDemoForOrg(user.orgId);
    clearSummaryCache(user.orgId);
    return NextResponse.json({
      ok:           true,
      count:        result.loaded.length,
      durationMs:   result.durationMs,
      connections:  result.loaded,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[load-demo] failed:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Demo load failed" },
      { status: 500 },
    );
  }
}

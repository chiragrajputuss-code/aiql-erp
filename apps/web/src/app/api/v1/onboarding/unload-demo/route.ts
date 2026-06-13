/**
 * POST /api/v1/onboarding/unload-demo
 *
 * Removes all demo connections (and their tables) for the current org. Used
 * when the user has uploaded their real data and wants to clear the samples.
 */

import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { unloadDemoForOrg } from "@/lib/demo-loader";
import { clearSummaryCache } from "@/lib/summary-cache";

export async function POST(): Promise<NextResponse> {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const result = await unloadDemoForOrg(user.orgId);
    clearSummaryCache(user.orgId);
    return NextResponse.json({ ok: true, removed: result.removed });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[unload-demo] failed:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Unload failed" },
      { status: 500 },
    );
  }
}

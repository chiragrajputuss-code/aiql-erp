import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { backfillEmbeddings } from "@/lib/embeddings";
import { telemetryStart } from "@/lib/telemetry";

/**
 * POST /api/v1/knowledge/backfill-embeddings
 *
 * Embeds any knowledge rows missing an embedding. Scoped to the calling org.
 * Idempotent — safe to run as a recurring cron or manual button.
 */

export async function POST() {
  const t = telemetryStart("knowledge.backfill_embeddings");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    if (user.role !== "ADMIN") {
      t.done({ status: 403 });
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // Cap at 100 per request to avoid long-running connections.
    const result = await backfillEmbeddings({ orgId: user.orgId, maxRows: 100 });

    t.done({ status: 200, ...result });
    return NextResponse.json({
      ...result,
      hasMore: result.embedded + result.failed >= 100,
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

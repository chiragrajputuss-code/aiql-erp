import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { telemetryStart } from "@/lib/telemetry";

/**
 * POST /api/v1/knowledge/lookup
 *
 * Given a pattern key (built client-side via close-engine helpers), return
 * any matching knowledge row for this org. Used by anomaly surfaces to
 * decide whether to ask the user "is this normal?" or auto-resolve from
 * stored knowledge.
 *
 * Returns shape:
 *   { match: KnowledgeRow | null, autoResolved: boolean }
 *
 * autoResolved is true only when the stored row's `autoApply` policy
 * permits skipping the question this period. Caller still decides whether
 * to honour the auto-resolution (e.g., always ask for material amounts).
 */

const lookupSchema = z.object({
  connectionId: z.string().min(1).nullable().optional(),
  patternKey:   z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const t = telemetryStart("knowledge.lookup");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const body = await req.json();
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400, reason: "invalid_body" });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { connectionId, patternKey } = parsed.data;

    const match = await prisma.orgBusinessKnowledge.findFirst({
      where: {
        orgId:        user.orgId,
        connectionId: connectionId ?? null,
        patternKey,
      },
    });

    if (!match) {
      t.done({ status: 200, hit: false });
      return NextResponse.json({ match: null, autoResolved: false });
    }

    // autoApply policy decides whether the caller can skip asking the user.
    // ALWAYS  → auto-resolve every time
    // ONCE    → only auto-resolve once (we'd need per-period state to honour
    //           this strictly; for now we treat ONCE same as NEVER on lookup
    //           and the caller can choose to use it as a "saw-this-before" hint)
    // NEVER   → never auto-resolve
    // REJECTED knowledge is never auto-applied either.
    const canAuto = match.autoApply === "ALWAYS" && match.verdict !== "REJECTED";

    t.done({
      status:       200,
      hit:          true,
      verdict:      match.verdict,
      autoApply:    match.autoApply,
      autoResolved: canAuto,
    });
    return NextResponse.json({ match, autoResolved: canAuto });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[knowledge/lookup POST]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

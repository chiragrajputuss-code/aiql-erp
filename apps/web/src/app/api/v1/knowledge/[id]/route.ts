import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { telemetryStart } from "@/lib/telemetry";

type Ctx = { params: { id: string } };

/**
 * GET    /api/v1/knowledge/:id   fetch single knowledge row
 * DELETE /api/v1/knowledge/:id   forget this knowledge
 */

export async function GET(_req: NextRequest, ctx: Ctx) {
  const t = telemetryStart("knowledge.get");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const item = await prisma.orgBusinessKnowledge.findFirst({
      where: { id: ctx.params.id, orgId: user.orgId },
    });
    if (!item) {
      t.done({ status: 404 });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    t.done({ status: 200 });
    return NextResponse.json(item);
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const t = telemetryStart("knowledge.delete");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    // Verify ownership before delete (avoid the deleteMany-with-orgId workaround)
    const item = await prisma.orgBusinessKnowledge.findFirst({
      where: { id: ctx.params.id, orgId: user.orgId },
      select: { id: true },
    });
    if (!item) {
      t.done({ status: 404 });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.orgBusinessKnowledge.delete({ where: { id: item.id } });
    t.done({ status: 200 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

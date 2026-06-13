import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { telemetryStart } from "@/lib/telemetry";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t = telemetryStart("llm_proxy.keys.update");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400 });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.llmProxyApiKey.findFirst({
      where:  { id: ctx.params.id, orgId: user.orgId },
      select: { id: true },
    });
    if (!existing) { t.done({ status: 404 }); return NextResponse.json({ error: "Not found" }, { status: 404 }); }

    const updated = await prisma.llmProxyApiKey.update({
      where: { id: existing.id },
      data:  parsed.data,
      select: {
        id: true, provider: true, name: true, keyTail: true, isActive: true,
        callCount: true, lastUsedAt: true, createdAt: true,
      },
    });

    t.done({ status: 200 });
    return NextResponse.json(updated);
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const t = telemetryStart("llm_proxy.keys.delete");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const existing = await prisma.llmProxyApiKey.findFirst({
      where:  { id: ctx.params.id, orgId: user.orgId },
      select: { id: true },
    });
    if (!existing) { t.done({ status: 404 }); return NextResponse.json({ error: "Not found" }, { status: 404 }); }

    await prisma.llmProxyApiKey.delete({ where: { id: existing.id } });
    t.done({ status: 200 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

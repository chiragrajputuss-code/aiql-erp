import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

const schema = z.object({
  queryLogId: z.string(),
  feedback:   z.enum(["thumbs_up", "thumbs_down"]),
});

export async function PATCH(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { queryLogId, feedback } = parsed.data;

  // Verify the log belongs to this user's org (security check)
  const log = await prisma.queryLog.findFirst({
    where: { id: queryLogId, orgId: user.orgId },
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.queryLog.update({
    where: { id: queryLogId },
    data:  { feedback },
  });

  return NextResponse.json({ ok: true });
}

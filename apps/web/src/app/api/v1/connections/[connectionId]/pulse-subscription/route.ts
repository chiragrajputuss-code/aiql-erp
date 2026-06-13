import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { z } from "zod";

type Ctx = { params: { connectionId: string } };

// ─── GET — fetch or create subscription ──────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.connectionId, orgId: user.orgId },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sub = await prisma.pulseSubscription.upsert({
    where:  { connectionId: params.connectionId },
    update: {},
    create: {
      orgId:        user.orgId,
      connectionId: params.connectionId,
    },
  });

  return NextResponse.json(sub);
}

// ─── PATCH — update subscription settings ────────────────────────────────────

const patchSchema = z.object({
  cadence:           z.enum(["DAILY", "WEEKLY", "OFF"]).optional(),
  emailEnabled:      z.boolean().optional(),
  inAppEnabled:      z.boolean().optional(),
  isActive:          z.boolean().optional(),
  snoozedCategories: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify ownership
  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.connectionId, orgId: user.orgId },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sub = await prisma.pulseSubscription.upsert({
    where:  { connectionId: params.connectionId },
    update: parsed.data,
    create: {
      orgId:        user.orgId,
      connectionId: params.connectionId,
      ...parsed.data,
    },
  });

  return NextResponse.json(sub);
}

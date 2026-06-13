/**
 * POST /api/v1/onboarding/complete
 *
 * Marks the current user's onboarding as finished. Called after the user
 * either loads demo data or uploads their first real file — whichever path
 * they choose in the onboarding wizard.
 *
 * Idempotent — safe to call more than once.
 */

import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

export async function POST(): Promise<NextResponse> {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  await prisma.user.update({
    where: { id: user.id },
    data:  { onboardingComplete: true },
  });

  return NextResponse.json({ ok: true });
}

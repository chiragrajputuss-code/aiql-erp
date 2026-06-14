/**
 * GET /api/billing/portal
 * Returns billing state for the current org (used by /billing page).
 */

import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { getOrgBillingState } from "@/lib/billing";

export async function GET() {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const state = await getOrgBillingState(user.orgId);
  if (!state) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  return NextResponse.json({
    ...state,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  });
}

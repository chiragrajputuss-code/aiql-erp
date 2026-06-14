/**
 * POST /api/billing/subscribe
 * Creates a Razorpay subscription and returns the subscription_id + key_id
 * for the frontend to open Razorpay Checkout.
 *
 * Body: { planKey: "STARTER_MONTHLY" | "STARTER_ANNUAL" | "PROFESSIONAL_MONTHLY" | "PROFESSIONAL_ANNUAL" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { getRazorpay, RAZORPAY_PLAN_IDS } from "@/lib/razorpay";

const schema = z.object({
  planKey: z.enum([
    "STARTER_MONTHLY",
    "STARTER_ANNUAL",
    "PROFESSIONAL_MONTHLY",
    "PROFESSIONAL_ANNUAL",
  ]),
});

export async function POST(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { planKey } = parsed.data;
  const planId = RAZORPAY_PLAN_IDS[planKey];
  if (!planId) {
    return NextResponse.json(
      { error: `Razorpay plan not configured for ${planKey}. Set RAZORPAY_PLAN_${planKey} env var.` },
      { status: 500 },
    );
  }

  const org = await prisma.organisation.findUnique({
    where: { id: user.orgId },
    select: { id: true, name: true, razorpayCustomerId: true, razorpaySubscriptionId: true },
  });
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  // If already has active subscription, return it
  if (org.razorpaySubscriptionId) {
    return NextResponse.json({
      subscriptionId: org.razorpaySubscriptionId,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  }

  try {
    const razorpay = getRazorpay();

    // Create or reuse Razorpay customer
    let customerId = org.razorpayCustomerId;
    if (!customerId) {
      const customer = await razorpay.customers.create({
        name: org.name,
        email: user.email ?? "",
        fail_existing: 0,
      });
      customerId = customer.id;
      await prisma.organisation.update({
        where: { id: org.id },
        data: { razorpayCustomerId: customerId },
      });
    }

    // Create subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      quantity: 1,
      total_count: planKey.includes("ANNUAL") ? 1 : 12,
    } as Parameters<typeof razorpay.subscriptions.create>[0]);

    // Save subscription ID (status = "created" until payment)
    await prisma.organisation.update({
      where: { id: org.id },
      data: {
        razorpaySubscriptionId: subscription.id,
        subscriptionStatus: "created",
      },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("[billing/subscribe]", err);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

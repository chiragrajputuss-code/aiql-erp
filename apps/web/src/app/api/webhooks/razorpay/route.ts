/**
 * POST /api/webhooks/razorpay
 *
 * Handles Razorpay subscription lifecycle events.
 * Events we care about:
 *   subscription.activated   → set plan + status=active
 *   subscription.charged     → extend period (Razorpay handles renewal)
 *   subscription.halted      → payment failure after retries
 *   subscription.cancelled   → user cancelled
 *   subscription.completed   → term ended
 *   subscription.expired     → never paid
 *
 * SECURITY: Signature verified with HMAC-SHA256 before any DB write.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@aiql/db";
import { verifyWebhookSignature, PLAN_DB_MAP, PLAN_QUERY_LIMIT } from "@/lib/razorpay";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // ── Verify signature ──────────────────────────────────────────────────────
  try {
    if (!verifyWebhookSignature(body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const event = JSON.parse(body) as {
    event: string;
    payload: {
      subscription: {
        entity: {
          id: string;
          plan_id: string;
          status: string;
        };
      };
    };
  };

  const sub = event.payload?.subscription?.entity;
  if (!sub) return NextResponse.json({ ok: true }); // unrecognised shape, ignore

  const subscriptionId = sub.id;
  const status = sub.status; // razorpay status string

  const org = await prisma.organisation.findFirst({
    where: { razorpaySubscriptionId: subscriptionId },
    select: { id: true },
  });

  if (!org) {
    // Unknown subscription — could be from a different environment, ignore
    return NextResponse.json({ ok: true });
  }

  switch (event.event) {
    case "subscription.activated":
    case "subscription.charged": {
      // Determine which plan was activated from the plan_id
      const planEntry = Object.entries(PLAN_DB_MAP).find(
        ([key]) => process.env[`RAZORPAY_PLAN_${key}`] === sub.plan_id,
      );
      const dbPlan = planEntry ? planEntry[1] : "STARTER";
      const queryLimit = PLAN_QUERY_LIMIT[dbPlan] ?? 500;

      await prisma.organisation.update({
        where: { id: org.id },
        data: {
          plan: dbPlan as never,
          queryLimit,
          subscriptionStatus: "active",
        },
      });
      break;
    }

    case "subscription.halted":
      await prisma.organisation.update({
        where: { id: org.id },
        data: { subscriptionStatus: "halted" },
      });
      break;

    case "subscription.cancelled":
      await prisma.organisation.update({
        where: { id: org.id },
        data: {
          subscriptionStatus: "cancelled",
          plan: "FREE" as never,
          queryLimit: 100,
        },
      });
      break;

    case "subscription.completed":
    case "subscription.expired":
      await prisma.organisation.update({
        where: { id: org.id },
        data: {
          subscriptionStatus: status,
          plan: "FREE" as never,
          queryLimit: 100,
        },
      });
      break;

    default:
      // Unhandled event type — log and return ok
      console.log(`[razorpay-webhook] unhandled event: ${event.event}`);
  }

  return NextResponse.json({ ok: true });
}

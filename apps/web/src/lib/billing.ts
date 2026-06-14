/**
 * Billing enforcement — trial expiry, plan limits, Razorpay helpers.
 *
 * CRITICAL: checkPlanAccess() must be called at the top of every /api/v1 route
 * that touches GL data, queries, or file imports.
 */

import { prisma } from "@aiql/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessResult =
  | { allowed: true }
  | { allowed: false; reason: "trial_expired" | "query_limit" | "plan_limit"; message: string };

export interface OrgBillingState {
  plan: string;
  trialEndsAt: Date | null;
  isTrialActive: boolean;
  trialDaysLeft: number;
  isSubscriptionActive: boolean;
  subscriptionStatus: string | null;
  queriesUsed: number;
  queryLimit: number;
  queriesLeft: number;
}

// ─── Plan query limits ────────────────────────────────────────────────────────

export const PLAN_QUERY_LIMITS: Record<string, number> = {
  FREE:         100,
  STARTER:      500,
  PROFESSIONAL: 2000,
  ENTERPRISE:   999999,
};

export const PLAN_CONNECTION_LIMITS: Record<string, number> = {
  FREE:         1,
  STARTER:      5,
  PROFESSIONAL: 20,
  ENTERPRISE:   999999,
};

// ─── Core access check ────────────────────────────────────────────────────────

/**
 * Returns allowed:true or a 402-ready error.
 * Call this at the start of every billable API route.
 */
export async function checkPlanAccess(
  orgId: string,
  action: "query" | "import" | "scan" | "reconcile" | "close" = "query",
): Promise<AccessResult> {
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      trialEndsAt: true,
      razorpaySubscriptionId: true,
      subscriptionStatus: true,
      queriesUsed: true,
      queryLimit: true,
    },
  });

  if (!org) return { allowed: false, reason: "plan_limit", message: "Organisation not found." };

  const now = new Date();
  const isTrialActive = org.trialEndsAt ? org.trialEndsAt > now : false;
  const isSubscriptionActive = org.subscriptionStatus === "active";
  const hasPaidPlan = isSubscriptionActive && org.razorpaySubscriptionId != null;

  // If neither trial nor active subscription — block
  if (!isTrialActive && !hasPaidPlan) {
    return {
      allowed: false,
      reason: "trial_expired",
      message:
        "Your 14-day free trial has ended. Upgrade to continue querying your GL data.",
    };
  }

  // Query limit check (applies to all plans)
  if (action === "query" && org.queriesUsed >= org.queryLimit) {
    return {
      allowed: false,
      reason: "query_limit",
      message: `You've used all ${org.queryLimit} queries this month. Upgrade your plan for more.`,
    };
  }

  return { allowed: true };
}

/**
 * Increment query counter after a successful query.
 * Fire-and-forget — don't await in hot path.
 */
export async function incrementQueryCount(orgId: string): Promise<void> {
  await prisma.organisation.update({
    where: { id: orgId },
    data: { queriesUsed: { increment: 1 } },
  });
}

// ─── Billing state (for UI) ───────────────────────────────────────────────────

export async function getOrgBillingState(orgId: string): Promise<OrgBillingState | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      trialEndsAt: true,
      razorpaySubscriptionId: true,
      subscriptionStatus: true,
      queriesUsed: true,
      queryLimit: true,
    },
  });

  if (!org) return null;

  const now = new Date();
  const isTrialActive = org.trialEndsAt ? org.trialEndsAt > now : false;
  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : 0;

  return {
    plan: org.plan,
    trialEndsAt: org.trialEndsAt,
    isTrialActive,
    trialDaysLeft,
    isSubscriptionActive: org.subscriptionStatus === "active",
    subscriptionStatus: org.subscriptionStatus,
    queriesUsed: org.queriesUsed,
    queryLimit: org.queryLimit,
    queriesLeft: Math.max(0, org.queryLimit - org.queriesUsed),
  };
}

// ─── Set trial on new org ─────────────────────────────────────────────────────

export async function startTrial(orgId: string): Promise<void> {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  await prisma.organisation.update({
    where: { id: orgId },
    data: { trialEndsAt, plan: "FREE" as never, queryLimit: 100 },
  });
}

// ─── Reset monthly query counter (called by cron) ────────────────────────────

export async function resetMonthlyQueryCounts(): Promise<void> {
  await prisma.organisation.updateMany({
    data: {
      queriesUsed: 0,
      queriesResetAt: new Date(),
    },
  });
}

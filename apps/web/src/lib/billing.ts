/**
 * Billing enforcement — trial expiry, plan limits, Razorpay helpers.
 *
 * CRITICAL: checkPlanAccess() must be called at the top of every /api/v1 route
 * that touches GL data, queries, or file imports.
 */

import { prisma } from "@aiql/db";

// ─── Permanent test accounts ────────────────────────────────────────────────────
// Orgs whose admin/member email is in this list bypass ALL billing enforcement:
// no trial expiry, no query limit, no upgrade banners. Used for internal
// testing/demo accounts. Match is case-insensitive.

export const TEST_ACCOUNT_EMAILS: ReadonlySet<string> = new Set([
  "df@as.com",
]);

export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_ACCOUNT_EMAILS.has(email.trim().toLowerCase());
}

/** True if any of the org's user emails is a permanent test account. */
export function isTestAccount(emails: { email: string }[]): boolean {
  return emails.some((u) => isTestAccountEmail(u.email));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessResult =
  | { allowed: true }
  | { allowed: false; reason: "trial_expired" | "query_limit" | "plan_limit"; message: string };

export interface OrgBillingState {
  plan: string;
  // True for FREE-plan orgs (and test accounts) — free for founding firms
  // through 2027, never gated by trial expiry or subscription status. The
  // billing page uses this to show an honest "founding access" panel
  // instead of the legacy trial/upgrade flow.
  isFoundingFree: boolean;
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

// Pricing model (Aug 2026 → founding-free, see docs/PLAN-PRACTICE-MODE.md
// Phase 5): free for founding firms through 2027 — unlimited clients,
// unlimited queries, nothing gated. These limits stay in place (rather than
// being deleted) purely so they can be reintroduced after 2027; they are not
// currently enforced against anyone.
//   FREE          — founding-free: unlimited client books, unlimited queries.
//   PROFESSIONAL / STARTER / ENTERPRISE — legacy tiers, no longer sold.
export const PLAN_QUERY_LIMITS: Record<string, number> = {
  FREE:         999999,
  STARTER:      500,
  PROFESSIONAL: 999999,
  ENTERPRISE:   999999,
};

export const PLAN_CONNECTION_LIMITS: Record<string, number> = {
  FREE:         999999,
  STARTER:      5,        // legacy
  PROFESSIONAL: 999999,   // legacy Firm plan
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
      users: { select: { email: true } },
    },
  });

  if (!org) return { allowed: false, reason: "plan_limit", message: "Organisation not found." };

  // Permanent test accounts bypass all enforcement.
  if (isTestAccount(org.users)) return { allowed: true };

  // Founding-free (Phase 5): nobody is gated by trial expiry, subscription
  // status, or query count right now — free for founding firms through
  // 2027. This is intentionally unconditional, not scoped to plan==="FREE":
  // checked the production org table (2026-08-28) and every existing org is
  // either FREE or STARTER (the schema's pre-Phase-5 default), none has an
  // active subscription — "STARTER" here just means "signed up before the
  // founding-free pricing model shipped," not "a real paying customer on a
  // legacy tier." The actual enforcement below reads org.trialEndsAt/
  // queryLimit (per-row DB columns set by startTrial()), NOT the
  // PLAN_QUERY_LIMITS / PLAN_CONNECTION_LIMITS maps above — those are unread
  // reference constants today. Revisit this bypass (scope it back down, and
  // wire real per-org limits) when pricing is actually introduced after
  // 2027 and a genuine paid subscription flow exists. The trial_expired/
  // query_limit logic this replaced is in git history (see the commit that
  // added this comment) — restore from there rather than reconstructing it,
  // since org.trialEndsAt/queryLimit semantics may need a fresh look by then
  // anyway (e.g. per-plan values, a real subscription flow).
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
      users: { select: { email: true } },
    },
  });

  if (!org) return null;

  // Permanent test accounts always appear fully active with no limits.
  if (isTestAccount(org.users)) {
    return {
      plan: "ENTERPRISE",
      isFoundingFree: true,
      trialEndsAt: null,
      isTrialActive: true,
      trialDaysLeft: 9999,
      isSubscriptionActive: true,
      subscriptionStatus: "active",
      queriesUsed: org.queriesUsed,
      queryLimit: 999999,
      queriesLeft: 999999,
    };
  }

  const now = new Date();
  const isTrialActive = org.trialEndsAt ? org.trialEndsAt > now : false;
  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : 0;

  // Matches checkPlanAccess: founding-free applies to everyone right now,
  // not just plan==="FREE" — the only org that should see the legacy trial/
  // subscribe UI is one with a genuinely active paid subscription, and none
  // exist today (checked production 2026-08-28).
  const isSubscriptionActive = org.subscriptionStatus === "active";

  return {
    plan: org.plan,
    isFoundingFree: !isSubscriptionActive,
    trialEndsAt: org.trialEndsAt,
    isTrialActive,
    trialDaysLeft,
    isSubscriptionActive,
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

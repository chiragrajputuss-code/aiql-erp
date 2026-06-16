/**
 * Phase A anti-abuse — no SMS required.
 *
 * Limits:
 *  - IP: max 2 trial signups per IP per 30 days
 *  - Device fingerprint: max 1 trial per fingerprint ever
 *  - Lifetime queries: FREE plan capped at 25 total (never resets)
 *  - GL close runs: FREE plan capped at 3 total
 */

import { prisma } from "@aiql/db";

// ─── Constants ────────────────────────────────────────────────────────────────

export const FREE_LIFETIME_QUERY_CAP = 25;
export const FREE_CLOSE_RUN_CAP      = 3;
export const IP_SIGNUP_LIMIT         = 2;   // per 30 days
export const IP_WINDOW_DAYS          = 30;

// Plans exempt from abuse caps (paid plans)
const PAID_PLANS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

// ─── IP rate limit ────────────────────────────────────────────────────────────

export async function checkIpSignupLimit(ip: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - IP_WINDOW_DAYS);

  const count = await prisma.signupAbuseLog.count({
    where: { ip, createdAt: { gte: windowStart } },
  });

  if (count >= IP_SIGNUP_LIMIT) {
    return {
      allowed: false,
      reason: `Too many accounts created from this network. Please wait ${IP_WINDOW_DAYS} days or contact support@acctqai.com.`,
    };
  }
  return { allowed: true };
}

// ─── Device fingerprint check ─────────────────────────────────────────────────

export async function checkFingerprintLimit(fingerprint: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  if (!fingerprint) return { allowed: true };

  const existing = await prisma.signupAbuseLog.findFirst({
    where: { fingerprint },
  });

  if (existing) {
    return {
      allowed: false,
      reason: "A trial account already exists from this device. Please log in or contact support@acctqai.com to continue.",
    };
  }
  return { allowed: true };
}

// ─── Log signup ───────────────────────────────────────────────────────────────

export async function logSignup(
  ip: string,
  email: string,
  orgId: string,
  fingerprint?: string,
): Promise<void> {
  await prisma.signupAbuseLog.create({
    data: {
      id: `sal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ip,
      email,
      orgId,
      fingerprint: fingerprint ?? null,
    },
  });
}

// ─── Lifetime query cap ───────────────────────────────────────────────────────

export async function checkLifetimeQueryCap(orgId: string): Promise<{
  allowed: boolean;
  reason?: string;
  used?: number;
}> {
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { plan: true, lifetimeQueriesUsed: true, subscriptionStatus: true },
  });
  if (!org) return { allowed: false, reason: "Organisation not found." };

  // Paid plans have no lifetime cap
  if (PAID_PLANS.includes(org.plan)) return { allowed: true };
  if (org.subscriptionStatus === "active") return { allowed: true };

  if (org.lifetimeQueriesUsed >= FREE_LIFETIME_QUERY_CAP) {
    return {
      allowed: false,
      used: org.lifetimeQueriesUsed,
      reason: `You've used all ${FREE_LIFETIME_QUERY_CAP} free queries. Upgrade to continue — plans start at ₹999/month.`,
    };
  }
  return { allowed: true, used: org.lifetimeQueriesUsed };
}

export async function incrementLifetimeQueryCount(orgId: string): Promise<void> {
  await prisma.organisation.update({
    where: { id: orgId },
    data: { lifetimeQueriesUsed: { increment: 1 } },
  });
}

// ─── GL close run cap ─────────────────────────────────────────────────────────

export async function checkCloseRunCap(orgId: string): Promise<{
  allowed: boolean;
  reason?: string;
  used?: number;
}> {
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { plan: true, closeRunsUsed: true, subscriptionStatus: true },
  });
  if (!org) return { allowed: false, reason: "Organisation not found." };

  if (PAID_PLANS.includes(org.plan)) return { allowed: true };
  if (org.subscriptionStatus === "active") return { allowed: true };

  if (org.closeRunsUsed >= FREE_CLOSE_RUN_CAP) {
    return {
      allowed: false,
      used: org.closeRunsUsed,
      reason: `You've used all ${FREE_CLOSE_RUN_CAP} free GL close runs. Upgrade to run unlimited closes — plans start at ₹999/month.`,
    };
  }
  return { allowed: true, used: org.closeRunsUsed };
}

export async function incrementCloseRunCount(orgId: string): Promise<void> {
  await prisma.organisation.update({
    where: { id: orgId },
    data: { closeRunsUsed: { increment: 1 } },
  });
}

// ─── Helper: extract real IP from request headers ─────────────────────────────

export function extractIp(req: Request): string {
  const headers = req instanceof Request ? req.headers : new Headers();
  return (
    (headers as Headers).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    (headers as Headers).get("x-real-ip") ??
    "unknown"
  );
}

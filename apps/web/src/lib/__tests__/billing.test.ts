import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { organisation: { findUnique: vi.fn() } },
}));

vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));

import { checkPlanAccess, getOrgBillingState } from "../billing";

const NOW = new Date("2026-08-28T00:00:00.000Z");
const YESTERDAY = new Date("2026-08-27T00:00:00.000Z"); // expired trial
const TOMORROW  = new Date("2026-08-29T00:00:00.000Z"); // active trial

function org(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    plan: "FREE",
    trialEndsAt: YESTERDAY,
    razorpaySubscriptionId: null,
    subscriptionStatus: null,
    queriesUsed: 0,
    queryLimit: 100,
    users: [{ email: "someone@example.com" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

// ─── checkPlanAccess ────────────────────────────────────────────────────────
//
// Founding-free (Phase 5, broadened after a real user got blocked live):
// checkPlanAccess is unconditional for any existing org right now — not
// scoped to plan==="FREE". Production had zero orgs with an active paid
// subscription when this was written; the legacy STARTER/PROFESSIONAL plan
// value on pre-Phase-5 signups is not a real paid tier today.

describe("checkPlanAccess — unconditional founding-free access", () => {
  it("is always allowed regardless of plan, even with a long-expired trial (the bug that blocked a real user)", async () => {
    for (const plan of ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"]) {
      mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan, trialEndsAt: YESTERDAY }));
      const result = await checkPlanAccess("org-1", "query");
      expect(result.allowed, `plan=${plan}`).toBe(true);
    }
  });

  it("is always allowed with trialEndsAt null (never had a trial set)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ trialEndsAt: null }));
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("is allowed even when queriesUsed has exceeded queryLimit", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ queriesUsed: 5000, queryLimit: 100 }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("is allowed for a non-'query' action too (import, scan, reconcile, close)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ trialEndsAt: YESTERDAY }));
    for (const action of ["import", "scan", "reconcile", "close"] as const) {
      const result = await checkPlanAccess("org-1", action);
      expect(result.allowed, action).toBe(true);
    }
  });

  it("bypasses everything for a permanent test account too", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "STARTER", trialEndsAt: YESTERDAY, users: [{ email: "df@as.com" }] }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("returns plan_limit when the org does not exist", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(null);
    const result = await checkPlanAccess("missing-org", "query");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("plan_limit");
  });
});

// ─── getOrgBillingState ─────────────────────────────────────────────────────

describe("getOrgBillingState — isFoundingFree", () => {
  it("is true for a FREE-plan org", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "FREE", trialEndsAt: YESTERDAY }));
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(true);
  });

  it("is true for a legacy STARTER/PROFESSIONAL org with no active subscription (matches checkPlanAccess)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "STARTER", trialEndsAt: YESTERDAY, subscriptionStatus: null }),
    );
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(true);
  });

  it("is true for a test account", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ users: [{ email: "df@as.com" }] }));
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(true);
  });

  it("is false only for an org with a genuinely active paid subscription", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "STARTER", subscriptionStatus: "active", razorpaySubscriptionId: "sub_123" }),
    );
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(false);
    expect(state?.isSubscriptionActive).toBe(true);
  });

  it("trial fields still reflect the real underlying data for display purposes (unrelated to the access bypass)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "STARTER", trialEndsAt: TOMORROW }));
    const state = await getOrgBillingState("org-1");
    expect(state?.isTrialActive).toBe(true);
    expect(state?.trialDaysLeft).toBe(1);
  });
});

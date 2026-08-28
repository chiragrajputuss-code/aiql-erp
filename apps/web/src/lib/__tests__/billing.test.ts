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

describe("checkPlanAccess — FREE plan (founding-free, Phase 5)", () => {
  it("is always allowed even with a long-expired trial (this is the bug that blocked real users)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "FREE", trialEndsAt: YESTERDAY }));
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("is always allowed with trialEndsAt null (never had a trial set)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "FREE", trialEndsAt: null }));
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("is allowed even when queriesUsed has exceeded queryLimit (unlimited, not gated by the stale DB column)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "FREE", trialEndsAt: YESTERDAY, queriesUsed: 5000, queryLimit: 100 }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("never even reaches a Date comparison for FREE orgs (bypass happens before trial logic)", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "FREE", trialEndsAt: YESTERDAY }));
    const result = await checkPlanAccess("org-1", "import");
    expect(result.allowed).toBe(true);
  });
});

describe("checkPlanAccess — legacy plans keep their existing enforcement", () => {
  it("blocks a STARTER org with an expired trial and no active subscription", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "STARTER", trialEndsAt: YESTERDAY, subscriptionStatus: null }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("trial_expired");
  });

  it("allows a STARTER org with an active trial", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "STARTER", trialEndsAt: TOMORROW }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("allows a STARTER org with an active paid subscription past trial", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({ plan: "STARTER", trialEndsAt: YESTERDAY, subscriptionStatus: "active", razorpaySubscriptionId: "sub_123" }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(true);
  });

  it("still enforces the query_limit for a non-FREE org that has an active subscription", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(
      org({
        plan: "STARTER", trialEndsAt: YESTERDAY, subscriptionStatus: "active", razorpaySubscriptionId: "sub_123",
        queriesUsed: 500, queryLimit: 500,
      }),
    );
    const result = await checkPlanAccess("org-1", "query");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("query_limit");
  });
});

describe("checkPlanAccess — test accounts and missing orgs", () => {
  it("bypasses everything for a permanent test account, even on an expired-trial STARTER plan", async () => {
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
  it("is true for a FREE-plan org regardless of trial state", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "FREE", trialEndsAt: YESTERDAY }));
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(true);
  });

  it("is true for a test account", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ users: [{ email: "df@as.com" }] }));
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(true);
  });

  it("is false for a legacy STARTER/PROFESSIONAL org", async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue(org({ plan: "STARTER" }));
    const state = await getOrgBillingState("org-1");
    expect(state?.isFoundingFree).toBe(false);
  });
});

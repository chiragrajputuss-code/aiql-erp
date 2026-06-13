import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",   () => ({ prisma: mockPrisma }));

import { validateRequest } from "@/lib/auth";
import { POST } from "@/app/api/v1/onboarding/complete/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH_USER = { id: "u1", orgId: "org1", email: "ca@test.in" };

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({ user: AUTH_USER });
  mockPrisma.user.update.mockResolvedValue({ ...AUTH_USER, onboardingComplete: true });
});

// ── POST /api/v1/onboarding/complete ─────────────────────────────────────────

describe("POST /api/v1/onboarding/complete", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorised/i);
  });

  it("sets onboardingComplete=true and returns ok:true", async () => {
    const res  = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: AUTH_USER.id },
      data:  { onboardingComplete: true },
    });
  });

  it("is idempotent — calling twice updates the same user without error", async () => {
    await POST();
    const res  = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
  });
});

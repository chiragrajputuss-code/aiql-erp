import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    investigationFinding: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));

import { validateRequest } from "@/lib/auth";
import { POST } from "@/app/api/v1/investigations/findings/[id]/disposition/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH = { user: { id: "u1", orgId: "org-1", email: "ca@test.in" } };

function req(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}
function params(id: string) {
  return { params: { id } } as Parameters<typeof POST>[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue(AUTH);
});

describe("POST /api/v1/investigations/findings/:id/disposition", () => {
  it("401s when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await POST(req({ disposition: "recovered" }), params("f1"));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid disposition value", async () => {
    const res = await POST(req({ disposition: "definitely_fixed" }), params("f1"));
    expect(res.status).toBe(400);
    expect(mockPrisma.investigationFinding.findFirst).not.toHaveBeenCalled();
  });

  it("404s when the finding does not belong to the caller's org (never trust the client)", async () => {
    mockPrisma.investigationFinding.findFirst.mockResolvedValue(null);
    const res = await POST(req({ disposition: "recovered" }), params("someone-elses-finding"));
    expect(res.status).toBe(404);
    expect(mockPrisma.investigationFinding.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "someone-elses-finding", run: { orgId: "org-1" } } }),
    );
  });

  it("400s when the finding is not resolved (only a resolved finding can be dispositioned)", async () => {
    mockPrisma.investigationFinding.findFirst.mockResolvedValue({ id: "f1", status: "open", disposition: null });
    const res = await POST(req({ disposition: "recovered" }), params("f1"));
    expect(res.status).toBe(400);
    expect(mockPrisma.investigationFinding.update).not.toHaveBeenCalled();
  });

  it("409s when already dispositioned — never silently overwrites a human's confirmation", async () => {
    mockPrisma.investigationFinding.findFirst.mockResolvedValue({ id: "f1", status: "resolved", disposition: "recovered" });
    const res = await POST(req({ disposition: "not_an_issue" }), params("f1"));
    expect(res.status).toBe(409);
    expect(mockPrisma.investigationFinding.update).not.toHaveBeenCalled();
  });

  it("writes disposition + dispositionAt on a resolved, undispositioned finding", async () => {
    mockPrisma.investigationFinding.findFirst.mockResolvedValue({ id: "f1", status: "resolved", disposition: null });
    mockPrisma.investigationFinding.update.mockResolvedValue({
      id: "f1", disposition: "recovered", dispositionAt: new Date("2026-08-27T00:00:00.000Z"),
    });

    const res = await POST(req({ disposition: "recovered" }), params("f1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.investigationFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1" },
        data:  expect.objectContaining({ disposition: "recovered", dispositionAt: expect.any(Date) }),
      }),
    );
    const body = await res.json();
    expect(body.disposition).toBe("recovered");
  });
});

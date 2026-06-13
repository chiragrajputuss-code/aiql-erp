import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockPrisma, mockDropTempTable } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection: {
      findFirst: vi.fn(),
      delete:    vi.fn(),
    },
  },
  mockDropTempTable: vi.fn(),
}));

vi.mock("@/lib/auth",           () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",             () => ({ prisma: mockPrisma }));
vi.mock("@aiql/erp-connectors", () => ({ dropTempTable: mockDropTempTable }));
vi.mock("@/lib/summary-cache",  () => ({ clearSummaryCache: vi.fn() }));

import { validateRequest } from "@/lib/auth";
import { clearSummaryCache } from "@/lib/summary-cache";
import { DELETE } from "@/app/api/internal/connections/[id]/route";

const validateRequestMock    = validateRequest as ReturnType<typeof vi.fn>;
const clearCacheMock         = clearSummaryCache as ReturnType<typeof vi.fn>;

const ADMIN_USER = { id: "u1", orgId: "org1", email: "ca@test.in", role: "ADMIN" };
const MEMBER_USER = { id: "u2", orgId: "org1", email: "member@test.in", role: "MEMBER" };

function makeParams(id: string) {
  return { params: { id } } as Parameters<typeof DELETE>[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({ user: ADMIN_USER });
  mockDropTempTable.mockResolvedValue(undefined);
  mockPrisma.erpConnection.delete.mockResolvedValue({});
});

// ── DELETE /api/internal/connections/[id] ─────────────────────────────────────

describe("DELETE /api/internal/connections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await DELETE({} as unknown as import("next/server").NextRequest, makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-ADMIN users", async () => {
    validateRequestMock.mockResolvedValue({ user: MEMBER_USER });
    const res = await DELETE({} as unknown as import("next/server").NextRequest, makeParams("c1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue(null);
    const res = await DELETE({} as unknown as import("next/server").NextRequest, makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("deletes connection and returns ok:true", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({
      id: "c1", orgId: "org1", displayName: "Kumar Textiles", uploadedFile: null,
    });
    const res  = await DELETE({} as unknown as import("next/server").NextRequest, makeParams("c1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockPrisma.erpConnection.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("drops the upload table for FILE_UPLOAD connections", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({
      id: "c1", orgId: "org1", displayName: "Kumar Textiles",
      uploadedFile: { tableName: "upload_org1_kumar" },
    });
    await DELETE({} as unknown as import("next/server").NextRequest, makeParams("c1"));
    expect(mockDropTempTable).toHaveBeenCalledWith("upload_org1_kumar");
  });

  it("skips dropTempTable when no uploadedFile", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({
      id: "c1", orgId: "org1", displayName: "Tally Live", uploadedFile: null,
    });
    await DELETE({} as unknown as import("next/server").NextRequest, makeParams("c1"));
    expect(mockDropTempTable).not.toHaveBeenCalled();
  });

  it("invalidates summary cache after deletion", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({
      id: "c1", orgId: "org1", displayName: "Kumar Textiles", uploadedFile: null,
    });
    await DELETE({} as unknown as import("next/server").NextRequest, makeParams("c1"));
    expect(clearCacheMock).toHaveBeenCalledWith(ADMIN_USER.orgId);
  });
});

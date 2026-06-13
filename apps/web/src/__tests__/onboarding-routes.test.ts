import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies BEFORE importing route handlers ──────────────────────

const { mockPrisma, mockLoadDemo, mockUnloadDemo } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection: {
      findMany: vi.fn(),
      upsert:   vi.fn(),
      update:   vi.fn(),
      delete:   vi.fn(),
    },
    uploadedFile: {
      upsert: vi.fn(),
    },
    orgBusinessKnowledge: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRawUnsafe:      vi.fn().mockResolvedValue([]),
    $executeRawUnsafe:    vi.fn().mockResolvedValue(undefined),
  },
  mockLoadDemo:   vi.fn(),
  mockUnloadDemo: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",   () => ({ prisma: mockPrisma }));
vi.mock("@/lib/demo-loader", () => ({
  loadDemoForOrg:   mockLoadDemo,
  unloadDemoForOrg: mockUnloadDemo,
}));

// summary-cache: clearSummaryCache must be importable (side-effect only — just
// needs not to throw, so use the real implementation).
vi.mock("@/lib/summary-cache", () => ({
  clearSummaryCache: vi.fn(),
  CACHE:             new Map(),
  CACHE_TTL_MS:      300_000,
}));

import { validateRequest } from "@/lib/auth";
import { POST as loadDemoPOST   } from "@/app/api/v1/onboarding/load-demo/route";
import { POST as unloadDemoPOST } from "@/app/api/v1/onboarding/unload-demo/route";
import { clearSummaryCache }       from "@/lib/summary-cache";

const validateRequestMock     = validateRequest as ReturnType<typeof vi.fn>;
const clearSummaryCacheMock   = clearSummaryCache as ReturnType<typeof vi.fn>;

const AUTH_USER = { id: "u1", orgId: "org1", email: "ca@test.in" };

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({ user: AUTH_USER });
});

// ── POST /api/v1/onboarding/load-demo ─────────────────────────────────────────

describe("POST /api/v1/onboarding/load-demo", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await loadDemoPOST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorised/i);
  });

  it("returns ok:true and connection list on success", async () => {
    mockLoadDemo.mockResolvedValue({
      loaded: [
        { connectionId: "demo_org1_kumar",   displayName: "Demo: Kumar Textiles",    rowCount: 1200, columnsMapped: 7 },
        { connectionId: "demo_org1_sharma",  displayName: "Demo: Sharma Electronics", rowCount: 980,  columnsMapped: 7 },
        { connectionId: "demo_org1_techvista", displayName: "Demo: TechVista",        rowCount: 540,  columnsMapped: 6 },
      ],
      durationMs: 1500,
    });

    const res  = await loadDemoPOST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    expect(body.connections).toHaveLength(3);
    expect(body.durationMs).toBe(1500);
  });

  it("invalidates the summary cache after a successful load", async () => {
    mockLoadDemo.mockResolvedValue({ loaded: [], durationMs: 100 });
    await loadDemoPOST();
    expect(clearSummaryCacheMock).toHaveBeenCalledWith(AUTH_USER.orgId);
  });

  it("does NOT call clearSummaryCache when load fails", async () => {
    mockLoadDemo.mockRejectedValue(new Error("Demo file missing"));
    const res  = await loadDemoPOST();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain("Demo file missing");
    expect(clearSummaryCacheMock).not.toHaveBeenCalled();
  });
});

// ── POST /api/v1/onboarding/unload-demo ───────────────────────────────────────

describe("POST /api/v1/onboarding/unload-demo", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await unloadDemoPOST();
    expect(res.status).toBe(401);
  });

  it("returns ok:true with removed count", async () => {
    mockUnloadDemo.mockResolvedValue({ removed: 3 });
    const res  = await unloadDemoPOST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.removed).toBe(3);
  });

  it("invalidates the summary cache after successful unload", async () => {
    mockUnloadDemo.mockResolvedValue({ removed: 3 });
    await unloadDemoPOST();
    expect(clearSummaryCacheMock).toHaveBeenCalledWith(AUTH_USER.orgId);
  });

  it("returns removed:0 when no demo connections exist", async () => {
    mockUnloadDemo.mockResolvedValue({ removed: 0 });
    const res  = await unloadDemoPOST();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.removed).toBe(0);
  });

  it("returns 500 on internal error", async () => {
    mockUnloadDemo.mockRejectedValue(new Error("DB error"));
    const res  = await unloadDemoPOST();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain("DB error");
  });
});

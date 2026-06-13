import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks (vi.mock factories run before module code)
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    orgBusinessKnowledge: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
      delete:    vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",   () => ({ prisma: mockPrisma }));

import { validateRequest } from "@/lib/auth";
import { POST as recordPOST, GET as listGET } from "@/app/api/v1/knowledge/route";
import { POST as lookupPOST }                  from "@/app/api/v1/knowledge/lookup/route";
import { GET as singleGET, DELETE as singleDEL } from "@/app/api/v1/knowledge/[id]/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH = { user: { id: "u1", orgId: "org1", email: "x@y.com" } };

function jsonReq(body: unknown, method = "POST") {
  return { url: "http://localhost/api/v1/knowledge", method, json: async () => body } as Parameters<typeof recordPOST>[0];
}
function getReq(url: string) {
  return { url, method: "GET" } as Parameters<typeof listGET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue(AUTH);
});

// ── POST /api/v1/knowledge ─────────────────────────────────────────────────

describe("POST /api/v1/knowledge", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await recordPOST(jsonReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid", async () => {
    const res = await recordPOST(jsonReq({ patternKey: "x" }));
    expect(res.status).toBe(400);
  });

  it("creates a new knowledge row when none exists", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue(null);
    mockPrisma.orgBusinessKnowledge.create.mockResolvedValue({
      id: "k1", patternKey: "scan:voucher-imbalance",
    });

    const res = await recordPOST(jsonReq({
      patternKey: "scan:voucher-imbalance",
      context:    "3 vouchers had Dr ≠ Cr",
      answer:     "Known issue, ignore for now",
      source:     "SCAN_ISSUE",
      verdict:    "NORMAL",
      autoApply:  "ALWAYS",
    }));

    expect(res.status).toBe(201);
    expect(mockPrisma.orgBusinessKnowledge.create).toHaveBeenCalled();
    const arg = mockPrisma.orgBusinessKnowledge.create.mock.calls[0][0];
    expect(arg.data.confidence).toBe(1.0);
    expect(arg.data.historyJson).toContain("NORMAL");
  });

  it("upserts an existing row by bumping confidence + reaffirmationCount + history", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1",
      confidence: 0.6,
      reaffirmationCount: 2,
      historyJson: "[]",
      sourceRefJson: null,
    });
    mockPrisma.orgBusinessKnowledge.update.mockResolvedValue({
      id: "k1", confidence: 0.7, reaffirmationCount: 3,
    });

    await recordPOST(jsonReq({
      patternKey: "scan:voucher-imbalance",
      context:    "Repeated",
      answer:     "Still known",
      source:     "SCAN_ISSUE",
    }));

    const arg = mockPrisma.orgBusinessKnowledge.update.mock.calls[0][0];
    expect(arg.data.confidence).toBeCloseTo(0.7, 2);
    expect(arg.data.reaffirmationCount).toBe(3);
    // History should grow by 1 entry
    const history = JSON.parse(arg.data.historyJson);
    expect(history).toHaveLength(1);
  });

  it("caps confidence at 1.0 on reaffirmation", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", confidence: 0.95, reaffirmationCount: 5, historyJson: "[]",
    });
    mockPrisma.orgBusinessKnowledge.update.mockResolvedValue({});

    await recordPOST(jsonReq({
      patternKey: "x", context: "x", answer: "x", source: "MANUAL",
    }));

    const arg = mockPrisma.orgBusinessKnowledge.update.mock.calls[0][0];
    expect(arg.data.confidence).toBeLessThanOrEqual(1.0);
    expect(arg.data.confidence).toBe(1.0);
  });
});

// ── GET /api/v1/knowledge ──────────────────────────────────────────────────

describe("GET /api/v1/knowledge", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await listGET(getReq("http://localhost/api/v1/knowledge"));
    expect(res.status).toBe(401);
  });

  it("returns items for the authed org", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      { id: "k1" }, { id: "k2" },
    ]);
    const res = await listGET(getReq("http://localhost/api/v1/knowledge"));
    const body = await res.json();
    expect(body.count).toBe(2);
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.orgId).toBe("org1");
  });

  it("filters by connectionId when provided", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    await listGET(getReq("http://localhost/api/v1/knowledge?connectionId=c1"));
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.connectionId).toBe("c1");
  });

  it("filters by source when valid", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    await listGET(getReq("http://localhost/api/v1/knowledge?source=SCAN_ISSUE"));
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.source).toBe("SCAN_ISSUE");
  });

  it("ignores invalid source values (no filter)", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    await listGET(getReq("http://localhost/api/v1/knowledge?source=BOGUS"));
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.source).toBeUndefined();
  });
});

// ── POST /api/v1/knowledge/lookup ──────────────────────────────────────────

describe("POST /api/v1/knowledge/lookup", () => {
  it("returns null + autoResolved=false when no match", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue(null);
    const res = await lookupPOST(jsonReq({ patternKey: "scan:voucher-imbalance" }));
    const body = await res.json();
    expect(body.match).toBeNull();
    expect(body.autoResolved).toBe(false);
  });

  it("returns match + autoResolved=true when policy is ALWAYS", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", autoApply: "ALWAYS", verdict: "NORMAL",
    });
    const res = await lookupPOST(jsonReq({ patternKey: "scan:x" }));
    const body = await res.json();
    expect(body.match.id).toBe("k1");
    expect(body.autoResolved).toBe(true);
  });

  it("returns match + autoResolved=false when policy is NEVER", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", autoApply: "NEVER", verdict: "NORMAL",
    });
    const res = await lookupPOST(jsonReq({ patternKey: "scan:x" }));
    const body = await res.json();
    expect(body.autoResolved).toBe(false);
  });

  it("returns match + autoResolved=false when verdict is REJECTED (even if ALWAYS)", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", autoApply: "ALWAYS", verdict: "REJECTED",
    });
    const res = await lookupPOST(jsonReq({ patternKey: "scan:x" }));
    const body = await res.json();
    expect(body.autoResolved).toBe(false);
  });

  it("treats ONCE policy as not auto-resolving (caller decides what to do with the hint)", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", autoApply: "ONCE", verdict: "NORMAL",
    });
    const res = await lookupPOST(jsonReq({ patternKey: "scan:x" }));
    const body = await res.json();
    expect(body.autoResolved).toBe(false);
    expect(body.match.id).toBe("k1");  // but still surfaces the prior answer
  });
});

// ── GET / DELETE /api/v1/knowledge/:id ─────────────────────────────────────

describe("/api/v1/knowledge/:id", () => {
  const ctx = { params: { id: "k1" } };

  it("GET returns 404 if not owned by org", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue(null);
    const res = await singleGET({} as Parameters<typeof singleGET>[0], ctx);
    expect(res.status).toBe(404);
  });

  it("GET returns the row when found", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({ id: "k1", answer: "x" });
    const res = await singleGET({} as Parameters<typeof singleGET>[0], ctx);
    const body = await res.json();
    expect(body.id).toBe("k1");
  });

  it("DELETE refuses if not owned", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue(null);
    const res = await singleDEL({} as Parameters<typeof singleDEL>[0], ctx);
    expect(res.status).toBe(404);
    expect(mockPrisma.orgBusinessKnowledge.delete).not.toHaveBeenCalled();
  });

  it("DELETE removes when owned", async () => {
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({ id: "k1" });
    mockPrisma.orgBusinessKnowledge.delete.mockResolvedValue({});
    const res = await singleDEL({} as Parameters<typeof singleDEL>[0], ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.orgBusinessKnowledge.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
  });
});

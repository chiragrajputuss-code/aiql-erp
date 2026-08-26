import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection:        { findMany: vi.fn() },
    investigationFinding: { groupBy: vi.fn() },
    $queryRaw:            vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",   () => ({ prisma: mockPrisma }));

import { validateRequest } from "@/lib/auth";
import { GET } from "@/app/api/v1/practice/overview/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH = { user: { id: "u1", orgId: "org-1", email: "ca@test.in" } };

function req(url = "http://localhost/api/v1/practice/overview") {
  return { url } as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue(AUTH);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.investigationFinding.groupBy.mockResolvedValue([]);
});

describe("GET /api/v1/practice/overview", () => {
  it("401s when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("only includes ACTIVE connections holding a GL upload as client rows", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      { id: "c-gl",   displayName: "Client A", uploadedFile: { documentType: "GL",       periodStart: null, periodEnd: null }, workspaceDocuments: [] },
      { id: "c-2b",   displayName: "Stray 2B", uploadedFile: { documentType: "GSTR_2B",  periodStart: null, periodEnd: null }, workspaceDocuments: [] },
      { id: "c-none", displayName: "Pending",  uploadedFile: null, workspaceDocuments: [] },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].connectionId).toBe("c-gl");
    expect(body.clients[0].hasGl).toBe(true);
  });

  it("marks hasGstr2b true only when a GSTR-2B upload's period overlaps the GL's period", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      {
        id: "c-may", displayName: "May Client",
        uploadedFile: { documentType: "GL", periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31") },
        workspaceDocuments: [],
      },
      {
        id: "c-2b-may", displayName: "2B May",
        uploadedFile: { documentType: "GSTR_2B", periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31") },
        workspaceDocuments: [],
      },
      {
        id: "c-jun", displayName: "June Client",
        uploadedFile: { documentType: "GL", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30") },
        workspaceDocuments: [],
      },
    ]);

    const res = await GET(req());
    const body = await res.json();
    const may = body.clients.find((c: { connectionId: string }) => c.connectionId === "c-may");
    const jun = body.clients.find((c: { connectionId: string }) => c.connectionId === "c-jun");
    expect(may.hasGstr2b).toBe(true);
    expect(jun.hasGstr2b).toBe(false);
  });

  it("never queries per-client — a fixed number of DB round trips regardless of client count", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: `c-${i}`, displayName: `Client ${i}`,
        uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null },
        workspaceDocuments: [],
      })),
    );
    mockPrisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: `run-${i}`, connectionId: `c-${i}`, period: "05-2026", startedAt: new Date(),
        healthScore: 80, totalImpactRs: i * 100, criticalCount: i % 3, warningCount: 0, opportunityCount: 0,
      })),
    );

    await GET(req());
    expect(mockPrisma.erpConnection.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.investigationFinding.groupBy).toHaveBeenCalledTimes(1);
  });

  it("sorts by criticalCount desc, then totalImpactRs desc", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      { id: "a", displayName: "A", uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null }, workspaceDocuments: [] },
      { id: "b", displayName: "B", uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null }, workspaceDocuments: [] },
      { id: "c", displayName: "C", uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null }, workspaceDocuments: [] },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "r-a", connectionId: "a", period: "05-2026", startedAt: new Date(), healthScore: 90, totalImpactRs: 1000, criticalCount: 0, warningCount: 0, opportunityCount: 0 },
      { id: "r-b", connectionId: "b", period: "05-2026", startedAt: new Date(), healthScore: 60, totalImpactRs: 5000, criticalCount: 2, warningCount: 0, opportunityCount: 0 },
      { id: "r-c", connectionId: "c", period: "05-2026", startedAt: new Date(), healthScore: 60, totalImpactRs: 9000, criticalCount: 2, warningCount: 0, opportunityCount: 0 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.clients.map((c: { connectionId: string }) => c.connectionId)).toEqual(["c", "b", "a"]);
  });

  it("shapes summary correctly, including clients that have never been run", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      { id: "a", displayName: "A", uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null }, workspaceDocuments: [] },
      { id: "b", displayName: "B", uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null }, workspaceDocuments: [] },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "r-a", connectionId: "a", period: "05-2026", startedAt: new Date(), healthScore: 90, totalImpactRs: 1000, criticalCount: 0, warningCount: 0, opportunityCount: 0 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.summary).toEqual({ totalClients: 2, neverRunCount: 1, totalAtRiskRs: 1000 });
    const b = body.clients.find((c: { connectionId: string }) => c.connectionId === "b");
    expect(b.lastRunAt).toBeNull();
    expect(b.openFindingsCount).toBe(0);
  });

  it("caps limit at 50 regardless of a larger requested value", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `c-${i}`, displayName: `Client ${i}`,
        uploadedFile: { documentType: "GL", periodStart: null, periodEnd: null }, workspaceDocuments: [],
      })),
    );
    const res = await GET(req("http://localhost/api/v1/practice/overview?limit=9999"));
    const body = await res.json();
    expect(body.pagination.limit).toBe(50);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks (vi.mock factories run before module code)
const { mockPrisma, mockBuildBusinessContext, mockPersistRun, mockRunReport } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection:        { findFirst: vi.fn(), findMany: vi.fn() },
    investigationRun:     { findFirst: vi.fn(), findMany: vi.fn() },
    investigationFinding: { findMany: vi.fn() },
    organisation:         { findUnique: vi.fn() },
  },
  mockBuildBusinessContext: vi.fn(),
  mockPersistRun:           vi.fn(),
  mockRunReport:            vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",   () => ({ prisma: mockPrisma }));
vi.mock("@/lib/investigations/context-resolver", async () => {
  const actual = await vi.importActual<typeof import("@/lib/investigations/context-resolver")>("@/lib/investigations/context-resolver");
  return { ...actual, buildBusinessContext: mockBuildBusinessContext };
});
vi.mock("@/lib/investigations/persist", () => ({ persistRun: mockPersistRun }));
vi.mock("@/lib/investigations/llm-fn", () => ({ makeInvestigationLlmFn: () => null }));
vi.mock("@aiql/investigation-engine", async () => {
  const actual = await vi.importActual<typeof import("@aiql/investigation-engine")>("@aiql/investigation-engine");
  return { ...actual, runReport: mockRunReport, getInvestigations: () => [], getDefaultProfile: () => ({ id: "indian-sme-default", investigationIds: [] }) };
});

import { validateRequest } from "@/lib/auth";
import { POST as runPOST } from "@/app/api/v1/investigations/run/route";
import { GET as reportGET } from "@/app/api/v1/investigations/report/route";
import { GET as clientsGET } from "@/app/api/v1/investigations/clients/route";
import { GET as historyGET } from "@/app/api/v1/investigations/history/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH = { user: { id: "u1", orgId: "org-1", email: "x@y.com" } };

function postReq(body: unknown) {
  return { url: "http://localhost/api/v1/investigations/run", method: "POST", json: async () => body } as Parameters<typeof runPOST>[0];
}
function getReq(url: string) {
  return { url } as Parameters<typeof reportGET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue(AUTH);
  mockRunReport.mockResolvedValue({
    findings: [], outcomes: [], healthScore: 100, totalImpactRs: 0,
    criticalCount: 0, warningCount: 0, opportunityCount: 0,
    executiveSummary: "clean", proactiveObservation: null, boardBrief: null,
  });
  mockPersistRun.mockResolvedValue({ runId: "run-1" });
  mockPrisma.investigationFinding.findMany.mockResolvedValue([]);
  mockBuildBusinessContext.mockResolvedValue({
    organizationId: "org-1", connectionId: "conn-1",
    period: { label: "05-2026" }, snapshotId: "CTX-1", resolvedAt: new Date(),
    isStale: false, capabilities: new Set(),
  });
});

describe("POST /api/v1/investigations/run — connection ownership", () => {
  it("404s when the connectionId belongs to another org (never trust the client)", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue(null); // not found under this org
    const res = await runPOST(postReq({ connectionId: "someone-elses-connection" }));
    expect(res.status).toBe(404);
    expect(mockBuildBusinessContext).not.toHaveBeenCalled();
  });

  it("proceeds when the connectionId belongs to the caller's org", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "conn-1" });
    const res = await runPOST(postReq({ connectionId: "conn-1" }));
    expect(res.status).toBe(200);
    expect(mockBuildBusinessContext).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", connectionId: "conn-1" }),
    );
  });

  it("does not check ownership when no connectionId is given (legacy path)", async () => {
    const res = await runPOST(postReq({}));
    expect(res.status).toBe(200);
    expect(mockPrisma.erpConnection.findFirst).not.toHaveBeenCalled();
  });

  it("returns 409 (not 500) when the resolver reports an ambiguous GSTR-2B match", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "conn-1" });
    const { AmbiguousItcSourceError } = await import("@/lib/investigations/context-resolver");
    mockBuildBusinessContext.mockRejectedValue(new AmbiguousItcSourceError("05-2026", ["itc-A", "itc-B"]));
    const res = await runPOST(postReq({ connectionId: "conn-1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Multiple GSTR-2B files/);
  });

  it("401s when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await runPOST(postReq({}));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/investigations/report — connection scoping", () => {
  it("404s when connectionId belongs to another org", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue(null);
    const res = await reportGET(getReq("http://localhost/api/v1/investigations/report?connectionId=not-mine"));
    expect(res.status).toBe(404);
    expect(mockPrisma.investigationRun.findFirst).not.toHaveBeenCalled();
  });

  it("filters the run query by connectionId when given", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "conn-1" });
    mockPrisma.investigationRun.findFirst.mockResolvedValue(null);
    await reportGET(getReq("http://localhost/api/v1/investigations/report?connectionId=conn-1"));
    expect(mockPrisma.investigationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ connectionId: "conn-1" }) }),
    );
  });

  it("omits connectionId from the filter on the legacy no-param path", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue(null);
    await reportGET(getReq("http://localhost/api/v1/investigations/report"));
    const arg = mockPrisma.investigationRun.findFirst.mock.calls[0][0];
    expect(arg.where).not.toHaveProperty("connectionId");
  });
});

describe("GET /api/v1/investigations/report?runId= — history (Phase 3.6)", () => {
  it("404s when the run belongs to another org (never trust the client)", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue(null);
    const res = await reportGET(getReq("http://localhost/api/v1/investigations/report?runId=someone-elses-run"));
    expect(res.status).toBe(404);
  });

  it("looks up the run by id scoped to the caller's org, ignoring connectionId when runId is given", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue({
      id: "run-old", orgId: "org-1", connectionId: "conn-1", period: "03-2026", status: "SUPERSEDED",
      snapshotId: "CTX-1", resolvedAt: new Date(), completedAt: new Date(),
      healthScore: 90, totalImpactRs: 0, criticalCount: 0, warningCount: 0, opportunityCount: 0,
      executiveSummary: null, investigationsJson: "[]", proactiveObservationJson: null, boardBriefJson: null,
      comparedToRunId: null, newCount: 0, carriedCount: 0, resolvedCount: 0, resolvedRs: 0,
      findings: [],
    });
    const res = await reportGET(getReq("http://localhost/api/v1/investigations/report?runId=run-old&connectionId=conn-2"));
    expect(res.status).toBe(200);
    expect(mockPrisma.investigationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "run-old", orgId: "org-1" } }),
    );
    expect(mockPrisma.erpConnection.findFirst).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.run.status).toBe("SUPERSEDED");
  });

  it("surfaces findings this run resolved on its comparedToRunId as resolvedFindings", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue({
      id: "run-new", orgId: "org-1", connectionId: "conn-1", period: "05-2026", status: "CURRENT",
      snapshotId: "CTX-2", resolvedAt: new Date(), completedAt: new Date(),
      healthScore: 100, totalImpactRs: 0, criticalCount: 0, warningCount: 0, opportunityCount: 0,
      executiveSummary: null, investigationsJson: "[]", proactiveObservationJson: null, boardBriefJson: null,
      comparedToRunId: "run-prior", newCount: 0, carriedCount: 0, resolvedCount: 1, resolvedRs: 15000,
      findings: [],
    });
    mockPrisma.investigationFinding.findMany.mockResolvedValue([
      { id: "f1", code: "GST-ITC-002", title: "not filed", category: "compliance", impactRs: 15000, resolvedAt: new Date() },
    ]);

    const res = await reportGET(getReq("http://localhost/api/v1/investigations/report?runId=run-new"));
    expect(mockPrisma.investigationFinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: "run-prior", status: "resolved" } }),
    );
    const body = await res.json();
    expect(body.run.resolvedFindings).toHaveLength(1);
    expect(body.run.resolvedRs).toBe(15000);
  });

  it("does not query resolved findings when comparedToRunId is null (a client's first run)", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue({
      id: "run-first", orgId: "org-1", connectionId: "conn-1", period: "05-2026", status: "CURRENT",
      snapshotId: "CTX-1", resolvedAt: new Date(), completedAt: new Date(),
      healthScore: 100, totalImpactRs: 0, criticalCount: 0, warningCount: 0, opportunityCount: 0,
      executiveSummary: null, investigationsJson: "[]", proactiveObservationJson: null, boardBriefJson: null,
      comparedToRunId: null, newCount: 0, carriedCount: 0, resolvedCount: 0, resolvedRs: 0,
      findings: [],
    });
    const res = await reportGET(getReq("http://localhost/api/v1/investigations/report?runId=run-first"));
    expect(mockPrisma.investigationFinding.findMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.run.resolvedFindings).toEqual([]);
  });
});

describe("GET /api/v1/investigations/history", () => {
  it("404s when connectionId belongs to another org", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue(null);
    const res = await historyGET(getReq("http://localhost/api/v1/investigations/history?connectionId=not-mine"));
    expect(res.status).toBe(404);
    expect(mockPrisma.investigationRun.findMany).not.toHaveBeenCalled();
  });

  it("scopes the list by orgId + connectionId and orders newest first", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "conn-1" });
    mockPrisma.investigationRun.findMany.mockResolvedValue([]);
    await historyGET(getReq("http://localhost/api/v1/investigations/history?connectionId=conn-1"));
    expect(mockPrisma.investigationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { orgId: "org-1", connectionId: "conn-1" },
        orderBy: { startedAt: "desc" },
        take:    12,
      }),
    );
  });

  it("shapes each run with counts + resolvedRs from the persisted columns", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "conn-1" });
    mockPrisma.investigationRun.findMany.mockResolvedValue([{
      id: "run-1", period: "05-2026", startedAt: new Date("2026-05-15"), status: "CURRENT",
      healthScore: 80, totalImpactRs: 15000, criticalCount: 1,
      newCount: 1, carriedCount: 0, resolvedCount: 1, resolvedRs: 5000,
    }]);
    const res = await historyGET(getReq("http://localhost/api/v1/investigations/history?connectionId=conn-1"));
    const body = await res.json();
    expect(body.runs).toEqual([{
      runId: "run-1", period: "05-2026", startedAt: "2026-05-15T00:00:00.000Z", status: "CURRENT",
      healthScore: 80, totalImpactRs: 15000, criticalCount: 1,
      counts: { new: 1, carried: 0, resolved: 1 }, resolvedRs: 5000,
    }]);
  });

  it("caps limit at MAX_LIMIT rather than trusting an arbitrary client-supplied value", async () => {
    mockPrisma.investigationRun.findMany.mockResolvedValue([]);
    await historyGET(getReq("http://localhost/api/v1/investigations/history?limit=9999"));
    expect(mockPrisma.investigationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60 }),
    );
  });
});

describe("GET /api/v1/investigations/clients", () => {
  it("only requests ACTIVE connections with a GL uploadedFile", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([]);
    await clientsGET({} as never);
    expect(mockPrisma.erpConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-1", status: "ACTIVE",
          uploadedFile: { documentType: "GL" },
        }),
      }),
    );
  });

  it("shapes the response as { clients: [...] }", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      { id: "conn-1", displayName: "Mahalaxmi Steel — May", uploadedFile: { periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31") } },
    ]);
    const res = await clientsGET({} as never);
    const body = await res.json();
    expect(body.clients).toEqual([
      { connectionId: "conn-1", displayName: "Mahalaxmi Steel — May", periodStart: "2026-05-01", periodEnd: "2026-05-31" },
    ]);
  });
});

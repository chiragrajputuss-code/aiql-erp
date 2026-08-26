import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks (vi.mock factories run before module code)
const { mockPrisma, mockBuildBusinessContext, mockPersistRun, mockRunReport } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection:      { findFirst: vi.fn(), findMany: vi.fn() },
    investigationRun:   { findFirst: vi.fn() },
    organisation:       { findUnique: vi.fn() },
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

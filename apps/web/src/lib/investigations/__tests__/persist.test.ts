import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessContext, Finding, ReportResult, Evidence } from "@aiql/investigation-engine";

// Hoisted mock Prisma client. $transaction(callback) invokes the callback
// with this same mock object as `tx` — fine for a unit test, since we're not
// testing real transactional isolation, only that persistRun issues the
// right calls in the right order.
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    investigationRun: {
      findFirst:  vi.fn(),
      updateMany: vi.fn(),
      create:     vi.fn(),
    },
    investigationFinding: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockPrisma)),
  },
}));

vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));

import { persistRun } from "../persist";

function evidence(refs: string[]): Evidence {
  return { source: "gl_vs_gstr2b", description: "", query: "", rows: [], amountRs: null, confidence: 1, references: refs };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    code: "GST-ITC-002", category: "compliance", severity: "critical",
    title: "not filed", impactRs: 10000,
    businessQuestion: "q", evidence: [evidence(["Mehta Steel", "INV-001"])],
    recommendation: { action: "a", owner: "o", priority: "today", expectedBenefit: "b", deadline: null },
    verificationSteps: [], conclusion: "c", resolvesWhen: "r", status: "open",
    ...over,
  };
}

function report(findings: Finding[]): ReportResult {
  return {
    findings, executiveSummary: "summary", healthScore: 80,
    criticalCount: findings.length, warningCount: 0, opportunityCount: 0, infoCount: 0,
    totalImpactRs: findings.reduce((s, f) => s + (f.impactRs ?? 0), 0),
    outcomes: [], proactiveObservation: null,
    boardBrief: { headline: { period: "05-2026", healthScore: 80, totalAtRiskRs: 0, totalOpportunityRs: 0 }, risks: [], opportunities: [], cashAndWorkingCapital: [], recommendedDecisions: [], narratedSummary: "" },
  };
}

const CTX: BusinessContext = {
  organizationId: "org-1", connectionId: "conn-1",
  period: { month: 5, year: 2026, label: "05-2026", start: new Date("2026-05-01"), end: new Date("2026-05-31") },
  snapshotId: "CTX-1", resolvedAt: new Date(), profileId: "indian-sme-default",
  isStale: false, dataAsOf: new Date(), capabilities: new Set(),
  gl: null, itc: null, vendorCompliance: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.investigationRun.findFirst.mockResolvedValue(null); // no prior run by default
  mockPrisma.investigationRun.create.mockResolvedValue({ id: "run-new" });
});

describe("persistRun — historical continuity", () => {
  it("a client's first run: no prior, comparedToRunId null, every finding stamped 'new'", async () => {
    const f = finding();
    await persistRun(CTX, report([f]), "user", new Date());

    expect(mockPrisma.investigationFinding.updateMany).not.toHaveBeenCalled(); // nothing to resolve
    const createArg = mockPrisma.investigationRun.create.mock.calls[0][0];
    expect(createArg.data.comparedToRunId).toBeNull();
    expect(createArg.data.findings.create[0].changeStatus).toBe("new");
    expect(createArg.data.findings.create[0].firstSeenPeriod).toBe("05-2026");
    expect(createArg.data.findings.create[0].matchKey).toBeTruthy();
  });

  it("loads the prior run scoped to THIS client (connectionId), not the whole org", async () => {
    await persistRun(CTX, report([finding()]), "user", new Date());
    expect(mockPrisma.investigationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org-1", connectionId: "conn-1", status: "CURRENT" },
      }),
    );
  });

  it("a carried finding: matches a prior run's finding, keeps the original firstSeenPeriod", async () => {
    const f = finding();
    // Compute the SAME matchKey persistRun will derive internally, so the
    // "prior" row genuinely matches instead of relying on a hardcoded guess.
    const { computeMatchKey } = await import("@aiql/investigation-engine");
    const realKey = computeMatchKey(f)!;
    mockPrisma.investigationRun.findFirst.mockResolvedValue({
      id: "run-prior",
      findings: [{ matchKey: realKey, code: "GST-ITC-002", impactRs: 10000, firstSeenPeriod: "03-2026" }],
    });

    await persistRun(CTX, report([f]), "user", new Date());

    const createArg = mockPrisma.investigationRun.create.mock.calls[0][0];
    expect(createArg.data.comparedToRunId).toBe("run-prior");
    expect(createArg.data.findings.create[0].changeStatus).toBe("carried");
    expect(createArg.data.findings.create[0].firstSeenPeriod).toBe("03-2026");
  });

  it("resolves a prior finding that no longer appears: writes status='resolved' + resolvedAt onto the PRIOR run's row, never deletes", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue({
      id: "run-prior",
      findings: [{ matchKey: "GST-ITC-002:gone", code: "GST-ITC-002", impactRs: 15000, firstSeenPeriod: "03-2026" }],
    });

    await persistRun(CTX, report([]), "user", new Date()); // the issue is fixed — no findings this run

    expect(mockPrisma.investigationFinding.updateMany).toHaveBeenCalledWith({
      where: { runId: "run-prior", matchKey: { in: ["GST-ITC-002:gone"] } },
      data:  expect.objectContaining({ status: "resolved", resolvedAt: expect.any(Date) }),
    });
    // The current run itself has no findings to create.
    const createArg = mockPrisma.investigationRun.create.mock.calls[0][0];
    expect(createArg.data.findings.create).toEqual([]);
  });

  it("does not call updateMany on findings when nothing resolved (avoids a no-op DB write)", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue(null);
    await persistRun(CTX, report([finding()]), "user", new Date());
    expect(mockPrisma.investigationFinding.updateMany).not.toHaveBeenCalled();
  });

  it("still scopes the supersede update to (orgId, connectionId, period) only", async () => {
    await persistRun(CTX, report([finding()]), "user", new Date());
    expect(mockPrisma.investigationRun.updateMany).toHaveBeenCalledWith({
      where: { orgId: "org-1", connectionId: "conn-1", period: "05-2026", status: "CURRENT" },
      data:  { status: "SUPERSEDED" },
    });
  });

  it("persists the diff counts + resolvedRs onto the run itself (Phase 3.6 history API)", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValue({
      id: "run-prior",
      findings: [{ matchKey: "GST-ITC-002:gone", code: "GST-ITC-002", impactRs: 15000, firstSeenPeriod: "03-2026" }],
    });
    const f = finding(); // new (no matching matchKey in the prior findings above)

    await persistRun(CTX, report([f]), "user", new Date());

    const createArg = mockPrisma.investigationRun.create.mock.calls[0][0];
    expect(createArg.data.newCount).toBe(1);
    expect(createArg.data.carriedCount).toBe(0);
    expect(createArg.data.resolvedCount).toBe(1);
    expect(createArg.data.resolvedRs).toBe(15000);
  });

  it("legacy path (connectionId null) diffs against the org's own null-connection history, not another client's", async () => {
    const legacyCtx: BusinessContext = { ...CTX, connectionId: null };
    await persistRun(legacyCtx, report([finding()]), "user", new Date());
    expect(mockPrisma.investigationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org-1", connectionId: null, status: "CURRENT" } }),
    );
  });
});

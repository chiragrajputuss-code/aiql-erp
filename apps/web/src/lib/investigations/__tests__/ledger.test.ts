import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    investigationFinding: { aggregate: vi.fn() },
    investigationRun:     { findFirst: vi.fn() },
  },
}));

vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));

import { computeLedger } from "../ledger";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.investigationFinding.aggregate.mockResolvedValue({ _sum: { impactRs: 0 } });
  mockPrisma.investigationRun.findFirst.mockResolvedValue(null);
});

describe("computeLedger", () => {
  it("foundTotalRs is openTotalRs + resolvedTotalRs, never a raw sum across periods", async () => {
    mockPrisma.investigationFinding.aggregate.mockResolvedValue({ _sum: { impactRs: 15000 } });
    mockPrisma.investigationRun.findFirst
      .mockResolvedValueOnce({ totalImpactRs: 8000 })          // latest CURRENT run
      .mockResolvedValueOnce({ startedAt: new Date("2026-03-01") }); // first run

    const ledger = await computeLedger("org-1", { connectionId: "conn-1" });

    expect(ledger.resolvedTotalRs).toBe(15000);
    expect(ledger.openTotalRs).toBe(8000);
    expect(ledger.foundTotalRs).toBe(23000);
    expect(ledger.firstRunAt).toEqual(new Date("2026-03-01"));
  });

  it("scopes every query to the given connectionId, including null (legacy scope)", async () => {
    await computeLedger("org-1", { connectionId: null });
    expect(mockPrisma.investigationFinding.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ run: { orgId: "org-1", connectionId: null } }) }),
    );
  });

  it("omits the connectionId filter entirely for a firm-wide aggregate", async () => {
    await computeLedger("org-1");
    const arg = mockPrisma.investigationFinding.aggregate.mock.calls[0][0];
    expect(arg.where.run).toEqual({ orgId: "org-1" });
  });

  it("filters resolvedTotalRs by sinceDate when given (trailing window)", async () => {
    const since = new Date("2026-01-01");
    await computeLedger("org-1", { connectionId: "conn-1", sinceDate: since });
    expect(mockPrisma.investigationFinding.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ resolvedAt: { gte: since } }) }),
    );
  });

  it("openTotalRs is 0 (not undefined) when there is no CURRENT run", async () => {
    mockPrisma.investigationRun.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const ledger = await computeLedger("org-1", { connectionId: "conn-1" });
    expect(ledger.openTotalRs).toBe(0);
    expect(ledger.foundTotalRs).toBe(0);
    expect(ledger.firstRunAt).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    orgBusinessKnowledge: { findMany: vi.fn() },
  },
}));

vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));

import { buildKnowledgeContext } from "@/lib/knowledge-context";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildKnowledgeContext", () => {
  it("returns empty when prompt yields no keywords", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    const r = await buildKnowledgeContext("org1", "the and of");  // all stopwords
    expect(r.systemAddendum).toBe("");
    expect(r.items).toEqual([]);
  });

  it("returns empty when org has no knowledge rows", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    const r = await buildKnowledgeContext("org1", "March salary bonus payout");
    expect(r.systemAddendum).toBe("");
    expect(r.items).toEqual([]);
  });

  it("returns relevant rows when keywords overlap", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      {
        id: "k1",
        context:    "March salary bonus payout",
        answer:     "Annual bonus paid every March — normal",
        annotation: null,
        verdict:    "NORMAL",
        confidence: 1.0,
        reaffirmationCount: 3,
        lastReaffirmedAt: new Date(),
        source:     "FLUX_VARIANCE",
      },
    ]);
    const r = await buildKnowledgeContext("org1", "Why did salary expense jump in March?");
    expect(r.items).toHaveLength(1);
    expect(r.systemAddendum).toContain("previously confirmed");
    expect(r.systemAddendum).toContain("March");
  });

  it("excludes REJECTED verdicts at the SQL level", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    await buildKnowledgeContext("org1", "salary bonus March");
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.verdict).toEqual({ not: "REJECTED" });
  });

  it("respects minConfidence filter", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    await buildKnowledgeContext("org1", "salary bonus March", { minConfidence: 0.7 });
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.confidence).toEqual({ gte: 0.7 });
  });

  it("ranks by confidence × reaffirmation count", async () => {
    const old   = new Date();
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      // Two rows, both match. The well-established one should rank higher.
      {
        id: "low",
        context:    "salary bonus",
        answer:     "x",
        annotation: null,
        verdict:    "NORMAL",
        confidence: 0.6,
        reaffirmationCount: 1,
        lastReaffirmedAt: old,
        source:     "MANUAL",
      },
      {
        id: "high",
        context:    "salary bonus",
        answer:     "x",
        annotation: null,
        verdict:    "NORMAL",
        confidence: 1.0,
        reaffirmationCount: 5,
        lastReaffirmedAt: old,
        source:     "MANUAL",
      },
    ]);
    const r = await buildKnowledgeContext("org1", "Why salary bonus jumped");
    expect(r.items[0]?.id).toBe("high");
    expect(r.items[1]?.id).toBe("low");
  });

  it("limits to topN rows", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      id: `k${i}`,
      context:    "salary bonus payment",
      answer:     "x",
      annotation: null,
      verdict:    "NORMAL",
      confidence: 1.0,
      reaffirmationCount: 1,
      lastReaffirmedAt: new Date(),
      source:     "MANUAL",
    }));
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue(rows);

    const r = await buildKnowledgeContext("org1", "Why salary bonus", { topN: 3 });
    expect(r.items).toHaveLength(3);
  });

  it("includes verdict tag in formatted addendum", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      {
        id: "k1",
        context:    "salary bonus March",
        answer:     "Annual",
        annotation: null,
        verdict:    "NORMAL",
        confidence: 1.0,
        reaffirmationCount: 3,
        lastReaffirmedAt: new Date(),
        source:     "FLUX_VARIANCE",
      },
    ]);
    const r = await buildKnowledgeContext("org1", "salary bonus March");
    expect(r.systemAddendum).toContain("NORMAL");
    expect(r.systemAddendum).toContain("3×");
  });

  it("includes annotation when present", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      {
        id: "k1",
        context:    "salary bonus",
        answer:     "Annual",
        annotation: "Paid every March via direct deposit",
        verdict:    "ANNOTATED",
        confidence: 1.0,
        reaffirmationCount: 1,
        lastReaffirmedAt: new Date(),
        source:     "FLUX_VARIANCE",
      },
    ]);
    const r = await buildKnowledgeContext("org1", "salary bonus");
    expect(r.systemAddendum).toContain("Paid every March via direct deposit");
  });

  it("filters out rows with zero keyword overlap", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      {
        id: "irrelevant",
        context:    "Inventory write-off pattern",
        answer:     "Annual cleanup",
        annotation: null,
        verdict:    "NORMAL",
        confidence: 1.0,
        reaffirmationCount: 2,
        lastReaffirmedAt: new Date(),
        source:     "MANUAL",
      },
    ]);
    const r = await buildKnowledgeContext("org1", "What did salary look like?");
    expect(r.items).toHaveLength(0);
  });

  it("scopes by connectionId when provided", async () => {
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
    await buildKnowledgeContext("org1", "salary", { connectionId: "c1" });
    const arg = mockPrisma.orgBusinessKnowledge.findMany.mock.calls[0][0];
    expect(arg.where.connectionId).toBe("c1");
  });
});

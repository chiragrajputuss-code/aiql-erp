import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks (vi.mock factories run before module code)
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection: { findMany: vi.fn() },
    vendorComplianceRecord: { count: vi.fn().mockResolvedValue(0) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));
vi.mock("@aiql/doc-parsers", () => ({ parseGstr2B: (rows: unknown[]) => rows }));
vi.mock("@aiql/investigation-engine", async () => {
  const actual = await vi.importActual<typeof import("@aiql/investigation-engine")>("@aiql/investigation-engine");
  return { ...actual, getDefaultProfile: () => ({ id: "indian-sme-default" }) };
});

import { buildBusinessContext, AmbiguousItcSourceError } from "../context-resolver";

const ORG = "org-1";

// A minimal ErpConnection row shaped the way gatherDataSources reads it —
// one uploadedFile, no workspaceDocuments (the common case).
function conn(opts: {
  id: string;
  documentType: "GL" | "GSTR_2B";
  tableName?: string;
  periodStart: string;
  periodEnd: string;
  createdAt?: string;
}) {
  return {
    id: opts.id,
    uploadedFile: {
      documentType: opts.documentType,
      tableName:    opts.tableName ?? `upload_${opts.id}`,
      periodStart:  new Date(opts.periodStart),
      periodEnd:    new Date(opts.periodEnd),
      createdAt:    new Date(opts.createdAt ?? opts.periodStart),
    },
    workspaceDocuments: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.vendorComplianceRecord.count.mockResolvedValue(0);
  mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
});

describe("buildBusinessContext — legacy path (no connectionId given)", () => {
  it("picks the org's latest GL and sets connectionId on the returned context", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-1", documentType: "GL", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
    ]);
    const ctx = await buildBusinessContext({ orgId: ORG });
    expect(ctx.connectionId).toBe("gl-1");
    expect(ctx.period.label).toBe("05-2026");
  });

  it("falls back to the most recent GSTR-2B of any period when none covers the requested month (single-business behaviour preserved)", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-1",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-1", documentType: "GSTR_2B", periodStart: "2026-03-01", periodEnd: "2026-03-31" }),
    ]);
    const ctx = await buildBusinessContext({ orgId: ORG, year: 2026, month: 5 });
    expect(ctx.itc).not.toBeNull();
  });

  it("has no GL at all -> connectionId is null, no GL capability", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([]);
    const ctx = await buildBusinessContext({ orgId: ORG });
    expect(ctx.connectionId).toBeNull();
    expect(ctx.gl).toBeNull();
  });
});

describe("buildBusinessContext — explicit connectionId (practice mode)", () => {
  it("investigates the requested client's GL, not just the org's latest", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A", documentType: "GL", periodStart: "2026-05-01", periodEnd: "2026-05-31", createdAt: "2026-05-01" }),
      conn({ id: "gl-B", documentType: "GL", periodStart: "2026-05-01", periodEnd: "2026-05-31", createdAt: "2026-06-01" }), // uploaded later
    ]);
    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A" });
    expect(ctx.connectionId).toBe("gl-A");
  });

  it("throws if the requested connection has no GL upload", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([]);
    await expect(buildBusinessContext({ orgId: ORG, connectionId: "does-not-exist" }))
      .rejects.toThrow(/No GL upload found/);
  });

  it("matches an unambiguous single GSTR-2B for the client's period", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-A", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
    ]);
    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A" });
    expect(ctx.itc).not.toBeNull();
    expect(ctx.itc!.getConnectionId()).toBe("itc-A");
  });

  it("CORRECTNESS: throws rather than silently pairing client A's GL with client B's GSTR-2B", async () => {
    // Two different clients (gl-A, gl-B) each have a GSTR-2B covering the
    // same month. Investigating gl-A must not silently pick either one.
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "gl-B",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-A", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-B", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
    ]);
    await expect(buildBusinessContext({ orgId: ORG, connectionId: "gl-A" }))
      .rejects.toThrow(AmbiguousItcSourceError);
  });

  it("no period-covering GSTR-2B for the client -> no ITC capability, never reaches for another client's stale data", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      // Some OTHER client's old GSTR-2B, unrelated period-wise reach risk.
      conn({ id: "itc-X", documentType: "GSTR_2B", periodStart: "2026-01-01", periodEnd: "2026-01-31", createdAt: "2026-06-01" }),
    ]);
    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A", year: 2026, month: 5 });
    expect(ctx.itc).toBeNull(); // NOT itc-X
  });
});

describe("buildBusinessContext — itc.getTrailingRows (Phase 3.4)", () => {
  // parseGstr2B is mocked as identity, so we can tag rows by their source
  // table to prove which months actually got pulled in.
  function mockRowsPerTable(map: Record<string, unknown[]>) {
    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      const m = /FROM "([^"]+)"/.exec(sql);
      const table = m?.[1] ?? "";
      return Promise.resolve(map[table] ?? []);
    });
  }

  it("pulls prior months' rows, oldest first, excluding the current period", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-05", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31", tableName: "t05" }),
      conn({ id: "itc-04", documentType: "GSTR_2B", periodStart: "2026-04-01", periodEnd: "2026-04-30", tableName: "t04" }),
      conn({ id: "itc-03", documentType: "GSTR_2B", periodStart: "2026-03-01", periodEnd: "2026-03-31", tableName: "t03" }),
    ]);
    mockRowsPerTable({
      t05: [{ tag: "may" }],   // current period — must NOT appear in trailing
      t04: [{ tag: "apr" }],
      t03: [{ tag: "mar" }],
    });

    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A", year: 2026, month: 5 });
    const trailing = await ctx.itc!.getTrailingRows(6);

    expect(trailing).toEqual([{ tag: "mar" }, { tag: "apr" }]); // oldest first, no "may"
  });

  it("skips a month with no GSTR-2B uploaded, rather than erroring", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-05", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31", tableName: "t05" }),
      // April missing entirely.
      conn({ id: "itc-03", documentType: "GSTR_2B", periodStart: "2026-03-01", periodEnd: "2026-03-31", tableName: "t03" }),
    ]);
    mockRowsPerTable({ t05: [{ tag: "may" }], t03: [{ tag: "mar" }] });

    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A", year: 2026, month: 5 });
    const trailing = await ctx.itc!.getTrailingRows(6);
    expect(trailing).toEqual([{ tag: "mar" }]);
  });

  it("CORRECTNESS: skips an ambiguous month (two clients' filings) rather than guessing", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",   documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-05", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31", tableName: "t05" }),
      // Two DIFFERENT clients' April filings — ambiguous, must be skipped.
      conn({ id: "itc-04a", documentType: "GSTR_2B", periodStart: "2026-04-01", periodEnd: "2026-04-30", tableName: "t04a" }),
      conn({ id: "itc-04b", documentType: "GSTR_2B", periodStart: "2026-04-01", periodEnd: "2026-04-30", tableName: "t04b" }),
      conn({ id: "itc-03",  documentType: "GSTR_2B", periodStart: "2026-03-01", periodEnd: "2026-03-31", tableName: "t03" }),
    ]);
    mockRowsPerTable({
      t05: [{ tag: "may" }], t04a: [{ tag: "apr-A" }], t04b: [{ tag: "apr-B" }], t03: [{ tag: "mar" }],
    });

    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A", year: 2026, month: 5 });
    const trailing = await ctx.itc!.getTrailingRows(6);
    // April excluded entirely — neither apr-A nor apr-B guessed.
    expect(trailing).toEqual([{ tag: "mar" }]);
  });

  it("returns an empty array (never throws) when nothing is available", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-05", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
    ]);
    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A", year: 2026, month: 5 });
    await expect(ctx.itc!.getTrailingRows(6)).resolves.toEqual([]);
  });

  it("memoizes: a second call for the same `periods` does not re-query", async () => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      conn({ id: "gl-A",  documentType: "GL",      periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-05", documentType: "GSTR_2B", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      conn({ id: "itc-04", documentType: "GSTR_2B", periodStart: "2026-04-01", periodEnd: "2026-04-30", tableName: "t04" }),
    ]);
    mockRowsPerTable({ t04: [{ tag: "apr" }] });

    const ctx = await buildBusinessContext({ orgId: ORG, connectionId: "gl-A", year: 2026, month: 5 });
    const callsBefore = mockPrisma.$queryRawUnsafe.mock.calls.length;
    await ctx.itc!.getTrailingRows(6);
    const callsAfterFirst = mockPrisma.$queryRawUnsafe.mock.calls.length;
    await ctx.itc!.getTrailingRows(6);
    const callsAfterSecond = mockPrisma.$queryRawUnsafe.mock.calls.length;

    expect(callsAfterFirst).toBeGreaterThan(callsBefore);
    expect(callsAfterSecond).toBe(callsAfterFirst); // no new queries on the repeat call
  });
});

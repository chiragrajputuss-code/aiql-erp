import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies BEFORE importing the route handlers ──────────────────
// Hoisted because vi.mock factories run before module-scope code.

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection:        { findFirst: vi.fn(), findMany: vi.fn() },
    closePeriod:          { findMany: vi.fn(), findUnique: vi.fn() },
    closeTask:            { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    orgClosePreferences:  { findUnique: vi.fn(), upsert: vi.fn() },
    orgAccountMapping:    { findMany: vi.fn() },
    orgBusinessKnowledge: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(),
}));

vi.mock("@aiql/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@aiql/close-engine", () => ({
  generateAdaptiveTemplate: vi.fn(),
  parseUserIntent:          vi.fn(),
  createClosePeriodFromTemplate: vi.fn(),
  MONTHLY_CLOSE_TEMPLATE:   {
    id: "monthly", name: "Monthly Close", periodType: "MONTHLY", tasks: [],
  },
  runDataQualityScan:       vi.fn(),
  updateTaskStatus:         vi.fn(),
  prepareCloseContext:      vi.fn(async () => ({
    accounts:   { bank: [], payable: [], receivable: [], tax: [], inventory: [] },
    scanResult: { issues: [] },
  })),
  patternKeyForScanIssue: (args: { issueCode: string }) => ({
    patternKey: `scan:${args.issueCode}`,
    source:     "SCAN_ISSUE",
    sourceRef:  { issueCode: args.issueCode },
  }),
}));

// Import after mocks are registered
import { validateRequest } from "@/lib/auth";
import {
  generateAdaptiveTemplate, parseUserIntent, createClosePeriodFromTemplate,
  runDataQualityScan, updateTaskStatus,
} from "@aiql/close-engine";
import { POST as periodsPOST }       from "@/app/api/v1/close/periods/route";
import { POST as previewPOST }       from "@/app/api/v1/close/periods/preview/route";
import { GET as preferencesGET }     from "@/app/api/v1/close/preferences/route";
import { GET as dataContextHintsGET } from "@/app/api/v1/close/data-context-hints/route";
import { PATCH as taskPATCH }        from "@/app/api/v1/close/tasks/[taskId]/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const generateMock        = generateAdaptiveTemplate as ReturnType<typeof vi.fn>;
const parseIntentMock     = parseUserIntent as ReturnType<typeof vi.fn>;
const createPeriodMock    = createClosePeriodFromTemplate as ReturnType<typeof vi.fn>;
const runScanMock         = runDataQualityScan as ReturnType<typeof vi.fn>;
const updateTaskMock      = updateTaskStatus as ReturnType<typeof vi.fn>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function jsonRequest(url: string, body: unknown, method = "POST") {
  return {
    url,
    method,
    json: async () => body,
  } as Parameters<typeof previewPOST>[0];
}

function getRequest(url: string) {
  return { url, method: "GET" } as Parameters<typeof dataContextHintsGET>[0];
}

const AUTH_USER = { id: "u1", orgId: "org1", email: "x@y.com" };

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({ user: AUTH_USER });
  // Default — preview's mapping precondition assumes either no mappings
  // or all confirmed. Tests that exercise the unconfirmed path override.
  mockPrisma.orgAccountMapping.findMany.mockResolvedValue([]);
});

// ── /api/v1/close/preferences GET ───────────────────────────────────────────

describe("GET /api/v1/close/preferences", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await preferencesGET();
    expect(res.status).toBe(401);
  });

  it("returns hasPrevious=false when no prefs exist", async () => {
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue(null);
    const res = await preferencesGET();
    const body = await res.json();
    expect(body.hasPrevious).toBe(false);
    expect(body.lastProfile).toBeNull();
    expect(body.lastCustomWatchItems).toEqual([]);
  });

  it("returns parsed prefs when they exist", async () => {
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue({
      orgId:                 "org1",
      lastProfile:           "ADAPTIVE",
      lastIntent:            "skip flux",
      lastIntentSummaryJson: JSON.stringify({ focusAreas: ["bank"], confidence: 0.9 }),
      lastCustomWatchItems:  ["salary advance"],
      lastClosedAt:          new Date("2026-04-30"),
      usageCountJson:        '{"ADAPTIVE":3}',
      recurringPatternsJson: '[{"pattern":"salary advance","count":3}]',
    });
    const res = await preferencesGET();
    const body = await res.json();
    expect(body.hasPrevious).toBe(true);
    expect(body.lastProfile).toBe("ADAPTIVE");
    expect(body.lastIntent).toBe("skip flux");
    expect(body.lastIntentSummary).toEqual({ focusAreas: ["bank"], confidence: 0.9 });
    expect(body.usageCount).toEqual({ ADAPTIVE: 3 });
  });

  it("recovers from malformed JSON in stored fields", async () => {
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue({
      orgId: "org1",
      lastProfile: null,
      lastIntent: null,
      lastIntentSummaryJson: "not json",
      lastCustomWatchItems: [],
      lastClosedAt: null,
      usageCountJson: "{",
      recurringPatternsJson: "[",
    });
    const res = await preferencesGET();
    const body = await res.json();
    expect(body.lastIntentSummary).toBeNull();
    expect(body.usageCount).toEqual({});
    expect(body.recurringPatterns).toEqual([]);
  });
});

// ── /api/v1/close/data-context-hints GET ────────────────────────────────────

describe("GET /api/v1/close/data-context-hints", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await dataContextHintsGET(getRequest("http://localhost/api/v1/close/data-context-hints?connectionId=c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not found", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue(null);
    const res = await dataContextHintsGET(getRequest("http://localhost/api/v1/close/data-context-hints?connectionId=c1"));
    expect(res.status).toBe(404);
  });

  it("computes account counts from accountTypeMap", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([
      { accountType: "BANK" },
      { accountType: "BANK" },
      { accountType: "RECEIVABLE" },
      { accountType: "PAYABLE" },
      { accountType: "TAX" },
      { accountType: "INVENTORY" },
      { accountType: "REVENUE" },  // → other
    ]);
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue(null);
    const res = await dataContextHintsGET(getRequest("http://localhost/api/v1/close/data-context-hints?connectionId=c1"));
    const body = await res.json();
    expect(body.accountCounts).toEqual({ bank: 2, ar: 1, ap: 1, tax: 1, inventory: 1, other: 1 });
  });

  it("flags year-end when end date is March 31", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([]);
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue(null);
    runScanMock.mockResolvedValue({ issues: [] });
    const url = "http://localhost/api/v1/close/data-context-hints"
      + "?connectionId=c1&startDate=2025-04-01T00:00:00.000Z&endDate=2026-03-31T23:59:59.000Z";
    const res = await dataContextHintsGET(getRequest(url));
    const body = await res.json();
    expect(body.yearEndLikely).toBe(true);
    expect(body.suggestions.some((s: { kind: string }) => s.kind === "profile")).toBe(true);
  });

  it("does not flag year-end for mid-year close", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([]);
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue(null);
    runScanMock.mockResolvedValue({ issues: [] });
    const url = "http://localhost/api/v1/close/data-context-hints"
      + "?connectionId=c1&startDate=2026-08-01T00:00:00.000Z&endDate=2026-08-31T23:59:59.000Z";
    const res = await dataContextHintsGET(getRequest(url));
    const body = await res.json();
    expect(body.yearEndLikely).toBe(false);
  });

  it("surfaces high-confidence recurring patterns prominently", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([]);
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue({
      lastCustomWatchItems: ["salary advance"],
      recurringPatternsJson: JSON.stringify([
        { pattern: "salary advance", count: 3 },
        { pattern: "depreciation",   count: 2 },
        { pattern: "ad-hoc item",    count: 1 },  // below threshold
      ]),
    });
    const res = await dataContextHintsGET(getRequest("http://localhost/api/v1/close/data-context-hints?connectionId=c1"));
    const body = await res.json();
    // "ad-hoc item" must be filtered out (count < 2)
    expect(body.recurringWatchItems).toEqual(["salary advance", "depreciation"]);
    // The first suggestion mentions count
    const patternSuggestion = body.suggestions.find((s: { kind: string }) => s.kind === "pattern");
    expect(patternSuggestion).toBeDefined();
    expect(patternSuggestion.label).toContain("3 previous closes");
  });
});

// ── /api/v1/close/periods/preview POST ──────────────────────────────────────

describe("POST /api/v1/close/periods/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {}));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      profile: "INVALID",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when connection not found", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue(null);
    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "missing",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "STANDARD",
    }));
    expect(res.status).toBe(404);
  });

  it("returns 412 when account mappings exist but are not all confirmed", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([
      { isConfirmed: true },
      { isConfirmed: false },
    ]);
    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "c1",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "STANDARD",
    }));
    expect(res.status).toBe(412);
    const body = await res.json();
    expect(body.code).toBe("MAPPINGS_UNCONFIRMED");
  });

  it("proceeds when no mappings exist yet (greenfield connection)", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([]);
    generateMock.mockResolvedValue({
      template: { name: "Std", periodType: "MONTHLY", tasks: [] },
      scanResult: { issues: [] },
      reasoning: [],
    });
    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "c1",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "STANDARD",
    }));
    expect(res.status).toBe(200);
  });

  it("does not call parseUserIntent for STANDARD profile", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    mockPrisma.orgAccountMapping.findMany.mockResolvedValue([]);
    generateMock.mockResolvedValue({
      template: { name: "Std", periodType: "MONTHLY", tasks: [] },
      scanResult: { issues: [] },
      reasoning: ["Profile: STANDARD"],
    });
    await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "c1",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "STANDARD",
      userIntent:   "skip flux",   // ignored when profile=STANDARD
    }));
    expect(parseIntentMock).not.toHaveBeenCalled();
  });

  it("calls parseUserIntent for ADAPTIVE profile with non-empty userIntent", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    parseIntentMock.mockResolvedValue({
      focusAreas: ["bank"], watchAccounts: [], exclusions: [], riskFlags: [],
      oneOffEvents: [], ambiguities: [], confidence: 0.9, rationale: "ok", source: "llm",
    });
    generateMock.mockResolvedValue({
      template: { name: "Adaptive", periodType: "MONTHLY", tasks: [] },
      scanResult: { issues: [] },
      reasoning: [],
    });
    await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "c1",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "ADAPTIVE",
      userIntent:   "focus on bank",
    }));
    expect(parseIntentMock).toHaveBeenCalledWith("focus on bank");
  });

  it("computes diff against STANDARD baseline for non-STANDARD profile", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    generateMock
      // First call = chosen profile (QUICK)
      .mockResolvedValueOnce({
        template: {
          name: "Quick", periodType: "MONTHLY",
          tasks: [
            { key: "opening-balance", title: "Opening", category: "REVIEW", autoComplete: false, dependsOnKeys: [], sortOrder: 1, description: "" },
            { key: "bank-recon",      title: "Bank",    category: "RECONCILIATION", autoComplete: true, dependsOnKeys: ["opening-balance"], sortOrder: 2, description: "" },
            { key: "cfo-signoff",     title: "Sign",    category: "APPROVAL", autoComplete: false, dependsOnKeys: ["bank-recon"], sortOrder: 3, description: "" },
          ],
        },
        scanResult: { issues: [] },
        reasoning: [],
      })
      // Second call = STANDARD baseline
      .mockResolvedValueOnce({
        template: {
          name: "Standard", periodType: "MONTHLY",
          tasks: [
            { key: "opening-balance", title: "Opening", category: "REVIEW", autoComplete: false, dependsOnKeys: [], sortOrder: 1, description: "" },
            { key: "bank-recon",      title: "Bank",    category: "RECONCILIATION", autoComplete: true, dependsOnKeys: ["opening-balance"], sortOrder: 2, description: "" },
            { key: "ap-recon",        title: "AP",      category: "RECONCILIATION", autoComplete: true, dependsOnKeys: ["opening-balance"], sortOrder: 3, description: "" },
            { key: "ar-recon",        title: "AR",      category: "RECONCILIATION", autoComplete: true, dependsOnKeys: ["opening-balance"], sortOrder: 4, description: "" },
            { key: "pl-review",       title: "P&L",     category: "REVIEW", autoComplete: false, dependsOnKeys: [], sortOrder: 5, description: "" },
            { key: "bs-review",       title: "BS",      category: "REVIEW", autoComplete: false, dependsOnKeys: [], sortOrder: 6, description: "" },
            { key: "flux-analysis",   title: "Flux",    category: "FLUX_ANALYSIS", autoComplete: false, dependsOnKeys: [], sortOrder: 7, description: "" },
            { key: "cfo-signoff",     title: "Sign",    category: "APPROVAL", autoComplete: false, dependsOnKeys: [], sortOrder: 8, description: "" },
          ],
        },
        scanResult: { issues: [] },
        reasoning: [],
      });

    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "c1",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "QUICK",
    }));
    const body = await res.json();

    expect(body.diff).not.toBeNull();
    expect(body.diff.removedCount).toBe(5); // ap, ar, pl, bs, flux
    expect(body.diff.addedCount).toBe(0);
    expect(body.diff.removed.map((t: { key: string }) => t.key).sort())
      .toEqual(["ap-recon", "ar-recon", "bs-review", "flux-analysis", "pl-review"]);
  });

  it("returns null diff when chosen profile is STANDARD", async () => {
    mockPrisma.erpConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "org1" });
    generateMock.mockResolvedValueOnce({
      template: { name: "Standard", periodType: "MONTHLY", tasks: [] },
      scanResult: { issues: [] },
      reasoning: [],
    });
    const res = await previewPOST(jsonRequest("http://localhost/api/v1/close/periods/preview", {
      connectionId: "c1",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "STANDARD",
    }));
    const body = await res.json();
    expect(body.diff).toBeNull();
    // Only one generateAdaptiveTemplate call when STANDARD (no baseline needed)
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});

// ── /api/v1/close/periods POST (create) ─────────────────────────────────────

describe("POST /api/v1/close/periods", () => {
  beforeEach(() => {
    mockPrisma.erpConnection.findMany.mockResolvedValue([
      { id: "c1", orgId: "org1", uploadedFile: { tableName: "gl_c1" } },
    ]);
    generateMock.mockResolvedValue({
      template: { id: "t1", name: "Adaptive", periodType: "MONTHLY", tasks: [] },
      scanResult: { issues: [] },
      reasoning: ["Profile: ADAPTIVE"],
    });
    createPeriodMock.mockResolvedValue({ id: "p1", name: "Test", tasks: [] });
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue(null);
    mockPrisma.orgClosePreferences.upsert.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {}));
    expect(res.status).toBe(401);
  });

  it("returns 400 when neither connectionIds nor connectionId provided", async () => {
    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      name: "x",
      startDate: "2026-04-01T00:00:00.000Z",
      endDate:   "2026-04-30T23:59:59.000Z",
    }));
    expect(res.status).toBe(400);
  });

  it("persists profile metadata on create", async () => {
    parseIntentMock.mockResolvedValue({
      focusAreas: ["bank"], watchAccounts: ["salary advance"], exclusions: [],
      riskFlags: [], oneOffEvents: [], ambiguities: [], confidence: 0.9,
      rationale: "x", source: "llm",
    });
    await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1",
      name:         "April Close",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "ADAPTIVE",
      userIntent:   "watch salary advance",
    }));

    expect(createPeriodMock).toHaveBeenCalled();
    const meta = createPeriodMock.mock.calls[0]![10];   // 11th arg = meta object
    expect(meta).toBeDefined();
    expect(meta.closeProfile).toBe("ADAPTIVE");
    expect(meta.userIntent).toBe("watch salary advance");
    expect(meta.customWatchItems).toEqual(["salary advance"]);
    expect(JSON.parse(meta.intentSummaryJson).focusAreas).toEqual(["bank"]);
  });

  it("does NOT bump usage count on period creation (bumps on completion only)", async () => {
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue({
      usageCountJson:        '{"STANDARD":2}',
      recurringPatternsJson: "[]",
    });
    parseIntentMock.mockResolvedValue({
      focusAreas: [], watchAccounts: [], exclusions: [], riskFlags: [],
      oneOffEvents: [], ambiguities: [], confidence: 0.5, rationale: "x", source: "llm",
    });
    await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1",
      name:         "April Close",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "ADAPTIVE",
      userIntent:   "do something",
    }));

    expect(mockPrisma.orgClosePreferences.upsert).toHaveBeenCalled();
    const upsertArg = mockPrisma.orgClosePreferences.upsert.mock.calls[0][0];
    // usageCountJson is NOT in the upsert payload — bump happens on completion.
    expect(upsertArg.update.usageCountJson).toBeUndefined();
    expect(upsertArg.create.usageCountJson).toBeUndefined();
    // Other intent fields ARE captured on creation.
    expect(upsertArg.update.lastProfile).toBe("ADAPTIVE");
    expect(upsertArg.update.lastIntent).toBe("do something");
  });

  it("uses pre-parsed intentSummary if provided (no re-parse)", async () => {
    const preParsed = {
      focusAreas: ["gst"], watchAccounts: [], exclusions: [], riskFlags: [],
      oneOffEvents: [], ambiguities: [], confidence: 0.95, rationale: "preset", source: "llm",
    };
    await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId:  "c1",
      name:          "April Close",
      startDate:     "2026-04-01T00:00:00.000Z",
      endDate:       "2026-04-30T23:59:59.000Z",
      profile:       "ADAPTIVE",
      userIntent:    "review gst",
      intentSummary: preParsed,
    }));

    expect(parseIntentMock).not.toHaveBeenCalled();
    const meta = createPeriodMock.mock.calls[0]![10];
    expect(JSON.parse(meta.intentSummaryJson).rationale).toBe("preset");
  });

  it("does not call parseUserIntent for non-ADAPTIVE profile even with userIntent", async () => {
    await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1",
      name:         "April Close",
      startDate:    "2026-04-01T00:00:00.000Z",
      endDate:      "2026-04-30T23:59:59.000Z",
      profile:      "QUICK",
      userIntent:   "this should be ignored",
    }));
    expect(parseIntentMock).not.toHaveBeenCalled();
  });

  // Helper: build a generateMock value with scan issues so the route can pass
  // them into applyKnowledgeBase for scale-matching.
  function generateMockWithIssues(issues: Array<{ code: string; affectedRows: number; exposure: number | null }>) {
    return {
      template: { id: "t1", name: "Adaptive", periodType: "MONTHLY", tasks: [] },
      scanResult: { issues },
      reasoning: ["Profile: STANDARD"],
    };
  }

  it("auto-resolves anomaly tasks when knowledge base says NORMAL+ALWAYS (no stored scale → legacy path)", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([
      { code: "voucher_imbalance", affectedRows: 3, exposure: 500 },
    ]));
    createPeriodMock.mockResolvedValue({
      id: "p1", name: "Test",
      tasks: [
        { id: "t1", title: "Resolve 3 vouchers where Dr ≠ Cr", category: "CUSTOM", status: "PENDING" },
        { id: "t2", title: "Verify Opening Balances",            category: "REVIEW", status: "PENDING" },
      ],
    });
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", verdict: "NORMAL", autoApply: "ALWAYS", answer: "Known issue, ignore",
      annotation: null, sourceRefJson: null,  // legacy: no scale stored
    });
    mockPrisma.closeTask.update.mockResolvedValue({});

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "April Close",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();

    expect(body.autoResolved).toHaveLength(1);
    expect(body.autoResolved[0].patternKey).toBe("scan:voucher_imbalance");
    expect(body.knowledgeHinted).toEqual([]);
    expect(mockPrisma.closeTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "t1" },
      data:  expect.objectContaining({ status: "COMPLETED" }),
    }));
  });

  it("auto-resolves silently when current scale is similar to stored (≤ 2× rows + ≤ 2× exposure)", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([
      { code: "voucher_imbalance", affectedRows: 4, exposure: 800 },
    ]));
    createPeriodMock.mockResolvedValue({
      id: "p1",
      tasks: [
        { id: "t1", title: "Resolve 4 vouchers where Dr ≠ Cr", category: "CUSTOM", status: "PENDING" },
      ],
    });
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", verdict: "NORMAL", autoApply: "ALWAYS", answer: "Typos by junior",
      annotation: null,
      sourceRefJson: JSON.stringify({ issueCode: "voucher_imbalance", affectedRows: 3, exposure: 500 }),
    });
    mockPrisma.closeTask.update.mockResolvedValue({});

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "x",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();
    expect(body.autoResolved).toHaveLength(1);
    expect(body.knowledgeHinted).toEqual([]);
  });

  it("DOES NOT auto-resolve when current scale is materially larger — leaves task PENDING with hint", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([
      // 30 rows now vs 3 stored = 10× scale jump → hint, not silent
      { code: "voucher_imbalance", affectedRows: 30, exposure: 5_00_000 },
    ]));
    createPeriodMock.mockResolvedValue({
      id: "p1",
      tasks: [
        { id: "t1", title: "Resolve 30 vouchers where Dr ≠ Cr", category: "CUSTOM", status: "PENDING" },
      ],
    });
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", verdict: "NORMAL", autoApply: "ALWAYS", answer: "Typos, ignore",
      annotation: null,
      sourceRefJson: JSON.stringify({ issueCode: "voucher_imbalance", affectedRows: 3, exposure: 500 }),
    });
    mockPrisma.closeTask.update.mockResolvedValue({});

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "x",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();

    // No silent auto-resolve
    expect(body.autoResolved).toEqual([]);
    // But surfaced as hint with the scale-mismatch reason
    expect(body.knowledgeHinted).toHaveLength(1);
    expect(body.knowledgeHinted[0].reason).toContain("30");
    expect(body.knowledgeHinted[0].reason).toContain("3");

    // Task notes should contain the warning + prior answer (not status=COMPLETED)
    const updateCall = mockPrisma.closeTask.update.mock.calls[0][0];
    expect(updateCall.data.status).toBeUndefined();  // status NOT touched
    expect(updateCall.data.notes).toContain("Knowledge match found");
    expect(updateCall.data.notes).toContain("Typos, ignore");
  });

  it("auto-resolves when current scale is SMALLER than stored (fewer issues than confirmed = no surprise)", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([
      { code: "voucher_imbalance", affectedRows: 1, exposure: 100 },
    ]));
    createPeriodMock.mockResolvedValue({
      id: "p1",
      tasks: [
        { id: "t1", title: "Resolve 1 voucher where Dr ≠ Cr", category: "CUSTOM", status: "PENDING" },
      ],
    });
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", verdict: "NORMAL", autoApply: "ALWAYS", answer: "ok",
      annotation: null,
      sourceRefJson: JSON.stringify({ issueCode: "voucher_imbalance", affectedRows: 10, exposure: 50_000 }),
    });
    mockPrisma.closeTask.update.mockResolvedValue({});

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "x",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();
    expect(body.autoResolved).toHaveLength(1);
    expect(body.knowledgeHinted).toEqual([]);
  });

  it("does NOT auto-resolve when verdict is INVESTIGATE", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([
      { code: "voucher_imbalance", affectedRows: 1, exposure: 100 },
    ]));
    createPeriodMock.mockResolvedValue({
      id: "p1",
      tasks: [
        { id: "t1", title: "Resolve 1 voucher where Dr ≠ Cr", category: "CUSTOM", status: "PENDING" },
      ],
    });
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", verdict: "INVESTIGATE", autoApply: "ALWAYS", answer: "x", annotation: null,
      sourceRefJson: null,
    });

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "x",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();
    expect(body.autoResolved).toEqual([]);
    expect(body.knowledgeHinted).toEqual([]);
    expect(mockPrisma.closeTask.update).not.toHaveBeenCalled();
  });

  it("does NOT auto-resolve when autoApply is ONCE or NEVER", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([
      { code: "voucher_imbalance", affectedRows: 1, exposure: 100 },
    ]));
    createPeriodMock.mockResolvedValue({
      id: "p1",
      tasks: [
        { id: "t1", title: "Resolve 1 voucher where Dr ≠ Cr", category: "CUSTOM", status: "PENDING" },
      ],
    });
    mockPrisma.orgBusinessKnowledge.findFirst.mockResolvedValue({
      id: "k1", verdict: "NORMAL", autoApply: "NEVER", answer: "x", annotation: null,
      sourceRefJson: null,
    });

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "x",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();
    expect(body.autoResolved).toEqual([]);
  });

  it("ignores non-anomaly tasks (only CUSTOM category gets considered)", async () => {
    generateMock.mockResolvedValue(generateMockWithIssues([]));
    createPeriodMock.mockResolvedValue({
      id: "p1",
      tasks: [
        { id: "t1", title: "Verify Opening Balances", category: "REVIEW", status: "PENDING" },
        { id: "t2", title: "Bank Reconciliation",     category: "RECONCILIATION", status: "PENDING" },
      ],
    });

    const res = await periodsPOST(jsonRequest("http://localhost/api/v1/close/periods", {
      connectionId: "c1", name: "x",
      startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-04-30T23:59:59.000Z",
      profile: "STANDARD",
    }));
    const body = await res.json();
    expect(body.autoResolved).toEqual([]);
    expect(mockPrisma.orgBusinessKnowledge.findFirst).not.toHaveBeenCalled();
  });
});

// ── Task PATCH usage-count bump on completion ───────────────────────────────

describe("PATCH /api/v1/close/tasks/[taskId] — usage count on completion", () => {
  const TASK_ID = "task1";
  const PERIOD_ID = "period1";

  beforeEach(() => {
    mockPrisma.closeTask.findFirst.mockResolvedValue({
      id:       TASK_ID,
      periodId: PERIOD_ID,
      period:   { orgId: "org1" },
    });
    updateTaskMock.mockResolvedValue({ id: TASK_ID, status: "COMPLETED" });
  });

  function patchReq(body: unknown) {
    return {
      url:    `http://localhost/api/v1/close/tasks/${TASK_ID}`,
      method: "PATCH",
      json:   async () => body,
    } as Parameters<typeof taskPATCH>[0];
  }
  const ctx = { params: { taskId: TASK_ID } };

  it("bumps usage count when period transitions to COMPLETED", async () => {
    mockPrisma.closePeriod.findUnique
      .mockResolvedValueOnce({ status: "IN_PROGRESS", closeProfile: "ADAPTIVE", orgId: "org1" }) // before
      .mockResolvedValueOnce({ status: "COMPLETED" });                                            // after
    mockPrisma.orgClosePreferences.findUnique.mockResolvedValue({
      usageCountJson: '{"STANDARD":2}',
    });

    await taskPATCH(patchReq({ status: "COMPLETED" }), ctx);

    expect(mockPrisma.orgClosePreferences.upsert).toHaveBeenCalled();
    const arg = mockPrisma.orgClosePreferences.upsert.mock.calls[0][0];
    const counts = JSON.parse(arg.update.usageCountJson);
    expect(counts).toEqual({ STANDARD: 2, ADAPTIVE: 1 });
  });

  it("does NOT bump usage count when period was already COMPLETED", async () => {
    mockPrisma.closePeriod.findUnique
      .mockResolvedValueOnce({ status: "COMPLETED", closeProfile: "ADAPTIVE", orgId: "org1" })
      .mockResolvedValueOnce({ status: "COMPLETED" });

    await taskPATCH(patchReq({ status: "COMPLETED" }), ctx);

    expect(mockPrisma.orgClosePreferences.upsert).not.toHaveBeenCalled();
  });

  it("does NOT bump usage count when period stays IN_PROGRESS after update", async () => {
    mockPrisma.closePeriod.findUnique
      .mockResolvedValueOnce({ status: "IN_PROGRESS", closeProfile: "QUICK", orgId: "org1" })
      .mockResolvedValueOnce({ status: "IN_PROGRESS" });

    await taskPATCH(patchReq({ status: "COMPLETED" }), ctx);

    expect(mockPrisma.orgClosePreferences.upsert).not.toHaveBeenCalled();
  });

  it("does NOT call period status checks when no status field in request", async () => {
    mockPrisma.closeTask.findUniqueOrThrow.mockResolvedValue({ id: TASK_ID });

    await taskPATCH(patchReq({ notes: "just a note" }), ctx);

    expect(mockPrisma.closePeriod.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.orgClosePreferences.upsert).not.toHaveBeenCalled();
  });
});

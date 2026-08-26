import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
// Phase 3.5: a confirmed column mapping must default to THIS client's
// connectionId, not the org-wide default — otherwise one client's file
// quirks silently become another client's auto-suggested mapping. Verifies
// the scoping decision the route makes, not the table-creation mechanics
// (those are exercised by @aiql/erp-connectors' own tests).

const { mockPrisma, mockUpsertOrgMappings, mockSeedDefaultPinnedQueries } = vi.hoisted(() => ({
  mockPrisma: {
    erpConnection: { findFirst: vi.fn(), update: vi.fn() },
    uploadedFile:  { upsert: vi.fn() },
    $transaction:  vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
  mockUpsertOrgMappings:       vi.fn(),
  mockSeedDefaultPinnedQueries: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db", () => ({
  prisma:                     mockPrisma,
  upsertOrgMappings:          mockUpsertOrgMappings,
  seedDefaultPinnedQueries:   mockSeedDefaultPinnedQueries,
}));
vi.mock("@aiql/erp-connectors", () => ({
  createTempTable:      vi.fn(async () => "gl_table_1"),
  createNativeTable:    vi.fn(async () => ({ tableName: "native_table_1", columns: [] })),
  resolveRedundancy:    vi.fn((mappings: unknown) => mappings),
  validateMappings:     vi.fn(() => ({
    isValid: true, canonicalColumns: ["vendor_name"], droppedColumns: [], warnings: [],
  })),
  getUploadEntityLists: vi.fn(async () => ({})),
  buildUploadSchema:    vi.fn(() => ({})),
}));
vi.mock("@/lib/s3",      () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/billing", () => ({ checkPlanAccess: vi.fn(async () => ({ allowed: true })) }));

import { validateRequest } from "@/lib/auth";
import { POST } from "@/app/api/internal/connections/confirm-upload/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH = { user: { id: "u1", orgId: "org-1", email: "ca@test.in" } };

function postReq(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const PENDING_CONNECTION = {
  id: "conn-1", orgId: "org-1", erpType: "FILE_UPLOAD",
  schemaCacheJson: JSON.stringify({
    _pending: true, fileName: "gl.xlsx", mimeType: "application/vnd.ms-excel",
    sizeBytes: 100, rowCount: 1, headers: ["Vendor"],
    rows: [{ Vendor: "Mehta Supplies" }],
  }),
};

const BODY = {
  connectionId: "conn-1",
  confirmedMapping: [
    { originalName: "Vendor", canonicalName: "vendor_name", confidence: 1, detectionMethod: "manual" },
  ],
  documentType: "GL" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue(AUTH);
  mockPrisma.erpConnection.findFirst.mockResolvedValue(PENDING_CONNECTION);
  mockPrisma.uploadedFile.upsert.mockResolvedValue({});
  mockPrisma.erpConnection.update.mockResolvedValue({});
  mockUpsertOrgMappings.mockResolvedValue(undefined);
});

describe("POST /api/internal/connections/confirm-upload — mapping scope", () => {
  it("scopes the saved mapping to this connection by default", async () => {
    const res = await POST(postReq(BODY));
    expect(res.status).toBe(200);
    expect(mockUpsertOrgMappings).toHaveBeenCalledWith(
      "org-1",
      [{ sourceColumnName: "Vendor", canonicalField: "vendor_name" }],
      "conn-1",
    );
  });

  it("writes the org-wide default (connectionId: null) when applyToAllClients is true", async () => {
    const res = await POST(postReq({ ...BODY, applyToAllClients: true }));
    expect(res.status).toBe(200);
    expect(mockUpsertOrgMappings).toHaveBeenCalledWith(
      "org-1",
      [{ sourceColumnName: "Vendor", canonicalField: "vendor_name" }],
      null,
    );
  });

  it("does not call upsertOrgMappings when nothing is mapped (all skipped)", async () => {
    const res = await POST(postReq({
      ...BODY,
      confirmedMapping: [{ originalName: "Vendor", canonicalName: null, confidence: 0, detectionMethod: "skipped", skip: true }],
    }));
    expect(res.status).toBe(200);
    expect(mockUpsertOrgMappings).not.toHaveBeenCalled();
  });
});

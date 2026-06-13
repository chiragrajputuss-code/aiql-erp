import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZohoBooksConnector, buildAuthorizationUrl } from "../zoho-books/auth";
import { createConnector } from "../index";

vi.mock("axios", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

import axios from "axios";
const mockGet  = vi.mocked(axios.get);
const mockPost = vi.mocked(axios.post);

// ─── Sample Zoho API responses ────────────────────────────────────────────────

const ORG_RESPONSE = {
  data: { organization: { name: "Acme Finance Pvt Ltd", organization_id: "org_123" } },
};

const ACCOUNTS_RESPONSE = {
  data: {
    chartofaccounts: [
      { account_id: "a1", account_name: "Sales", account_type: "income",       is_active: true },
      { account_id: "a2", account_name: "HDFC Bank", account_type: "bank",     is_active: true },
      { account_id: "a3", account_name: "Sundry Debtors", account_type: "accounts_receivable", is_active: true },
      { account_id: "a4", account_name: "Sundry Creditors", account_type: "accounts_payable",  is_active: true },
      { account_id: "a5", account_name: "Office Rent", account_type: "expense", is_active: true },
    ],
  },
};

const CONTACTS_RESPONSE = {
  data: {
    contacts: [
      { contact_id: "c1", contact_name: "Acme Corp",    contact_type: "vendor",   status: "active" },
      { contact_id: "c2", contact_name: "Beta Ltd",     contact_type: "vendor",   status: "active" },
      { contact_id: "c3", contact_name: "Infosys Ltd",  contact_type: "customer", status: "active" },
      { contact_id: "c4", contact_name: "Wipro Ltd",    contact_type: "customer", status: "active" },
    ],
  },
};

const PL_RESPONSE = {
  data: {
    profitloss: {
      income:  [{ account_name: "Sales", total: 500000 }],
      expense: [{ account_name: "Office Rent", total: 50000 }],
    },
  },
};

function makeConnector(extraCreds = {}) {
  return new ZohoBooksConnector({
    accessToken:    "tok_valid",
    refreshToken:   "ref_valid",
    clientId:       "client123",
    clientSecret:   "secret123",
    organisationId: "org_123",
    tokenExpiresAt: new Date(Date.now() + 3600_000), // 1 hour from now
    ...extraCreds,
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

describe("createConnector — ZOHO_BOOKS", () => {
  it("returns a ZohoBooksConnector", () => {
    const c = createConnector("ZOHO_BOOKS", { accessToken: "tok" });
    expect(c).toBeInstanceOf(ZohoBooksConnector);
    expect(c.erpType).toBe("ZOHO_BOOKS");
  });

  it("passes onTokenRefresh callback", async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    mockPost.mockResolvedValueOnce({
      data: { access_token: "new_tok", expires_in: 3600 },
    });
    const c = createConnector(
      "ZOHO_BOOKS",
      { accessToken: "old", refreshToken: "ref", clientId: "id", clientSecret: "sec",
        organisationId: "org", tokenExpiresAt: new Date(0) },
      { onTokenRefresh: cb }
    ) as ZohoBooksConnector;

    mockGet.mockResolvedValueOnce(ORG_RESPONSE);
    await c.testConnection();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "new_tok" }));
  });
});

// ─── testConnection() ─────────────────────────────────────────────────────────

describe("testConnection()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success with org name when API responds", async () => {
    mockGet.mockResolvedValueOnce(ORG_RESPONSE);
    const c = makeConnector();
    const result = await c.testConnection();
    expect(result.success).toBe(true);
    expect(result.message).toContain("Acme Finance Pvt Ltd");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns failure on 401 (invalid credentials)", async () => {
    mockGet.mockRejectedValueOnce(Object.assign(new Error("401"), { response: { status: 401 } }));
    const c = makeConnector();
    const result = await c.testConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain("authentication failed");
  });

  it("returns failure on network error", async () => {
    mockGet.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const c = makeConnector();
    const result = await c.testConnection();
    expect(result.success).toBe(false);
  });
});

// ─── Token refresh ────────────────────────────────────────────────────────────

describe("token refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isTokenExpired() returns true for past expiry", () => {
    const c = makeConnector({ tokenExpiresAt: new Date(0) });
    expect(c.isTokenExpired()).toBe(true);
  });

  it("isTokenExpired() returns false for future expiry (> 5min)", () => {
    const c = makeConnector({ tokenExpiresAt: new Date(Date.now() + 3600_000) });
    expect(c.isTokenExpired()).toBe(false);
  });

  it("auto-refreshes token before API call when expired", async () => {
    const c = makeConnector({ tokenExpiresAt: new Date(0) });
    mockPost.mockResolvedValueOnce({ data: { access_token: "refreshed_tok", expires_in: 3600 } });
    mockGet.mockResolvedValueOnce(ORG_RESPONSE);
    await c.testConnection();
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/oauth/v2/token"),
      expect.anything(),
      expect.anything()
    );
  });

  it("throws when refresh token is invalid", async () => {
    const c = makeConnector({ tokenExpiresAt: new Date(0) });
    mockPost.mockResolvedValueOnce({ data: { error: "invalid_client" } });
    await expect(c.refreshAccessToken()).rejects.toThrow("invalid_client");
  });
});

// ─── introspectSchema() ───────────────────────────────────────────────────────

describe("introspectSchema()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(ACCOUNTS_RESPONSE);
  });

  it("returns erpType ZOHO_BOOKS", async () => {
    const c = makeConnector();
    const schema = await c.introspectSchema();
    expect(schema.erpType).toBe("ZOHO_BOOKS");
  });

  it("returns 4 tables: accounts, contacts, invoices, bills", async () => {
    const c = makeConnector();
    const { tables } = await c.introspectSchema();
    const names = tables.map((t) => t.name);
    expect(names).toContain("chart_of_accounts");
    expect(names).toContain("contacts");
    expect(names).toContain("invoices");
    expect(names).toContain("bills");
  });

  it("sampleData contains account names from API", async () => {
    const c = makeConnector();
    const { tables } = await c.introspectSchema();
    const acctTable = tables.find((t) => t.name === "chart_of_accounts")!;
    const names = (acctTable.sampleData ?? []).map((r) => r.account_name);
    expect(names).toContain("Sales");
    expect(names).toContain("HDFC Bank");
  });

  it("metadata has gstEnabled: true (India)", async () => {
    const c = makeConnector();
    const { metadata } = await c.introspectSchema();
    expect(metadata.gstEnabled).toBe(true);
  });
});

// ─── getEntityLists() ─────────────────────────────────────────────────────────

describe("getEntityLists()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(CONTACTS_RESPONSE);
  });

  it("classifies vendor contacts correctly", async () => {
    const c = makeConnector();
    const { vendors } = await c.getEntityLists();
    expect(vendors).toContain("Acme Corp");
    expect(vendors).toContain("Beta Ltd");
  });

  it("classifies customer contacts correctly", async () => {
    const c = makeConnector();
    const { customers } = await c.getEntityLists();
    expect(customers).toContain("Infosys Ltd");
    expect(customers).toContain("Wipro Ltd");
  });

  it("vendors and customers are separate (no overlap)", async () => {
    const c = makeConnector();
    const { vendors, customers } = await c.getEntityLists();
    for (const v of vendors) expect(customers).not.toContain(v);
  });

  it("employees is empty (Zoho Books has no employee ledgers)", async () => {
    const c = makeConnector();
    const { employees } = await c.getEntityLists();
    expect(employees).toHaveLength(0);
  });
});

// ─── executeQuery() ───────────────────────────────────────────────────────────

describe("executeQuery()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(PL_RESPONSE);
  });

  it("executes a P&L report by name", async () => {
    const c = makeConnector();
    const result = await c.executeQuery("profitandloss");
    expect(result.rowCount).toBeGreaterThan(0);
  });

  it("accepts 'profit & loss' as a report alias", async () => {
    const c = makeConnector();
    await expect(c.executeQuery("profit & loss")).resolves.toBeTruthy();
  });

  it("accepts JSON query format with params", async () => {
    const c = makeConnector();
    const json = JSON.stringify({ report: "profitandloss", params: { from_date: "2026-04-01" } });
    const result = await c.executeQuery(json);
    expect(result.rowCount).toBeGreaterThanOrEqual(0);
    // Verify params were passed
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("/profitandloss"),
      expect.objectContaining({ params: expect.objectContaining({ from_date: "2026-04-01" }) })
    );
  });

  it("throws for unknown report name", async () => {
    const c = makeConnector();
    await expect(c.executeQuery("invalid_report")).rejects.toThrow("Unknown Zoho Books report");
  });

  it("returns columns from flattened report data", async () => {
    const c = makeConnector();
    const result = await c.executeQuery("profitandloss");
    expect(result.columns.length).toBeGreaterThan(0);
  });
});

// ─── OAuth helpers ────────────────────────────────────────────────────────────

describe("buildAuthorizationUrl", () => {
  it("builds correct Zoho India auth URL", () => {
    const url = buildAuthorizationUrl("client123", "https://myapp.com/callback", "state123");
    expect(url).toContain("accounts.zoho.in");
    expect(url).toContain("client_id=client123");
    expect(url).toContain("ZohoBooks.accountants.READ");
    expect(url).toContain("state=state123");
    expect(url).toContain("access_type=offline");
  });
});

// ─── zohoKnowledge config ─────────────────────────────────────────────────────

describe("zohoKnowledge", () => {
  it("maps income → REVENUE", async () => {
    const { zohoKnowledge } = await import("@aiql/schema-intel");
    expect(zohoKnowledge.accountGroups["income"]).toBe("REVENUE");
  });

  it("maps accounts_payable → PAYABLE", async () => {
    const { zohoKnowledge } = await import("@aiql/schema-intel");
    expect(zohoKnowledge.accountGroups["accounts_payable"]).toBe("PAYABLE");
  });

  it("maps accounts_receivable → RECEIVABLE", async () => {
    const { zohoKnowledge } = await import("@aiql/schema-intel");
    expect(zohoKnowledge.accountGroups["accounts_receivable"]).toBe("RECEIVABLE");
  });

  it("has April fiscal year start for India", async () => {
    const { zohoKnowledge } = await import("@aiql/schema-intel");
    expect(zohoKnowledge.periodConfig.fiscalYearStart).toBe("04-01");
  });

  it("does NOT use Dr/Cr notation (unlike Tally)", async () => {
    const { zohoKnowledge } = await import("@aiql/schema-intel");
    expect(zohoKnowledge.periodConfig.drCrNotation).toBe(false);
  });
});

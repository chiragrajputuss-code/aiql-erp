import { describe, it, expect, vi, beforeEach } from "vitest";
import { TallyConnector } from "../tally/auth";
import { createConnector } from "../index";

// ─── Mock axios so tests don't need a real Tally instance ────────────────────

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from "axios";
const mockPost = vi.mocked(axios.post);

// ─── Sample Tally XML responses ───────────────────────────────────────────────

const LEDGER_XML = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><STATUS>1</STATUS></HEADER>
  <BODY><DATA><COLLECTION>
    <LEDGER NAME="Acme Corp"><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE> 50000.00 Dr</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Beta Ltd"><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE> 25000.00 Dr</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Infosys Ltd"><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE> 100000.00 Cr</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Cash"><PARENT>Cash-in-Hand</PARENT></LEDGER>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

const GROUP_XML = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><STATUS>1</STATUS></HEADER>
  <BODY><DATA><COLLECTION>
    <GROUP NAME="Sundry Creditors"><PARENT>Current Liabilities</PARENT></GROUP>
    <GROUP NAME="Sundry Debtors"><PARENT>Current Assets</PARENT></GROUP>
    <GROUP NAME="Cash-in-Hand"><PARENT>Current Assets</PARENT></GROUP>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

const VOUCHER_XML = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY><DATA><COLLECTION>
    <VOUCHERTYPE NAME="Sales"><PARENT>Sales</PARENT></VOUCHERTYPE>
    <VOUCHERTYPE NAME="Purchase"><PARENT>Purchase</PARENT></VOUCHERTYPE>
    <VOUCHERTYPE NAME="Payment"><PARENT>Payment</PARENT></VOUCHERTYPE>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

const COSTCENTRE_XML = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY><DATA><COLLECTION>
    <COSTCENTRE NAME="Head Office"><PARENT>Primary Cost Centre</PARENT></COSTCENTRE>
    <COSTCENTRE NAME="Mumbai Branch"><PARENT>Primary Cost Centre</PARENT></COSTCENTRE>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

const GODOWN_XML = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY><DATA><COLLECTION>
    <GODOWN NAME="Main Store"><PARENT>Primary</PARENT></GODOWN>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

const ERROR_XML = `<ENVELOPE><HEADER><STATUS>0</STATUS></HEADER></ENVELOPE>`;

// ─── Factory ──────────────────────────────────────────────────────────────────

describe("createConnector factory", () => {
  it("returns TallyConnector for TALLY type", () => {
    const connector = createConnector("TALLY", { host: "192.168.1.10", port: 9000 });
    expect(connector).toBeInstanceOf(TallyConnector);
    expect(connector.erpType).toBe("TALLY");
  });

  it("throws for unimplemented ERP types", () => {
    expect(() => createConnector("QUICKBOOKS", {})).toThrow("not yet implemented");
    expect(() => createConnector("XERO", {})).toThrow("not yet implemented");
  });

  it("throws for unknown ERP type", () => {
    expect(() => createConnector("CUSTOM" as never, {})).toThrow("Unsupported ERP type");
  });
});

// ─── TallyConnector ───────────────────────────────────────────────────────────

describe("TallyConnector — construction", () => {
  it("uses provided host and port", () => {
    const c = new TallyConnector({ host: "10.0.0.5", port: 9001 });
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe("http://10.0.0.5:9001");
  });

  it("defaults to localhost:9000", () => {
    const c = new TallyConnector({});
    expect((c as unknown as { host: string; port: number }).host).toBe("localhost");
    expect((c as unknown as { port: number }).port).toBe(9000);
  });
});

// ─── testConnection() ─────────────────────────────────────────────────────────

describe("testConnection()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success when Tally responds with valid ENVELOPE", async () => {
    mockPost.mockResolvedValueOnce({ data: LEDGER_XML });
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.testConnection();
    expect(result.success).toBe(true);
    expect(result.message).toContain("Connected");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns failure on ECONNREFUSED", async () => {
    const err = new Error("connect ECONNREFUSED") as Error & { code: string };
    err.code = "ECONNREFUSED";
    mockPost.mockRejectedValueOnce(err);
    const c = new TallyConnector({ host: "1.2.3.4" });
    const result = await c.testConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain("Cannot reach Tally");
  });

  it("returns failure on timeout", async () => {
    const err = new Error("timeout") as Error & { code: string };
    err.code = "ETIMEDOUT";
    mockPost.mockRejectedValueOnce(err);
    const c = new TallyConnector({ host: "1.2.3.4" });
    const result = await c.testConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain("timed out");
  });

  it("returns failure when response has no ENVELOPE", async () => {
    mockPost.mockResolvedValueOnce({ data: "<html>Not Tally</html>" });
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.testConnection();
    expect(result.success).toBe(false);
  });

  it("sends a POST to the correct URL", async () => {
    mockPost.mockResolvedValueOnce({ data: LEDGER_XML });
    const c = new TallyConnector({ host: "tally.mycompany.com", port: 9000 });
    await c.testConnection();
    expect(mockPost).toHaveBeenCalledWith(
      "http://tally.mycompany.com:9000",
      expect.stringContaining("<TALLYREQUEST>"),
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": expect.stringContaining("xml") }) })
    );
  });

  it("XML request contains correct Export Data structure", async () => {
    mockPost.mockResolvedValueOnce({ data: LEDGER_XML });
    const c = new TallyConnector({ host: "192.168.1.10" });
    await c.testConnection();
    const sentXml = mockPost.mock.calls[0][1] as string;
    expect(sentXml).toContain("Export Data");
    expect(sentXml).toContain("ENVELOPE");
    expect(sentXml).toContain("TALLYREQUEST");
  });
});

// ─── introspectSchema() ───────────────────────────────────────────────────────

describe("introspectSchema()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // introspectSchema fires 5 requests in parallel
    mockPost
      .mockResolvedValueOnce({ data: LEDGER_XML })
      .mockResolvedValueOnce({ data: GROUP_XML })
      .mockResolvedValueOnce({ data: VOUCHER_XML })
      .mockResolvedValueOnce({ data: COSTCENTRE_XML })
      .mockResolvedValueOnce({ data: GODOWN_XML });
  });

  it("returns RawSchemaData with erpType TALLY", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const schema = await c.introspectSchema();
    expect(schema.erpType).toBe("TALLY");
  });

  it("returns 5 tables: ledgers, groups, voucher_types, cost_centres, godowns", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { tables } = await c.introspectSchema();
    const names = tables.map((t) => t.name);
    expect(names).toContain("ledgers");
    expect(names).toContain("groups");
    expect(names).toContain("voucher_types");
    expect(names).toContain("cost_centres");
    expect(names).toContain("godowns");
  });

  it("ledgers table has name, parent, openingBalance columns", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { tables } = await c.introspectSchema();
    const ledgers = tables.find((t) => t.name === "ledgers")!;
    const cols = ledgers.columns.map((c) => c.name);
    expect(cols).toContain("name");
    expect(cols).toContain("parent");
    expect(cols).toContain("openingBalance");
  });

  it("metadata includes INR currency and April fiscal year start", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { metadata } = await c.introspectSchema();
    expect(metadata.currency).toBe("INR");
    expect(metadata.fiscalYearStart).toBe("04-01");
  });

  it("sampleData contains parsed ledger names", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { tables } = await c.introspectSchema();
    const ledgers = tables.find((t) => t.name === "ledgers")!;
    const names = (ledgers.sampleData ?? []).map((r) => r.name);
    expect(names).toContain("Acme Corp");
    expect(names).toContain("Infosys Ltd");
  });

  it("fires exactly 5 HTTP requests (one per collection)", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    await c.introspectSchema();
    expect(mockPost).toHaveBeenCalledTimes(5);
  });

  it("ledger→group relationship is present", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { relationships } = await c.introspectSchema();
    const rel = relationships.find(
      (r) => r.fromTable === "ledgers" && r.toTable === "groups"
    );
    expect(rel).toBeTruthy();
    expect(rel?.type).toBe("many-to-one");
  });
});

// ─── extractCollection helper ─────────────────────────────────────────────────

describe("TallyConnector.extractCollection()", () => {
  it("returns an array of ledgers from LEDGER_XML", () => {
    const { XMLParser } = require("fast-xml-parser");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (tagName: string) =>
        ["LEDGER", "GROUP", "VOUCHERTYPE", "COSTCENTRE", "GODOWN"].includes(tagName),
    });
    const parsed = parser.parse(LEDGER_XML);
    const ledgers = TallyConnector.extractCollection(parsed, "LEDGER");
    expect(ledgers).toHaveLength(4);
  });

  it("returns empty array when collection is empty", () => {
    const emptyParsed = {
      ENVELOPE: { BODY: { DATA: { COLLECTION: {} } } },
    };
    const result = TallyConnector.extractCollection(emptyParsed, "LEDGER");
    expect(result).toEqual([]);
  });
});

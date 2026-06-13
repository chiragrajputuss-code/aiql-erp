import { describe, it, expect, vi, beforeEach } from "vitest";
import { TallyConnector } from "../tally/auth";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

import axios from "axios";
const mockPost = vi.mocked(axios.post);

const COLLECTION_XML = `<?xml version="1.0"?>
<ENVELOPE>
  <BODY><DATA><COLLECTION>
    <LEDGER NAME="Acme Corp"><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE> 50000.00 Dr</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Beta Ltd"><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE> 25000.00 Dr</OPENINGBALANCE></LEDGER>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

describe("executeTallyQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: COLLECTION_XML });
  });

  it("executes a report name query and returns rows", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.executeQuery("List of Ledgers");
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]).toHaveProperty("NAME", "Acme Corp");
  });

  it("executes raw XML query starting with <", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
      <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Ledgers</REPORTNAME>
      </REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
    const result = await c.executeQuery(xml);
    expect(result.rowCount).toBe(2);
  });

  it("cleans @_NAME attribute keys to NAME in result columns", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.executeQuery("List of Ledgers");
    // Should not have @_ prefix in output
    expect(result.columns).not.toContain("@_NAME");
    expect(result.columns).toContain("NAME");
  });

  it("returns correct columns from first row", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.executeQuery("List of Ledgers");
    expect(result.columns).toContain("NAME");
    expect(result.columns).toContain("PARENT");
  });

  it("returns executionTimeMs", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.executeQuery("List of Ledgers");
    expect(typeof result.executionTimeMs).toBe("number");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects IMPORTDATA (write operation)", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const writeXml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDESC>
      <REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC></IMPORTDATA></BODY></ENVELOPE>`;
    await expect(c.executeQuery(writeXml)).rejects.toThrow("Write operations");
  });

  it("rejects SQL-like write keywords", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    await expect(c.executeQuery("DELETE FROM ledgers")).rejects.toThrow("Write operations");
    await expect(c.executeQuery("DROP TABLE vouchers")).rejects.toThrow("Write operations");
    await expect(c.executeQuery("UPDATE ledger SET balance = 0")).rejects.toThrow("Write operations");
  });

  it("returns empty rows and columns for empty collection", async () => {
    mockPost.mockResolvedValueOnce({
      data: `<ENVELOPE><BODY><DATA><COLLECTION></COLLECTION></DATA></BODY></ENVELOPE>`,
    });
    const c = new TallyConnector({ host: "192.168.1.10" });
    const result = await c.executeQuery("Empty Report");
    expect(result.rows).toHaveLength(0);
    expect(result.columns).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });
});

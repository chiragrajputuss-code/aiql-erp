import { describe, it, expect, vi, beforeEach } from "vitest";
import { TallyConnector } from "../tally/auth";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

import axios from "axios";
const mockPost = vi.mocked(axios.post);

const LEDGER_XML = `<?xml version="1.0"?>
<ENVELOPE>
  <BODY><DATA><COLLECTION>
    <LEDGER NAME="Acme Corp"><PARENT>Sundry Creditors</PARENT></LEDGER>
    <LEDGER NAME="Beta Ltd"><PARENT>Sundry Creditors</PARENT></LEDGER>
    <LEDGER NAME="Infosys Ltd"><PARENT>Sundry Debtors</PARENT></LEDGER>
    <LEDGER NAME="Wipro Ltd"><PARENT>Sundry Debtors</PARENT></LEDGER>
    <LEDGER NAME="Priya Sharma"><PARENT>Salary Payable</PARENT></LEDGER>
    <LEDGER NAME="Cash"><PARENT>Cash-in-Hand</PARENT></LEDGER>
    <LEDGER NAME="HDFC Bank"><PARENT>Bank Accounts</PARENT></LEDGER>
  </COLLECTION></DATA></BODY>
</ENVELOPE>`;

describe("getTallyEntityLists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: LEDGER_XML });
  });

  it("classifies Sundry Creditors ledgers as vendors", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { vendors } = await c.getEntityLists();
    expect(vendors).toContain("Acme Corp");
    expect(vendors).toContain("Beta Ltd");
  });

  it("classifies Sundry Debtors ledgers as customers", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { customers } = await c.getEntityLists();
    expect(customers).toContain("Infosys Ltd");
    expect(customers).toContain("Wipro Ltd");
  });

  it("classifies payroll ledgers as employees", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { employees } = await c.getEntityLists();
    expect(employees).toContain("Priya Sharma");
  });

  it("does not include non-entity ledgers (Cash, Bank) in any list", async () => {
    const c = new TallyConnector({ host: "192.168.1.10" });
    const { vendors, customers, employees } = await c.getEntityLists();
    const all = [...vendors, ...customers, ...employees];
    expect(all).not.toContain("Cash");
    expect(all).not.toContain("HDFC Bank");
  });

  it("returns empty lists when no matching ledgers found", async () => {
    mockPost.mockResolvedValueOnce({
      data: `<ENVELOPE><BODY><DATA><COLLECTION>
        <LEDGER NAME="Petty Cash"><PARENT>Cash-in-Hand</PARENT></LEDGER>
      </COLLECTION></DATA></BODY></ENVELOPE>`,
    });
    const c = new TallyConnector({ host: "192.168.1.10" });
    const lists = await c.getEntityLists();
    expect(lists.vendors).toHaveLength(0);
    expect(lists.customers).toHaveLength(0);
  });
});

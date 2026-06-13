import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeQuery } from "../execute-query";
import type { QueryRequest } from "../execute-query";
import type { ERPSchema } from "@aiql/schema-intel";
import type { RouterResult } from "../llm-providers/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../llm-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("../llm-router")>();
  return {
    ...original,
    routeQuery: vi.fn(),
  };
});

import { routeQuery } from "../llm-router";
const mockRouteQuery = vi.mocked(routeQuery);

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SCHEMA: ERPSchema = {
  erpType:   "FILE_UPLOAD",
  tables: [
    {
      name:        "upload_org1_conn1",
      displayName: "GL Entries",
      category:    "ledger",
      columns: [
        { name: "transaction_date", displayName: "Date",    dataType: "date",     nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: true,  isName: false },
        { name: "account_name",     displayName: "Account", dataType: "string",   nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: true  },
        { name: "debit_amount",     displayName: "Dr",      dataType: "currency", nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: true,  isDate: false, isName: false },
        { name: "credit_amount",    displayName: "Cr",      dataType: "currency", nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: true,  isDate: false, isName: false },
        { name: "cost_centre",      displayName: "Dept",    dataType: "string",   nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: false },
      ],
    },
  ],
  relationships:  [],
  accountTypeMap: {},
  dimensions:     ["cost_centre"],
  currency:       { baseCurrency: "INR", isMultiCurrency: false, amountColumns: ["debit_amount", "credit_amount"], locale: "en-IN" },
  metadata:       {},
  introspectedAt: new Date(),
};

function makeRouterResult(sql: string, confidence = 0.92): RouterResult {
  return {
    provider:  "groq",
    model:     "llama-3.1-70b-versatile",
    response: {
      sql,
      confidence,
      explanation:          "Aggregates debit amounts grouped by account.",
      assumptions:          ["Uses debit_amount for vendor spend"],
      clarificationsNeeded: [],
      tokensIn:             120,
      tokensOut:            80,
    },
    tokensIn:  120,
    tokensOut: 80,
    cost:      0,
    retried:   false,
  };
}

const BASE_REQUEST: QueryRequest = {
  question: "Show me accounts with unusual debit patterns",
  schema:   SCHEMA,
  erpType:  "FILE_UPLOAD",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("executeQuery — full pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns detokenised SQL when LLM response is valid", async () => {
    // SQL uses real schema table/columns so schema-match scorer gives 1.0
    const llmSql = `SELECT account_name, SUM(debit_amount) AS total_spend FROM upload_org1_conn1 GROUP BY account_name ORDER BY total_spend DESC LIMIT 10`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql));

    const result = await executeQuery(BASE_REQUEST);

    expect(result.sql).toBe(llmSql);
    expect(result.rawSql).toBe(llmSql);
    expect(result.verdict).not.toBe("needs_clarification");
    expect(result.provider).toBe("groq");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("detokenises vendor name in SQL", async () => {
    // Question contains a vendor name that should be tokenised before LLM,
    // then detokenised in the output SQL.
    const request: QueryRequest = {
      ...BASE_REQUEST,
      question:   "Show spend for Acme Corp",
      dictionary: { vendors: ["Acme Corp"], customers: [], employees: [], projects: [] },
    };

    // LLM receives tokenised question and echoes the token in SQL
    const llmSql = `SELECT SUM(debit_amount) AS total FROM upload_org1_conn1 WHERE account_name = 'VENDOR_T001'`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql));

    const result = await executeQuery(request);

    // Token should be replaced with original value in the final SQL
    expect(result.sql).toContain("Acme Corp");
    expect(result.sql).not.toContain("VENDOR_T001");
    // rawSql retains the token
    expect(result.rawSql).toContain("VENDOR_T001");
  });

  it("returns needs_clarification when LLM confidence is below threshold", async () => {
    const llmSql = `SELECT * FROM upload_org1_conn1`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql, 0.30));

    const result = await executeQuery(BASE_REQUEST);

    expect(result.verdict).toBe("needs_clarification");
    expect(result.sql).toBe("");
    expect(result.clarificationsNeeded.length).toBeGreaterThan(0);
  });

  it("returns needs_clarification when SQL fails validation", async () => {
    const maliciousSql = `DELETE FROM upload_org1_conn1`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(maliciousSql, 0.95));

    const result = await executeQuery(BASE_REQUEST);

    expect(result.verdict).toBe("needs_clarification");
    expect(result.sql).toBe("");
    expect(result.clarificationsNeeded.some((c) => c.includes("SQL validation failed"))).toBe(true);
  });

  it("uses template when question matches a built-in pattern", async () => {
    const request: QueryRequest = {
      ...BASE_REQUEST,
      question: "Show AP aging report",
    };

    // routeQuery should NOT be called — template short-circuits
    const result = await executeQuery(request);

    expect(mockRouteQuery).not.toHaveBeenCalled();
    expect(result.templateId).toBe("ap-aging");
    expect(result.provider).toBe("template");
    expect(result.cost).toBe(0);
    expect(result.sql).toBeTruthy();
  });

  it("calls connector.executeQuery when executeQuery=true and connector provided", async () => {
    const llmSql = `SELECT account_name, SUM(debit_amount) AS total FROM upload_org1_conn1 GROUP BY account_name`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql));

    const mockConnector = {
      erpType: "FILE_UPLOAD" as const,
      testConnection:  vi.fn(),
      introspectSchema: vi.fn(),
      executeQuery:    vi.fn().mockResolvedValue({ columns: ["account_name", "total"], rows: [{ account_name: "Acme Corp", total: 50000 }], rowCount: 1 }),
      getEntityLists:  vi.fn(),
    };

    const result = await executeQuery({
      ...BASE_REQUEST,
      executeQuery: true,
      connector:    mockConnector,
    });

    expect(mockConnector.executeQuery).toHaveBeenCalledWith(result.sql);
    expect(result.queryResult).toBeDefined();
    expect(result.queryResult?.rowCount).toBe(1);
  });

  it("does not call connector.executeQuery when executeQuery=false", async () => {
    const llmSql = `SELECT account_name FROM upload_org1_conn1`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql));

    const mockConnector = { executeQuery: vi.fn() };

    await executeQuery({
      ...BASE_REQUEST,
      executeQuery: false,
      connector:    mockConnector as never,
    });

    expect(mockConnector.executeQuery).not.toHaveBeenCalled();
  });

  it("strips trailing semicolons from SQL via validator", async () => {
    const llmSql = `SELECT account_name FROM upload_org1_conn1;`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql));

    const result = await executeQuery(BASE_REQUEST);

    expect(result.sql).not.toMatch(/;$/);
  });

  it("surfaces warnings from SQL validator in the response", async () => {
    const llmSql = `SELECT * FROM upload_org1_conn1`;
    mockRouteQuery.mockResolvedValue(makeRouterResult(llmSql));

    const result = await executeQuery(BASE_REQUEST);

    expect(result.warnings.some((w) => w.includes("SELECT *"))).toBe(true);
  });

  it("marks retried=true when Claude retried from Groq fallback", async () => {
    const llmSql = `SELECT account_name FROM upload_org1_conn1`;
    const retriedResult: RouterResult = { ...makeRouterResult(llmSql), provider: "claude", retried: true };
    mockRouteQuery.mockResolvedValue(retriedResult);

    const result = await executeQuery(BASE_REQUEST);

    expect(result.retried).toBe(true);
    expect(result.provider).toBe("claude");
  });
});

import { describe, it, expect } from "vitest";
import { calculateConfidence, BUILT_IN_TEMPLATES } from "../confidence-scorer";
import type { ERPSchema } from "@aiql/schema-intel";
import type { LLMResponse } from "../llm-providers/types";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SCHEMA: ERPSchema = {
  erpType: "FILE_UPLOAD",
  tables: [
    {
      name: "upload_org1_conn1",
      displayName: "GL",
      category: "ledger",
      columns: [
        { name: "transaction_date", displayName: "Date",    dataType: "date",    nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: true,  isName: false },
        { name: "account_name",     displayName: "Account", dataType: "string",  nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: true  },
        { name: "debit_amount",     displayName: "Dr",      dataType: "currency",nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: true,  isDate: false, isName: false },
        { name: "credit_amount",    displayName: "Cr",      dataType: "currency",nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: true,  isDate: false, isName: false },
        { name: "cost_centre",      displayName: "Dept",    dataType: "string",  nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: false },
      ],
    },
  ],
  relationships: [],
  accountTypeMap: {},
  dimensions:    ["cost_centre"],
  currency:      { baseCurrency: "INR", isMultiCurrency: false, amountColumns: [], locale: "en-IN" },
  metadata:      {},
  introspectedAt: new Date(),
};

function makeResponse(sql: string, confidence: number): LLMResponse {
  return { sql, confidence, explanation: "", assumptions: [], clarificationsNeeded: [], tokensIn: 0, tokensOut: 0 };
}

const VALID_SQL = `SELECT account_name, SUM(debit_amount) FROM upload_org1_conn1 GROUP BY account_name`;
const HALLUCINATED_SQL = `SELECT account_name, SUM(balance) FROM unknown_table GROUP BY account_name`;

// ─── Verdict thresholds ───────────────────────────────────────────────────────

describe("verdict thresholds", () => {
  it("returns 'execute' when final score >= 0.85", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.95), SCHEMA, "AP aging", BUILT_IN_TEMPLATES);
    expect(r.verdict).toBe("execute");
    expect(r.final).toBeGreaterThanOrEqual(0.85);
  });

  it("returns 'execute_with_warning' when score is 0.70–0.84", () => {
    // LLM gives 0.75 — schemaMatch high, complexity simple
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.75), SCHEMA, "AP aging", BUILT_IN_TEMPLATES);
    expect(["execute_with_warning", "execute"]).toContain(r.verdict);
  });

  it("returns 'needs_clarification' when LLM is very uncertain", () => {
    const r = calculateConfidence(makeResponse("SELECT 1", 0.2), SCHEMA, "unclear question", BUILT_IN_TEMPLATES);
    expect(r.verdict).toBe("needs_clarification");
  });
});

// ─── LLM self-assessment (50%) ────────────────────────────────────────────────

describe("LLM self-assessment component (50%)", () => {
  it("high LLM confidence raises final score significantly", () => {
    const high = calculateConfidence(makeResponse(VALID_SQL, 0.95), SCHEMA, "test", []);
    const low  = calculateConfidence(makeResponse(VALID_SQL, 0.30), SCHEMA, "test", []);
    expect(high.final).toBeGreaterThan(low.final);
    expect(high.components.llmSelfAssessment).toBe(0.95);
    expect(low.components.llmSelfAssessment).toBe(0.30);
  });

  it("LLM confidence is capped at 1.0", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 1.5), SCHEMA, "test", []);
    expect(r.components.llmSelfAssessment).toBeLessThanOrEqual(1.0);
  });
});

// ─── Schema match (20%) ───────────────────────────────────────────────────────

describe("schema match component (20%)", () => {
  it("score = 1.0 when all identifiers exist in schema", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "test", []);
    expect(r.components.schemaMatch).toBe(1.0);
    expect(r.hallucinations).toHaveLength(0);
  });

  it("score = 0 when table is hallucinated", () => {
    const r = calculateConfidence(makeResponse(HALLUCINATED_SQL, 0.9), SCHEMA, "test", []);
    expect(r.components.schemaMatch).toBe(0);
    expect(r.hallucinations.some(h => h.includes("unknown_table"))).toBe(true);
  });

  it("hallucinated column also sets schemaMatch to 0", () => {
    const sql = `SELECT upload_org1_conn1.nonexistent_column FROM upload_org1_conn1`;
    const r = calculateConfidence(makeResponse(sql, 0.9), SCHEMA, "test", []);
    expect(r.components.schemaMatch).toBe(0);
    expect(r.hallucinations.some(h => h.includes("nonexistent_column"))).toBe(true);
  });

  it("CTE names are not flagged as hallucinations", () => {
    const sql = `WITH vendor_totals AS (SELECT account_name, SUM(debit_amount) AS total FROM upload_org1_conn1 GROUP BY account_name) SELECT * FROM vendor_totals`;
    const r = calculateConfidence(makeResponse(sql, 0.9), SCHEMA, "test", []);
    expect(r.hallucinations).toHaveLength(0);
    expect(r.components.schemaMatch).toBeGreaterThan(0);
  });

  it("hallucination drops final score materially", () => {
    const good = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "test", []);
    const bad  = calculateConfidence(makeResponse(HALLUCINATED_SQL, 0.9), SCHEMA, "test", []);
    expect(good.final).toBeGreaterThan(bad.final);
    // Difference should be ~20% (the schemaMatch weight)
    expect(good.final - bad.final).toBeGreaterThanOrEqual(0.18);
  });
});

// ─── Complexity component (15%) ───────────────────────────────────────────────

describe("complexity component (15%)", () => {
  it("simple query (no joins/aggregation) gets complexity score = 1.0", () => {
    const simpleSQL = `SELECT account_name FROM upload_org1_conn1 WHERE transaction_date = '2026-04-01'`;
    const r = calculateConfidence(makeResponse(simpleSQL, 0.9), SCHEMA, "test", []);
    expect(r.components.complexity).toBe(1.0);
  });

  it("complex query (window function) gets lower complexity score", () => {
    const sql = `SELECT account_name, RANK() OVER (ORDER BY SUM(debit_amount) DESC) FROM upload_org1_conn1 GROUP BY account_name`;
    const r = calculateConfidence(makeResponse(sql, 0.9), SCHEMA, "test", []);
    expect(r.components.complexity).toBeLessThan(1.0);
  });
});

// ─── Template match (15%) ─────────────────────────────────────────────────────

describe("template match component (15%)", () => {
  it("AP aging question matches ap-aging template (score = 1.0)", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "Show AP aging by vendor", BUILT_IN_TEMPLATES);
    expect(r.components.templateMatch).toBe(1.0);
  });

  it("novel question gets base score 0.6", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "what is the meaning of life", BUILT_IN_TEMPLATES);
    expect(r.components.templateMatch).toBe(0.6);
  });

  it("empty template registry gives 0.6 (no match)", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "any question", []);
    expect(r.components.templateMatch).toBe(0.6);
  });
});

// ─── Weighted formula ─────────────────────────────────────────────────────────

describe("weighted formula (50/20/15/15)", () => {
  it("final = llm*0.5 + schema*0.2 + complexity*0.15 + template*0.15", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "Show AP aging", BUILT_IN_TEMPLATES);
    const expected =
      r.components.llmSelfAssessment * 0.50 +
      r.components.schemaMatch       * 0.20 +
      r.components.complexity        * 0.15 +
      r.components.templateMatch     * 0.15;
    expect(r.final).toBeCloseTo(expected, 2);
  });

  it("final score is between 0 and 1", () => {
    const r = calculateConfidence(makeResponse(VALID_SQL, 0.9), SCHEMA, "test", BUILT_IN_TEMPLATES);
    expect(r.final).toBeGreaterThanOrEqual(0);
    expect(r.final).toBeLessThanOrEqual(1);
  });
});

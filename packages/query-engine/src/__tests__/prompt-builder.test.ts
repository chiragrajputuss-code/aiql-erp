import { describe, it, expect } from "vitest";
import { buildPrompt, formatSchemaForPrompt } from "../prompt-builder";
import type { ERPSchema } from "@aiql/schema-intel";

// ─── Minimal test schema ──────────────────────────────────────────────────────

const SCHEMA: ERPSchema = {
  erpType: "FILE_UPLOAD",
  tables: [
    {
      name: "upload_org1_conn1",
      displayName: "GL Ledger",
      category: "ledger",
      columns: [
        { name: "transaction_date", displayName: "Date",    dataType: "date",    nullable: false, isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: true,  isName: false },
        { name: "account_name",     displayName: "Account", dataType: "string",  nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: true  },
        { name: "party_name",       displayName: "Party",   dataType: "string",  nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: true  },
        { name: "debit_amount",     displayName: "Dr",      dataType: "currency",nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: true,  isDate: false, isName: false },
        { name: "credit_amount",    displayName: "Cr",      dataType: "currency",nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: true,  isDate: false, isName: false },
        { name: "description",      displayName: "Narration",dataType: "string", nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: false },
        { name: "cost_centre",      displayName: "Dept",    dataType: "string",  nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: false },
        { name: "voucher_type",     displayName: "Type",    dataType: "string",  nullable: true,  isPrimaryKey: false, isForeignKey: false, isAmount: false, isDate: false, isName: false },
      ],
    },
  ],
  relationships: [],
  accountTypeMap: {
    "Sundry Creditors": "PAYABLE",
    "Sundry Debtors":   "RECEIVABLE",
    "Cash-in-Hand":     "CASH",
    "Indirect Expenses":"EXPENSE",
  },
  dimensions:  ["cost_centre"],
  currency:    { baseCurrency: "INR", isMultiCurrency: false, amountColumns: ["debit_amount","credit_amount"], locale: "en-IN" },
  metadata:    { rowCount: 25 },
  introspectedAt: new Date(),
};

const DICT = {
  vendors:   ["Sharma Enterprises", "Tata Motors Ltd", "Acme Corp Pvt Ltd"],
  customers: ["Infosys Ltd", "Wipro Technologies", "HCL Technologies"],
  employees: [],
};

// ─── formatSchemaForPrompt ────────────────────────────────────────────────────

describe("formatSchemaForPrompt", () => {
  it("includes table name and category", () => {
    const text = formatSchemaForPrompt(SCHEMA);
    expect(text).toContain("upload_org1_conn1");
    expect(text).toContain("ledger");
  });

  it("includes key columns", () => {
    const text = formatSchemaForPrompt(SCHEMA);
    expect(text).toContain("transaction_date");
    expect(text).toContain("debit_amount");
    expect(text).toContain("credit_amount");
    expect(text).toContain("account_name");
  });

  it("includes account type map", () => {
    const text = formatSchemaForPrompt(SCHEMA);
    expect(text).toContain("Sundry Creditors");
    expect(text).toContain("PAYABLE");
  });

  it("includes dimensions", () => {
    const text = formatSchemaForPrompt(SCHEMA);
    expect(text).toContain("cost_centre");
    expect(text).toContain("DIMENSIONS");
  });

  it("stays under 6000 chars for typical schema", () => {
    const text = formatSchemaForPrompt(SCHEMA);
    expect(text.length).toBeLessThanOrEqual(6000);
  });
});

// ─── buildPrompt — English queries ───────────────────────────────────────────

describe("buildPrompt — English queries", () => {
  it("returns systemPrompt, userPrompt, tokenisedQuestion, tokenMap", () => {
    const result = buildPrompt({ schema: SCHEMA, rawQuestion: "Show AP aging by vendor", erpType: "FILE_UPLOAD", dictionary: DICT });
    expect(result.systemPrompt).toBeTruthy();
    expect(result.userPrompt).toBeTruthy();
    expect(result.tokenisedQuestion).toBeTruthy();
    expect(result.tokenMap).toBeInstanceOf(Map);
  });

  it("systemPrompt includes ERP type", () => {
    const { systemPrompt } = buildPrompt({ schema: SCHEMA, rawQuestion: "Show balance", erpType: "TALLY" });
    expect(systemPrompt).toContain("TALLY");
  });

  it("systemPrompt includes SQL dialect", () => {
    const { systemPrompt } = buildPrompt({ schema: SCHEMA, rawQuestion: "Show balance", erpType: "FILE_UPLOAD", sqlDialect: "postgresql" });
    expect(systemPrompt).toContain("POSTGRESQL");
  });

  it("systemPrompt includes Hindi language instruction", () => {
    const { systemPrompt } = buildPrompt({ schema: SCHEMA, rawQuestion: "test", erpType: "FILE_UPLOAD" });
    expect(systemPrompt).toContain("Hinglish");
    expect(systemPrompt).toContain("dikhao=show");
    expect(systemPrompt).toContain("baaki=outstanding");
  });

  it("systemPrompt forbids write operations", () => {
    const { systemPrompt } = buildPrompt({ schema: SCHEMA, rawQuestion: "test", erpType: "FILE_UPLOAD" });
    expect(systemPrompt).toContain("never INSERT");
    expect(systemPrompt).toContain("SELECT");
  });

  it("systemPrompt includes schema text", () => {
    const { systemPrompt } = buildPrompt({ schema: SCHEMA, rawQuestion: "test", erpType: "FILE_UPLOAD" });
    expect(systemPrompt).toContain("SCHEMA:");
    expect(systemPrompt).toContain("transaction_date");
  });

  it("userPrompt contains the (tokenised) question", () => {
    const { userPrompt } = buildPrompt({ schema: SCHEMA, rawQuestion: "Show all vendors", erpType: "FILE_UPLOAD" });
    expect(userPrompt).toContain("Question:");
    expect(userPrompt).toContain("vendor");
  });

  it("vendor names in question are tokenised", () => {
    const { tokenisedQuestion, tokenMap } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "Show outstanding for Sharma Enterprises above ₹5L",
      erpType: "FILE_UPLOAD",
      dictionary: DICT,
    });
    expect(tokenisedQuestion).not.toContain("Sharma Enterprises");
    expect(tokenisedQuestion).toContain("VENDOR_T001");
    expect(tokenMap.get("VENDOR_T001")).toBe("Sharma Enterprises");
  });

  it("amounts in question are tokenised", () => {
    const { tokenisedQuestion } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "Show vendors with balance above ₹1Cr",
      erpType: "FILE_UPLOAD",
      dictionary: DICT,
    });
    expect(tokenisedQuestion).not.toContain("₹1Cr");
    expect(tokenisedQuestion).toContain("AMOUNT_T");
  });
});

// ─── buildPrompt — Hindi/Hinglish queries ────────────────────────────────────

describe("buildPrompt — Hindi/Hinglish preprocessing", () => {
  it("translates 'dikhao' before tokenising", () => {
    const { tokenisedQuestion } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "vendor wise baaki dikhao",
      erpType: "FILE_UPLOAD",
    });
    // After preprocessHinglish: "vendor wise outstanding show"
    // After tokenise: no PII, passes through
    expect(tokenisedQuestion).toContain("outstanding");
    expect(tokenisedQuestion).toContain("show");
    expect(tokenisedQuestion).not.toContain("dikhao");
  });

  it("translates 'baaki' to 'outstanding'", () => {
    const { tokenisedQuestion } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "sabhi vendors ka baaki amount",
      erpType: "FILE_UPLOAD",
    });
    expect(tokenisedQuestion).toContain("outstanding");
    expect(tokenisedQuestion).not.toContain("baaki");
  });

  it("translates 'pichle mahine' to 'last month'", () => {
    const { tokenisedQuestion } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "pichle mahine ka revenue batao",
      erpType: "FILE_UPLOAD",
    });
    expect(tokenisedQuestion).toContain("last");
    expect(tokenisedQuestion).toContain("month");
    expect(tokenisedQuestion).toContain("tell");
  });

  it("preserves entity names (does not translate 'Sharma')", () => {
    const { tokenisedQuestion } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "Sharma Enterprises ka baaki dikhao",
      erpType: "FILE_UPLOAD",
      dictionary: DICT,
    });
    // "Sharma Enterprises" → tokenised (VENDOR_T001), not translated
    expect(tokenisedQuestion).not.toContain("Sharma Enterprises");
    expect(tokenisedQuestion).toContain("VENDOR_T001");
    expect(tokenisedQuestion).toContain("outstanding");
  });

  it("handles full Hinglish AP aging query", () => {
    const { tokenisedQuestion, systemPrompt } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "sabhi vendors ka baaki amount dikhao jo 5 lakh se upar hai",
      erpType: "FILE_UPLOAD",
      dictionary: DICT,
    });
    expect(tokenisedQuestion).toContain("all");
    expect(tokenisedQuestion).toContain("outstanding");
    expect(tokenisedQuestion).toContain("show");
    expect(tokenisedQuestion).toContain("above");
    // System prompt should mention Hindi support
    expect(systemPrompt).toContain("Hindi");
  });

  it("Hindi query with amount — amount is tokenised", () => {
    const { tokenisedQuestion } = buildPrompt({
      schema: SCHEMA,
      rawQuestion: "kitna baaki hai jo ₹10L se upar hai",
      erpType: "FILE_UPLOAD",
    });
    expect(tokenisedQuestion).not.toContain("₹10L");
    expect(tokenisedQuestion).toContain("AMOUNT_T");
    expect(tokenisedQuestion).toContain("how much");
  });
});

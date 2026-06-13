import { describe, it, expect, vi } from "vitest";
import { discoverRelationships }  from "../relationship-mapper";
import { detectCurrencyConfig }   from "../currency-handler";
import { parsePeriod }            from "../period-handler";
import { tallyKnowledge }         from "../erp-knowledge/tally";
import { zohoKnowledge }          from "../erp-knowledge/zoho-books";
import type { RawSchemaData }     from "@aiql/erp-connectors";

// ─── Shared fixture ───────────────────────────────────────────────────────────

const TALLY_RAW: RawSchemaData = {
  erpType: "TALLY",
  tables: [
    {
      name: "ledgers", displayName: "Ledgers", category: "ledger",
      columns: [
        { name: "name",   dataType: "string",  nullable: false, isPrimaryKey: true  },
        { name: "parent", dataType: "string",  nullable: true,  isForeignKey: true,
          references: { table: "groups", column: "name" } },
        { name: "openingBalance", dataType: "currency", nullable: true },
      ],
      sampleData: [
        { name: "Acme Corp",   parent: "Sundry Creditors" },
        { name: "Infosys Ltd", parent: "Sundry Debtors"   },
        { name: "Cash",        parent: "Cash-in-Hand"     },
      ],
    },
    {
      name: "groups", displayName: "Groups", category: "group",
      columns: [
        { name: "name",   dataType: "string", nullable: false, isPrimaryKey: true },
        { name: "parent", dataType: "string", nullable: true  },
      ],
    },
    {
      name: "cost_centres", displayName: "Cost Centres", category: "cost-centre",
      columns: [
        { name: "name",   dataType: "string", nullable: false, isPrimaryKey: true },
        { name: "parent", dataType: "string", nullable: true  },
      ],
    },
    {
      name: "godowns", displayName: "Godowns", category: "godown",
      columns: [
        { name: "name",   dataType: "string", nullable: false, isPrimaryKey: true },
        { name: "parent", dataType: "string", nullable: true  },
      ],
    },
  ],
  relationships: [],
  metadata: { currency: "INR" },
};

// ─── relationship-mapper ──────────────────────────────────────────────────────

describe("discoverRelationships", () => {
  it("discovers explicit FK: ledgers.parent → groups.name", () => {
    const rels = discoverRelationships(TALLY_RAW, tallyKnowledge);
    const fk = rels.find((r) => r.fromTable === "ledgers" && r.toTable === "groups");
    expect(fk).toBeTruthy();
    expect(fk?.implicit).toBeFalsy();
  });

  it("adds implicit Tally cost_centre hierarchy", () => {
    const rels = discoverRelationships(TALLY_RAW, tallyKnowledge);
    const cc = rels.find((r) => r.fromTable === "cost_centres" && r.toTable === "cost_centres");
    expect(cc?.implicit).toBe(true);
    expect(cc?.type).toBe("many-to-one");
  });

  it("adds implicit godown hierarchy", () => {
    const rels = discoverRelationships(TALLY_RAW, tallyKnowledge);
    const g = rels.find((r) => r.fromTable === "godowns" && r.toTable === "godowns");
    expect(g?.implicit).toBe(true);
  });

  it("does not duplicate relationships", () => {
    const rels = discoverRelationships(TALLY_RAW, tallyKnowledge);
    const keys = rels.map((r) => `${r.fromTable}.${r.fromColumn}→${r.toTable}.${r.toColumn}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("skips implicit relationships for missing tables", () => {
    const slim: RawSchemaData = { ...TALLY_RAW, tables: [TALLY_RAW.tables[0], TALLY_RAW.tables[1]] };
    const rels = discoverRelationships(slim, tallyKnowledge);
    // cost_centres and godowns not in slim → their implicit rels should be skipped
    const cc = rels.find((r) => r.fromTable === "cost_centres");
    expect(cc).toBeUndefined();
  });
});

// ─── currency-handler ─────────────────────────────────────────────────────────

describe("detectCurrencyConfig", () => {
  it("detects INR from metadata and sets en-IN locale", () => {
    const cfg = detectCurrencyConfig(TALLY_RAW);
    expect(cfg.baseCurrency).toBe("INR");
    expect(cfg.locale).toBe("en-IN");
  });

  it("defaults to INR when metadata.currency is missing", () => {
    const raw = { ...TALLY_RAW, metadata: {} };
    const cfg = detectCurrencyConfig(raw);
    expect(cfg.baseCurrency).toBe("INR");
  });

  it("collects currency-typed columns as amountColumns", () => {
    const cfg = detectCurrencyConfig(TALLY_RAW);
    expect(cfg.amountColumns.some((c) => c.includes("openingBalance"))).toBe(true);
  });

  it("detects USD schema with en-US locale", () => {
    const usd = { ...TALLY_RAW, metadata: { currency: "USD" } };
    const cfg = detectCurrencyConfig(usd);
    expect(cfg.baseCurrency).toBe("USD");
    expect(cfg.locale).toBe("en-US");
  });

  it("isMultiCurrency=false for single-currency Tally", () => {
    const cfg = detectCurrencyConfig(TALLY_RAW);
    expect(cfg.isMultiCurrency).toBe(false);
  });
});

// ─── period-handler ───────────────────────────────────────────────────────────

// Fix today for deterministic tests: August 15, 2026
const TODAY = new Date(2026, 7, 15); // August 15, 2026

describe("parsePeriod — named months", () => {
  it("parses 'March 2026' as that calendar month", () => {
    const { startDate, endDate } = parsePeriod("March 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(2); // 0-based: March = 2
    expect(startDate.getDate()).toBe(1);
    expect(endDate.getMonth()).toBe(2);
    expect(endDate.getDate()).toBe(31);
  });

  it("parses 'April 2026' as April 1–30", () => {
    const { startDate, endDate } = parsePeriod("April 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(3); // April = 3 (0-based)
    expect(startDate.getDate()).toBe(1);
    expect(endDate.getDate()).toBe(30);
  });

  it("parses 'Jan 2026' (short form) correctly", () => {
    const { startDate } = parsePeriod("Jan 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(0); // January
  });
});

describe("parsePeriod — fiscal year", () => {
  it("parses 'FY 2025-26' as Apr 2025 – Mar 2026", () => {
    const { startDate, endDate } = parsePeriod("FY 2025-26", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2025);
    expect(startDate.getMonth()).toBe(3); // April = 3
    expect(endDate.getFullYear()).toBe(2026);
    expect(endDate.getMonth()).toBe(2); // March = 2
    expect(endDate.getDate()).toBe(31);
  });

  it("parses 'FY 2026-27'", () => {
    const { startDate, endDate } = parsePeriod("FY 2026-27", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2026);
    expect(endDate.getFullYear()).toBe(2027);
  });
});

describe("parsePeriod — fiscal quarters (Indian FY, April start)", () => {
  it("Q1 = April–June", () => {
    const { startDate, endDate } = parsePeriod("Q1 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(3); // April
    expect(endDate.getMonth()).toBe(5);   // June
    expect(endDate.getDate()).toBe(30);
  });

  it("Q2 = July–September", () => {
    const { startDate, endDate } = parsePeriod("Q2 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(6); // July
    expect(endDate.getMonth()).toBe(8);   // September
  });

  it("Q3 = October–December", () => {
    const { startDate, endDate } = parsePeriod("Q3 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(9);  // October
    expect(endDate.getMonth()).toBe(11);   // December
  });

  it("Q4 = January–March (next calendar year)", () => {
    const { startDate, endDate } = parsePeriod("Q4 2026", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2027);
    expect(startDate.getMonth()).toBe(0); // January
    expect(endDate.getMonth()).toBe(2);   // March
  });
});

describe("parsePeriod — relative expressions (TODAY = Aug 15, 2026)", () => {
  it("'this month' = August 2026", () => {
    const { startDate, endDate } = parsePeriod("this month", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(7); // August
    expect(startDate.getFullYear()).toBe(2026);
    expect(endDate.getDate()).toBe(31);
  });

  it("'last month' = July 2026", () => {
    const { startDate } = parsePeriod("last month", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(6); // July
    expect(startDate.getFullYear()).toBe(2026);
  });

  it("'this year' = FY 2026-27 (Apr 2026 – Mar 2027)", () => {
    const { startDate, endDate } = parsePeriod("this year", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(3); // April
    expect(endDate.getFullYear()).toBe(2027);
    expect(endDate.getMonth()).toBe(2);   // March
  });

  it("'last year' = FY 2025-26 (Apr 2025 – Mar 2026)", () => {
    const { startDate, endDate } = parsePeriod("last year", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getFullYear()).toBe(2025);
    expect(startDate.getMonth()).toBe(3); // April
    expect(endDate.getFullYear()).toBe(2026);
    expect(endDate.getMonth()).toBe(2);   // March
  });

  it("'this quarter' = Q2 (July–Sep, since Aug is in Q2)", () => {
    const { startDate, endDate } = parsePeriod("this quarter", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(6); // July
    expect(endDate.getMonth()).toBe(8);   // September
  });

  it("'last quarter' = Q1 (April–June)", () => {
    const { startDate, endDate } = parsePeriod("last quarter", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(3); // April
    expect(endDate.getMonth()).toBe(5);   // June
  });

  it("'YTD' = Apr 1 2026 to today", () => {
    const { startDate, endDate } = parsePeriod("YTD", tallyKnowledge.periodConfig, TODAY);
    expect(startDate.getMonth()).toBe(3); // April
    expect(endDate).toEqual(TODAY);
  });

  it("throws for unrecognised period text", () => {
    expect(() => parsePeriod("random garbage", tallyKnowledge.periodConfig, TODAY)).toThrow();
  });
});

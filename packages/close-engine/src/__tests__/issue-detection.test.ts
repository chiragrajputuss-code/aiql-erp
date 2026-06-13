import { describe, it, expect } from "vitest";
import {
  buildVoucherImbalanceIssue,
  buildDuplicateIssue,
  compareIssues,
  isMaterialFlux,
  toNum,
  isoDateOnly,
  getPriorPeriod,
  bucketAccountsByType,
  estimateCostInr,
  QUESTION_BUDGET_MAX,
  QUESTION_MATERIALITY_INR,
  FLUX_MATERIAL_ABS_THRESHOLD,
} from "../lib/issue-detection";

describe("buildVoucherImbalanceIssue", () => {
  it("returns null when no rows", () => {
    expect(buildVoucherImbalanceIssue([])).toBeNull();
  });

  it("builds critical issue from single mismatched voucher", () => {
    const issue = buildVoucherImbalanceIssue([
      { reference_number: "VCH-001", dr: 100, cr: 99.5, diff: 0.5 },
    ]);
    expect(issue).not.toBeNull();
    expect(issue!.severity).toBe("critical");
    expect(issue!.code).toBe("voucher_imbalance");
    expect(issue!.affectedRows).toBe(1);
    expect(issue!.exposure).toBe(0.5);
    expect(issue!.title).toContain("1 voucher");
  });

  it("aggregates exposure across multiple rows", () => {
    const issue = buildVoucherImbalanceIssue([
      { reference_number: "VCH-001", dr: 100, cr: 99,    diff: 1 },
      { reference_number: "VCH-002", dr: 200, cr: 197,   diff: 3 },
      { reference_number: "VCH-003", dr: 500, cr: 490,   diff: 10 },
    ]);
    expect(issue!.exposure).toBe(14);
    expect(issue!.affectedRows).toBe(3);
    expect(issue!.title).toContain("3 vouchers");
  });

  it("limits examples to 5 rows", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      reference_number: `VCH-${i}`,
      dr: 100, cr: 99, diff: 1,
    }));
    const issue = buildVoucherImbalanceIssue(rows);
    expect(issue!.examples).toHaveLength(5);
    expect(issue!.affectedRows).toBe(10);
  });

  it("handles BigInt-like number coercion", () => {
    const issue = buildVoucherImbalanceIssue([
      { reference_number: "VCH-001", dr: 100, cr: 50, diff: 50 as unknown as number },
    ]);
    expect(issue!.exposure).toBe(50);
  });
});

describe("buildDuplicateIssue", () => {
  it("returns null when no duplicates", () => {
    expect(buildDuplicateIssue([])).toBeNull();
  });

  it("flags critical duplicates with cumulative exposure", () => {
    const issue = buildDuplicateIssue([
      { party: "ABC Ltd", amount: 50000, vch_a: "INV-001", date_a: new Date(), vch_b: "INV-002", date_b: new Date() },
      { party: "XYZ Ltd", amount: 30000, vch_a: "INV-003", date_a: new Date(), vch_b: "INV-004", date_b: new Date() },
    ]);
    expect(issue!.severity).toBe("critical");
    expect(issue!.exposure).toBe(80000);
    expect(issue!.affectedRows).toBe(2);
  });
});

describe("compareIssues", () => {
  const critical = { code: "a", severity: "critical" as const, category: "", title: "", description: "", affectedRows: 1, exposure: 100, examples: [] };
  const review   = { code: "b", severity: "review"   as const, category: "", title: "", description: "", affectedRows: 1, exposure: 1000, examples: [] };
  const info     = { code: "c", severity: "info"     as const, category: "", title: "", description: "", affectedRows: 1, exposure: 10000, examples: [] };
  const critical2 = { ...critical, exposure: 500 };

  it("sorts critical before review before info", () => {
    const sorted = [info, review, critical].sort(compareIssues);
    expect(sorted[0]!.severity).toBe("critical");
    expect(sorted[1]!.severity).toBe("review");
    expect(sorted[2]!.severity).toBe("info");
  });

  it("within same severity, sorts by exposure descending", () => {
    const sorted = [critical, critical2].sort(compareIssues);
    expect(sorted[0]!.exposure).toBe(500);
    expect(sorted[1]!.exposure).toBe(100);
  });

  it("ignores severity comparison when severities match", () => {
    const sorted = [
      { ...info, exposure: 10 },
      { ...info, exposure: 1000 },
    ].sort(compareIssues);
    expect(sorted[0]!.exposure).toBe(1000);
  });
});

describe("isMaterialFlux", () => {
  it("not material if absolute variance below threshold", () => {
    expect(isMaterialFlux(40_000, 100_000)).toBe(false);
  });

  it("not material if variance above abs threshold but below 10% of prior", () => {
    expect(isMaterialFlux(60_000, 10_000_000)).toBe(false); // only 0.6%
  });

  it("material when both abs threshold and 10% threshold are exceeded", () => {
    expect(isMaterialFlux(60_000, 200_000)).toBe(true); // 30%, ₹60K
  });

  it("material when prior is zero and current exceeds abs threshold", () => {
    expect(isMaterialFlux(60_000, 0)).toBe(true);
    expect(isMaterialFlux(40_000, 0)).toBe(false);
  });

  it("uses the FLUX_MATERIAL_ABS_THRESHOLD constant correctly", () => {
    expect(isMaterialFlux(FLUX_MATERIAL_ABS_THRESHOLD - 1, 100_000)).toBe(false);
    expect(isMaterialFlux(FLUX_MATERIAL_ABS_THRESHOLD,     100_000)).toBe(true);
  });

  it("treats negative variance the same as positive", () => {
    expect(isMaterialFlux(-60_000, 200_000)).toBe(true);
  });
});

describe("toNum", () => {
  it("returns numbers as-is", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(3.14)).toBe(3.14);
  });

  it("converts BigInt to number", () => {
    expect(toNum(BigInt(100))).toBe(100);
  });

  it("handles null and undefined as 0", () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
  });

  it("converts numeric strings", () => {
    expect(toNum("123")).toBe(123);
  });

  it("returns 0 for non-numeric strings", () => {
    expect(toNum("not a number")).toBe(0);
  });
});

describe("isoDateOnly", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(isoDateOnly(new Date("2026-04-15T10:30:00Z"))).toBe("2026-04-15");
  });

  it("handles end of month", () => {
    expect(isoDateOnly(new Date("2026-02-28T23:59:59Z"))).toBe("2026-02-28");
  });
});

describe("getPriorPeriod", () => {
  it("computes prior period as same length, immediately before", () => {
    const { start, end } = getPriorPeriod(
      new Date("2026-04-01"),
      new Date("2026-04-30")
    );
    expect(isoDateOnly(end)).toBe("2026-03-31");
    expect(isoDateOnly(start)).toBe("2026-03-02"); // 30 days back
  });

  it("handles single-day period", () => {
    const { start, end } = getPriorPeriod(
      new Date("2026-04-15"),
      new Date("2026-04-15")
    );
    expect(isoDateOnly(end)).toBe("2026-04-14");
    expect(isoDateOnly(start)).toBe("2026-04-14");
  });
});

describe("bucketAccountsByType", () => {
  it("groups account names by financial type", () => {
    const map = new Map([
      ["HDFC Bank A/c",     "BANK"],
      ["Petty Cash",        "CASH"],
      ["Sundry Creditors",  "PAYABLE"],
      ["Sundry Debtors",    "RECEIVABLE"],
      ["CGST Output",       "TAX"],
      ["Stock-in-Hand",     "INVENTORY"],
      ["Sales",             "REVENUE"],         // not bucketed
    ]);
    const buckets = bucketAccountsByType(map);
    expect(buckets.bank).toEqual(["HDFC Bank A/c", "Petty Cash"]);
    expect(buckets.payable).toEqual(["Sundry Creditors"]);
    expect(buckets.receivable).toEqual(["Sundry Debtors"]);
    expect(buckets.tax).toEqual(["CGST Output"]);
    expect(buckets.inventory).toEqual(["Stock-in-Hand"]);
  });

  it("treats CURRENT_LIABILITY as payable", () => {
    const map = new Map([["Advances from Customer", "CURRENT_LIABILITY"]]);
    expect(bucketAccountsByType(map).payable).toContain("Advances from Customer");
  });

  it("returns empty buckets for empty map", () => {
    const buckets = bucketAccountsByType(new Map());
    expect(buckets.bank).toEqual([]);
    expect(buckets.payable).toEqual([]);
  });
});

describe("estimateCostInr", () => {
  it("returns 0 for free Groq model", () => {
    expect(estimateCostInr("groq:llama-3.1-8b-instant", 10_000, 5_000)).toBe(0);
  });

  it("calculates cost for paid Groq model", () => {
    // 10K input × $0.59/M = $0.0059
    // 5K output × $0.79/M = $0.00395
    // Total ≈ $0.00985 × 83 ≈ ₹0.82
    const cost = estimateCostInr("groq:llama-3.3-70b-versatile", 10_000, 5_000);
    expect(cost).toBeGreaterThan(0.5);
    expect(cost).toBeLessThan(1.5);
  });

  it("calculates cost for Claude Haiku", () => {
    // 10K × $0.80/M = $0.008, 5K × $4/M = $0.020, total $0.028 × 83 ≈ ₹2.32
    const cost = estimateCostInr("anthropic:claude-haiku-4-5", 10_000, 5_000);
    expect(cost).toBeGreaterThan(2);
    expect(cost).toBeLessThan(3);
  });

  it("falls back to default rates for unknown provider", () => {
    const cost = estimateCostInr("unknown:model", 1_000, 500);
    expect(cost).toBeGreaterThan(0);
  });
});

describe("budget constants", () => {
  it("has expected materiality threshold", () => {
    expect(QUESTION_MATERIALITY_INR).toBe(10_000);
  });

  it("has expected max questions per review", () => {
    expect(QUESTION_BUDGET_MAX).toBe(3);
  });
});

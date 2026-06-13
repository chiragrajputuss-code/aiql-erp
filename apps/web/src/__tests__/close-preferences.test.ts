import { describe, it, expect } from "vitest";
import { bumpUsage, updateRecurringPatterns } from "@/lib/close-preferences";

describe("bumpUsage", () => {
  it("starts at 1 when no prior counts", () => {
    expect(bumpUsage(null, "STANDARD")).toBe('{"STANDARD":1}');
  });

  it("increments existing count for the same profile", () => {
    const out = bumpUsage('{"STANDARD":3}', "STANDARD");
    expect(JSON.parse(out)).toEqual({ STANDARD: 4 });
  });

  it("preserves counts for other profiles", () => {
    const out = bumpUsage('{"STANDARD":3,"QUICK":1}', "ADAPTIVE");
    expect(JSON.parse(out)).toEqual({ STANDARD: 3, QUICK: 1, ADAPTIVE: 1 });
  });

  it("recovers from malformed JSON", () => {
    const out = bumpUsage("not json", "QUICK");
    expect(JSON.parse(out)).toEqual({ QUICK: 1 });
  });

  it("recovers from empty string", () => {
    const out = bumpUsage("", "YEAR_END");
    expect(JSON.parse(out)).toEqual({ YEAR_END: 1 });
  });
});

describe("updateRecurringPatterns", () => {
  const T0 = "2026-04-01T00:00:00.000Z";
  const T1 = "2026-05-01T00:00:00.000Z";
  const T2 = "2026-06-01T00:00:00.000Z";

  it("creates new patterns from watch items on first close", () => {
    const out = updateRecurringPatterns(null, ["salary advance", "bonus payable"], T0);
    const parsed = JSON.parse(out) as Array<{ pattern: string; count: number }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.map((p) => p.pattern).sort()).toEqual(["bonus payable", "salary advance"]);
    expect(parsed.every((p) => p.count === 1)).toBe(true);
  });

  it("increments count for items seen again", () => {
    const round1 = updateRecurringPatterns(null, ["salary advance"], T0);
    const round2 = updateRecurringPatterns(round1, ["salary advance"], T1);
    const parsed = JSON.parse(round2) as Array<{ pattern: string; count: number; lastSeenAt: string }>;
    expect(parsed[0]?.count).toBe(2);
    expect(parsed[0]?.lastSeenAt).toBe(T1);
  });

  it("preserves untouched items from prior closes", () => {
    const round1 = updateRecurringPatterns(null, ["a", "b"], T0);
    const round2 = updateRecurringPatterns(round1, ["a"], T1);
    const parsed = JSON.parse(round2) as Array<{ pattern: string; count: number }>;
    expect(parsed.map((p) => p.pattern).sort()).toEqual(["a", "b"]);
    expect(parsed.find((p) => p.pattern === "a")?.count).toBe(2);
    expect(parsed.find((p) => p.pattern === "b")?.count).toBe(1);
  });

  it("dedupes case-insensitively", () => {
    const round1 = updateRecurringPatterns(null, ["Salary Advance"], T0);
    const round2 = updateRecurringPatterns(round1, ["salary advance"], T1);
    const parsed = JSON.parse(round2) as Array<{ pattern: string; count: number }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.count).toBe(2);
  });

  it("ignores empty / whitespace-only items", () => {
    const out = updateRecurringPatterns(null, ["", "   ", "real item"], T0);
    const parsed = JSON.parse(out) as Array<{ pattern: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.pattern).toBe("real item");
  });

  it("sorts by count desc then by recency", () => {
    const r1 = updateRecurringPatterns(null, ["x"], T0);                     // x: 1, T0
    const r2 = updateRecurringPatterns(r1,   ["x", "y"], T1);                // x: 2, T1; y: 1, T1
    const r3 = updateRecurringPatterns(r2,   ["x", "y", "z"], T2);           // x: 3, T2; y: 2, T2; z: 1, T2
    const parsed = JSON.parse(r3) as Array<{ pattern: string }>;
    expect(parsed.map((p) => p.pattern)).toEqual(["x", "y", "z"]);
  });

  it("caps stored entries at 50", () => {
    const items = Array.from({ length: 75 }, (_, i) => `item-${i}`);
    const out = updateRecurringPatterns(null, items, T0);
    const parsed = JSON.parse(out) as Array<unknown>;
    expect(parsed.length).toBe(50);
  });

  it("recovers from malformed prior JSON", () => {
    const out = updateRecurringPatterns("not valid json", ["fresh"], T0);
    const parsed = JSON.parse(out) as Array<{ pattern: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.pattern).toBe("fresh");
  });

  it("filters out malformed entries from prior JSON", () => {
    const broken = JSON.stringify([
      { pattern: "valid", count: 2, lastSeenAt: T0 },
      { pattern: "missing-count" },
      "not an object",
      null,
    ]);
    const out = updateRecurringPatterns(broken, ["new"], T1);
    const parsed = JSON.parse(out) as Array<{ pattern: string; count: number }>;
    expect(parsed.map((p) => p.pattern).sort()).toEqual(["new", "valid"]);
  });

  it("count ≥ 2 threshold is meaningful for downstream filtering", () => {
    // The point: after just one close the count is 1 (not promoted),
    // but after two closes with the same item, count is 2 (eligible).
    const r1 = updateRecurringPatterns(null, ["depreciation"], T0);
    const parsedRound1 = JSON.parse(r1) as Array<{ count: number }>;
    expect(parsedRound1[0]?.count).toBe(1);   // not yet recurring

    const r2 = updateRecurringPatterns(r1, ["depreciation"], T1);
    const parsedRound2 = JSON.parse(r2) as Array<{ count: number }>;
    expect(parsedRound2[0]?.count).toBe(2);   // now recurring
  });
});

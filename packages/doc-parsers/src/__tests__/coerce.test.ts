import { describe, it, expect } from "vitest";
import { parseNum, parseIndianDate } from "../coerce";

const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

describe("parseNum — real-world Indian amount strings", () => {
  it("handles rupee symbol + Indian grouping", () => {
    expect(parseNum("₹1,05,020.00")).toBe(105020);
    expect(parseNum("Rs 1,05,020")).toBe(105020);
    expect(parseNum("1,05,020")).toBe(105020);
  });
  it("handles Tally Dr/Cr suffixes", () => {
    expect(parseNum("1,05,020.00 Dr")).toBe(105020);
    expect(parseNum("68000 Cr")).toBe(68000);
  });
  it("handles accounting-negative parentheses", () => {
    expect(parseNum("(5,000)")).toBe(-5000);
    expect(parseNum("(₹5,000.50)")).toBe(-5000.5);
  });
  it("passes through clean values and numbers", () => {
    expect(parseNum(68000)).toBe(68000);
    expect(parseNum("68000")).toBe(68000);
    expect(parseNum("89000.00")).toBe(89000);
  });
  it("returns 0 for blank / garbage", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum(null)).toBe(0);
    expect(parseNum("N/A")).toBe(0);
    expect(parseNum("1.05.020")).toBe(0); // ambiguous → refuse
  });
});

describe("parseIndianDate — day-first + Tally formats", () => {
  it("reads Indian dd/mm/yyyy as DAY-first (not US month-first)", () => {
    expect(iso(parseIndianDate("07/05/2026"))).toBe("2026-05-07"); // 7 May, not 5 Jul
    expect(iso(parseIndianDate("22-05-2026"))).toBe("2026-05-22");
  });
  it("reads Tally alphabetic d-Mon-yyyy / yy", () => {
    expect(iso(parseIndianDate("1-Apr-2026"))).toBe("2026-04-01"); // not 31 Mar
    expect(iso(parseIndianDate("1-Apr-26"))).toBe("2026-04-01");
    expect(iso(parseIndianDate("15 Aug 2026"))).toBe("2026-08-15");
  });
  it("keeps ISO stable with no timezone shift", () => {
    expect(iso(parseIndianDate("2026-05-07"))).toBe("2026-05-07");
    expect(iso(parseIndianDate("2026-05-07T00:00:00Z"))).toBe("2026-05-07");
  });
  it("rejects impossible dates and garbage rather than guessing", () => {
    expect(parseIndianDate("31-02-2026")).toBeNull(); // 31 Feb
    expect(parseIndianDate("hello")).toBeNull();
    expect(parseIndianDate("")).toBeNull();
  });
});

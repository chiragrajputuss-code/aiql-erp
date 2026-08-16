import { describe, it, expect } from "vitest";
import { parseGstr2B } from "../gstr-2b/parser";
import { buildFilingProfiles, lookupProfile, isLikelyLateNotMissing } from "../gstr-2b/filing-behaviour";

// Minimal 2B record in GSTN JSON-ish flat shape, with the supplier filing date.
function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ctin: "27AABCU9603R1ZX",
    trdnm: "Mahalaxmi Steel",
    inum: "MSRM/26/0412",
    idt: "04-05-2026",
    val: "105020",
    txval: "89000",
    igst: "16020",
    itcavl: "Y",
    supfildt: "09-05-2026",   // filed on the 9th — on time
    supprd: "042026",
    ...over,
  };
}

describe("GSTR-2B parser extracts supplier filing date/period", () => {
  it("reads supfildt and supprd (previously discarded)", () => {
    const [row] = parseGstr2B([rec()]);
    expect(row.supplierFiledDate).toBeInstanceOf(Date);
    expect(row.supplierFiledDate?.getDate()).toBe(9);
    expect(row.supplierFiledDate?.getMonth()).toBe(4); // May
    expect(row.supplierFiledPeriod).toBe("042026");
  });

  it("tolerates records with no filing date", () => {
    const [row] = parseGstr2B([rec({ supfildt: "", supprd: "" })]);
    expect(row.supplierFiledDate).toBeNull();
    expect(row.supplierFiledPeriod).toBeNull();
  });
});

describe("Supplier filing behaviour profiles", () => {
  it("classifies a habitual late filer (files after the 11th every period)", () => {
    const rows = parseGstr2B([
      rec({ inum: "A-1", supfildt: "17-03-2026", supprd: "022026" }),
      rec({ inum: "A-2", supfildt: "16-04-2026", supprd: "032026" }),
      rec({ inum: "A-3", supfildt: "18-05-2026", supprd: "042026" }),
    ]);
    const profiles = buildFilingProfiles(rows);
    const p = lookupProfile(profiles, "27AABCU9603R1ZX", null);
    expect(p).not.toBeNull();
    expect(p!.pattern).toBe("habitual_late");
    expect(p!.lateCount).toBe(3);
    expect(p!.observations).toBe(3);
    expect(isLikelyLateNotMissing(p)).toBe(true);
    // The summary is what a CA reads — it must not accuse, only describe.
    expect(p!.summary).toContain("3 of the last 3");
    expect(p!.summary).toContain("later GSTR-2B");
  });

  it("classifies an on-time filer", () => {
    const rows = parseGstr2B([
      rec({ inum: "B-1", supfildt: "08-03-2026" }),
      rec({ inum: "B-2", supfildt: "10-04-2026" }),
    ]);
    const p = lookupProfile(buildFilingProfiles(rows), "27AABCU9603R1ZX", null);
    expect(p!.pattern).toBe("on_time");
    expect(p!.lateCount).toBe(0);
    expect(isLikelyLateNotMissing(p)).toBe(false);
  });

  it("classifies erratic filing separately from habitual lateness", () => {
    const rows = parseGstr2B([
      rec({ inum: "C-1", supfildt: "08-03-2026" }),
      rec({ inum: "C-2", supfildt: "09-04-2026" }),
      rec({ inum: "C-3", supfildt: "19-05-2026" }),
    ]);
    const p = lookupProfile(buildFilingProfiles(rows), "27AABCU9603R1ZX", null);
    expect(p!.pattern).toBe("erratic");
    expect(isLikelyLateNotMissing(p)).toBe(false);
  });

  it("refuses to judge on a single observation", () => {
    const rows = parseGstr2B([rec({ supfildt: "19-05-2026" })]);
    const p = lookupProfile(buildFilingProfiles(rows), "27AABCU9603R1ZX", null);
    expect(p!.pattern).toBe("unknown");
    expect(isLikelyLateNotMissing(p)).toBe(false);
  });

  it("separates suppliers by GSTIN", () => {
    const rows = parseGstr2B([
      rec({ ctin: "27AAAAA0000A1Z5", trdnm: "Alpha", supfildt: "05-03-2026" }),
      rec({ ctin: "27AAAAA0000A1Z5", trdnm: "Alpha", supfildt: "07-04-2026" }),
      rec({ ctin: "29BBBBB1111B2Z6", trdnm: "Beta",  supfildt: "18-03-2026" }),
      rec({ ctin: "29BBBBB1111B2Z6", trdnm: "Beta",  supfildt: "20-04-2026" }),
    ]);
    const profiles = buildFilingProfiles(rows);
    expect(lookupProfile(profiles, "27AAAAA0000A1Z5", null)!.pattern).toBe("on_time");
    expect(lookupProfile(profiles, "29BBBBB1111B2Z6", null)!.pattern).toBe("habitual_late");
  });
});

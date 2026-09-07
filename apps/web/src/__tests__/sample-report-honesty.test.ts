import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_REPORT, ROADMAP, ANALYSIS_STEPS } from "@/lib/investigations/sample-report";

// The public /sample-report page is the main thing we ask a prospect to look at
// before signing up, and it is hand-written demo data — nothing stops it from
// advertising an investigation we haven't built. It has drifted before: it once
// showed nine findings (receivables, TDS, vendor concentration, margin bridge…)
// when the engine only produced GST/ITC and duplicate-payment ones.
//
// This test ties the demo back to the engine: every finding shown must carry a
// code some investigation actually emits. Anything we can't produce belongs in
// ROADMAP, which the page renders as "still being built".

const INVESTIGATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/investigation-engine/src/investigations",
);

/** Every `code: "…"` literal across the shipped investigation files. */
function emittedCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of fs.readdirSync(INVESTIGATIONS_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const src = fs.readFileSync(path.join(INVESTIGATIONS_DIR, file), "utf8");
    for (const m of src.matchAll(/\bcode:\s*(?:[^,\n]*\?\s*)?"([A-Z0-9-]+)"(?:\s*:\s*"([A-Z0-9-]+)")?/g)) {
      if (m[1]) codes.add(m[1]);
      if (m[2]) codes.add(m[2]);   // ternary form: code: cond ? "A" : "B"
    }
  }
  return codes;
}

describe("sample report only advertises what the engine can produce", () => {
  it("reads at least the two investigations we know ship today", () => {
    const codes = emittedCodes();
    // Guards the regex itself — if this ever goes empty the test below would
    // pass vacuously in the wrong direction (it would fail loudly, but this
    // gives the clearer message).
    expect(codes.has("GST-ITC-002")).toBe(true);
    expect(codes.has("DUP-PAY-001")).toBe(true);
  });

  it("every sample finding carries a code a real investigation emits", () => {
    const codes = emittedCodes();
    const invented = SAMPLE_REPORT.findings
      .map((f) => f.code)
      .filter((c) => !codes.has(c));
    expect(invented).toEqual([]);
  });

  it("headline counts and total are derived from the findings, not hand-typed", () => {
    const f = SAMPLE_REPORT.findings;
    expect(SAMPLE_REPORT.criticalCount).toBe(f.filter((x) => x.severity === "critical").length);
    expect(SAMPLE_REPORT.warningCount).toBe(f.filter((x) => x.severity === "warning").length);
    expect(SAMPLE_REPORT.opportunityCount).toBe(f.filter((x) => x.severity === "opportunity").length);
    expect(SAMPLE_REPORT.totalImpactRs).toBe(f.reduce((s, x) => s + (x.impactRs ?? 0), 0));
  });

  it("each finding's evidence adds up to the impact it claims", () => {
    for (const f of SAMPLE_REPORT.findings) {
      if (f.impactRs === null || f.impactRs === 0) continue;
      const evidenced = f.evidence.reduce((s, e) => s + (e.amountRs ?? 0), 0);
      expect(evidenced, `${f.code} claims ₹${f.impactRs} but its evidence totals ₹${evidenced}`)
        .toBe(f.impactRs);
    }
  });

  it("roadmap items are described, never quantified", () => {
    expect(ROADMAP.length).toBeGreaterThan(0);
    for (const item of ROADMAP) {
      // A rupee figure next to something we haven't built reads as a result.
      expect(item.willFind, `roadmap item "${item.title}" quotes a ₹ figure`).not.toMatch(/₹/);
      expect(item.businessQuestion.trim().endsWith("?")).toBe(true);
    }
  });

  it("no analysis step claims a check we don't run", () => {
    // The animated steps are the first thing a visitor reads, and they used to
    // narrate receivables aging and TDS checks that don't exist.
    const banned = /receivab|aging|TDS|concentration|margin|discount|expense trend/i;
    for (const s of ANALYSIS_STEPS) {
      // The result chip counts too — "1 short TDS deduction" next to an
      // honest label is still a claim we can't back.
      expect(`${s.label} ${s.detail} ${s.result}`, `analysis step "${s.label}" describes an unbuilt check`)
        .not.toMatch(banned);
    }
  });
});

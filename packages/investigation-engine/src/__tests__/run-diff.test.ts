import { describe, it, expect } from "vitest";
import { diffRuns, computeMatchKey } from "../run-diff";
import type { Finding, Evidence } from "../types";

function evidence(refs: string[], amountRs: number | null = null): Evidence {
  return { source: "gl_vs_gstr2b", description: "", query: "", rows: [], amountRs, confidence: 1, references: refs };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    code: "GST-ITC-002", category: "compliance", severity: "critical",
    title: "not filed", impactRs: 10000,
    businessQuestion: "q", evidence: [evidence(["Mehta Steel Industries", "MSRM/26/0412"])],
    recommendation: { action: "a", owner: "o", priority: "today", expectedBenefit: "b", deadline: null },
    verificationSteps: [], conclusion: "c", resolvesWhen: "r", status: "open",
    ...over,
  };
}

describe("computeMatchKey", () => {
  it("is deterministic — same finding, same key, across repeated calls", () => {
    const f = finding();
    expect(computeMatchKey(f)).toBe(computeMatchKey(f));
  });

  it("is stable across evidence reference reordering", () => {
    const a = finding({ evidence: [evidence(["Alpha", "INV-001"])] });
    const b = finding({ evidence: [evidence(["INV-001", "Alpha"])] });
    expect(computeMatchKey(a)).toBe(computeMatchKey(b));
  });

  it("does NOT collide two genuinely different invoices", () => {
    const a = finding({ evidence: [evidence(["Alpha Traders", "INV-001"])] });
    const b = finding({ evidence: [evidence(["Beta Traders", "INV-002"])] });
    expect(computeMatchKey(a)).not.toBe(computeMatchKey(b));
  });

  it("does NOT collide two different finding codes referencing the same invoice", () => {
    const a = finding({ code: "GST-ITC-002", evidence: [evidence(["Alpha Traders", "INV-001"])] });
    const b = finding({ code: "DUP-PAY-001", evidence: [evidence(["Alpha Traders", "INV-001"])] });
    expect(computeMatchKey(a)).not.toBe(computeMatchKey(b));
  });

  it("absorbs format-only differences via normalizeInvoiceNo (same invoice, different punctuation)", () => {
    const a = finding({ evidence: [evidence(["Mehta Steel Industries", "MSRM-26-412"])] });
    const b = finding({ evidence: [evidence(["Mehta Steel Industries", "MSRM/26/0412"])] });
    expect(computeMatchKey(a)).toBe(computeMatchKey(b));
  });

  it("returns null when there is nothing to key on", () => {
    const f = finding({ evidence: [evidence([])] });
    expect(computeMatchKey(f)).toBeNull();
  });
});

describe("diffRuns", () => {
  it("marks everything NEW on a client's first run (empty prior)", () => {
    const diff = diffRuns([finding()], [], "05-2026");
    expect(diff.counts).toEqual({ new: 1, carried: 0, resolved: 0 });
    expect(diff.findings[0].changeStatus).toBe("new");
    expect(diff.findings[0].firstSeenPeriod).toBe("05-2026");
    expect(diff.resolved).toEqual([]);
  });

  it("marks a finding CARRIED when it matches a prior finding, preserving firstSeenPeriod", () => {
    const f = finding();
    const key = computeMatchKey(f)!;
    const diff = diffRuns([f], [{ matchKey: key, code: f.code, impactRs: 10000, firstSeenPeriod: "03-2026" }], "05-2026");
    expect(diff.counts).toEqual({ new: 0, carried: 1, resolved: 0 });
    expect(diff.findings[0].changeStatus).toBe("carried");
    expect(diff.findings[0].firstSeenPeriod).toBe("03-2026"); // NOT overwritten to the current period
  });

  it("stays CARRIED when the amount changed, and reports the CURRENT amount", () => {
    const f = finding({ impactRs: 25000 }); // amount went up since last month
    const key = computeMatchKey(f)!;
    const diff = diffRuns([f], [{ matchKey: key, code: f.code, impactRs: 10000, firstSeenPeriod: "03-2026" }], "05-2026");
    expect(diff.findings[0].changeStatus).toBe("carried");
    expect(diff.findings[0].impactRs).toBe(25000);
  });

  it("marks a prior finding RESOLVED when it no longer appears, and excludes it from findings[]", () => {
    const prior = [{ matchKey: "GST-ITC-002:abc123", code: "GST-ITC-002", impactRs: 15000, firstSeenPeriod: "03-2026" }];
    const diff = diffRuns([], prior, "05-2026"); // the issue is gone this run
    expect(diff.counts).toEqual({ new: 0, carried: 0, resolved: 1 });
    expect(diff.resolved).toEqual([{ matchKey: "GST-ITC-002:abc123", code: "GST-ITC-002", impactRs: 15000 }]);
    expect(diff.resolvedRs).toBe(15000);
    expect(diff.findings).toEqual([]);
  });

  it("handles a mix of new, carried and resolved in one run", () => {
    const carriedF = finding({ code: "GST-ITC-002", evidence: [evidence(["Alpha", "INV-001"])] });
    const newF     = finding({ code: "GST-ITC-002", evidence: [evidence(["Gamma", "INV-003"])], impactRs: 5000 });
    const carriedKey = computeMatchKey(carriedF)!;

    const prior = [
      { matchKey: carriedKey, code: "GST-ITC-002", impactRs: 10000, firstSeenPeriod: "03-2026" },
      { matchKey: "GST-ITC-002:resolved-one", code: "GST-ITC-002", impactRs: 8000, firstSeenPeriod: "04-2026" },
    ];
    const diff = diffRuns([carriedF, newF], prior, "05-2026");

    expect(diff.counts).toEqual({ new: 1, carried: 1, resolved: 1 });
    expect(diff.resolvedRs).toBe(8000);
  });

  it("never resolves or matches a prior finding with a null matchKey (unmatchable legacy row)", () => {
    const prior = [{ matchKey: null, code: "GST-ITC-002", impactRs: 5000, firstSeenPeriod: null }];
    const diff = diffRuns([finding()], prior, "05-2026");
    // The current finding can't match a null-key prior row -> it's "new".
    expect(diff.findings[0].changeStatus).toBe("new");
    // The null-key prior row is never reported as resolved either -> we
    // genuinely don't know, so we don't claim to.
    expect(diff.resolved).toEqual([]);
  });

  it("is deterministic: running the same diff twice yields identical output", () => {
    const f = finding();
    const key = computeMatchKey(f)!;
    const prior = [{ matchKey: key, code: f.code, impactRs: 10000, firstSeenPeriod: "03-2026" }];
    const d1 = diffRuns([f], prior, "05-2026");
    const d2 = diffRuns([f], prior, "05-2026");
    expect(d1.counts).toEqual(d2.counts);
    expect(d1.findings[0].matchKey).toBe(d2.findings[0].matchKey);
  });
});

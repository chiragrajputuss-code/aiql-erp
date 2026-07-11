import { describe, it, expect } from "vitest";
import { computeProactiveObservation, narrateObservation } from "../proactive";
import { buildBoardBrief, narrateBoardSummary } from "../board-brief";
import type { Finding, FindingSeverity, InvestigationCategory, Priority } from "../types";

// ─── Finding builder ──────────────────────────────────────────────────────────

function finding(over: Partial<Finding> & { code: string }): Finding {
  return {
    code:             over.code,
    category:         (over.category ?? "compliance") as InvestigationCategory,
    severity:         (over.severity ?? "warning") as FindingSeverity,
    title:            over.title ?? `Finding ${over.code}`,
    impactRs:         over.impactRs ?? 0,
    businessQuestion: over.businessQuestion ?? "Q?",
    evidence:         over.evidence ?? [],
    recommendation:   over.recommendation ?? { action: `Act on ${over.code}`, owner: "Finance Manager", priority: "this_week" as Priority, expectedBenefit: "benefit", deadline: null },
    verificationSteps: over.verificationSteps ?? ["verify"],
    conclusion:       over.conclusion ?? "conclusion",
    resolvesWhen:     over.resolvesWhen ?? "resolved",
    status:           "open",
  };
}

function ev(refs: string[]) {
  return [{ source: "test", description: "d", query: "q", rows: [], amountRs: null, confidence: 1, references: refs }];
}

// ─── Proactive observation ────────────────────────────────────────────────────

describe("computeProactiveObservation", () => {
  it("returns null with fewer than 2 findings", () => {
    expect(computeProactiveObservation([finding({ code: "A" })])).toBeNull();
  });

  it("picks the same-party correlation across findings (Rule 1)", () => {
    const fs = [
      finding({ code: "GST-ITC-002", severity: "critical", impactRs: 15000, evidence: ev(["INV-1", "Mehta Steel Industries"]) }),
      finding({ code: "GST-ITC-005", severity: "info", impactRs: 0, evidence: ev(["INV-9", "Mehta Steel Industries"]) }),
    ];
    const obs = computeProactiveObservation(fs);
    expect(obs?.kind).toBe("correlation");
    expect(obs?.title).toContain("Mehta Steel Industries");
    expect(obs?.relatedCodes).toEqual(["GST-ITC-002", "GST-ITC-005"]);
  });

  it("surfaces an overlooked opportunity when criticals are present (Rule 2)", () => {
    const fs = [
      finding({ code: "C1", severity: "critical", impactRs: 50000, evidence: ev(["INV-1"]) }),
      finding({ code: "O1", severity: "opportunity", impactRs: 25000, title: "₹25,000 unclaimed ITC", evidence: ev(["INV-2"]) }),
    ];
    const obs = computeProactiveObservation(fs);
    expect(obs?.kind).toBe("opportunity");
    expect(obs?.relatedCodes).toEqual(["O1"]);
    expect(obs?.impactRs).toBe(25000);
  });

  it("flags single-party risk concentration (Rule 3)", () => {
    const fs = [
      finding({ code: "R1", severity: "critical", impactRs: 90000, evidence: ev(["Bright Tools Hardware"]) }),
      finding({ code: "R2", severity: "warning",  impactRs: 5000,  evidence: ev(["Small Vendor Co"]) }),
    ];
    const obs = computeProactiveObservation(fs);
    expect(obs?.kind).toBe("concentration");
    expect(obs?.title).toContain("Bright Tools Hardware");
  });

  it("narration falls back to deterministic text when no llmFn", async () => {
    const obs = computeProactiveObservation([
      finding({ code: "C1", severity: "critical", impactRs: 50000, evidence: ev(["INV-1"]) }),
      finding({ code: "O1", severity: "opportunity", impactRs: 25000, evidence: ev(["INV-2"]) }),
    ]);
    const narrated = await narrateObservation(obs);
    expect(narrated?.narrated).toBeTruthy();
    expect(narrated?.narrated).toContain("also noticed");
  });
});

// ─── Board brief ──────────────────────────────────────────────────────────────

describe("buildBoardBrief", () => {
  const fs = [
    finding({ code: "R1", severity: "critical", impactRs: 80000, category: "compliance", recommendation: { action: "Do R1 now", owner: "FM", priority: "today", expectedBenefit: "protect ₹80k", deadline: null } }),
    finding({ code: "R2", severity: "warning", impactRs: 40000, category: "financial_health", recommendation: { action: "Do R2", owner: "FM", priority: "this_month", expectedBenefit: "cash", deadline: null } }),
    finding({ code: "O1", severity: "opportunity", impactRs: 25000, category: "opportunity", recommendation: { action: "Claim O1", owner: "Acct", priority: "this_week", expectedBenefit: "recover ₹25k", deadline: null } }),
  ];

  it("buckets findings into risks / opportunities / cash and totals ₹", () => {
    const b = buildBoardBrief(fs, { period: "05-2026", healthScore: 60 });
    expect(b.risks.map((r) => r.code)).toEqual(["R1", "R2"]); // ₹ desc
    expect(b.opportunities.map((o) => o.code)).toEqual(["O1"]);
    expect(b.cashAndWorkingCapital.map((c) => c.code)).toEqual(["R2"]); // financial_health
    expect(b.headline.totalAtRiskRs).toBe(120000);
    expect(b.headline.totalOpportunityRs).toBe(25000);
  });

  it("orders recommended decisions by priority (today first)", () => {
    const b = buildBoardBrief(fs, { period: "05-2026", healthScore: 60 });
    expect(b.recommendedDecisions[0].priority).toBe("today");
    expect(b.recommendedDecisions[0].action).toBe("Do R1 now");
  });

  it("produces a non-empty deterministic summary without llmFn", async () => {
    const b = await narrateBoardSummary(buildBoardBrief(fs, { period: "05-2026", healthScore: 60 }));
    expect(b.narratedSummary.length).toBeGreaterThan(0);
    expect(b.narratedSummary).toContain("05-2026");
  });
});

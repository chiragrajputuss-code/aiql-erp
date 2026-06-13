import { describe, it, expect } from "vitest";
import {
  scoreDataIntegrity,
  scorePeriodScope,
  scoreReconciliation,
  scoreCompliance,
  scoreVarianceAnalysis,
  scoreWorkflowProgress,
  evaluateHardGates,
} from "../readiness-scorer";

// Minimal helpers to construct scan results
const emptyScan = {
  totalIssues: 0,
  bySeverity: { critical: 0, review: 0, info: 0 },
  totalExposure: 0,
  issues: [] as Array<{ code: string; severity: string; affectedRows: number; exposure: number | null }>,
};

const issue = (code: string, severity: string, affectedRows: number, exposure: number | null = null) =>
  ({ code, severity, affectedRows, exposure });

describe("scoreDataIntegrity", () => {
  it("returns full score on clean scan", () => {
    const dim = scoreDataIntegrity(emptyScan);
    expect(dim.score).toBe(100);
    expect(dim.issues).toHaveLength(0);
  });

  it("deducts 10 per critical (capped at 40)", () => {
    const scan = { ...emptyScan, bySeverity: { critical: 2, review: 0, info: 0 } };
    expect(scoreDataIntegrity(scan).score).toBe(80);
  });

  it("caps critical penalty at 40 points", () => {
    const scan = { ...emptyScan, bySeverity: { critical: 10, review: 0, info: 0 } };
    expect(scoreDataIntegrity(scan).score).toBe(60);  // 100 - 40 cap
  });

  it("deducts 3 per review-level (capped at 15)", () => {
    const scan = { ...emptyScan, bySeverity: { critical: 0, review: 3, info: 0 } };
    expect(scoreDataIntegrity(scan).score).toBe(91);
  });

  it("returns 50 with note when no scan ran", () => {
    const dim = scoreDataIntegrity(null);
    expect(dim.score).toBe(50);
    expect(dim.issues).toContain("No data quality scan run yet");
  });

  it("never returns negative score", () => {
    const scan = { ...emptyScan, bySeverity: { critical: 100, review: 100, info: 0 } };
    expect(scoreDataIntegrity(scan).score).toBeGreaterThanOrEqual(0);
  });
});

describe("scorePeriodScope", () => {
  it("returns 70 with note when no scan", () => {
    expect(scorePeriodScope(null).score).toBe(70);
  });

  it("returns full score on clean scan", () => {
    expect(scorePeriodScope(emptyScan).score).toBe(100);
  });

  it("deducts for date outliers", () => {
    const scan = { ...emptyScan, issues: [issue("date_outliers", "review", 10)] };
    expect(scorePeriodScope(scan).score).toBe(80); // 100 - (10*2)=20
  });

  it("deducts for missing fields", () => {
    const scan = { ...emptyScan, issues: [issue("missing_fields", "critical", 5)] };
    expect(scorePeriodScope(scan).score).toBe(95); // 100 - 5
  });
});

describe("scoreReconciliation", () => {
  it("returns 50 when no recons defined", () => {
    expect(scoreReconciliation({ passed: 0, failed: 0, pending: 0, total: 0 }).score).toBe(50);
  });

  it("returns 100 when all passed", () => {
    expect(scoreReconciliation({ passed: 5, failed: 0, pending: 0, total: 5 }).score).toBe(100);
  });

  it("returns 0 when all failed", () => {
    expect(scoreReconciliation({ passed: 0, failed: 5, pending: 0, total: 5 }).score).toBe(0);
  });

  it("partial pass counts proportionally", () => {
    const dim = scoreReconciliation({ passed: 3, failed: 2, pending: 0, total: 5 });
    expect(dim.score).toBe(48); // (60% passed) - (40% × 30%) = 60 - 12 = 48
  });

  it("includes failure issues in summary", () => {
    const dim = scoreReconciliation({ passed: 1, failed: 1, pending: 1, total: 3 });
    expect(dim.issues).toContain("1 reconciliation failed");
    expect(dim.issues).toContain("1 reconciliation not yet run");
  });
});

describe("scoreCompliance", () => {
  it("clean scan returns 100", () => {
    expect(scoreCompliance(emptyScan).score).toBe(100);
  });

  it("deducts for GST mismatches", () => {
    const scan = { ...emptyScan, issues: [issue("gst_mismatch", "review", 3)] };
    expect(scoreCompliance(scan).score).toBe(85); // 100 - (3*5)
  });

  it("caps GST penalty at 40", () => {
    const scan = { ...emptyScan, issues: [issue("gst_mismatch", "review", 50)] };
    expect(scoreCompliance(scan).score).toBe(60);
  });

  it("deducts for sign anomalies", () => {
    const scan = { ...emptyScan, issues: [issue("sign_anomalies", "review", 2)] };
    expect(scoreCompliance(scan).score).toBe(90); // 100 - 10
  });

  it("returns 80 when no scan", () => {
    expect(scoreCompliance(null).score).toBe(80);
  });
});

describe("scoreVarianceAnalysis", () => {
  it("returns 40 when flux not run", () => {
    expect(scoreVarianceAnalysis({ run: false, materialCount: 0, explainedCount: 0 }).score).toBe(40);
  });

  it("returns 100 when flux ran with no material variances", () => {
    expect(scoreVarianceAnalysis({ run: true, materialCount: 0, explainedCount: 0 }).score).toBe(100);
  });

  it("deducts 10 per unexplained material variance", () => {
    expect(scoreVarianceAnalysis({ run: true, materialCount: 5, explainedCount: 3 }).score).toBe(80);
  });

  it("returns full score when all material variances explained", () => {
    expect(scoreVarianceAnalysis({ run: true, materialCount: 5, explainedCount: 5 }).score).toBe(100);
  });
});

describe("scoreWorkflowProgress", () => {
  it("returns 0 when no tasks", () => {
    expect(scoreWorkflowProgress({ completed: 0, failed: 0, blocked: 0, total: 0 }).score).toBe(0);
  });

  it("returns 100 when all complete", () => {
    expect(scoreWorkflowProgress({ completed: 14, failed: 0, blocked: 0, total: 14 }).score).toBe(100);
  });

  it("scales linearly with completion", () => {
    expect(scoreWorkflowProgress({ completed: 7, failed: 0, blocked: 0, total: 14 }).score).toBe(50);
  });

  it("flags failed/blocked tasks in issues", () => {
    const dim = scoreWorkflowProgress({ completed: 5, failed: 1, blocked: 2, total: 14 });
    expect(dim.issues).toContain("1 task failed");
    expect(dim.issues).toContain("2 tasks blocked");
  });
});

describe("evaluateHardGates", () => {
  it("all gates pass on clean scan", () => {
    const gates = evaluateHardGates(emptyScan, 14);
    expect(gates.every((g) => g.passed)).toBe(true);
  });

  it("voucher integrity fails when imbalance exceeds tolerance", () => {
    const scan = { ...emptyScan, issues: [issue("voucher_imbalance", "critical", 5, 5000)] };
    const gates = evaluateHardGates(scan, 14);
    const integrityGate = gates.find((g) => g.name === "Voucher integrity")!;
    expect(integrityGate.passed).toBe(false);
    expect(integrityGate.message).toContain("exceeds tolerance");
  });

  it("voucher integrity passes within tolerance", () => {
    const scan = { ...emptyScan, issues: [issue("voucher_imbalance", "critical", 2, 50)] };
    const gates = evaluateHardGates(scan, 14);
    const integrityGate = gates.find((g) => g.name === "Voucher integrity")!;
    expect(integrityGate.passed).toBe(true);
  });

  it("missing field gate fails over threshold", () => {
    const scan = { ...emptyScan, issues: [issue("missing_fields", "critical", 25)] };
    const gates = evaluateHardGates(scan, 14);
    const gate = gates.find((g) => g.name === "Critical field completeness")!;
    expect(gate.passed).toBe(false);
  });

  it("duplicate transactions gate fails when too many", () => {
    const scan = { ...emptyScan, issues: [issue("duplicate_transactions", "critical", 10)] };
    const gates = evaluateHardGates(scan, 14);
    const gate = gates.find((g) => g.name === "Duplicate transactions")!;
    expect(gate.passed).toBe(false);
  });

  it("period has data gate fails for empty period", () => {
    const gates = evaluateHardGates(emptyScan, 0);
    const gate = gates.find((g) => g.name === "Period has data")!;
    expect(gate.passed).toBe(false);
    expect(gate.message).toContain("empty");
  });
});

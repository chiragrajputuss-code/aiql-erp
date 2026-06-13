/**
 * Close Readiness Score
 *
 * Multi-dimensional 0-100 score that tells the user objectively whether
 * the period's GL data is ready for close. Computed from existing engines:
 *   - Scan result (data integrity, compliance)
 *   - Reconciliation status (matching, variance)
 *   - Flux analysis (variance explained?)
 *   - Workflow progress (tasks completed)
 *
 * Two layers of gating:
 *   - Hard gates (cannot proceed): broken data
 *   - Score (transparency): how ready overall
 */

import { prisma } from "@aiql/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReadinessStatus = "ready" | "warning" | "blocked";

export interface HardGate {
  name:    string;
  passed:  boolean;
  message: string;
}

export interface ScoreDimension {
  name:         string;
  score:        number;        // 0-100
  weight:       number;        // 0-1, sums to 1 across all dimensions
  contribution: number;        // weight × score
  issues:       string[];      // human-readable issue list
}

export interface ReadinessScore {
  periodId:    string;
  score:       number;         // 0-100, weighted sum of dimensions
  status:      ReadinessStatus;
  hardGates:   HardGate[];     // ALL must pass to proceed
  dimensions:  ScoreDimension[];
  topActions:  string[];       // up to 5 prioritized next steps
  computedAt:  Date;
}

// ─── Scoring config ───────────────────────────────────────────────────────────

const DIMENSION_WEIGHTS = {
  dataIntegrity:   0.30,
  periodScope:     0.10,
  reconciliation:  0.25,
  compliance:      0.10,
  varianceAnalysis: 0.15,
  workflowProgress: 0.10,
} as const;

const READY_THRESHOLD   = 80;
const WARNING_THRESHOLD = 50;

// Hard-gate thresholds — fail any of these and you're BLOCKED regardless of score
const MAX_VOUCHER_IMBALANCE_TOTAL = 1000;     // ₹1000 cumulative imbalance
const MAX_MISSING_CRITICAL_FIELDS = 20;       // total entries with missing date/account/amount
const MAX_DUPLICATE_TRANSACTIONS  = 5;        // confirmed-looking dups

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ScanIssue {
  code:         string;
  severity:     string;
  affectedRows: number;
  exposure:     number | null;
}

interface ScanResult {
  totalIssues:  number;
  bySeverity:   Record<string, number>;
  totalExposure: number;
  issues:       ScanIssue[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

export function scoreDataIntegrity(scan: ScanResult | null): ScoreDimension {
  let score = 100;
  const issues: string[] = [];

  if (!scan) {
    return {
      name: "Data Integrity",
      score: 50,
      weight: DIMENSION_WEIGHTS.dataIntegrity,
      contribution: 50 * DIMENSION_WEIGHTS.dataIntegrity,
      issues: ["No data quality scan run yet"],
    };
  }

  // Penalise critical issues heavily (max -40)
  const critical = scan.bySeverity.critical ?? 0;
  score -= Math.min(40, critical * 10);
  if (critical > 0) issues.push(`${critical} critical data integrity issue${critical > 1 ? "s" : ""}`);

  // Review-level lighter (max -15)
  const review = scan.bySeverity.review ?? 0;
  score -= Math.min(15, review * 3);
  if (review > 0) issues.push(`${review} review-level issue${review > 1 ? "s" : ""}`);

  return {
    name:         "Data Integrity",
    score:        clamp(score, 0, 100),
    weight:       DIMENSION_WEIGHTS.dataIntegrity,
    contribution: clamp(score, 0, 100) * DIMENSION_WEIGHTS.dataIntegrity,
    issues,
  };
}

export function scorePeriodScope(scan: ScanResult | null): ScoreDimension {
  let score = 100;
  const issues: string[] = [];

  if (!scan) {
    return {
      name: "Period Scope",
      score: 70,
      weight: DIMENSION_WEIGHTS.periodScope,
      contribution: 70 * DIMENSION_WEIGHTS.periodScope,
      issues: ["Period scope not validated (no scan)"],
    };
  }

  const dateOutlier = scan.issues.find((i) => i.code === "date_outliers");
  if (dateOutlier) {
    score -= Math.min(30, dateOutlier.affectedRows * 2);
    issues.push(`${dateOutlier.affectedRows} entries dated outside the period`);
  }

  const missingFields = scan.issues.find((i) => i.code === "missing_fields");
  if (missingFields) {
    score -= Math.min(20, missingFields.affectedRows);
    issues.push(`${missingFields.affectedRows} entries with missing fields`);
  }

  return {
    name:         "Period Scope",
    score:        clamp(score, 0, 100),
    weight:       DIMENSION_WEIGHTS.periodScope,
    contribution: clamp(score, 0, 100) * DIMENSION_WEIGHTS.periodScope,
    issues,
  };
}

export function scoreReconciliation(reconStats: { passed: number; failed: number; pending: number; total: number }): ScoreDimension {
  const issues: string[] = [];

  if (reconStats.total === 0) {
    return {
      name: "Reconciliation",
      score: 50,
      weight: DIMENSION_WEIGHTS.reconciliation,
      contribution: 50 * DIMENSION_WEIGHTS.reconciliation,
      issues: ["No reconciliations defined for this period"],
    };
  }

  const passedRatio  = reconStats.passed / reconStats.total;
  const failedRatio  = reconStats.failed / reconStats.total;
  const pendingRatio = reconStats.pending / reconStats.total;

  // Score: 100% if all passed, 0% if all failed/pending
  let score = (passedRatio * 100) - (failedRatio * 30);
  score = clamp(score, 0, 100);

  if (reconStats.failed > 0)  issues.push(`${reconStats.failed} reconciliation${reconStats.failed > 1 ? "s" : ""} failed`);
  if (reconStats.pending > 0) issues.push(`${reconStats.pending} reconciliation${reconStats.pending > 1 ? "s" : ""} not yet run`);

  return {
    name:         "Reconciliation",
    score,
    weight:       DIMENSION_WEIGHTS.reconciliation,
    contribution: score * DIMENSION_WEIGHTS.reconciliation,
    issues,
  };
}

export function scoreCompliance(scan: ScanResult | null): ScoreDimension {
  let score = 100;
  const issues: string[] = [];

  if (!scan) {
    return {
      name: "Compliance",
      score: 80,
      weight: DIMENSION_WEIGHTS.compliance,
      contribution: 80 * DIMENSION_WEIGHTS.compliance,
      issues: ["Compliance not validated"],
    };
  }

  const gst = scan.issues.find((i) => i.code === "gst_mismatch");
  if (gst) {
    score -= Math.min(40, gst.affectedRows * 5);
    issues.push(`${gst.affectedRows} CGST ≠ SGST mismatch${gst.affectedRows > 1 ? "es" : ""}`);
  }

  const signs = scan.issues.find((i) => i.code === "sign_anomalies");
  if (signs) {
    score -= Math.min(20, signs.affectedRows * 5);
    issues.push(`${signs.affectedRows} sign anomal${signs.affectedRows > 1 ? "ies" : "y"}`);
  }

  return {
    name:         "Compliance",
    score:        clamp(score, 0, 100),
    weight:       DIMENSION_WEIGHTS.compliance,
    contribution: clamp(score, 0, 100) * DIMENSION_WEIGHTS.compliance,
    issues,
  };
}

export function scoreVarianceAnalysis(fluxStats: { run: boolean; materialCount: number; explainedCount: number }): ScoreDimension {
  const issues: string[] = [];
  let score = 100;

  if (!fluxStats.run) {
    return {
      name: "Variance Analysis",
      score: 40,
      weight: DIMENSION_WEIGHTS.varianceAnalysis,
      contribution: 40 * DIMENSION_WEIGHTS.varianceAnalysis,
      issues: ["Flux analysis not yet run"],
    };
  }

  if (fluxStats.materialCount === 0) {
    return {
      name: "Variance Analysis",
      score: 100,
      weight: DIMENSION_WEIGHTS.varianceAnalysis,
      contribution: 100 * DIMENSION_WEIGHTS.varianceAnalysis,
      issues: [],
    };
  }

  const unexplained = fluxStats.materialCount - fluxStats.explainedCount;
  score -= unexplained * 10;
  if (unexplained > 0) issues.push(`${unexplained} material variance${unexplained > 1 ? "s" : ""} without AI explanation`);

  return {
    name:         "Variance Analysis",
    score:        clamp(score, 0, 100),
    weight:       DIMENSION_WEIGHTS.varianceAnalysis,
    contribution: clamp(score, 0, 100) * DIMENSION_WEIGHTS.varianceAnalysis,
    issues,
  };
}

export function scoreWorkflowProgress(taskStats: { completed: number; failed: number; blocked: number; total: number }): ScoreDimension {
  const issues: string[] = [];

  if (taskStats.total === 0) {
    return {
      name: "Workflow Progress",
      score: 0,
      weight: DIMENSION_WEIGHTS.workflowProgress,
      contribution: 0,
      issues: ["No tasks defined"],
    };
  }

  const score = clamp((taskStats.completed / taskStats.total) * 100, 0, 100);

  if (taskStats.failed > 0)  issues.push(`${taskStats.failed} task${taskStats.failed > 1 ? "s" : ""} failed`);
  if (taskStats.blocked > 0) issues.push(`${taskStats.blocked} task${taskStats.blocked > 1 ? "s" : ""} blocked`);

  return {
    name:         "Workflow Progress",
    score,
    weight:       DIMENSION_WEIGHTS.workflowProgress,
    contribution: score * DIMENSION_WEIGHTS.workflowProgress,
    issues,
  };
}

// ─── Hard gates ───────────────────────────────────────────────────────────────

export function evaluateHardGates(scan: ScanResult | null, taskCount: number): HardGate[] {
  const gates: HardGate[] = [];

  // Gate 1: Voucher integrity
  const imbalance = scan?.issues.find((i) => i.code === "voucher_imbalance");
  const imbalanceTotal = imbalance?.exposure ?? 0;
  gates.push({
    name:    "Voucher integrity",
    passed:  imbalanceTotal <= MAX_VOUCHER_IMBALANCE_TOTAL,
    message: imbalanceTotal === 0
      ? "All vouchers balanced (Dr = Cr)"
      : `${imbalance?.affectedRows ?? 0} vouchers imbalanced, total ₹${imbalanceTotal.toLocaleString("en-IN")}` +
        (imbalanceTotal > MAX_VOUCHER_IMBALANCE_TOTAL ? " — exceeds tolerance" : " — within tolerance"),
  });

  // Gate 2: Critical fields
  const missing = scan?.issues.find((i) => i.code === "missing_fields");
  const missingCount = missing?.affectedRows ?? 0;
  gates.push({
    name:    "Critical field completeness",
    passed:  missingCount <= MAX_MISSING_CRITICAL_FIELDS,
    message: missingCount === 0
      ? "All critical fields populated"
      : `${missingCount} entries with missing date/account/amount` +
        (missingCount > MAX_MISSING_CRITICAL_FIELDS ? " — exceeds tolerance" : " — within tolerance"),
  });

  // Gate 3: Duplicate transactions
  const dups = scan?.issues.find((i) => i.code === "duplicate_transactions");
  const dupCount = dups?.affectedRows ?? 0;
  gates.push({
    name:    "Duplicate transactions",
    passed:  dupCount <= MAX_DUPLICATE_TRANSACTIONS,
    message: dupCount === 0
      ? "No duplicate transactions detected"
      : `${dupCount} possible duplicate transaction${dupCount > 1 ? "s" : ""}` +
        (dupCount > MAX_DUPLICATE_TRANSACTIONS ? " — review and resolve" : " — within tolerance"),
  });

  // Gate 4: Period has tasks (catches empty period)
  gates.push({
    name:    "Period has data",
    passed:  taskCount > 0,
    message: taskCount > 0
      ? `${taskCount} tasks defined for this period`
      : "Period has no tasks — was this batch empty?",
  });

  return gates;
}

// ─── Top action recommendations ───────────────────────────────────────────────

function buildTopActions(
  hardGates:  HardGate[],
  dimensions: ScoreDimension[],
  reconStats: { failed: number; pending: number },
  fluxRun:    boolean
): string[] {
  const actions: string[] = [];

  // Failed hard gates first
  for (const gate of hardGates) {
    if (!gate.passed) actions.push(`🛑 Fix: ${gate.message}`);
  }

  // Failed reconciliations
  if (reconStats.failed > 0) {
    actions.push(`🔍 Investigate ${reconStats.failed} failed reconciliation${reconStats.failed > 1 ? "s" : ""}`);
  }

  // Pending reconciliations
  if (reconStats.pending > 0) {
    actions.push(`▶ Run ${reconStats.pending} pending reconciliation${reconStats.pending > 1 ? "s" : ""}`);
  }

  // No flux run
  if (!fluxRun) {
    actions.push(`📊 Run flux analysis to compare with prior period`);
  }

  // Lowest-scoring dimensions
  const sorted = [...dimensions].sort((a, b) => a.score - b.score);
  for (const dim of sorted.slice(0, 2)) {
    if (dim.score < 80 && dim.issues.length > 0) {
      actions.push(`⚠ ${dim.name}: ${dim.issues[0]}`);
    }
  }

  return actions.slice(0, 5);
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function computeReadinessScore(periodId: string): Promise<ReadinessScore> {
  // 1. Load period + scan result + tasks + recons + flux run
  const period = await prisma.closePeriod.findUniqueOrThrow({
    where:   { id: periodId },
    include: {
      tasks: {
        include: {
          reconciliations: true,
          fluxRun:         true,
        },
      },
    },
  });

  // 2. Parse scan result
  let scan: ScanResult | null = null;
  if (period.scanResultJson) {
    try { scan = JSON.parse(period.scanResultJson) as ScanResult; }
    catch { scan = null; }
  }

  // 3. Aggregate task stats
  const taskStats = {
    completed: period.tasks.filter((t) => t.status === "COMPLETED").length,
    failed:    period.tasks.filter((t) => t.status === "FAILED").length,
    blocked:   period.tasks.filter((t) => t.status === "BLOCKED").length,
    total:     period.tasks.length,
  };

  // 4. Aggregate recon stats
  const allRecons = period.tasks.flatMap((t) => t.reconciliations);
  const reconStats = {
    passed:  allRecons.filter((r) => r.status === "PASSED").length,
    failed:  allRecons.filter((r) => r.status === "FAILED").length,
    pending: allRecons.filter((r) => r.status === "PENDING" || r.status === "RUNNING").length,
    total:   allRecons.length,
  };

  // 5. Aggregate flux stats
  const fluxRuns = period.tasks
    .map((t) => t.fluxRun)
    .filter((f): f is NonNullable<typeof f> => !!f);

  let fluxExplained = 0;
  let fluxMaterial  = 0;
  for (const fr of fluxRuns) {
    fluxMaterial += fr.materialCount;
    try {
      const result = JSON.parse(fr.resultJson) as { changes?: { isMaterial: boolean; analysis?: unknown }[] };
      const changes = result.changes ?? [];
      fluxExplained += changes.filter((c) => c.isMaterial && !!c.analysis).length;
    } catch { /* skip */ }
  }
  const fluxStats = { run: fluxRuns.length > 0, materialCount: fluxMaterial, explainedCount: fluxExplained };

  // 6. Compute dimension scores
  const dimensions: ScoreDimension[] = [
    scoreDataIntegrity(scan),
    scorePeriodScope(scan),
    scoreReconciliation(reconStats),
    scoreCompliance(scan),
    scoreVarianceAnalysis(fluxStats),
    scoreWorkflowProgress(taskStats),
  ];

  // 7. Total score = weighted sum of dimension contributions
  const totalScore = Math.round(dimensions.reduce((sum, d) => sum + d.contribution, 0));

  // 8. Hard gates
  const hardGates = evaluateHardGates(scan, taskStats.total);
  const allGatesPassed = hardGates.every((g) => g.passed);

  // 9. Determine status
  let status: ReadinessStatus;
  if (!allGatesPassed) status = "blocked";
  else if (totalScore >= READY_THRESHOLD)  status = "ready";
  else if (totalScore >= WARNING_THRESHOLD) status = "warning";
  else status = "blocked";

  // 10. Top action recommendations
  const topActions = buildTopActions(hardGates, dimensions, reconStats, fluxStats.run);

  return {
    periodId,
    score:      totalScore,
    status,
    hardGates,
    dimensions,
    topActions,
    computedAt: new Date(),
  };
}

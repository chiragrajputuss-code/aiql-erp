// ─── Investigation Runner ────────────────────────────────────────────────────
//
// Pure orchestration over the BusinessContext. Responsibilities:
//   - Validate each investigation's required capabilities (Principle 3 — the
//     RUNNER resolves dependencies, investigations never self-discover).
//   - Run only the ones whose capabilities are satisfied; record SKIPPED + reason
//     for the rest.
//   - Compute the deterministic report rollup (health score, counts, ₹ impact).
//   - Produce ONE executive summary via the injected LLM function (Principle 5).
//
// No DB. No network. The web app injects llmFn and persists the result.

import type { BusinessContext } from "./context";
import type { Finding, InvestigationDefinition } from "./types";
import { buildExecutiveSummary, toDigest, type LlmFn } from "./llm-summary";
import { computeProactiveObservation, narrateObservation, type ProactiveObservation } from "./proactive";
import { buildBoardBrief, narrateBoardSummary, type BoardBrief } from "./board-brief";

export type InvestigationRunStatus = "completed" | "skipped" | "failed";

export interface InvestigationOutcome {
  investigationId: string;
  status:          InvestigationRunStatus;
  reason:          string | null;   // skip/failure reason
  findingCount:    number;
  durationMs:      number;
}

export interface ReportResult {
  findings:             Finding[];
  executiveSummary:     string;
  healthScore:          number;
  criticalCount:        number;
  warningCount:         number;
  opportunityCount:     number;
  infoCount:            number;
  totalImpactRs:        number;
  outcomes:             InvestigationOutcome[];
  proactiveObservation: ProactiveObservation | null;
  boardBrief:           BoardBrief;
}

// Health score: start at 100, subtract a weight per finding by severity, floor 0.
const SEVERITY_WEIGHT: Record<Finding["severity"], number> = {
  critical:    20,
  warning:     8,
  opportunity: 2,
  info:        1,
};

function computeHealthScore(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  return Math.max(0, 100 - penalty);
}

export async function runReport(
  definitions: InvestigationDefinition[],
  ctx:         BusinessContext,
  opts:        { llmFn?: LlmFn } = {},
): Promise<ReportResult> {
  const findings: Finding[] = [];
  const outcomes: InvestigationOutcome[] = [];

  for (const def of definitions) {
    const t0 = Date.now();

    // Principle 3: capability gate before run()
    const missing = def.requiredCapabilities.filter((c) => !ctx.capabilities.has(c));
    if (missing.length > 0) {
      outcomes.push({
        investigationId: def.id,
        status:          "skipped",
        reason:          `Missing required data: ${missing.join(", ")}`,
        findingCount:    0,
        durationMs:      Date.now() - t0,
      });
      continue;
    }

    try {
      const produced = await def.run(ctx);
      findings.push(...produced);
      outcomes.push({
        investigationId: def.id,
        status:          "completed",
        reason:          null,
        findingCount:    produced.length,
        durationMs:      Date.now() - t0,
      });
    } catch (err) {
      outcomes.push({
        investigationId: def.id,
        status:          "failed",
        reason:          err instanceof Error ? err.message : String(err),
        findingCount:    0,
        durationMs:      Date.now() - t0,
      });
    }
  }

  const healthScore      = computeHealthScore(findings);
  const criticalCount    = findings.filter((f) => f.severity === "critical").length;
  const warningCount     = findings.filter((f) => f.severity === "warning").length;
  const opportunityCount = findings.filter((f) => f.severity === "opportunity").length;
  const infoCount        = findings.filter((f) => f.severity === "info").length;
  const totalImpactRs    = findings.reduce((sum, f) => sum + (f.impactRs ?? 0), 0);

  const executiveSummary = await buildExecutiveSummary(
    toDigest(ctx.period.label, healthScore, findings),
    opts.llmFn,
  );

  // Sort findings critical-first for presentation.
  const order: Record<Finding["severity"], number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (b.impactRs ?? 0) - (a.impactRs ?? 0));

  // Reasoning layer — computed deterministically, LLM only narrates (Principle 5).
  const proactiveObservation = await narrateObservation(computeProactiveObservation(findings), opts.llmFn);
  const boardBrief = await narrateBoardSummary(
    buildBoardBrief(findings, { period: ctx.period.label, healthScore }),
    opts.llmFn,
  );

  return {
    findings,
    executiveSummary,
    healthScore,
    criticalCount,
    warningCount,
    opportunityCount,
    infoCount,
    totalImpactRs,
    outcomes,
    proactiveObservation,
    boardBrief,
  };
}

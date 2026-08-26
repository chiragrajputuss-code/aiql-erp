// ─── @aiql/investigation-engine ──────────────────────────────────────────────
// Pure financial-investigation framework. No DB, no network. The web app
// injects the context resolver, persistence and LLM function.

export { Capability } from "./capabilities";
export type { CapabilitySet } from "./capabilities";

export type {
  InvestigationCategory,
  FindingSeverity,
  Priority,
  FindingStatus,
  Evidence,
  Recommendation,
  Finding,
  InvestigationDefinition,
} from "./types";

export type {
  InvestigationPeriod,
  GlAccessor,
  ItcAccessor,
  VendorComplianceAccessor,
  BusinessContext,
} from "./context";
export { hasCapability } from "./context";

export { runReport } from "./runner";
export type { ReportResult, InvestigationOutcome, InvestigationRunStatus } from "./runner";

export { computeProactiveObservation, narrateObservation } from "./proactive";
export type { ProactiveObservation, ObservationKind } from "./proactive";

export { buildBoardBrief, narrateBoardSummary } from "./board-brief";
export type { BoardBrief, BriefItem, BoardDecision } from "./board-brief";

export { buildExecutiveSummary, buildDeterministicSummary, toDigest } from "./llm-summary";
export type { LlmFn, SummaryDigest } from "./llm-summary";

export {
  getInvestigation,
  getInvestigations,
  getAllInvestigations,
  REGISTRY,
} from "./registry";

export {
  getProfile,
  getDefaultProfile,
  INDIAN_SME_DEFAULT,
} from "./profiles";
export type { InvestigationProfile } from "./profiles";

export { GST_VENDOR_ITC } from "./investigations/gst-vendor-itc";
export { DUPLICATE_PAYMENT } from "./investigations/duplicate-payment";

export { diffRuns, computeMatchKey } from "./run-diff";
export type { RunDiff, DiffedFinding, PriorFindingRef, ResolvedFindingRef } from "./run-diff";

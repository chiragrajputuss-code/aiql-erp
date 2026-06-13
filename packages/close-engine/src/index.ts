export type {
  CloseTemplate, CloseTaskTemplate, ReconciliationTemplate,
  TaskWithRecon, ReconSummary, PeriodWithTasks, ProgressSummary,
  TaskCategory, PeriodType, ClosePeriodStatus, CloseTaskStatus, ReconStatus,
} from "./types";

export { MONTHLY_CLOSE_TEMPLATE } from "./templates/monthly-close";

export {
  createClosePeriodFromTemplate,
  resolveDependencies,
  updateTaskStatus,
  recalculateProgress,
  calculateProgress,
  getBlockers,
  getPeriodWithTasks,
  getTaskWithRecon,
} from "./checklist";

export {
  runReconciliation,
  runAllReconciliations,
  getReconciliationDetail,
} from "./reconciliation";
export type { ReconDetail, ReconAnalysis, ReconFinding, FindingType, VariancePattern } from "./reconciliation";

export { runDataQualityScan } from "./scanner";
export type { Issue, IssueSeverity, ScanResult } from "./scanner";

export { generateAdaptiveTemplate, prepareCloseContext } from "./task-generator";
export type { CloseProfile, GenerateOptions, CloseContext } from "./task-generator";

export { parseUserIntent } from "./intent-parser";
export type {
  CloseIntent, CloseFocusArea, ExclusionKey, IntentParseContext,
} from "./intent-parser";

export {
  patternKeyForScanIssue,
  patternKeyForRecon,
  patternKeyForFlux,
  patternKeyForAgentQuestion,
  patternKeyForManual,
  appendHistory,
  shortHash,
} from "./knowledge";
export type {
  KnowledgeKey, KnowledgeSource, KnowledgeHistoryEntry,
} from "./knowledge";

export { runFluxAnalysis, runFluxForTask, getFluxRunForTask } from "./flux-analyzer";
export type {
  AccountChange, FluxAnalysisDetail, FluxAnalysisResult, FluxPattern, FluxRunPersisted,
} from "./flux-analyzer";

export { computeReadinessScore } from "./readiness-scorer";
export type {
  ReadinessScore, ReadinessStatus, HardGate, ScoreDimension,
} from "./readiness-scorer";

// Sprint 2: P&L Review Agent
export {
  startPlReview,
  submitPlAnswers,
  getPlSession,
  getPlSessionForTask,
  QUESTION_BUDGET,
} from "./agents/pl-reviewer";
export type {
  PlReviewInput,
  PLAgentReport,
  Investigation,
  AgentQuestion,
  UserAnswer,
  ConfidenceLabel,
} from "./agents/pl-reviewer";

// Sprint 1: Agent runtime infrastructure (with hard guardrails)
export {
  DEFAULT_LIMITS,
  createSession,
  checkLimits,
  executeTool,
  trackUsage,
  estimateCostInr,
  buildGlTools,
  crossCheckClaims,
} from "./agents/runtime";
export type {
  AgentLimits,
  AgentTool,
  AgentSession,
  AgentRunResult,
  ToolCallLog,
  StopReason,
  CrossCheckResult,
} from "./agents/runtime";

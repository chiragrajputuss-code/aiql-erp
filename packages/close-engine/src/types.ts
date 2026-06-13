import type { TaskCategory, PeriodType, ClosePeriodStatus, CloseTaskStatus, ReconStatus } from "@aiql/db";

export type { TaskCategory, PeriodType, ClosePeriodStatus, CloseTaskStatus, ReconStatus };

// ─── Template types (used at period creation time) ────────────────────────────

export interface ReconciliationTemplate {
  name: string;
  /**
   * SQL with `{tableName}`, `{startDate}`, `{endDate}` placeholders for safe
   * static substitution + `$1`, `$2`, ... positional bindings for any
   * user-supplied values. Bindings are passed via `params` and bound at
   * execution time (no string interpolation, no SQL injection vector).
   */
  sourceQuery: string;
  targetQuery: string;
  detailQuery?: string;
  /** Positional binding values for `$1`, `$2`, ... in the queries above. */
  params?: string[];
  varianceThreshold: number;
}

export interface CloseTaskTemplate {
  /** Unique key within the template, used to wire up dependencies */
  key: string;
  title: string;
  description?: string;
  category: TaskCategory;
  /** If true, task auto-completes when its Reconciliation passes */
  autoComplete: boolean;
  /** References other tasks by key — resolved to DB IDs at period creation */
  dependsOnKeys: string[];
  sortOrder: number;
  reconciliation?: ReconciliationTemplate;
}

export interface CloseTemplate {
  id: string;
  name: string;
  periodType: PeriodType;
  tasks: CloseTaskTemplate[];
}

// ─── Runtime types (returned from checklist functions) ────────────────────────

export interface TaskWithRecon {
  id: string;
  periodId: string;
  title: string;
  category: TaskCategory;
  autoComplete: boolean;
  status: CloseTaskStatus;
  assigneeId: string | null;
  dueDate: Date | null;
  notes: string | null;
  sortOrder: number;
  dependsOnIds: string[];
  completedAt: Date | null;
  reconciliations: ReconSummary[];
}

export interface ReconSummary {
  id: string;
  name: string;
  status: ReconStatus;
  sourceBalance: number | null;
  targetBalance: number | null;
  variance: number | null;
  aiExplanation: string | null;
  lastRunAt: Date | null;
}

export interface PeriodWithTasks {
  id: string;
  orgId: string;
  connectionId: string;
  connectionIds: string[];
  name: string;
  periodType: PeriodType;
  status: ClosePeriodStatus;
  startDate: Date;
  endDate: Date;
  targetCompletionDate: Date | null;
  completionPct: number;
  completedAt: Date | null;
  /** Adaptive close metadata — see ClosePeriod model */
  closeProfile:        "STANDARD" | "QUICK" | "YEAR_END" | "ADAPTIVE";
  userIntent:          string | null;
  intentSummaryJson:   string | null;
  customWatchItems:    string[];
  profileSnapshotJson: string | null;
  tasks: TaskWithRecon[];
}

export interface ProgressSummary {
  periodId: string;
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  blocked: number;
  pending: number;
  pct: number;
}

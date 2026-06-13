"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Circle,
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw,
  User, StickyNote, Zap, ExternalLink, TrendingUp, TrendingDown, Activity, Sparkles, AlertCircle,
  Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { describeConfidence } from "@/lib/intent-display";
import { PROFILE_META as SHARED_PROFILE_META, type CloseProfile, type CloseIntent } from "@/lib/close-types";
import { KnowledgeCapturePrompt } from "@/components/close/knowledge-capture-prompt";
import {
  patternKeyForScanIssue,
  patternKeyForRecon,
  patternKeyForFlux,
  patternKeyForAgentQuestion,
} from "@aiql/close-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReadinessScore {
  periodId:    string;
  score:       number;
  status:      "ready" | "warning" | "blocked";
  hardGates:   { name: string; passed: boolean; message: string }[];
  dimensions:  { name: string; score: number; weight: number; contribution: number; issues: string[] }[];
  topActions:  string[];
  computedAt:  string;
}

// P&L Review types
interface PLAgentReport {
  headlineNumbers: {
    revenue:           number;
    cogs:              number;
    grossProfit:       number;
    grossMarginPct:    number;
    operatingExpenses: number;
    operatingProfit:   number;
    netProfitPct:      number;
  };
  investigations: {
    question:    string;
    approach:    string;
    findings:    string;
    conclusion:  string;
    confidence:  string;
    severity?:   string;
    evidence:    Record<string, unknown>[];
  }[];
  concerns: {
    severity:        string;
    issue:           string;
    estimatedImpactInr?: number;
    recommendation:  string;
  }[];
  questionsAsked: {
    id:             string;
    questionText:   string;
    context:        string;
    type:           string;
    options?:       string[];
    materialityInr: number;
    whyAsking:      string;
    patternKey?:    string;
  }[];
  userAnswers: { questionId: string; answer: string; skipped: boolean }[];
  assumptions: string[];
  overallAssessment: string;
  confidenceLabel: string;
  generatedAt: string;
}

interface PlSessionResponse {
  sessionId: string;
  state:     string;
  report?:   PLAgentReport;
  questions?: PLAgentReport["questionsAsked"];
}

interface FluxAccountChange {
  accountName:    string;
  accountType:    string;
  currentBalance: number;
  priorBalance:   number;
  variance:       number;
  variancePct:    number;
  isMaterial:     boolean;
  analysis?: {
    pattern:    string;
    summary:    string;
    causes:     string[];
    actions:    string[];
    confidence: number;
  } | null;
}

interface FluxRunPersisted {
  id:                 string;
  taskId:             string;
  currentPeriodStart: string;
  currentPeriodEnd:   string;
  priorPeriodStart:   string;
  priorPeriodEnd:     string;
  totalAccounts:      number;
  materialCount:      number;
  totalAbsVariance:   number;
  durationMs:         number;
  lastRunAt:          string;
  result: {
    changes: FluxAccountChange[];
    [k: string]: unknown;
  };
}

interface Recon {
  id: string;
  name: string;
  status: string;
  sourceBalance: number | null;
  targetBalance: number | null;
  variance: number | null;
  aiExplanation: string | null;
  lastRunAt: string | null;
}

interface Task {
  id: string;
  title: string;
  category: string;
  autoComplete: boolean;
  status: string;
  assigneeId: string | null;
  dueDate: string | null;
  notes: string | null;
  sortOrder: number;
  dependsOnIds: string[];
  completedAt: string | null;
  reconciliations: Recon[];
}

interface Period {
  id: string;
  name: string;
  status: string;
  completionPct: number;
  startDate: string;
  endDate: string;
  tasks: Task[];
  /** Primary connection (used for knowledge-base scoping). */
  connectionId?: string;
  // Adaptive close metadata — populated when the period was created via the wizard
  closeProfile?:        CloseProfile;
  userIntent?:          string | null;
  intentSummaryJson?:   string | null;
  customWatchItems?:    string[];
  profileSnapshotJson?: string | null;
}

type ParsedIntent = CloseIntent;

interface Progress {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  blocked: number;
  pending: number;
  pct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { icon: React.ReactNode; rail: string; label: string }> = {
  COMPLETED:   { icon: <CheckCircle2  className="h-4 w-4 text-emerald-500" />, rail: "before:bg-emerald-500", label: "Completed"   },
  IN_PROGRESS: { icon: <Clock         className="h-4 w-4 text-indigo-500"  />, rail: "before:bg-indigo-500",  label: "In progress" },
  FAILED:      { icon: <XCircle       className="h-4 w-4 text-rose-500"    />, rail: "before:bg-rose-500",    label: "Failed"      },
  BLOCKED:     { icon: <AlertTriangle className="h-4 w-4 text-amber-500"   />, rail: "before:bg-amber-400",   label: "Blocked"     },
  PENDING:     { icon: <Circle        className="h-4 w-4 text-slate-300"   />, rail: "before:bg-slate-200",   label: "Pending"     },
};

const CATEGORY_LABEL: Record<string, string> = {
  RECONCILIATION: "Recon",
  REVIEW:         "Review",
  APPROVAL:       "Approval",
  FLUX_ANALYSIS:  "Flux",
  REPORTING:      "Report",
  CUSTOM:         "Action",
};

const CATEGORY_COLOR: Record<string, string> = {
  RECONCILIATION: "bg-violet-50 text-violet-700 border-violet-200",
  REVIEW:         "bg-slate-100 text-slate-600 border-slate-200",
  APPROVAL:       "bg-indigo-50 text-indigo-700 border-indigo-200",
  FLUX_ANALYSIS:  "bg-blue-50 text-blue-700 border-blue-200",
  REPORTING:      "bg-slate-100 text-slate-600 border-slate-200",
  CUSTOM:         "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING:     ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "PENDING"],
  FAILED:      ["IN_PROGRESS", "PENDING"],
  BLOCKED:     [],
  COMPLETED:   ["IN_PROGRESS"],
};

// Query Studio questions per task — sorted by task order
// Uses {start} and {end} placeholders replaced with actual period dates
const TASK_STUDIO_QUESTIONS: Record<number, string> = {
  1:  "Show trial balance with opening and closing balances for {start} to {end}",
  5:  "Show depreciation entries posted between {start} and {end}",
  6:  "Show prepaid expense account balances as of {end}",
  7:  "Show expenses accrued or outstanding between {start} and {end}",
  9:  "Show TDS deducted and TDS payable for {start} to {end}",
  11: "Show profit and loss summary for {start} to {end}",
  12: "Show balance sheet as of {end}",
  13: "Show month over month account balance variance up to {end}",
  14: "Show complete trial balance for CFO review as of {end}",
};

function studioQuestion(sortOrder: number, startDate: string, endDate: string): string | null {
  const template = TASK_STUDIO_QUESTIONS[sortOrder];
  if (!template) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return template.replace("{start}", fmt(startDate)).replace("{end}", fmt(endDate));
}

function formatINR(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Close Readiness Score card (top of period page) ─────────────────────────

const STATUS_META_READINESS: Record<string, {
  label: string; tone: string; heroBg: string; ringSoft: string; pillBg: string; iconBg: string;
}> = {
  ready: {
    label: "Ready to close", tone: "text-emerald-700",
    heroBg: "bg-hero-emerald", ringSoft: "ring-soft-emerald",
    pillBg: "bg-emerald-100 text-emerald-700 border-emerald-200",
    iconBg: "bg-emerald-100",
  },
  warning: {
    label: "Proceed with caution", tone: "text-amber-700",
    heroBg: "bg-hero-amber", ringSoft: "ring-soft-amber",
    pillBg: "bg-amber-100 text-amber-700 border-amber-200",
    iconBg: "bg-amber-100",
  },
  blocked: {
    label: "Not ready", tone: "text-rose-700",
    heroBg: "bg-hero-rose", ringSoft: "ring-soft-rose",
    pillBg: "bg-rose-100 text-rose-700 border-rose-200",
    iconBg: "bg-rose-100",
  },
};

function ReadinessCard({ readiness, onRefresh, loading }: {
  readiness: ReadinessScore | null;
  onRefresh: () => void;
  loading:   boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);

  if (loading && !readiness) {
    return (
      <div className="rounded-xl bg-white card-elevated p-5">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />
          <p className="text-sm text-slate-600">Computing close readiness…</p>
        </div>
      </div>
    );
  }

  if (!readiness) return null;

  const meta = STATUS_META_READINESS[readiness.status]!;
  const failedGates = readiness.hardGates.filter((g) => !g.passed);

  // Score color (used inside circle)
  const scoreToneClass = readiness.status === "blocked" ? "text-rose-600"
    : readiness.score >= 80 ? "text-emerald-600"
    : readiness.score >= 50 ? "text-amber-600"
    : "text-rose-600";

  const ringClass = readiness.status === "blocked" ? "ring-soft-rose"
    : readiness.score >= 80 ? "ring-soft-emerald"
    : readiness.score >= 50 ? "ring-soft-amber"
    : "ring-soft-rose";

  return (
    <div className="rounded-xl bg-white card-elevated overflow-hidden">
      {/* Hero — gradient bg with score circle */}
      <div className={`${meta.heroBg} px-5 py-5 sm:py-6`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Score circle */}
            <div className={`relative h-20 w-20 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0 ${ringClass}`}>
              <div className="text-center">
                <p className={`text-[26px] font-semibold leading-none tabular-nums ${scoreToneClass}`}>
                  {readiness.score}
                </p>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
                  / 100
                </p>
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Close Readiness
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <h2 className={`text-lg font-semibold ${meta.tone}`}>{meta.label}</h2>
                <span className={`pill ${meta.pillBg}`}>
                  {failedGates.length > 0
                    ? `${failedGates.length} gate${failedGates.length > 1 ? "s" : ""} failed`
                    : readiness.status === "ready" ? "All checks passed"
                    : "Below threshold"}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                {failedGates.length > 0
                  ? "Hard gates must resolve before this period can close."
                  : readiness.status === "ready"
                    ? "Period can be safely closed. No critical concerns."
                    : "Review issues below to improve the score."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 text-xs gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-white/60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Recompute
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowDetail((s) => !s)}
              className="h-8 text-xs gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-white/60"
            >
              {showDetail ? "Hide" : "Details"}
              <ChevronDown className={`h-3 w-3 transition-transform ${showDetail ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Recommended next steps */}
      {readiness.topActions.length > 0 && (
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2.5">
            Recommended next steps
          </p>
          <ol className="space-y-1.5">
            {readiness.topActions.map((a, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2.5 leading-relaxed">
                <span className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 tabular-nums">
                  {i + 1}
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Detailed breakdown */}
      {showDetail && (
        <div className="border-t border-slate-100 bg-slate-50/30 p-5 space-y-5">
          {/* Hard gates */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2.5">
              Hard gates · all must pass
            </h3>
            <div className="space-y-2">
              {readiness.hardGates.map((gate, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm bg-white rounded-md border border-slate-100 px-3 py-2">
                  {gate.passed
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle      className="h-4 w-4 text-rose-500    shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${gate.passed ? "text-slate-900" : "text-rose-700"}`}>
                      {gate.name}
                    </p>
                    <p className={`text-xs mt-0.5 ${gate.passed ? "text-slate-500" : "text-rose-600"}`}>
                      {gate.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Dimensions */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2.5">
              Score breakdown
            </h3>
            <div className="space-y-2.5">
              {readiness.dimensions.map((dim, i) => (
                <div key={i} className="bg-white rounded-md border border-slate-100 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">{dim.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      <span className="font-semibold text-slate-700">{Math.round(dim.score)}</span>
                      <span className="text-slate-400">/100</span>
                      <span className="ml-2 text-slate-400">×</span>
                      <span className="ml-1">{Math.round(dim.weight * 100)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        dim.score >= 80 ? "bg-emerald-500" :
                        dim.score >= 50 ? "bg-amber-400" : "bg-rose-400"
                      }`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  {dim.issues.length > 0 && (
                    <ul className="text-xs text-slate-500 space-y-0.5 mt-1.5">
                      {dim.issues.map((issue, j) => (
                        <li key={j} className="flex items-start gap-1.5">
                          <span className="text-slate-300 mt-0.5">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Computed {new Date(readiness.computedAt).toLocaleString("en-IN")} ·
            Score = weighted sum of dimensions ·
            Ready ≥ 80, Warning 50–79, Blocked &lt; 50 or any failed gate
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Recon AI analysis card ───────────────────────────────────────────────────

interface ReconAnalysis {
  summary:    string;
  findings:   { type: string; description: string; amount?: number; items?: string[] }[];
  actions:    string[];
  pattern:    string;
  confidence: number;
}

const FINDING_META: Record<string, { icon: string; label: string; color: string }> = {
  timing:           { icon: "⏱",  label: "Timing",           color: "bg-blue-50 border-blue-200 text-blue-800" },
  missing:          { icon: "✗",  label: "Missing entry",    color: "bg-red-50 border-red-200 text-red-800" },
  misclassification:{ icon: "↪",  label: "Misclassification",color: "bg-amber-50 border-amber-200 text-amber-800" },
  duplicate:        { icon: "⊕",  label: "Duplicate",        color: "bg-purple-50 border-purple-200 text-purple-800" },
  rounding:         { icon: "≈",  label: "Rounding",         color: "bg-slate-50 border-slate-200 text-slate-700" },
  other:            { icon: "?",  label: "Other",            color: "bg-slate-50 border-slate-200 text-slate-700" },
};

const PATTERN_META: Record<string, { label: string; color: string }> = {
  normal_in_transit: { label: "Normal — items in transit",      color: "bg-emerald-100 text-emerald-800" },
  expected_timing:   { label: "Expected — timing variance",     color: "bg-blue-100 text-blue-800" },
  data_error:        { label: "Data error — needs correction",  color: "bg-amber-100 text-amber-800" },
  anomaly:           { label: "Anomaly — investigate",          color: "bg-red-100 text-red-800" },
  unknown:           { label: "Pattern unclear",                color: "bg-slate-100 text-slate-700" },
};

// ─── Profile + intent display ───────────────────────────────────────────────
//
// Renders what the user configured at period creation time so they can see
// "this close is QUICK + skips flux" or "ADAPTIVE: focus on bank, watch X, Y"
// even days after they created the period. Profile metadata is shared with
// the wizard via lib/close-types so labels and colours stay consistent.

function ProfileIntentPanel({ period }: { period: Period }) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const profile = period.closeProfile ?? "STANDARD";
  const meta = SHARED_PROFILE_META[profile];
  const Icon = meta.icon;

  const parsedIntent: ParsedIntent | null = (() => {
    if (!period.intentSummaryJson) return null;
    try { return JSON.parse(period.intentSummaryJson) as ParsedIntent; } catch { return null; }
  })();

  const watchItems = period.customWatchItems ?? [];
  const hasIntentRichness =
    !!period.userIntent ||
    !!parsedIntent ||
    watchItems.length > 0;

  // For STANDARD periods with no extra context, render a single compact line.
  if (profile === "STANDARD" && !hasIntentRichness) {
    return (
      <div className={`rounded-xl card-elevated overflow-hidden ${meta.bgClass}`}>
        <div className="px-4 py-2.5 flex items-center gap-2.5 text-xs">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-white border border-slate-200 text-slate-600 shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className={`pill ${meta.pillClass}`}>{meta.label} profile</span>
          <span className="text-slate-500">{meta.tagline}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl card-elevated overflow-hidden ${meta.bgClass}`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3 border-b border-white/60">
        <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-white border border-slate-200 text-slate-600 shrink-0">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`pill ${meta.pillClass}`}>{meta.label} profile</span>
            {watchItems.length > 0 && (
              <span className="pill bg-amber-50 text-amber-700 border-amber-200">
                {watchItems.length} watch item{watchItems.length !== 1 ? "s" : ""}
              </span>
            )}
            {parsedIntent && parsedIntent.confidence > 0 && (() => {
              const desc = describeConfidence(parsedIntent.confidence);
              return (
                <span
                  className={`text-[11px] ${
                    desc.tone === "high"     ? "text-emerald-700" :
                    desc.tone === "medium"   ? "text-slate-600"   :
                    desc.tone === "low"      ? "text-amber-700"   :
                    "text-rose-700"
                  }`}
                  title={`Raw confidence: ${Math.round(parsedIntent.confidence * 100)}%`}
                >
                  {desc.label}{desc.suggestReview && " — review carefully"}
                </span>
              );
            })()}
          </div>
          <p className="text-xs text-slate-600 mt-0.5">{meta.tagline}</p>
        </div>
      </div>

      {/* User prompt — collapsible if long */}
      {period.userIntent && (
        <div className="px-4 py-3 border-b border-white/60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Your prompt
          </p>
          <p className={`text-sm text-slate-800 italic leading-relaxed ${
            !showFullPrompt && period.userIntent.length > 180 ? "line-clamp-2" : ""
          }`}>
            "{period.userIntent}"
          </p>
          {period.userIntent.length > 180 && (
            <button
              type="button"
              onClick={() => setShowFullPrompt((s) => !s)}
              className="mt-1 text-[11px] text-indigo-600 hover:text-indigo-700 hover:underline flex items-center gap-1"
            >
              {showFullPrompt
                ? <><EyeOff className="h-3 w-3" /> Show less</>
                : <><Eye   className="h-3 w-3" /> Show full prompt</>}
            </button>
          )}
        </div>
      )}

      {/* Parsed intent breakdown */}
      {parsedIntent && (
        parsedIntent.focusAreas.length > 0 ||
        parsedIntent.watchAccounts.length > 0 ||
        parsedIntent.exclusions.length > 0 ||
        parsedIntent.riskFlags.length > 0 ||
        parsedIntent.oneOffEvents.length > 0
      ) && (
        <div className="px-4 py-3 border-b border-white/60 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            AI understood
          </p>
          {parsedIntent.rationale && (
            <p className="text-xs text-slate-700 leading-relaxed">{parsedIntent.rationale}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {parsedIntent.focusAreas.map((a) => (
              <span key={`focus-${a}`} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                focus: {a}
              </span>
            ))}
            {parsedIntent.exclusions.map((e) => (
              <span key={`skip-${e}`} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
                skip: {e}
              </span>
            ))}
            {parsedIntent.watchAccounts.map((w) => (
              <span key={`watch-${w}`} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                watch: {w}
              </span>
            ))}
            {parsedIntent.riskFlags.map((r) => (
              <span key={`risk-${r}`} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100">
                risk: {r}
              </span>
            ))}
            {parsedIntent.oneOffEvents.map((e) => (
              <span key={`oneoff-${e}`} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                one-off: {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Custom watch items (if not already captured by parsedIntent) */}
      {watchItems.length > 0 && !parsedIntent && (
        <div className="px-4 py-3 border-b border-white/60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Watch items
          </p>
          <div className="flex flex-wrap gap-1.5">
            {watchItems.map((w) => (
              <span key={w} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReconAnalysisCard({ explanation }: { explanation: string }) {
  // Try to parse as structured JSON; if it fails, render as plain text
  let analysis: ReconAnalysis | null = null;
  try {
    const parsed = JSON.parse(explanation);
    if (parsed && typeof parsed.summary === "string" && Array.isArray(parsed.findings)) {
      analysis = parsed as ReconAnalysis;
    }
  } catch { /* fall through to plain text */ }

  if (!analysis) {
    // Plain text fallback (legacy format)
    return (
      <div className="rounded bg-amber-50 border border-amber-100 p-2 text-xs text-amber-800">
        <strong>AI analysis:</strong> {explanation}
      </div>
    );
  }

  const patternMeta    = PATTERN_META[analysis.pattern] ?? PATTERN_META.unknown!;
  const confidencePct  = Math.round(analysis.confidence * 100);
  const confidenceColor = confidencePct >= 80 ? "text-emerald-700" : confidencePct >= 50 ? "text-amber-700" : "text-red-700";

  return (
    <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-3 space-y-3">
      {/* Header: pattern + confidence */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${patternMeta.color}`}>
          {patternMeta.label}
        </span>
        <span className={`text-[10px] font-semibold ${confidenceColor}`}>
          AI confidence: {confidencePct}%
        </span>
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-800 leading-relaxed">
        <strong>Analysis:</strong> {analysis.summary}
      </p>

      {/* Findings */}
      {analysis.findings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">What we found</p>
          {analysis.findings.map((f, i) => {
            const meta = FINDING_META[f.type] ?? FINDING_META.other!;
            return (
              <div key={i} className={`text-xs rounded border px-2 py-1.5 ${meta.color}`}>
                <div className="flex items-start gap-2">
                  <span className="font-bold shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{meta.label}{f.amount !== undefined && ` — ₹${f.amount.toLocaleString("en-IN")}`}</p>
                    <p className="mt-0.5 leading-relaxed">{f.description}</p>
                    {f.items && f.items.length > 0 && (
                      <p className="mt-1 text-[10px] font-mono opacity-75">
                        Refs: {f.items.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {analysis.actions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recommended actions</p>
          <ol className="text-xs text-slate-800 space-y-1 list-decimal list-inside">
            {analysis.actions.map((a, i) => (
              <li key={i} className="leading-relaxed">{a}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Flux analysis result card ────────────────────────────────────────────────

const FLUX_PATTERN_META: Record<string, { label: string; color: string }> = {
  seasonal:     { label: "Seasonal",       color: "bg-blue-100 text-blue-800" },
  one_time:     { label: "One-time event", color: "bg-violet-100 text-violet-800" },
  trend_change: { label: "Trend change",   color: "bg-amber-100 text-amber-800" },
  data_error:   { label: "Data error",     color: "bg-red-100 text-red-800" },
  new_activity: { label: "New activity",   color: "bg-emerald-100 text-emerald-800" },
  discontinued: { label: "Discontinued",   color: "bg-slate-100 text-slate-700" },
  unknown:      { label: "Unclear",        color: "bg-slate-100 text-slate-600" },
};

function FluxResultCard({ run, connectionId, periodId, periodEnd }: {
  run:          FluxRunPersisted;
  connectionId: string | null;
  periodId:     string;
  periodEnd:    string;
}) {
  const [showAll, setShowAll] = useState(false);
  const changes = run.result.changes ?? [];
  const material = changes.filter((c) => c.isMaterial);

  const fmtDateShort = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-blue-100 bg-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-semibold text-slate-900">Period-over-period analysis</p>
          </div>
          <p className="text-xs text-slate-500">
            {fmtDateShort(run.priorPeriodStart)}–{fmtDateShort(run.priorPeriodEnd)} vs {fmtDateShort(run.currentPeriodStart)}–{fmtDateShort(run.currentPeriodEnd)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Accounts</p>
            <p className="text-lg font-bold text-slate-900">{run.totalAccounts}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Material</p>
            <p className={`text-lg font-bold ${run.materialCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {run.materialCount}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Total movement</p>
            <p className="text-lg font-bold text-slate-900">{formatINR(run.totalAbsVariance)}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Last run: {new Date(run.lastRunAt).toLocaleString("en-IN")} · Took {(run.durationMs / 1000).toFixed(1)}s
        </p>
      </div>

      {/* Material variances */}
      {material.length === 0 ? (
        <div className="p-4 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
          <p className="text-sm font-medium text-emerald-700">No material variances</p>
          <p className="text-xs text-slate-500 mt-0.5">All account movements are within material thresholds.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {(showAll ? material : material.slice(0, 5)).map((c) => (
            <FluxAccountInline
              key={c.accountName}
              change={c}
              connectionId={connectionId}
              periodId={periodId}
              periodEnd={periodEnd}
            />
          ))}
          {material.length > 5 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="w-full py-2 text-xs text-blue-700 hover:bg-blue-50"
            >
              {showAll ? "Show less" : `Show all ${material.length} material variances`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FluxAccountInline({ change, connectionId, periodId, periodEnd }: {
  change:       FluxAccountChange;
  connectionId: string | null;
  periodId:     string;
  periodEnd:    string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isUp = change.variance > 0;
  const hasAnalysis = !!change.analysis;
  const variancePct = isFinite(change.variancePct)
    ? `${change.variancePct > 0 ? "+" : ""}${change.variancePct.toFixed(1)}%`
    : "new";

  return (
    <div className="bg-white">
      <button
        onClick={() => hasAnalysis && setExpanded((e) => !e)}
        disabled={!hasAnalysis}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
      >
        {isUp
          ? <TrendingUp   className="h-4 w-4 text-amber-600 shrink-0" />
          : <TrendingDown className="h-4 w-4 text-red-600 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900 truncate">{change.accountName}</span>
            {hasAnalysis && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
                <Sparkles className="h-2 w-2" /> AI
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatINR(change.priorBalance)} → {formatINR(change.currentBalance)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${isUp ? "text-amber-700" : "text-red-700"}`}>
            {isUp ? "+" : ""}{formatINR(change.variance)}
          </p>
          <p className="text-xs text-slate-500">{variancePct}</p>
        </div>
        {hasAnalysis && (
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {expanded && change.analysis && (
        <div className="px-4 pb-3 pt-1 bg-slate-50/50 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${FLUX_PATTERN_META[change.analysis.pattern]?.color ?? FLUX_PATTERN_META.unknown!.color}`}>
              {FLUX_PATTERN_META[change.analysis.pattern]?.label ?? "Unclear"}
            </span>
            <span className="text-[10px] text-slate-500">
              {Math.round(change.analysis.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            {change.analysis.summary}
          </p>
          {change.analysis.causes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Likely causes</p>
              <ul className="text-xs text-slate-700 list-disc list-inside space-y-0.5">
                {change.analysis.causes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {change.analysis.actions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Recommended actions</p>
              <ol className="text-xs text-slate-700 list-decimal list-inside space-y-0.5">
                {change.analysis.actions.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </div>
          )}
          {(() => {
            const k = patternKeyForFlux({
              accountName: change.accountName,
              periodEnd,
              direction:   isUp ? "increase" : "decrease",
            });
            return (
              <KnowledgeCapturePrompt
                patternKey={k.patternKey}
                source={k.source}
                sourceRef={k.sourceRef}
                connectionId={connectionId}
                periodId={periodId}
                context={`${change.accountName} ${isUp ? "increased" : "decreased"} by ${formatINR(Math.abs(change.variance))}`}
                question="Is this variance expected for this period?"
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Scan issue card (for anomaly-driven CUSTOM tasks) ──────────────────────

function ScanIssueCard({ issue }: { issue: ScanIssue }) {
  const columns = issue.examples[0] ? Object.keys(issue.examples[0]) : [];
  const fmtCell = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      return new Date(v).toLocaleDateString("en-IN");
    }
    return String(v);
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-red-100 bg-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-500" />
          <p className="text-sm font-semibold text-slate-900">Affected rows ({issue.affectedRows})</p>
        </div>
        {issue.exposure !== null && issue.exposure > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-white font-semibold">
            {formatINR(issue.exposure)} exposure
          </span>
        )}
      </div>

      {issue.examples.length > 0 && columns.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {issue.examples.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-slate-700 font-mono whitespace-nowrap">
                      {fmtCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {issue.affectedRows > issue.examples.length && (
            <p className="text-xs text-slate-500 px-3 py-2 italic bg-slate-50">
              Showing {issue.examples.length} of {issue.affectedRows} affected rows. Use Query Studio to see all.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 p-3 italic">No example rows available.</p>
      )}
    </div>
  );
}

// ─── P&L Review AI card ──────────────────────────────────────────────────────

const CONFIDENCE_META: Record<string, { label: string; color: string }> = {
  high_confidence_clean:    { label: "Looks ready",          color: "bg-emerald-100 text-emerald-800" },
  high_confidence_concerns: { label: "Concerns found",       color: "bg-amber-100 text-amber-800" },
  medium_confidence:        { label: "Needs review",         color: "bg-blue-100 text-blue-800" },
  low_confidence:           { label: "Cannot fully assess",  color: "bg-slate-100 text-slate-700" },
  blocked:                  { label: "Cannot proceed",       color: "bg-red-100 text-red-800" },
};

function PlReviewCard({ session, answers, onAnswerChange, onSubmit, loading, connectionId, periodId }: {
  session:        PlSessionResponse;
  answers:        Record<string, string>;
  onAnswerChange: (qid: string, val: string) => void;
  onSubmit:       () => void;
  loading:        boolean;
  connectionId:   string | null;
  periodId:       string;
}) {
  if (!session.report) return null;
  const r = session.report;
  const conf = CONFIDENCE_META[r.confidenceLabel] ?? CONFIDENCE_META.medium_confidence!;
  const isAwaitingUser = session.state === "awaiting_user";
  const questionsToShow = session.questions ?? r.questionsAsked;

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white overflow-hidden">

      {/* Header: confidence + assessment */}
      <div className="px-4 py-3 border-b border-emerald-100 bg-white">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-900">AI P&amp;L Review</p>
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${conf.color}`}>
            {conf.label}
          </span>
        </div>
        <p className="text-xs text-slate-700 mt-2 leading-relaxed">{r.overallAssessment}</p>
      </div>

      {/* Headline numbers */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/50 border-b border-slate-100">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Revenue</p>
          <p className="text-sm font-bold text-slate-900">{fmt(r.headlineNumbers.revenue)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Gross Profit</p>
          <p className="text-sm font-bold text-slate-900">{fmt(r.headlineNumbers.grossProfit)}</p>
          <p className="text-[10px] text-slate-500">{r.headlineNumbers.grossMarginPct.toFixed(1)}% margin</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Op. Expenses</p>
          <p className="text-sm font-bold text-slate-900">{fmt(r.headlineNumbers.operatingExpenses)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Op. Profit</p>
          <p className="text-sm font-bold text-slate-900">{fmt(r.headlineNumbers.operatingProfit)}</p>
          <p className="text-[10px] text-slate-500">{r.headlineNumbers.netProfitPct.toFixed(1)}% of revenue</p>
        </div>
      </div>

      {/* Questions for user (if awaiting answer) */}
      {isAwaitingUser && questionsToShow.length > 0 && (
        <div className="p-4 bg-amber-50/40 border-b border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {questionsToShow.length} quick question{questionsToShow.length > 1 ? "s" : ""} to finalize the review
          </p>
          <div className="space-y-3">
            {questionsToShow.map((q, i) => (
              <div key={q.id} className="bg-white rounded border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">
                  {i + 1}. {q.questionText}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {q.whyAsking} ({fmt(q.materialityInr)} at stake)
                </p>
                <div className="mt-2 space-y-1">
                  {q.options && q.options.length > 0 ? (
                    q.options.map((opt, j) => (
                      <label key={j} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={(e) => onAnswerChange(q.id, e.target.value)}
                        />
                        {opt}
                      </label>
                    ))
                  ) : (
                    <Textarea
                      placeholder="Your answer (or skip)…"
                      value={answers[q.id] ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onAnswerChange(q.id, e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onAnswerChange(q.id, "__skip__")}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      answers[q.id] === "__skip__" ? "bg-slate-300 text-slate-700" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    Skip / make best guess
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" onClick={onSubmit} disabled={loading} className="mt-3 w-full">
            {loading ? <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />}
            Submit answers and finalize
          </Button>
        </div>
      )}

      {/* Investigations */}
      {r.investigations.length > 0 && (
        <div className="p-4 space-y-2 border-b border-slate-100">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Investigations ({r.investigations.length})</p>
          {r.investigations.slice(0, 5).map((inv, i) => {
            const k = patternKeyForAgentQuestion({ agentType: "pl_review", question: inv.question });
            return (
              <div key={i} className="text-xs border-l-2 border-slate-200 pl-3 py-1">
                <p className="font-medium text-slate-800">{inv.question}</p>
                <p className="text-slate-600 mt-0.5">{inv.findings}</p>
                <p className="text-slate-500 mt-0.5 italic">→ {inv.conclusion}</p>
                <KnowledgeCapturePrompt
                  patternKey={k.patternKey}
                  source={k.source}
                  sourceRef={k.sourceRef}
                  connectionId={connectionId}
                  periodId={periodId}
                  context={`P&L review: ${inv.question}`}
                  question="Is this conclusion correct for your business?"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Concerns */}
      {r.concerns.length > 0 && (
        <div className="p-4 space-y-1.5 border-b border-slate-100 bg-red-50/30">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">Concerns ({r.concerns.length})</p>
          {r.concerns.map((c, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">{c.issue}</p>
                <p className="text-red-700 mt-0.5">{c.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assumptions */}
      {r.assumptions.length > 0 && (
        <div className="p-4 space-y-1 bg-slate-50/50">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Assumptions made ({r.assumptions.length}) — below ask threshold
          </p>
          {r.assumptions.slice(0, 5).map((a, i) => (
            <p key={i} className="text-[11px] text-slate-600">• {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

interface ScanIssue {
  code:         string;
  severity:     string;
  category:     string;
  title:        string;
  description:  string;
  affectedRows: number;
  exposure:     number | null;
  examples:     Record<string, unknown>[];
}

// Map task title patterns to scanner issue codes (must match task-generator.ts titles)
function deriveIssueCode(title: string): string | null {
  if (/Dr ≠ Cr/.test(title))                         return "voucher_imbalance";
  if (/duplicate transaction/i.test(title))           return "duplicate_transactions";
  if (/dated outside/i.test(title))                   return "date_outliers";
  if (/missing field/i.test(title))                   return "missing_fields";
  if (/unmapped account|unclassified/i.test(title))   return "unclassified_accounts";
  if (/CGST ≠ SGST/i.test(title))                     return "gst_mismatch";
  if (/unusual sign/i.test(title))                    return "sign_anomalies";
  return null;
}

function TaskRow({ task, allTasks, onUpdate, isNextUp, startDate, endDate, periodId, connectionId }: {
  task:         Task;
  allTasks:     Task[];
  onUpdate:     (updated: Task) => void;
  isNextUp:     boolean;
  startDate:    string;
  endDate:      string;
  periodId:     string;
  connectionId: string | null;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [saving,   setSaving]     = useState(false);
  const [notes,    setNotes]      = useState(task.notes ?? "");
  const [fluxRun,  setFluxRun]    = useState<FluxRunPersisted | null>(null);
  const [fluxLoading, setFluxLoading] = useState(false);
  const [scanIssue, setScanIssue] = useState<ScanIssue | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);

  const meta        = STATUS_META[task.status] ?? STATUS_META.PENDING!;
  const transitions = STATUS_TRANSITIONS[task.status] ?? [];
  const recon       = task.reconciliations[0];
  const isFluxTask  = task.category === "FLUX_ANALYSIS";
  const isAnomalyTask = task.category === "CUSTOM";
  // P&L Review detection — task title or sortOrder
  const isPlReviewTask = /p&?l review/i.test(task.title);

  // Derive issue code from task title (matches the title patterns in task-generator.ts)
  const issueCode = isAnomalyTask ? deriveIssueCode(task.title) : null;

  // P&L review state
  const [plSession, setPlSession] = useState<PlSessionResponse | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plAnswers, setPlAnswers] = useState<Record<string, string>>({});

  // Fetch existing flux run when expanded for the first time
  useEffect(() => {
    if (!expanded || !isFluxTask || fluxRun) return;
    setFluxLoading(true);
    fetch(`/api/v1/close/tasks/${task.id}/flux`)
      .then((r) => r.json())
      .then((d: { run: FluxRunPersisted | null }) => setFluxRun(d.run))
      .finally(() => setFluxLoading(false));
  }, [expanded, isFluxTask, task.id, fluxRun]);

  // Fetch existing P&L session when P&L Review task is expanded
  useEffect(() => {
    if (!expanded || !isPlReviewTask || plSession) return;
    setPlLoading(true);
    fetch(`/api/v1/close/tasks/${task.id}/pl-review`)
      .then((r) => r.json())
      .then((d: { session: PlSessionResponse | null }) => {
        if (d.session) setPlSession(d.session);
      })
      .finally(() => setPlLoading(false));
  }, [expanded, isPlReviewTask, task.id, plSession]);

  // Fetch scan issue details when CUSTOM (anomaly) task is expanded
  useEffect(() => {
    if (!expanded || !isAnomalyTask || !issueCode || scanIssue) return;
    setIssueLoading(true);
    fetch(`/api/v1/close/periods/${periodId}/scan-issue?code=${encodeURIComponent(issueCode)}`)
      .then((r) => r.json())
      .then((d: { issue: ScanIssue | null }) => setScanIssue(d.issue))
      .finally(() => setIssueLoading(false));
  }, [expanded, isAnomalyTask, issueCode, periodId, scanIssue]);

  const blockerTitles = task.dependsOnIds
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t && t.status !== "COMPLETED")
    .map((t) => t.title);

  async function changeStatus(status: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/close/tasks/${task.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status, notes: notes || undefined }),
      });
      if (res.ok) {
        const updated = await res.json() as Task;
        onUpdate(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runRecon(reconId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/close/reconcile/${reconId}`, { method: "POST" });
      if (res.ok) {
        // Reload the whole task to get updated status + recon result
        const taskRes = await fetch(`/api/v1/close/tasks/${task.id}`);
        if (taskRes.ok) onUpdate(await taskRes.json() as Task);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runFlux() {
    setFluxLoading(true);
    try {
      const res = await fetch(`/api/v1/close/tasks/${task.id}/flux`, { method: "POST" });
      if (res.ok) {
        const run = await res.json() as FluxRunPersisted;
        setFluxRun(run);
      }
    } finally {
      setFluxLoading(false);
    }
  }

  async function runPlReview() {
    setPlLoading(true);
    try {
      const res = await fetch(`/api/v1/close/tasks/${task.id}/pl-review`, { method: "POST" });
      if (res.ok) {
        const data = await res.json() as PlSessionResponse;
        setPlSession(data);
        setPlAnswers({});
      }
    } finally {
      setPlLoading(false);
    }
  }

  async function submitPlAnswers() {
    if (!plSession) return;
    const questionsToAnswer = plSession.questions ?? plSession.report?.questionsAsked ?? [];
    const answersPayload = questionsToAnswer.map((q) => ({
      questionId: q.id,
      answer:     plAnswers[q.id] ?? "",
      skipped:    !plAnswers[q.id] || plAnswers[q.id] === "__skip__",
    }));

    setPlLoading(true);
    try {
      const res = await fetch(`/api/v1/close/tasks/${task.id}/pl-review`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: plSession.sessionId, answers: answersPayload }),
      });
      if (res.ok) {
        const result = await res.json() as { state: string; report: PLAgentReport };
        setPlSession({ ...plSession, state: result.state, report: result.report, questions: undefined });
      }
    } finally {
      setPlLoading(false);
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/close/tasks/${task.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ notes }),
      });
      if (res.ok) {
        const updated = await res.json() as Task;
        onUpdate(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`relative bg-white rounded-lg overflow-hidden card-elevated card-elevated-hover
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0
        before:w-[3px] ${meta.rail}
        ${task.status === "FAILED" ? "ring-soft-rose" : ""}
        ${isNextUp ? "ring-soft-indigo" : ""}`}
    >
      {/* Header row */}
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50/50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="mt-0.5 shrink-0">{meta.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold tabular-nums tracking-wide ${task.status === "BLOCKED" ? "text-slate-300" : "text-slate-400"}`}>
              {String(task.sortOrder).padStart(2, "0")}
            </span>
            <span className={`font-medium text-sm leading-snug ${task.status === "BLOCKED" ? "text-slate-400" : "text-slate-900"}`}>
              {task.title}
            </span>
            <span className={`pill ${CATEGORY_COLOR[task.category] ?? CATEGORY_COLOR.REVIEW}`}>
              {CATEGORY_LABEL[task.category] ?? task.category}
            </span>
            {task.autoComplete && (
              <span className="pill bg-violet-50 text-violet-700 border-violet-200">
                <Zap className="h-2.5 w-2.5" /> AUTO
              </span>
            )}
            {isNextUp && (
              <span className="pill bg-indigo-600 text-white border-indigo-600 shadow-sm">
                Start here
              </span>
            )}
          </div>

          {/* Recon result inline */}
          {recon && (
            <div className={`mt-1.5 text-xs flex items-center gap-1.5 ${
              recon.status === "PASSED" ? "text-emerald-600" :
              recon.status === "FAILED" ? "text-rose-600" : "text-slate-400"
            }`}>
              {recon.status === "PASSED" && <CheckCircle2 className="h-3 w-3" />}
              {recon.status === "FAILED" && <XCircle      className="h-3 w-3" />}
              {recon.status === "PENDING" && <Circle      className="h-3 w-3" />}
              <span>{recon.name}</span>
              {recon.variance !== null && (
                <span className="text-slate-400">·</span>
              )}
              {recon.variance !== null && (
                <span className="tabular-nums">
                  Variance: <strong className="text-current">{formatINR(recon.variance)}</strong>
                </span>
              )}
            </div>
          )}

          {/* Blockers */}
          {task.status === "BLOCKED" && blockerTitles.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-600">
              <span className="font-medium">Waiting on:</span> {blockerTitles.join(", ")}
            </p>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
          {/* Actions row — status transitions + Run Reconciliation */}
          <div className="flex items-center gap-2 flex-wrap">
            {transitions.length > 0 && (
              <>
                <span className="text-xs text-slate-500 font-medium">Mark as:</span>
                {transitions.map((s) => (
                  <Button key={s} variant="outline" size="sm" disabled={saving}
                    onClick={() => changeStatus(s)} className="text-xs h-7">
                    {saving && <RefreshCw className="h-3 w-3 animate-spin mr-1" />}
                    {s === "IN_PROGRESS" ? "Start" : s === "COMPLETED" ? "Complete" : s === "FAILED" ? "Mark Failed" : "Reset"}
                  </Button>
                ))}
              </>
            )}
            {/* Run Reconciliation button — only for auto-complete tasks with a recon */}
            {task.autoComplete && recon && task.status !== "BLOCKED" && (
              <Button
                variant="outline" size="sm" disabled={saving}
                onClick={() => runRecon(recon.id)}
                className="text-xs h-7 ml-auto border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                {saving
                  ? <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                  : <Zap className="h-3 w-3 mr-1.5" />}
                Run Reconciliation
              </Button>
            )}

            {/* Run Flux Analysis button — only for FLUX_ANALYSIS category tasks */}
            {isFluxTask && task.status !== "BLOCKED" && (
              <Button
                variant="outline" size="sm" disabled={fluxLoading}
                onClick={runFlux}
                className="text-xs h-7 ml-auto border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {fluxLoading
                  ? <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                  : <Activity className="h-3 w-3 mr-1.5" />}
                {fluxRun ? "Re-run Flux Analysis" : "Run Flux Analysis"}
              </Button>
            )}

            {/* Run P&L Review button — only for P&L Review tasks */}
            {isPlReviewTask && task.status !== "BLOCKED" && (
              <Button
                variant="outline" size="sm" disabled={plLoading}
                onClick={runPlReview}
                className="text-xs h-7 ml-auto border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                {plLoading
                  ? <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                  : <Sparkles className="h-3 w-3 mr-1.5" />}
                {plSession ? "Re-run AI Review" : "Run AI Review"}
              </Button>
            )}
          </div>

          {/* Flux analysis result panel */}
          {isFluxTask && fluxRun && (
            <FluxResultCard
              run={fluxRun}
              connectionId={connectionId}
              periodId={periodId}
              periodEnd={endDate}
            />
          )}
          {isFluxTask && !fluxRun && !fluxLoading && (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center">
              <Activity className="h-6 w-6 text-slate-300 mx-auto mb-1" />
              <p className="text-xs text-slate-500">No flux analysis yet. Click <strong>Run Flux Analysis</strong> above.</p>
            </div>
          )}

          {/* P&L Review result panel */}
          {isPlReviewTask && plLoading && !plSession && (
            <div className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">
              <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin text-slate-400" />
              Running AI P&L review (computing numbers, detecting anomalies, asking smart questions)…
            </div>
          )}
          {isPlReviewTask && plSession && (
            <PlReviewCard
              session={plSession}
              answers={plAnswers}
              onAnswerChange={(qid, val) => setPlAnswers((prev) => ({ ...prev, [qid]: val }))}
              onSubmit={submitPlAnswers}
              loading={plLoading}
              connectionId={connectionId}
              periodId={periodId}
            />
          )}
          {isPlReviewTask && !plSession && !plLoading && (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center">
              <Sparkles className="h-6 w-6 text-slate-300 mx-auto mb-1" />
              <p className="text-xs text-slate-500">No P&L review yet. Click <strong>Run AI Review</strong> above.</p>
            </div>
          )}

          {/* Scan issue details — for anomaly-driven CUSTOM tasks */}
          {isAnomalyTask && issueLoading && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Loading affected rows…</div>
          )}
          {isAnomalyTask && scanIssue && (
            <>
              <ScanIssueCard issue={scanIssue} />
              {(() => {
                const k = patternKeyForScanIssue({ issueCode: scanIssue.code });
                // Include scale signals (affectedRows + exposure) in sourceRef so
                // future auto-resolve can compare scale before silently applying
                // the user's prior answer to a new occurrence. See
                // applyKnowledgeBase in api/v1/close/periods for the gate.
                const sourceRefWithScale = {
                  ...k.sourceRef,
                  affectedRows: scanIssue.affectedRows,
                  exposure:     scanIssue.exposure ?? 0,
                };
                return (
                  <KnowledgeCapturePrompt
                    patternKey={k.patternKey}
                    source={k.source}
                    sourceRef={sourceRefWithScale}
                    connectionId={connectionId}
                    periodId={periodId}
                    context={`Scan flagged: ${scanIssue.title} (${scanIssue.affectedRows} rows)`}
                    question="Is this normal for your books?"
                  />
                );
              })()}
            </>
          )}
          {isAnomalyTask && !issueLoading && !scanIssue && (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500 text-center">
              Specific row data not available for this task. Use the Query Studio link below to investigate.
            </div>
          )}

          {/* View in Query Studio — manual tasks only */}
          {!task.autoComplete && (() => {
            const q = studioQuestion(task.sortOrder, startDate, endDate);
            if (!q) return null;
            return (
              <a
                href={`/query?q=${encodeURIComponent(q)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View relevant data in Query Studio
              </a>
            );
          })()}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Notes
            </label>
            <Textarea
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Add notes for this task…"
              rows={2}
              className="text-sm resize-none"
            />
            {notes !== (task.notes ?? "") && (
              <Button size="sm" variant="outline" onClick={saveNotes} disabled={saving} className="text-xs h-7">
                Save notes
              </Button>
            )}
          </div>

          {/* Recon detail */}
          {recon && recon.status !== "PENDING" && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">{recon.name}</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Source balance</p>
                  <p className="font-semibold text-slate-900">{formatINR(recon.sourceBalance)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Target balance</p>
                  <p className="font-semibold text-slate-900">{formatINR(recon.targetBalance)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Variance</p>
                  <p className={`font-semibold ${recon.variance && recon.variance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatINR(recon.variance)}
                  </p>
                </div>
              </div>
              {recon.aiExplanation && <ReconAnalysisCard explanation={recon.aiExplanation} />}
              {recon.status === "FAILED" && (() => {
                const k = patternKeyForRecon({ reconName: recon.name });
                return (
                  <KnowledgeCapturePrompt
                    patternKey={k.patternKey}
                    source={k.source}
                    sourceRef={k.sourceRef}
                    connectionId={connectionId}
                    periodId={periodId}
                    context={`${recon.name} variance: ${formatINR(recon.variance)}`}
                    question="Is this variance expected?"
                  />
                );
              })()}
              {recon.lastRunAt && (
                <p className="text-xs text-slate-400">
                  Last run: {new Date(recon.lastRunAt).toLocaleString("en-IN")}
                </p>
              )}
            </div>
          )}

          {/* Assignee info */}
          {task.assigneeId && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Assigned
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClosePeriodPage({ params }: { params: { periodId: string } }) {
  const { periodId } = params;
  const [period,   setPeriod]   = useState<Period | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading,  setLoading]  = useState(true);

  const [runningAll, setRunningAll] = useState(false);
  const [reasoning,  setReasoning]  = useState<string[] | null>(null);
  // Expanded by default — the reasoning trail is the trust-builder for
  // first-time users. They can collapse if they want (state not persisted).
  const [showReasoning, setShowReasoning] = useState(true);
  const [readiness, setReadiness] = useState<ReadinessScore | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(`close-reasoning-${periodId}`);
    if (stored) {
      try { setReasoning(JSON.parse(stored) as string[]); } catch { /* ignore */ }
    }
  }, [periodId]);

  async function loadReadiness() {
    setReadinessLoading(true);
    try {
      const res = await fetch(`/api/v1/close/periods/${periodId}/readiness`);
      if (res.ok) setReadiness(await res.json() as ReadinessScore);
    } finally {
      setReadinessLoading(false);
    }
  }

  useEffect(() => { loadReadiness(); }, [periodId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/close/periods/${periodId}`);
      if (res.ok) {
        const data = await res.json() as { period: Period; progress: Progress };
        setPeriod(data.period);
        setProgress(data.progress);
      }
    } finally {
      setLoading(false);
    }
  }

  async function runAllRecons() {
    setRunningAll(true);
    try {
      await fetch(`/api/v1/close/periods/${periodId}/reconcile`, { method: "POST" });
      await load(); // reload to get updated statuses
    } finally {
      setRunningAll(false);
    }
  }

  useEffect(() => { load(); }, [periodId]);

  function handleTaskUpdate(updated: Task) {
    setPeriod((prev) => {
      if (!prev) return prev;
      const tasks = prev.tasks.map((t) => t.id === updated.id ? updated : t);
      const done  = tasks.filter((t) => t.status === "COMPLETED").length;
      const pct   = Math.round((done / tasks.length) * 100);
      return { ...prev, tasks, completionPct: pct };
    });
    setProgress((prev) => {
      if (!prev) return prev;
      return { ...prev, completed: prev.completed + 1, pct: prev.pct };
    });
    // Recompute readiness in the background — task changes affect score
    loadReadiness();
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-3 py-2">
        <div className="h-8 w-48 rounded bg-slate-100 animate-pulse" />
        <div className="h-4 w-64 rounded bg-slate-100 animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!period) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-sm text-slate-500">Period not found.</p>
        <Link href="/close"><Button variant="ghost" size="sm" className="mt-2">← Back</Button></Link>
      </div>
    );
  }

  const prog = progress ?? { total: 0, completed: 0, inProgress: 0, failed: 0, blocked: 0, pending: 0, pct: 0 };

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">

      {/* Hero header — subtle gradient + refined typography */}
      <div className="bg-hero-default border-b border-slate-200/70 -mx-6 -mt-6 px-6 pt-6 pb-5 mb-2">
        <Link
          href="/close"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All periods
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">
              {period.name}
            </h1>
            <p className="text-sm text-slate-500 mt-1 tabular-nums">
              {new Date(period.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              <span className="mx-1.5 text-slate-300">→</span>
              {new Date(period.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm"
              onClick={runAllRecons}
              disabled={runningAll || loading}
              className="h-8 text-xs gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
            >
              {runningAll
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Zap className="h-3.5 w-3.5" />}
              Run all recons
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={loading}
              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Close Readiness Score (most prominent) */}
      <ReadinessCard readiness={readiness} onRefresh={loadReadiness} loading={readinessLoading} />

      {/* Progress bar + stats */}
      <div className="rounded-xl bg-white card-elevated p-5 space-y-3.5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workflow Progress</p>
            <p className="text-sm font-medium text-slate-700 mt-1 tabular-nums">
              <span className="text-slate-900 font-semibold">{prog.completed}</span>
              <span className="text-slate-400"> / {prog.total}</span>
              <span className="ml-1 text-slate-500">tasks complete</span>
            </p>
          </div>
          <span className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
            {period.completionPct}<span className="text-base text-slate-400 font-medium">%</span>
          </span>
        </div>
        <ProgressBar pct={period.completionPct} />
        <div className="flex gap-4 text-xs text-slate-500">
          {prog.inProgress > 0 && <span className="text-blue-600 font-medium">{prog.inProgress} in progress</span>}
          {prog.failed     > 0 && <span className="text-red-600  font-medium">{prog.failed} failed</span>}
          {prog.blocked    > 0 && <span className="text-amber-600 font-medium">{prog.blocked} blocked</span>}
          {prog.pending    > 0 && <span>{prog.pending} pending</span>}
        </div>
      </div>

      {/* Profile + intent panel — what the user configured at creation time */}
      <ProfileIntentPanel period={period} />

      {/* Adaptive reasoning panel */}
      {reasoning && reasoning.length > 0 && (
        <div className="rounded-xl bg-white card-elevated overflow-hidden">
          <button
            onClick={() => setShowReasoning((s) => !s)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="flex items-center gap-2.5 text-sm flex-wrap">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-indigo-100 text-indigo-600 shrink-0">
                <Zap className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium text-slate-900">
                {period.tasks.length} tasks generated from your data
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="pill bg-rose-50 text-rose-700 border-rose-200">
                  {reasoning.filter((r) => r.startsWith("Anomaly:")).length} anomaly
                </span>
                <span className="pill bg-blue-50 text-blue-700 border-blue-200">
                  {reasoning.filter((r) => r.startsWith("Account-driven:")).length} account
                </span>
                <span className="pill bg-slate-50 text-slate-600 border-slate-200">
                  {reasoning.filter((r) => r.startsWith("Skipped:")).length} skipped
                </span>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showReasoning ? "rotate-180" : ""}`} />
          </button>
          {showReasoning && (
            <div className="px-4 py-3 border-t border-blue-200 bg-white space-y-1.5">
              <p className="text-xs font-semibold text-slate-700 mb-2">Why these tasks?</p>
              <ul className="space-y-1 text-xs">
                {reasoning.map((r, i) => {
                  const isSkipped = r.startsWith("Skipped:");
                  const isAnomaly = r.startsWith("Anomaly:");
                  const isAccount = r.startsWith("Account-driven:");
                  const isAlways  = r.startsWith("Always:");
                  return (
                    <li key={i} className={`flex items-start gap-2 ${isSkipped ? "text-slate-400" : "text-slate-700"}`}>
                      <span className={`mt-0.5 shrink-0 ${
                        isSkipped ? "text-slate-300" :
                        isAnomaly ? "text-red-500" :
                        isAccount ? "text-blue-500" :
                        isAlways ? "text-emerald-500" : "text-slate-400"
                      }`}>•</span>
                      <span>{r}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tasks section header + legend */}
      <div className="flex items-end justify-between gap-4 pt-2 mt-1">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tasks</h2>
          <p className="text-xs text-slate-500 mt-0.5">Work through each task in order. Auto tasks complete on their own.</p>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Pending</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Active</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Done</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Failed</span>
        </div>
      </div>

      {/* Task list */}
      {(() => {
        const nextUpId = period.tasks.find(
          (t) => t.status === "PENDING" || t.status === "IN_PROGRESS"
        )?.id;

        return (
          <div className="space-y-2">
            {period.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                allTasks={period.tasks}
                onUpdate={handleTaskUpdate}
                isNextUp={task.id === nextUpId && task.status === "PENDING"}
                startDate={period.startDate}
                endDate={period.endDate}
                periodId={periodId}
                connectionId={period.connectionId ?? null}
              />
            ))}
          </div>
        );
      })()}

      {/* Bottom nav */}
      <div className="flex justify-between items-center pt-2 pb-6">
        <Link href="/close">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" /> All periods
          </Button>
        </Link>
        {period.status !== "COMPLETED" && (
          <Link href={`/close/${period.id}/dashboard`}>
            <Button variant="outline" size="sm">
              CFO Dashboard <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

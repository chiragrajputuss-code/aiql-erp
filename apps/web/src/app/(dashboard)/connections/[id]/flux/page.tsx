"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, ChevronLeft, RefreshCw, Activity,
  AlertCircle, ChevronDown, Sparkles, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FluxAnalysisDetail {
  pattern:    string;
  summary:    string;
  causes:     string[];
  actions:    string[];
  confidence: number;
}

interface AccountChange {
  accountName:    string;
  accountType:    string;
  currentBalance: number;
  priorBalance:   number;
  variance:       number;
  variancePct:    number;
  isMaterial:     boolean;
  analysis?:      FluxAnalysisDetail | null;
}

interface FluxResult {
  connectionId:    string;
  currentPeriod:   { start: string; end: string };
  priorPeriod:     { start: string; end: string };
  totalAccounts:   number;
  materialCount:   number;
  totalAbsVariance: number;
  changes:         AccountChange[];
  scannedAt:       string;
  durationMs:      number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PATTERN_META: Record<string, { label: string; color: string }> = {
  seasonal:       { label: "Seasonal",       color: "bg-blue-100 text-blue-800" },
  one_time:       { label: "One-time event", color: "bg-violet-100 text-violet-800" },
  trend_change:   { label: "Trend change",   color: "bg-amber-100 text-amber-800" },
  data_error:     { label: "Data error",     color: "bg-red-100 text-red-800" },
  new_activity:   { label: "New activity",   color: "bg-emerald-100 text-emerald-800" },
  discontinued:   { label: "Discontinued",   color: "bg-slate-100 text-slate-700" },
  unknown:        { label: "Unclear pattern",color: "bg-slate-100 text-slate-600" },
};

const TYPE_COLOR: Record<string, string> = {
  REVENUE:           "bg-green-50 text-green-700",
  OTHER_INCOME:      "bg-green-50 text-green-700",
  EXPENSE:           "bg-rose-50 text-rose-700",
  COGS:              "bg-rose-50 text-rose-700",
  BANK:              "bg-blue-50 text-blue-700",
  CASH:              "bg-blue-50 text-blue-700",
  RECEIVABLE:        "bg-emerald-50 text-emerald-700",
  PAYABLE:           "bg-amber-50 text-amber-700",
  TAX:               "bg-violet-50 text-violet-700",
  INVENTORY:         "bg-orange-50 text-orange-700",
  FIXED_ASSET:       "bg-slate-50 text-slate-700",
  CURRENT_ASSET:     "bg-teal-50 text-teal-700",
  CURRENT_LIABILITY: "bg-red-50 text-red-700",
  EQUITY:            "bg-purple-50 text-purple-700",
  UNKNOWN:           "bg-slate-50 text-slate-500",
};

function formatINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function formatPct(pct: number): string {
  if (!isFinite(pct)) return "new";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// ─── Account row ──────────────────────────────────────────────────────────────

function AccountRow({ change }: { change: AccountChange }) {
  const [expanded, setExpanded] = useState(false);
  const hasAnalysis = !!change.analysis;
  const isUp        = change.variance > 0;
  const typeColor   = TYPE_COLOR[change.accountType] ?? TYPE_COLOR.UNKNOWN!;
  const varianceColor = change.isMaterial
    ? (isUp ? "text-amber-700 font-bold" : "text-red-700 font-bold")
    : "text-slate-600";

  return (
    <div className={`rounded-lg border ${change.isMaterial ? "border-amber-200 bg-amber-50/30" : "border-slate-100 bg-white"} overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        disabled={!hasAnalysis}
      >
        {/* Direction icon */}
        <div className="shrink-0">
          {isUp
            ? <TrendingUp   className={`h-4 w-4 ${change.isMaterial ? "text-amber-600" : "text-slate-400"}`} />
            : <TrendingDown className={`h-4 w-4 ${change.isMaterial ? "text-red-600" : "text-slate-400"}`} />}
        </div>

        {/* Account name + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900 truncate">{change.accountName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeColor}`}>
              {change.accountType}
            </span>
            {change.isMaterial && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                MATERIAL
              </span>
            )}
            {hasAnalysis && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
            <span>Prior: {formatINR(change.priorBalance)}</span>
            <span>→</span>
            <span>Current: {formatINR(change.currentBalance)}</span>
          </div>
        </div>

        {/* Variance */}
        <div className="text-right shrink-0">
          <p className={`text-sm ${varianceColor}`}>
            {isUp ? "+" : ""}{formatINR(change.variance)}
          </p>
          <p className="text-xs text-slate-500">{formatPct(change.variancePct)}</p>
        </div>

        {hasAnalysis && (
          <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* AI analysis */}
      {expanded && change.analysis && (
        <div className="border-t border-slate-100 p-3 bg-slate-50/50 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PATTERN_META[change.analysis.pattern]?.color ?? PATTERN_META.unknown!.color}`}>
              {PATTERN_META[change.analysis.pattern]?.label ?? "Unclear"}
            </span>
            <span className="text-[10px] font-semibold text-slate-600">
              AI confidence: {Math.round(change.analysis.confidence * 100)}%
            </span>
          </div>

          <p className="text-xs text-slate-800 leading-relaxed">
            <strong>Summary:</strong> {change.analysis.summary}
          </p>

          {change.analysis.causes.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Likely causes</p>
              <ul className="text-xs text-slate-700 space-y-0.5 list-disc list-inside">
                {change.analysis.causes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {change.analysis.actions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recommended actions</p>
              <ol className="text-xs text-slate-700 space-y-0.5 list-decimal list-inside">
                {change.analysis.actions.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FluxAnalysisPage({ params }: { params: { id: string } }) {
  const { id: connectionId } = params;
  const defaults = getDefaultDates();

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate,   setEndDate]   = useState(defaults.end);
  const [withAI,    setWithAI]    = useState(true);
  const [result,    setResult]    = useState<FluxResult | null>(null);
  const [running,   setRunning]   = useState(false);
  const [error,     setError]     = useState("");

  async function runAnalysis() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/flux`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          endDate:   new Date(endDate).toISOString(),
          withAI,
          maxAIAnalyses: 10,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string; error?: string };
        setError(err.detail ?? err.error ?? "Flux analysis failed");
        return;
      }
      const data = await res.json() as FluxResult;
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  // Group by material / non-material
  const material    = result?.changes.filter((c) => c.isMaterial)  ?? [];
  const nonMaterial = result?.changes.filter((c) => !c.isMaterial) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">

      {/* Back nav */}
      <div>
        <Link href="/connections" className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to connections
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Flux Analysis</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Compare current period to prior period. Material variances are flagged and explained by AI.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="start" className="text-xs">Period start</Label>
            <Input id="start" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end" className="text-xs">Period end</Label>
            <Input id="end" type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pb-2">
            <input type="checkbox" checked={withAI} onChange={(e) => setWithAI(e.target.checked)}
              className="rounded border-slate-300" />
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            AI explanations for material variances
          </label>

          <Button onClick={runAnalysis} disabled={running} className="ml-auto">
            {running
              ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              : <Activity className="h-4 w-4 mr-2" />}
            {running ? "Analyzing…" : "Run flux analysis"}
          </Button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
          </p>
        )}
      </div>

      {/* Loading */}
      {running && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <RefreshCw className="h-8 w-8 text-slate-300 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-600">Comparing periods and analyzing material variances…</p>
          {withAI && <p className="text-xs text-slate-500 mt-1">AI is reviewing top 10 material accounts</p>}
        </div>
      )}

      {/* Results */}
      {!running && result && (
        <>
          {/* Summary */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Comparison</p>
            <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Calendar className="h-4 w-4" />
                Prior: {formatDate(result.priorPeriod.start)} – {formatDate(result.priorPeriod.end)}
              </span>
              <span className="text-slate-400">vs</span>
              <span className="flex items-center gap-1.5 text-slate-900 font-medium">
                <Calendar className="h-4 w-4" />
                Current: {formatDate(result.currentPeriod.start)} – {formatDate(result.currentPeriod.end)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Accounts compared</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{result.totalAccounts}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Material variances</p>
                <p className={`text-2xl font-bold mt-0.5 ${result.materialCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {result.materialCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total movement</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatINR(result.totalAbsVariance)}</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-3">
              Took {(result.durationMs / 1000).toFixed(2)}s · Material = variance &gt; ₹50K AND &gt;10%
            </p>
          </div>

          {/* Material variances */}
          {material.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Material variances ({material.length})
              </h2>
              {material.map((c) => <AccountRow key={c.accountName} change={c} />)}
            </section>
          )}

          {/* Other changes */}
          {nonMaterial.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                Other changes ({nonMaterial.length})
              </h2>
              {nonMaterial.slice(0, 30).map((c) => <AccountRow key={c.accountName} change={c} />)}
              {nonMaterial.length > 30 && (
                <p className="text-xs text-slate-500 italic px-3 py-2">
                  Showing top 30 of {nonMaterial.length}. Other changes are within material thresholds.
                </p>
              )}
            </section>
          )}

          {/* Empty state */}
          {result.changes.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-500">No account activity found in either period.</p>
            </div>
          )}
        </>
      )}

      {/* Initial */}
      {!running && !result && !error && (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <Activity className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Ready to analyze</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Set your current period above. We&apos;ll automatically compare it to the prior period of equal length and surface material variances.
          </p>
        </div>
      )}
    </div>
  );
}

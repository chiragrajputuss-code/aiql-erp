"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle, Info, CheckCircle2,
  ChevronLeft, RefreshCw, ChevronDown, Loader2, GitCompare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@aiql/pulse-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReconSeverity = "critical" | "review" | "info";

interface ReconGap {
  code:        string;
  severity:    ReconSeverity;
  title:       string;
  description: string;
  glAmount:    number | null;
  docAmount:   number | null;
  variance:    number;
  party:       string | null;
  reference:   string | null;
  glRows:      Record<string, unknown>[];
  docRows:     Record<string, unknown>[];
}

interface ReconResult {
  type:           "GL_26Q" | "GL_GSTR1";
  connectionId:   string;
  reconciledAt:   string;
  durationMs:     number;
  glTotal:        number;
  docTotal:       number;
  matchedTotal:   number;
  unmatchedTotal: number;
  totalGaps:      number;
  bySeverity:     Record<ReconSeverity, number>;
  gaps:           ReconGap[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<ReconSeverity, { icon: React.ReactNode; color: string; pillColor: string; label: string }> = {
  critical: {
    icon: <AlertCircle className="h-5 w-5 text-red-500" />,
    color: "border-l-red-500 bg-red-50/30",
    pillColor: "bg-red-100 text-red-700 border-red-200",
    label: "CRITICAL",
  },
  review: {
    icon: <AlertCircle className="h-5 w-5 text-amber-500" />,
    color: "border-l-amber-400 bg-amber-50/20",
    pillColor: "bg-amber-100 text-amber-700 border-amber-200",
    label: "REVIEW",
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-400" />,
    color: "border-l-blue-400 bg-blue-50/20",
    pillColor: "bg-blue-100 text-blue-600 border-blue-200",
    label: "INFO",
  },
};

const RECON_LABELS: Record<string, string> = {
  GL_26Q:  "GL ↔ Form 26Q (TDS)",
  GL_GSTR1: "GL ↔ GSTR-1 (Outward Supplies)",
};

function GapCard({ gap }: { gap: ReconGap }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[gap.severity];
  return (
    <div className={`border-l-4 rounded-r-lg p-4 ${meta.color} border border-slate-200/60`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold tracking-widest px-2 py-0.5 rounded border ${meta.pillColor}`}>
              {meta.label}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{gap.code}</span>
            {gap.party && <span className="text-[11px] text-slate-500">{gap.party}</span>}
            {gap.reference && <span className="text-[11px] font-mono text-slate-400">{gap.reference}</span>}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-800">{gap.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{gap.description}</p>
          {/* Amount comparison */}
          <div className="flex gap-4 mt-2 text-xs">
            {gap.glAmount !== null && (
              <div className="flex gap-1 items-center">
                <span className="text-slate-400">GL:</span>
                <span className="font-medium text-slate-700">{formatINR(gap.glAmount)}</span>
              </div>
            )}
            {gap.docAmount !== null && (
              <div className="flex gap-1 items-center">
                <span className="text-slate-400">Doc:</span>
                <span className="font-medium text-slate-700">{formatINR(gap.docAmount)}</span>
              </div>
            )}
            {gap.variance > 0 && (
              <div className="flex gap-1 items-center">
                <span className="text-slate-400">Variance:</span>
                <span className="font-medium text-red-600">{formatINR(gap.variance)}</span>
              </div>
            )}
          </div>
          {(gap.glRows.length > 0 || gap.docRows.length > 0) && (
            <button
              className="mt-2 text-xs text-blue-600 flex items-center gap-1"
              onClick={() => setOpen(!open)}
            >
              {open ? "Hide" : "Show"} raw rows
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          {open && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {gap.glRows.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-1">GL rows ({gap.glRows.length})</p>
                  <pre className="text-[10px] bg-slate-100 rounded p-2 text-slate-600 max-h-32 overflow-y-auto">
                    {JSON.stringify(gap.glRows.slice(0, 3), null, 2)}
                  </pre>
                </div>
              )}
              {gap.docRows.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-1">Doc rows ({gap.docRows.length})</p>
                  <pre className="text-[10px] bg-slate-100 rounded p-2 text-slate-600 max-h-32 overflow-y-auto">
                    {JSON.stringify(gap.docRows.slice(0, 3), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReconcilePage({ params }: { params: { id: string } }) {
  const [result, setResult] = useState<ReconResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<ReconSeverity | "all">("all");

  async function runRecon() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/connections/${params.id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runRecon(); }, []);

  const filtered = result?.gaps.filter(
    (g) => severityFilter === "all" || g.severity === severityFilter
  ) ?? [];

  const matchPct = result
    ? Math.round((result.matchedTotal / Math.max(result.glTotal, result.docTotal, 1)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/connections/${params.id}`} className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-slate-600" />
            <h1 className="text-xl font-semibold text-slate-800">Reconciliation</h1>
            {result && (
              <span className="text-sm text-slate-400">
                — {RECON_LABELS[result.type] ?? result.type}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={runRecon} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5">Re-run</span>
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !result && (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Running reconciliation…</span>
          </div>
        )}

        {result && (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-1">GL Total</div>
                <div className="text-xl font-bold text-slate-800">{formatINR(result.glTotal)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-1">Document Total</div>
                <div className="text-xl font-bold text-slate-800">{formatINR(result.docTotal)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-1">Match Rate</div>
                <div className={`text-xl font-bold ${matchPct >= 95 ? "text-green-600" : matchPct >= 80 ? "text-amber-600" : "text-red-600"}`}>
                  {matchPct}%
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-1">Total Variance</div>
                <div className="text-xl font-bold text-red-600">{formatINR(result.unmatchedTotal)}</div>
              </div>
            </div>

            {/* Severity filter chips */}
            <div className="flex gap-2">
              {(["all", "critical", "review", "info"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    severityFilter === s
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {s === "all" ? `All (${result.totalGaps})` : `${s} (${result.bySeverity[s]})`}
                </button>
              ))}
            </div>

            {/* No gaps */}
            {result.totalGaps === 0 && (
              <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <p className="text-sm font-medium text-slate-600">Fully reconciled</p>
                <p className="text-xs">GL and document figures match within tolerance.</p>
              </div>
            )}

            {/* Gap list */}
            {filtered.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  {filtered.length} gap{filtered.length !== 1 ? "s" : ""}
                  {severityFilter !== "all" ? ` · ${severityFilter} only` : ""}
                  {" "}· reconciled in {result.durationMs}ms
                </p>
                {filtered.map((gap, i) => (
                  <GapCard key={`${gap.code}-${i}`} gap={gap} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

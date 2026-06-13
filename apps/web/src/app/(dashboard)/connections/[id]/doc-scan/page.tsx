"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle, Info, CheckCircle2,
  ChevronLeft, RefreshCw, ChevronDown, Loader2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@aiql/pulse-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

type IssueSeverity = "critical" | "review" | "info";

interface ScanIssue {
  code:         string;
  severity:     IssueSeverity;
  category:     string;
  title:        string;
  description:  string;
  affectedRows: number;
  exposure:     number | null;
  examples:     Record<string, unknown>[];
}

interface DocScanResult {
  documentType:  string;
  connectionId:  string;
  scannedAt:     string;
  durationMs:    number;
  totalIssues:   number;
  bySeverity:    Record<IssueSeverity, number>;
  totalExposure: number;
  issues:        ScanIssue[];
  summary?:      Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<IssueSeverity, { icon: React.ReactNode; color: string; pillColor: string; label: string }> = {
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

const DOC_LABELS: Record<string, string> = {
  FORM_26Q: "Form 26Q — TDS Return",
  GSTR_1:   "GSTR-1 — Outward Supplies",
  GSTR_3B:  "GSTR-3B — Summary Return",
  ITR:      "Income Tax Return",
};

function IssueCard({ issue }: { issue: ScanIssue }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[issue.severity];
  return (
    <div className={`border-l-4 rounded-r-lg p-4 ${meta.color} border border-slate-200/60`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold tracking-widest px-2 py-0.5 rounded border ${meta.pillColor}`}>
              {meta.label}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{issue.code}</span>
            <span className="text-[11px] text-slate-400">{issue.category}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-800">{issue.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>
          <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
            <span>{issue.affectedRows} row{issue.affectedRows !== 1 ? "s" : ""} affected</span>
            {issue.exposure !== null && issue.exposure > 0 && (
              <span className="text-red-600 font-medium">Exposure: {formatINR(issue.exposure)}</span>
            )}
          </div>
          {issue.examples.length > 0 && (
            <button
              className="mt-2 text-xs text-blue-600 flex items-center gap-1"
              onClick={() => setOpen(!open)}
            >
              {open ? "Hide" : "Show"} examples
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          {open && (
            <div className="mt-2 overflow-x-auto">
              <pre className="text-[10px] bg-slate-100 rounded p-2 text-slate-600 max-h-40 overflow-y-auto">
                {JSON.stringify(issue.examples, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: Record<string, unknown> }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Parsed Summary</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        {Object.entries(summary)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-xs border-b border-slate-100 pb-1">
              <dt className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
              <dd className="font-medium text-slate-800 text-right">
                {typeof v === "number" ? formatINR(v) : String(v)}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocScanPage({ params }: { params: { id: string } }) {
  const [result, setResult] = useState<DocScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | "all">("all");

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/connections/${params.id}/doc-scan`, {
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

  useEffect(() => { runScan(); }, []);

  const filtered = result?.issues.filter(
    (i) => severityFilter === "all" || i.severity === severityFilter
  ) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/connections/${params.id}`} className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-600" />
            <h1 className="text-xl font-semibold text-slate-800">Document Scan</h1>
            {result && (
              <span className="text-sm text-slate-400">
                — {DOC_LABELS[result.documentType] ?? result.documentType}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={runScan} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5">Re-scan</span>
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !result && (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Running scan…</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-3">
              {(["critical", "review", "info"] as IssueSeverity[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(severityFilter === s ? "all" : s)}
                  className={`bg-white border rounded-xl p-4 text-left transition-all hover:shadow-sm ${
                    severityFilter === s ? "ring-2 ring-offset-1 ring-slate-400" : "border-slate-200"
                  }`}
                >
                  <div className="text-2xl font-bold text-slate-800">{result.bySeverity[s]}</div>
                  <div className={`text-xs font-semibold mt-0.5 ${SEVERITY_META[s].pillColor.split(" ")[1]}`}>
                    {SEVERITY_META[s].label}
                  </div>
                </button>
              ))}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-slate-800">{formatINR(result.totalExposure)}</div>
                <div className="text-xs text-slate-400 mt-0.5">Total Exposure</div>
              </div>
            </div>

            {/* Summary (GSTR-3B / ITR) */}
            {result.summary && Object.keys(result.summary).length > 0 && (
              <SummaryCard summary={result.summary} />
            )}

            {/* No issues */}
            {result.totalIssues === 0 && (
              <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <p className="text-sm font-medium text-slate-600">No issues found</p>
                <p className="text-xs">Document passed all validation checks.</p>
              </div>
            )}

            {/* Issue list */}
            {filtered.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  {filtered.length} issue{filtered.length !== 1 ? "s" : ""}
                  {severityFilter !== "all" ? ` · ${severityFilter} only` : ""}
                  {" "}· scanned in {result.durationMs}ms
                </p>
                {filtered.map((issue, i) => (
                  <IssueCard key={`${issue.code}-${i}`} issue={issue} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

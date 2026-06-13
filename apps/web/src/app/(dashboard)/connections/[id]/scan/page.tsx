"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, AlertCircle, Info, CheckCircle2,
  ChevronLeft, RefreshCw, ChevronDown, Search, Download, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";

// ─── Types (mirror @aiql/close-engine ScanResult) ────────────────────────────

type IssueSeverity = "critical" | "review" | "info";

interface Issue {
  code:         string;
  severity:     IssueSeverity;
  category:     string;
  title:        string;
  description:  string;
  affectedRows: number;
  exposure:     number | null;
  examples:     Record<string, unknown>[];
}

interface ScanResult {
  connectionId:  string;
  tableName:     string;
  startDate:     string;
  endDate:       string;
  scannedAt:     string;
  durationMs:    number;
  totalIssues:   number;
  bySeverity:    Record<IssueSeverity, number>;
  totalExposure: number;
  issues:        Issue[];
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
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    color: "border-l-amber-400 bg-amber-50/30",
    pillColor: "bg-amber-100 text-amber-700 border-amber-200",
    label: "NEEDS REVIEW",
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-500" />,
    color: "border-l-blue-400 bg-blue-50/20",
    pillColor: "bg-blue-100 text-blue-700 border-blue-200",
    label: "INFO",
  },
};

function formatINR(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(0)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function fmtCellValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (v instanceof Date)     return v.toLocaleDateString("en-IN");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return new Date(v).toLocaleDateString("en-IN");
  }
  return String(v);
}

// ─── Default date range = current month ──────────────────────────────────────

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false);
  const meta = SEVERITY_META[issue.severity];

  // Get column keys from the first example
  const columns = issue.examples[0] ? Object.keys(issue.examples[0]) : [];

  return (
    <div className={`rounded-xl border border-slate-200 bg-white border-l-4 ${meta.color} overflow-hidden`}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="mt-0.5 shrink-0">{meta.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.pillColor}`}>
              {meta.label}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
              {issue.category}
            </span>
            {issue.exposure !== null && issue.exposure > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-900 text-white font-semibold">
                {formatINR(issue.exposure)}
              </span>
            )}
          </div>

          <p className="font-medium text-sm text-slate-900 mt-1.5">{issue.title}</p>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">{issue.description}</p>
        </div>

        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && issue.examples.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/50 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {issue.examples.map((row, i) => (
                <tr key={i} className="hover:bg-white">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-slate-700 font-mono">
                      {fmtCellValue(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {issue.affectedRows > issue.examples.length && (
            <p className="text-xs text-slate-500 px-3 py-2 italic">
              Showing {issue.examples.length} of {issue.affectedRows} affected rows.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataQualityScanPage({ params }: { params: { id: string } }) {
  const { id: connectionId } = params;
  const defaults = getDefaultDates();

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate,   setEndDate]   = useState(defaults.end);
  const [result,    setResult]    = useState<ScanResult | null>(null);
  const [scanning,  setScanning]  = useState(false);
  const [error,     setError]     = useState("");

  async function runScan() {
    setScanning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/scan`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          endDate:   new Date(endDate).toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string; error?: string };
        setError(err.detail ?? err.error ?? "Scan failed");
        return;
      }
      const data = await res.json() as ScanResult;
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  const filtered = result?.issues ?? [];
  const critical = filtered.filter((i) => i.severity === "critical");
  const review   = filtered.filter((i) => i.severity === "review");
  const info     = filtered.filter((i) => i.severity === "info");

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">

      {/* Back nav */}
      <div>
        <Link href="/connections" className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to connections
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Data Quality Scan</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Find data errors, duplicates, and anomalies in your GL — before they hit reports.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="start" className="text-xs">Start date</Label>
            <Input id="start" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end" className="text-xs">End date</Label>
            <Input id="end" type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
          <Button onClick={runScan} disabled={scanning} className="ml-auto">
            {scanning
              ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              : <Search className="h-4 w-4 mr-2" />}
            {scanning ? "Scanning…" : "Run scan"}
          </Button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
          </p>
        )}
      </div>

      {/* Results */}
      {scanning && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <RefreshCw className="h-8 w-8 text-slate-300 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-600">Scanning your GL data…</p>
          <p className="text-xs text-slate-500 mt-1">Running 7 quality checks</p>
        </div>
      )}

      {!scanning && result && (
        <>
          {/* Summary card */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Scan complete</p>
                {result.totalIssues === 0 ? (
                  <div className="flex items-center gap-2 mt-1">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    <span className="text-2xl font-bold text-slate-900">No issues found</span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-bold text-slate-900">{result.totalIssues}</span>
                    <span className="text-sm text-slate-600">
                      issue{result.totalIssues > 1 ? "s" : ""} in {result.tableName.replace(/^upload_/, "")}
                    </span>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  Took {(result.durationMs / 1000).toFixed(2)}s — scanned {new Date(result.startDate).toLocaleDateString("en-IN")} to {new Date(result.endDate).toLocaleDateString("en-IN")}
                </p>
              </div>

              {result.totalIssues > 0 && (
                <div className="flex gap-3">
                  {result.bySeverity.critical > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-center">
                      <p className="text-2xl font-bold text-red-700">{result.bySeverity.critical}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600">Critical</p>
                    </div>
                  )}
                  {result.bySeverity.review > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center">
                      <p className="text-2xl font-bold text-amber-700">{result.bySeverity.review}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Review</p>
                    </div>
                  )}
                  {result.bySeverity.info > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center">
                      <p className="text-2xl font-bold text-blue-700">{result.bySeverity.info}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Info</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {result.totalExposure > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-600">Total financial exposure across all issues:</p>
                <p className="text-xl font-bold text-slate-900">{formatINR(result.totalExposure)}</p>
              </div>
            )}

            {/* Export bar */}
            {result.totalIssues > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <span className="text-xs text-slate-500 mr-2">Export findings:</span>
                <ExportButton connectionId={connectionId} scan={result} format="csv" />
                <ExportButton connectionId={connectionId} scan={result} format="pdf" />
              </div>
            )}
          </div>

          {/* Critical */}
          {critical.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> Critical — must fix
              </h2>
              {critical.map((i) => <IssueCard key={i.code} issue={i} />)}
            </section>
          )}

          {/* Review */}
          {review.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Needs review
              </h2>
              {review.map((i) => <IssueCard key={i.code} issue={i} />)}
            </section>
          )}

          {/* Info */}
          {info.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" /> Informational
              </h2>
              {info.map((i) => <IssueCard key={i.code} issue={i} />)}
            </section>
          )}
        </>
      )}

      {/* Initial state */}
      {!scanning && !result && !error && (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Ready to scan</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Set your date range above and click Run scan. We&apos;ll check for duplicate vouchers, imbalanced entries, GST mismatches, sign anomalies, and more.
          </p>
        </div>
      )}

    </div>
  );
}

// ─── Export button (CSV via client-side blob, PDF via server) ───────────────

function ExportButton({
  connectionId,
  scan,
  format,
}: {
  connectionId: string;
  scan:         ScanResult;
  format:       "csv" | "pdf";
}): JSX.Element {
  const [busy, setBusy] = useState(false);

  async function handleExport(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/connections/${connectionId}/scan/export?format=${format}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ scan }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Export failed: ${body?.error ?? res.statusText}`);
        return;
      }
      // Trigger download — pull filename from Content-Disposition or fall back to a sensible default
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const filename = m?.[1] ?? `aiql-scan-${Date.now()}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={busy}
      className="gap-1.5 text-xs"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {format.toUpperCase()}
    </Button>
  );
}

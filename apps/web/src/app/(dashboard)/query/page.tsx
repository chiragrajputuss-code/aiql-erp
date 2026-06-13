"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PlayCircle, ChevronUp, ChevronDown, Download, CheckCircle2,
  AlertCircle, HelpCircle, Loader2, Zap, RefreshCw, Database,
  FileText, BarChart3, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection {
  id:          string;
  displayName: string;
  erpType:     string;
  status:      string;
}

interface ConfidenceBreakdown {
  final:          number;
  verdict:        "execute" | "execute_with_warning" | "needs_clarification";
  components:     { llmSelfAssessment: number; schemaMatch: number; complexity: number; templateMatch: number };
  hallucinations: string[];
}

interface QueryApiResponse {
  queryLogId:           string;
  sql:                  string;
  rawSql:               string;
  confidence:           ConfidenceBreakdown;
  explanation:          string;
  assumptions:          string[];
  clarificationsNeeded: string[];
  warnings:             string[];
  verdict:              string;
  provider:             string;
  model:                string;
  cost:                 number;
  retried:              boolean;
  templateId?:          string;
  queryResult?:         { columns: string[]; rows: Record<string, unknown>[]; rowCount: number };
  auditLog:             { original: string; token: string; category: string }[];
  tokenisedQuestion:    string;
  executionTimeMs:      number;
}

type SortDir = "asc" | "desc";

const LOAD_STEPS = ["Tokenising", "Querying AI", "Validating", "Executing"] as const;

// ─── SQL syntax highlighter ───────────────────────────────────────────────────

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightSql(sql: string): string {
  const escaped = escHtml(sql);
  return escaped
    // keywords
    .replace(
      /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+OUTER\s+JOIN|ON|AS|AND|OR|NOT|IN|IS|NULL|LIMIT|OFFSET|UNION|ALL|WITH|CASE|WHEN|THEN|ELSE|END|DISTINCT|COUNT|SUM|AVG|MIN|MAX|COALESCE|DATE_TRUNC|ROUND|CAST|OVER|PARTITION\s+BY|ROW_NUMBER|RANK|LAG|LEAD)\b/gi,
      '<span style="color:#7dd3fc;font-weight:600">$&</span>'
    )
    // strings
    .replace(/'[^']*'/g, '<span style="color:#86efac">$&</span>')
    // numbers
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#fdba74">$&</span>')
    // comments
    .replace(/(--[^\n]*)/g, '<span style="color:#6b7280;font-style:italic">$&</span>');
}

// ─── CSV / Excel export ───────────────────────────────────────────────────────

function exportCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const header = columns.map((c) => JSON.stringify(c)).join(",");
  const body   = rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? "")).join(","));
  const csv    = [header, ...body].join("\n");
  const blob   = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href       = url;
  a.download   = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Confidence helpers ───────────────────────────────────────────────────────

function confidenceMeta(score: number): { label: string; color: string; bg: string; dot: string } {
  if (score >= 0.85) return { label: "High",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" };
  if (score >= 0.70) return { label: "Medium", color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-500"   };
  return               { label: "Low",    color: "text-red-700",     bg: "bg-red-50 border-red-200",         dot: "bg-red-500"     };
}

// ─── Category chip colours ────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  VENDOR:   "bg-blue-100 text-blue-800",
  CUSTOMER: "bg-green-100 text-green-800",
  EMPLOYEE: "bg-purple-100 text-purple-800",
  AMOUNT:   "bg-orange-100 text-orange-800",
  ACCT:     "bg-indigo-100 text-indigo-800",
  PROJECT:  "bg-teal-100 text-teal-800",
  ENTITY:   "bg-slate-100 text-slate-800",
  PII:      "bg-rose-100 text-rose-800",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      {LOAD_STEPS.map((step, i) => {
        const done    = i < currentStep;
        const active  = i === currentStep;
        const pending = i > currentStep;
        return (
          <div key={step} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              done    ? "bg-emerald-100 text-emerald-700" :
              active  ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" :
                        "bg-slate-100 text-slate-400"
            }`}>
              {done   ? <CheckCircle2 className="w-3 h-3" /> :
               active ? <Loader2 className="w-3 h-3 animate-spin" /> :
                        <div className="w-3 h-3 rounded-full border border-current opacity-40" />}
              {step}
            </div>
            {i < LOAD_STEPS.length - 1 && (
              <ChevronRight className={`w-4 h-4 mx-0.5 ${i < currentStep ? "text-emerald-400" : "text-slate-300"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SqlBlock({ result }: { result: QueryApiResponse }) {
  const meta = confidenceMeta(result.confidence.final);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(result.sql || result.rawSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-800">Generated SQL</CardTitle>
            {result.templateId && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                Template: {result.templateId}
              </span>
            )}
            {result.retried && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5" /> Claude retry
              </span>
            )}
          </div>
          {/* Confidence badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${meta.bg} ${meta.color}`}>
            <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
            {meta.label} confidence
            <span className="font-mono ml-0.5">{(result.confidence.final * 100).toFixed(0)}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">
        {/* Dark code block */}
        <div className="relative group rounded-lg bg-slate-900 border border-slate-700">
          <button
            onClick={copy}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <pre
            className="p-4 text-sm leading-relaxed overflow-x-auto text-slate-300 font-mono"
            dangerouslySetInnerHTML={{ __html: highlightSql(result.sql || result.rawSql || "") }}
          />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {result.provider === "template" ? "Built-in template" : `${result.provider} / ${result.model}`}
          </span>
          {result.cost > 0 && <span>Cost: ${result.cost.toFixed(5)}</span>}
          <span>{result.executionTimeMs}ms</span>
        </div>

        {/* Explanation */}
        {result.explanation && (
          <p className="text-xs text-slate-600 bg-slate-50 rounded px-3 py-2 border border-slate-200">
            {result.explanation}
          </p>
        )}

        {/* Assumptions */}
        {result.assumptions.length > 0 && (
          <details className="text-xs">
            <summary className="text-slate-500 cursor-pointer hover:text-slate-700 select-none">
              {result.assumptions.length} assumption{result.assumptions.length > 1 ? "s" : ""}
            </summary>
            <ul className="mt-1.5 space-y-1 pl-3">
              {result.assumptions.map((a, i) => (
                <li key={i} className="text-slate-600 flex gap-1.5">
                  <span className="text-slate-400">–</span>{a}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="flex flex-col gap-1">
            {result.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Hallucinations */}
        {result.confidence.hallucinations.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            Possible hallucinations: {result.confidence.hallucinations.join(", ")}
          </div>
        )}

        {/* Confidence breakdown */}
        <details className="text-xs">
          <summary className="text-slate-500 cursor-pointer hover:text-slate-700 select-none">
            Confidence breakdown
          </summary>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries({
              "LLM self-assessment": result.confidence.components.llmSelfAssessment,
              "Schema match":        result.confidence.components.schemaMatch,
              "Complexity":          result.confidence.components.complexity,
              "Template match":      result.confidence.components.templateMatch,
            }).map(([label, val]) => (
              <div key={label} className="bg-slate-50 rounded p-2 border border-slate-200">
                <div className="text-slate-500 truncate">{label}</div>
                <div className="font-mono font-semibold text-slate-700 mt-0.5">
                  {(val * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function AuditCard({ auditLog, tokenisedQuestion }: {
  auditLog:          { original: string; token: string; category: string }[];
  tokenisedQuestion: string;
}) {
  if (auditLog.length === 0) return null;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-sm font-semibold text-slate-800">Tokenisation Audit</CardTitle>
          <span className="text-xs text-slate-500 ml-auto">
            {auditLog.length} item{auditLog.length !== 1 ? "s" : ""} masked
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">
        {tokenisedQuestion && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2">
            <span className="text-slate-500 mr-1">Sent to LLM:</span>
            <span className="text-slate-700 font-mono">{tokenisedQuestion}</span>
          </div>
        )}
        <div className="space-y-1.5">
          {auditLog.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-100 last:border-0">
              <span className="text-slate-700 font-medium min-w-0 truncate flex-1">&ldquo;{item.original}&rdquo;</span>
              <span className="text-slate-400 shrink-0">→</span>
              <code className="font-mono text-slate-600 shrink-0">{item.token}</code>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                CATEGORY_COLOURS[item.category] ?? "bg-slate-100 text-slate-600"
              }`}>
                {item.category}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ClarificationCard({ clarifications }: { clarifications: string[] }) {
  return (
    <Card className="border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-600" />
          <CardTitle className="text-sm font-semibold text-amber-800">Clarification needed</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <p className="text-xs text-amber-700 mb-3">
          The AI couldn&apos;t generate a confident query. Please rephrase your question considering:
        </p>
        <ul className="space-y-2">
          {clarifications.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
              <span className="text-amber-500 mt-0.5 shrink-0">•</span>
              {c}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ResultsTable({
  columns,
  rows,
  onApproveExecute,
  isExecuting,
}: {
  columns:          string[];
  rows:             Record<string, unknown>[];
  onApproveExecute: () => void;
  isExecuting:      boolean;
}) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const hasData = rows.length > 0;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-800">
              {hasData ? `Results — ${rows.length} row${rows.length !== 1 ? "s" : ""}` : "Results"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {hasData && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => exportCsv(columns, rows, "query-results.csv")}
                >
                  <Download className="w-3 h-3" /> CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => exportCsv(columns, rows, "query-results.tsv")}
                >
                  <Download className="w-3 h-3" /> Excel
                </Button>
              </>
            )}
            {!hasData && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-slate-900 hover:bg-slate-700"
                onClick={onApproveExecute}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Executing…</>
                ) : (
                  <><PlayCircle className="w-3.5 h-3.5" /> Approve &amp; Execute</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <PlayCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm">SQL generated — click &ldquo;Approve &amp; Execute&rdquo; to run it</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      className="px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        {col}
                        {sortCol === col ? (
                          sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <div className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-100 last:border-0 ${
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    } hover:bg-blue-50/40 transition-colors`}
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-slate-700 font-mono whitespace-nowrap max-w-xs truncate">
                        {row[col] === null || row[col] === undefined
                          ? <span className="text-slate-400 font-sans">—</span>
                          : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QueryStudioPage() {
  const searchParams = useSearchParams();
  const [connections, setConnections]               = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [question, setQuestion]                     = useState(searchParams.get("q") ?? "");
  const [isLoading, setIsLoading]                   = useState(false);
  const [loadStep, setLoadStep]                     = useState(0);
  const [result, setResult]                         = useState<QueryApiResponse | null>(null);
  const [error, setError]                           = useState<string | null>(null);
  const [isExecuting, setIsExecuting]               = useState(false);
  const stepTimerRef                                = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load connections on mount
  useEffect(() => {
    fetch("/api/internal/connections")
      .then((r) => r.json())
      .then((data: Connection[]) => {
        const active = data.filter((c) => c.status === "ACTIVE");
        setConnections(active);
        if (active.length > 0) setSelectedConnectionId(active[0].id);
      })
      .catch(() => {});
  }, []);

  // Advance step indicator while loading
  useEffect(() => {
    if (isLoading) {
      setLoadStep(0);
      let step = 0;
      const STEP_DELAYS = [400, 1200, 500]; // ms before advancing to next step
      stepTimerRef.current = setInterval(() => {
        step = Math.min(step + 1, LOAD_STEPS.length - 1);
        setLoadStep(step);
        if (step === LOAD_STEPS.length - 1 && stepTimerRef.current) {
          clearInterval(stepTimerRef.current);
        }
      }, STEP_DELAYS[step] ?? 800);
    } else {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    }
    return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
  }, [isLoading]);

  const runQuery = useCallback(async (opts?: { executeQuery: boolean }) => {
    if (!selectedConnectionId || !question.trim()) return;

    setIsLoading(true);
    setError(null);
    if (!opts?.executeQuery) setResult(null);

    try {
      const res = await fetch("/api/v1/query", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          question:     question.trim(),
          connectionId: selectedConnectionId,
          options:      opts ?? {},
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Query failed"));
        return;
      }

      setResult(data as QueryApiResponse);
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsLoading(false);
    }
  }, [selectedConnectionId, question]);

  const approveAndExecute = useCallback(async () => {
    if (!result) return;
    setIsExecuting(true);
    try {
      const res = await fetch("/api/v1/query", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          question:     question.trim(),
          connectionId: selectedConnectionId,
          options:      { executeQuery: true },
        }),
      });
      const data = await res.json();
      if (res.ok) setResult(data as QueryApiResponse);
      else setError(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Execution failed"));
    } catch {
      setError("Network error during execution");
    } finally {
      setIsExecuting(false);
    }
  }, [result, question, selectedConnectionId]);

  const canRun = selectedConnectionId && question.trim().length > 0 && !isLoading;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Query Studio</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ask your financial data anything — in English, Hindi, or Hinglish
        </p>
      </div>

      {/* ── Input card ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-5 pb-4 px-5 space-y-4">

          {/* Connection selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-600 shrink-0">Connection</label>
            {connections.length === 0 ? (
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                No active connections — <a href="/connections" className="text-blue-600 hover:underline">add one here</a>
              </div>
            ) : (
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="flex-1 text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} — {c.erpType.replace("_", " ")}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Question textarea */}
          <div className="relative">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) runQuery();
              }}
              placeholder="Ask your ERP anything…   e.g. Show top 10 vendors by spend last quarter"
              rows={3}
              className="w-full text-sm border border-slate-200 rounded-lg px-4 py-3 text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white leading-relaxed"
            />
            <div className="absolute bottom-2 right-3 text-xs text-slate-400 pointer-events-none select-none">
              ⌘↵ to run
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                "Show AP aging by vendor",
                "Top 10 customers by revenue",
                "Monthly expense summary",
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQuestion(ex)}
                  className="text-xs text-slate-500 border border-slate-200 rounded-full px-2.5 py-1 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button
              onClick={() => runQuery()}
              disabled={!canRun}
              className="shrink-0 bg-slate-900 hover:bg-slate-700 text-white gap-2"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
              ) : (
                <><PlayCircle className="w-4 h-4" /> Run Query</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Loading indicator ── */}
      {isLoading && (
        <div className="flex justify-center py-2">
          <StepIndicator currentStep={loadStep} />
        </div>
      )}

      {/* ── Error state ── */}
      {error && !isLoading && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

      {/* ── Results ── */}
      {result && !isLoading && (
        <div className="space-y-4">
          {/* Clarification needed */}
          {result.verdict === "needs_clarification" && result.clarificationsNeeded.length > 0 && (
            <ClarificationCard clarifications={result.clarificationsNeeded} />
          )}

          {/* SQL + confidence (show even on low confidence for transparency) */}
          {(result.sql || result.rawSql) && <SqlBlock result={result} />}

          {/* Tokenisation audit */}
          <AuditCard auditLog={result.auditLog} tokenisedQuestion={result.tokenisedQuestion} />

          {/* Results table / approve & execute */}
          {result.verdict !== "needs_clarification" && (
            <ResultsTable
              columns={result.queryResult?.columns ?? []}
              rows={result.queryResult?.rows ?? []}
              onApproveExecute={approveAndExecute}
              isExecuting={isExecuting}
            />
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Database className="w-7 h-7 opacity-50" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">Ask anything about your financial data</p>
            <p className="text-xs mt-1">Supports English, Hindi, and Hinglish</p>
          </div>
        </div>
      )}
    </div>
  );
}

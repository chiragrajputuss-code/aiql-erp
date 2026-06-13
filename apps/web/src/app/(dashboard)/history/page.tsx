"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History, RefreshCw, ChevronRight, ChevronLeft,
  Loader2, AlertCircle, Zap, Brain, Database, CheckCircle2,
  XCircle, HelpCircle, Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueryLogRow {
  id:               string;
  connectionId:     string | null;
  question:         string;
  generatedSql:     string | null;
  confidence:       number | null;
  verdict:          string | null;
  status:           "PENDING" | "COMPLETED" | "FAILED" | "LOW_CONFIDENCE";
  llmProvider:      string | null;
  llmModel:         string | null;
  estimatedCostUsd: number | null;
  executionTimeMs:  number | null;
  fromTemplate:     string | null;
  fromCache:        boolean;
  rowCount:         number | null;
  errorMessage:     string | null;
  createdAt:        string;
}

type StatusFilter = "ALL" | "COMPLETED" | "FAILED" | "LOW_CONFIDENCE";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function providerLabel(row: QueryLogRow): { label: string; icon: React.ReactNode; cls: string } {
  if (row.fromTemplate)
    return { label: "Template", icon: <Zap className="w-3 h-3" />, cls: "bg-violet-100 text-violet-700" };
  if (row.fromCache)
    return { label: "RAG",      icon: <Brain className="w-3 h-3" />, cls: "bg-blue-100 text-blue-700"   };
  if (row.llmProvider === "groq")
    return { label: "Groq",     icon: <Brain className="w-3 h-3" />, cls: "bg-indigo-100 text-indigo-700" };
  if (row.llmProvider === "openai")
    return { label: "OpenAI",   icon: <Brain className="w-3 h-3" />, cls: "bg-emerald-100 text-emerald-700" };
  if (row.llmProvider === "claude")
    return { label: "Claude",   icon: <Brain className="w-3 h-3" />, cls: "bg-amber-100 text-amber-700"  };
  return   { label: "LLM",      icon: <Brain className="w-3 h-3" />, cls: "bg-slate-100 text-slate-600"  };
}

function statusMeta(status: QueryLogRow["status"]): { label: string; icon: React.ReactNode; cls: string } {
  switch (status) {
    case "COMPLETED":
      return { label: "Completed",   icon: <CheckCircle2 className="w-3 h-3" />, cls: "bg-emerald-100 text-emerald-700" };
    case "FAILED":
      return { label: "Failed",      icon: <XCircle className="w-3 h-3" />,      cls: "bg-red-100 text-red-700"         };
    case "LOW_CONFIDENCE":
      return { label: "Clarify",     icon: <HelpCircle className="w-3 h-3" />,   cls: "bg-amber-100 text-amber-700"     };
    default:
      return { label: "Pending",     icon: <Clock className="w-3 h-3" />,        cls: "bg-slate-100 text-slate-500"     };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day:    "2-digit",
    month:  "short",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number | null): string {
  if (usd == null || usd === 0) return "Free";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

const PAGE_SIZE = 20;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();

  const [rows, setRows]           = useState<QueryLogRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [statusFilter, setStatus] = useState<StatusFilter>("ALL");

  // Cursor stack for prev/next pagination
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]); // page 0 starts at null
  const [pageIndex, setPageIndex]     = useState(0);
  const [nextCursor, setNextCursor]   = useState<string | null>(null);

  const currentCursor = cursorStack[pageIndex] ?? null;

  const load = useCallback(async (cursor: string | null, status: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (status !== "ALL") params.set("status", status);
      if (cursor)           params.set("cursor", cursor);

      const res  = await fetch(`/api/v1/queries?${params}`);
      const data = await res.json() as { data: QueryLogRow[]; nextCursor: string | null };

      if (!res.ok) { setError("Failed to load history"); return; }

      setRows(data.data);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(currentCursor, statusFilter);
  }, [load, currentCursor, statusFilter]);

  function goNext() {
    if (!nextCursor) return;
    const newStack = [...cursorStack.slice(0, pageIndex + 1), nextCursor];
    setCursorStack(newStack);
    setPageIndex(pageIndex + 1);
  }

  function goPrev() {
    if (pageIndex === 0) return;
    setPageIndex(pageIndex - 1);
  }

  function changeStatus(s: StatusFilter) {
    setStatus(s);
    setCursorStack([null]);
    setPageIndex(0);
  }

  function openInStudio(question: string) {
    router.push(`/query?q=${encodeURIComponent(question)}`);
  }

  const page = pageIndex + 1;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-slate-400" />
            Query History
          </h1>
          <p className="text-sm text-slate-500 mt-1">All queries run by your organisation</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(currentCursor, statusFilter)}
          disabled={loading}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["ALL", "COMPLETED", "LOW_CONFIDENCE", "FAILED"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => changeStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              statusFilter === s
                ? "bg-[#1B3A5C] text-white border-[#1B3A5C]"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {s === "ALL" ? "All" : s === "LOW_CONFIDENCE" ? "Needs Clarification" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-5 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="pt-12 pb-12 text-center">
            <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No queries found</p>
            <p className="text-xs text-slate-400 mt-1">
              {statusFilter !== "ALL" ? "Try changing the filter above" : "Run a query in Query Studio to see it here"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium w-[40%]">Question</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Provider</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-right px-4 py-3 font-medium">Time</th>
                  <th className="text-right px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const sm     = statusMeta(row.status);
                  const pm     = providerLabel(row);
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                      onClick={() => openInStudio(row.question)}
                    >
                      {/* Question */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 truncate max-w-xs">{row.question}</p>
                        {row.fromTemplate && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{row.fromTemplate}</p>
                        )}
                        {row.errorMessage && (
                          <p className="text-xs text-red-500 mt-0.5 truncate">{row.errorMessage}</p>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>
                          {sm.icon}
                          {sm.label}
                        </span>
                      </td>

                      {/* Provider badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${pm.cls}`}>
                          {pm.icon}
                          {pm.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </td>

                      {/* Time */}
                      <td className="px-4 py-3 text-xs text-slate-500 text-right whitespace-nowrap">
                        {formatMs(row.executionTimeMs)}
                      </td>

                      {/* Cost */}
                      <td className="px-4 py-3 text-xs text-slate-500 text-right whitespace-nowrap">
                        {formatCost(row.estimatedCostUsd)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openInStudio(row.question); }}
                          title="Re-run in Query Studio"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-run
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">
              Page {page} · {rows.length} {rows.length === 1 ? "result" : "results"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs gap-1"
                disabled={pageIndex === 0 || loading}
                onClick={goPrev}
              >
                <ChevronLeft className="w-3 h-3" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs gap-1"
                disabled={!nextCursor || loading}
                onClick={goNext}
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

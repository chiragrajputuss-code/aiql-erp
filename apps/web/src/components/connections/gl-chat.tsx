"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Send, ThumbsUp, ThumbsDown,
  ChevronDown, ChevronUp, AlertCircle, X,
  TrendingUp, Calendar, Database,
} from "lucide-react";
import { parseDbError } from "@/lib/parse-db-error";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id:                    string;
  role:                  "user" | "assistant";
  content:               string;
  rows?:                 Record<string, unknown>[];
  columns?:              string[];
  rowCount?:             number;
  source?:               "template" | "rag" | "llm";
  sql?:                  string;
  confidence?:           number;
  assumptions?:          string[];
  clarificationsNeeded?: string[];
  warnings?:             string[];
  verdict?:              string;
  queryLogId?:           string;
  feedback?:             "thumbs_up" | "thumbs_down" | null;
  isLoading?:            boolean;
  error?:                string;
}

interface ConversationTurn {
  role:      "user" | "assistant";
  question:  string;
  sql?:      string;
  rowCount?: number;
  columns?:  string[];
}

interface GlContext {
  minDate:        string | null;
  maxDate:        string | null;
  totalRows:      number;
  topAccounts:    { name: string; count: number }[];
  topVendors:     { name: string; total: number }[];
  voucherTypes:   string[];
  quarters:       { label: string; start: string; end: string }[];
  hasVendors:     boolean;
  hasAccounts:    boolean;
  hasVoucherType: boolean;
}

export interface GlChatProps {
  connectionId:   string;
  connectionName: string;
  glMinDate:      string | null;
  glMaxDate:      string | null;
  uploadedAt:     string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOADING_STAGES = [
  "Checking templates…",
  "Searching past queries…",
  "Asking AI…",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function daysBetween(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

function sourceConfig(source?: "template" | "rag" | "llm") {
  if (source === "template") return { label: "Template", cls: "bg-green-100 text-green-700 border-green-200" };
  if (source === "rag")      return { label: "Learned",  cls: "bg-indigo-100 text-indigo-700 border-indigo-200" };
  if (source === "llm")      return { label: "AI",       cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return null;
}

function isTextBarChart(rows: Record<string, unknown>[], columns: string[]): boolean {
  if (columns.length !== 2 || rows.length < 2) return false;
  return rows.every((r) => typeof r[columns[1]] === "number" || !isNaN(Number(r[columns[1]])));
}

function buildCrossperiodQuestions(ctx: GlContext): { label: string; q: string; icon: React.ReactNode }[] {
  const qs: { label: string; q: string; icon: React.ReactNode }[] = [];

  if (ctx.quarters.length >= 2) {
    const [q1, q2] = ctx.quarters.slice(-2);
    qs.push({
      label: `${q1.label} vs ${q2.label} expenses`,
      q: `Compare total expenses in ${q1.label} (${q1.start} to ${q1.end}) vs ${q2.label} (${q2.start} to ${q2.end})`,
      icon: <TrendingUp className="h-3 w-3" />,
    });
  }

  if (ctx.minDate && ctx.maxDate) {
    qs.push({
      label: "Month-wise revenue trend",
      q: "Show month-wise revenue trend for the entire GL period",
      icon: <Calendar className="h-3 w-3" />,
    });
    qs.push({
      label: "YoY expense comparison",
      q: "Compare total expenses year over year",
      icon: <TrendingUp className="h-3 w-3" />,
    });
  }

  if (ctx.topVendors.length > 0) {
    qs.push({
      label: `${ctx.topVendors[0].name} payments`,
      q: `Show all payments to ${ctx.topVendors[0].name} with dates and amounts`,
      icon: <Database className="h-3 w-3" />,
    });
  }

  if (ctx.hasVoucherType && ctx.voucherTypes.includes("sales")) {
    qs.push({
      label: "Sales by quarter",
      q: "Show total sales grouped by quarter",
      icon: <TrendingUp className="h-3 w-3" />,
    });
  }

  return qs.slice(0, 4);
}

function buildOnboardingQuestions(ctx: GlContext): string[] {
  const qs: string[] = [];

  if (ctx.topVendors.length > 0) {
    qs.push(`Show top 10 vendors by total payments`);
  }
  if (ctx.hasAccounts) {
    qs.push(`Which accounts have the highest debit balance?`);
  }
  if (ctx.quarters.length > 0) {
    const q = ctx.quarters[ctx.quarters.length - 1];
    qs.push(`What is the total sales for ${q.label}?`);
  } else {
    qs.push(`What is the total sales for current quarter?`);
  }
  qs.push(`Show all outstanding vendor payments`);
  qs.push(`Show month-wise expense summary`);
  qs.push(`List all transactions above ₹1 lakh`);

  return [...new Set(qs)].slice(0, 6);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingDots({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="animate-pulse">
        {LOADING_STAGES[Math.min(stage, LOADING_STAGES.length - 1)]}
      </span>
    </div>
  );
}

function SourceBadge({ source }: { source?: "template" | "rag" | "llm" }) {
  const cfg = sourceConfig(source);
  if (!cfg) return null;
  return (
    <Badge className={`${cfg.cls} border text-[10px] font-medium px-1.5 py-0`}>
      {cfg.label}
    </Badge>
  );
}

function TextBarChart({ rows, columns }: { rows: Record<string, unknown>[]; columns: string[] }) {
  const values = rows.map((r) => Number(r[columns[1]] ?? 0));
  const max    = Math.max(...values, 1);
  return (
    <div className="space-y-1.5 mt-2">
      {rows.map((r, i) => {
        const pct   = (values[i] / max) * 100;
        const label = String(r[columns[0]] ?? "");
        const val   = values[i].toLocaleString("en-IN", { maximumFractionDigits: 2 });
        return (
          <div key={i} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span className="text-slate-700 truncate max-w-[60%]">{label}</span>
              <span className="text-slate-500 font-mono">₹{val}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DrillPanel — inline slide-over for a single row ─────────────────────────

function DrillPanel({
  row,
  columns,
  onClose,
  onAsk,
}: {
  row:     Record<string, unknown>;
  columns: string[];
  onClose: () => void;
  onAsk:   (q: string) => void;
}) {
  // Generate contextual follow-up chips based on available fields
  const chips: string[] = [];
  const party = row.vendor_name ?? row.customer_name ?? row.party_name;
  const acct  = row.account_name;
  const ref   = row.reference_number;

  if (party)  chips.push(`Show all transactions for ${party}`);
  if (acct)   chips.push(`Show all entries in ${acct} account`);
  if (ref)    chips.push(`Show all transactions with reference ${ref}`);
  if (party)  chips.push(`Total payments to ${party} this year`);
  if (acct)   chips.push(`Monthly trend for ${acct}`);

  const displayColumns = columns.filter((c) => !c.startsWith("_"));

  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col z-10">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-800">Row Detail</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <dl className="space-y-2">
          {displayColumns.map((col) => {
            const val = row[col];
            if (val === null || val === undefined || String(val).trim() === "") return null;
            return (
              <div key={col} className="border-b border-slate-50 pb-2">
                <dt className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                  {col.replace(/_/g, " ")}
                </dt>
                <dd className="text-xs text-slate-700 mt-0.5 break-words">
                  {String(val)}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {chips.length > 0 && (
        <div className="border-t border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Ask a follow-up
          </p>
          <div className="space-y-1.5">
            {chips.slice(0, 4).map((chip) => (
              <button
                key={chip}
                onClick={() => { onAsk(chip); onClose(); }}
                className="w-full text-left text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 hover:border-[#1B3A5C] text-slate-600 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DataTable with drill-in ──────────────────────────────────────────────────

function DataTable({
  rows,
  columns,
  rowCount,
  onDrill,
}: {
  rows:     Record<string, unknown>[];
  columns:  string[];
  rowCount: number;
  onDrill:  (row: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown   = expanded ? rows : rows.slice(0, 10);
  const hasMore = rows.length > 10;

  return (
    <div className="mt-2 rounded border border-slate-200 overflow-hidden text-xs">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap border-r last:border-0">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((row, i) => (
              <tr
                key={i}
                className="cursor-pointer hover:bg-indigo-50/50 transition-colors"
                onClick={() => onDrill(row)}
                title="Click to drill into this row"
              >
                {columns.map((c) => (
                  <td key={c} className="px-2 py-1.5 text-slate-600 whitespace-nowrap border-r last:border-0 max-w-[150px] truncate">
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="w-full py-1.5 text-xs text-muted-foreground hover:text-slate-700 flex items-center justify-center gap-1 border-t"
        >
          {expanded ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Show all {rowCount} rows</>}
        </button>
      )}
    </div>
  );
}

// ─── AssistantMessage ─────────────────────────────────────────────────────────

function AssistantMessage({
  msg,
  onFeedback,
  onClarify,
  onDrill,
}: {
  msg:          ChatMessage;
  onFeedback:   (id: string, queryLogId: string, fb: "thumbs_up" | "thumbs_down") => void;
  onClarify:    (q: string) => void;
  onDrill:      (row: Record<string, unknown>, columns: string[]) => void;
}) {
  const [showSql, setShowSql] = useState(false);
  const bars        = msg.rows && msg.columns && isTextBarChart(msg.rows, msg.columns);
  const canFeedback = msg.source !== "template" && msg.queryLogId;

  return (
    <div className="flex gap-2 items-start">
      <div className="w-7 h-7 rounded-full bg-[#1B3A5C]/10 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-[#1B3A5C]">A</span>
      </div>
      <div className="max-w-full min-w-0">
        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3">
          {sourceConfig(msg.source) && (
            <div className="mb-1.5"><SourceBadge source={msg.source} /></div>
          )}
          {msg.error ? (
            <div className="flex items-start gap-2 text-sm text-rose-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{msg.error}</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">{msg.content}</p>
              {msg.rows && msg.columns && msg.rows.length > 0 && (
                bars ? (
                  <TextBarChart rows={msg.rows} columns={msg.columns} />
                ) : (
                  <DataTable
                    rows={msg.rows}
                    columns={msg.columns}
                    rowCount={msg.rowCount ?? msg.rows.length}
                    onDrill={(row) => onDrill(row, msg.columns!)}
                  />
                )
              )}
              {msg.verdict === "needs_clarification" && msg.clarificationsNeeded && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.clarificationsNeeded.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => onClarify(c)}
                      className="text-xs border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50 text-slate-600"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {msg.assumptions && msg.assumptions.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-slate-700">
                    Assumptions ({msg.assumptions.length})
                  </summary>
                  <ul className="mt-1 pl-3 space-y-0.5">
                    {msg.assumptions.map((a, i) => (
                      <li key={i} className="text-xs text-muted-foreground list-disc list-inside">{a}</li>
                    ))}
                  </ul>
                </details>
              )}
              {msg.warnings && msg.warnings.length > 0 && (
                <div className="mt-2 text-xs text-amber-600 space-y-0.5">
                  {msg.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}
              {msg.sql && (
                <>
                  <button
                    onClick={() => setShowSql((x) => !x)}
                    className="mt-2 text-xs text-muted-foreground hover:text-slate-700"
                  >
                    {showSql ? "Hide SQL" : "Show SQL"}
                  </button>
                  {showSql && (
                    <pre className="mt-1 text-[10px] bg-slate-50 rounded p-2 overflow-x-auto text-slate-600">
                      {msg.sql}
                    </pre>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {canFeedback && !msg.error && (
          <div className="flex items-center gap-1 mt-1 ml-1">
            {msg.feedback === "thumbs_down" && (
              <p className="text-xs text-muted-foreground">Got it — we won&apos;t suggest this pattern again.</p>
            )}
            {!msg.feedback && (
              <>
                <button onClick={() => onFeedback(msg.id, msg.queryLogId!, "thumbs_up")} className="text-muted-foreground hover:text-green-600 p-1 rounded" title="Good answer">
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onFeedback(msg.id, msg.queryLogId!, "thumbs_down")} className="text-muted-foreground hover:text-rose-600 p-1 rounded" title="Wrong answer">
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {msg.feedback === "thumbs_up" && (
              <p className="text-xs text-green-600">Thanks for the feedback!</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main GlChat component ────────────────────────────────────────────────────

export function GlChat({ connectionId, connectionName: _cn, uploadedAt }: GlChatProps) {
  const [messages,            setMessages]            = useState<ChatMessage[]>([]);
  const [input,               setInput]               = useState("");
  const [submitting,          setSubmitting]          = useState(false);
  const [loadingStage,        setLoadingStage]        = useState(0);
  const [loadingMsgId,        setLoadingMsgId]        = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [glContext,            setGlContext]            = useState<GlContext | null>(null);
  const [drillRow,             setDrillRow]             = useState<{ row: Record<string, unknown>; columns: string[] } | null>(null);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load GL context on mount
  useEffect(() => {
    fetch(`/api/v1/connections/${connectionId}/gl-context`)
      .then((r) => r.json())
      .then(setGlContext)
      .catch(() => {});
  }, [connectionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!submitting) { setLoadingStage(0); return; }
    const t1 = setTimeout(() => setLoadingStage(1), 400);
    const t2 = setTimeout(() => setLoadingStage(2), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [submitting]);

  const daysOld = daysBetween(uploadedAt);
  const freshnessBadge =
    daysOld > 60 ? (
      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
        GL data is {daysOld} days old — consider updating
      </span>
    ) : daysOld > 14 ? (
      <span className="text-xs text-muted-foreground">Updated {daysOld} days ago</span>
    ) : null;

  const suggestedQuestions = glContext ? buildOnboardingQuestions(glContext) : [
    "Show top 10 vendors by total payments",
    "What is the total sales for current quarter?",
    "Show all outstanding vendor payments",
    "Which accounts have the highest debit balance?",
    "Show month-wise expense summary",
    "List all transactions above ₹1 lakh",
  ];

  const crossPeriodQuestions = glContext ? buildCrossperiodQuestions(glContext) : [];

  const submit = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || submitting) return;

      const userId    = genId();
      const loadingId = genId();

      setMessages((prev) => [
        ...prev,
        { id: userId,    role: "user",      content: q },
        { id: loadingId, role: "assistant", content: "", isLoading: true },
      ]);
      setLoadingMsgId(loadingId);
      setInput("");
      setSubmitting(true);
      setLoadingStage(0);

      try {
        const res  = await fetch(`/api/v1/connections/${connectionId}/chat`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ question: q, history: conversationHistory.slice(-3) }),
        });
        const data = await res.json();

        if (!res.ok) {
          const errMsg = data.error ? parseDbError(data.error) : parseDbError("");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === loadingId ? { ...m, isLoading: false, content: "Sorry, something went wrong.", error: errMsg } : m
            )
          );
          return;
        }

        const assistantMsg: ChatMessage = {
          id:                    genId(),
          role:                  "assistant",
          content:               data.answer ?? "Done.",
          rows:                  data.rows,
          columns:               data.columns,
          rowCount:              data.rowCount,
          source:                data.source,
          sql:                   data.sql,
          confidence:            data.confidence,
          assumptions:           data.assumptions,
          clarificationsNeeded:  data.clarificationsNeeded,
          warnings:              data.warnings,
          verdict:               data.verdict,
          queryLogId:            data.queryLogId,
          feedback:              null,
        };

        setMessages((prev) => prev.map((m) => (m.id === loadingId ? assistantMsg : m)));
        setConversationHistory((prev) => [
          ...prev,
          { role: "user" as const,      question: q },
          { role: "assistant" as const, question: q, sql: data.sql, rowCount: data.rowCount, columns: data.columns },
        ].slice(-6));
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId ? { ...m, isLoading: false, content: "Connection error.", error: parseDbError("") } : m
          )
        );
      } finally {
        setSubmitting(false);
        setLoadingMsgId(null);
        textareaRef.current?.focus();
      }
    },
    [connectionId, conversationHistory, submitting]
  );

  const handleFeedback = useCallback(
    async (msgId: string, queryLogId: string, fb: "thumbs_up" | "thumbs_down") => {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: fb } : m)));
      await fetch("/api/v1/query-feedback", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ queryLogId, feedback: fb }),
      }).catch(() => {});
    },
    []
  );

  const handleClarify = useCallback((suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 relative">
      {/* Freshness badge */}
      {freshnessBadge && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-100">
          {freshnessBadge}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xl font-semibold text-slate-800">Ask anything about your GL data</p>
              <p className="text-sm text-muted-foreground">
                Natural language · Hindi/Hinglish supported · PII masked
                {glContext && (
                  <> · <span className="text-slate-600">{glContext.totalRows.toLocaleString("en-IN")} rows</span></>
                )}
              </p>
              {glContext?.minDate && glContext?.maxDate && (
                <p className="text-xs text-slate-400">
                  GL period: {glContext.minDate} — {glContext.maxDate}
                </p>
              )}
            </div>

            {/* Cross-period question chips */}
            {crossPeriodQuestions.length > 0 && (
              <div className="w-full max-w-lg">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide text-center mb-2">
                  Cross-period analysis
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {crossPeriodQuestions.map(({ label, q, icon }) => (
                    <button
                      key={label}
                      onClick={() => submit(q)}
                      className="flex items-center gap-1.5 text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-3 py-1.5 hover:bg-indigo-100 transition-colors"
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Standard suggested questions */}
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => submit(q)}
                  className="text-xs border border-slate-200 bg-white rounded-full px-3 py-1.5 hover:border-[#1B3A5C] hover:text-[#1B3A5C] transition-colors text-slate-600"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-[#1B3A5C] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-sm text-sm">
                    {msg.content}
                  </div>
                </div>
              );
            }
            if (msg.isLoading && msg.id === loadingMsgId) {
              return (
                <div key={msg.id} className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-[#1B3A5C]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-[#1B3A5C]">A</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-prose">
                    <LoadingDots stage={loadingStage} />
                  </div>
                </div>
              );
            }
            return (
              <AssistantMessage
                key={msg.id}
                msg={msg}
                onFeedback={handleFeedback}
                onClarify={handleClarify}
                onDrill={(row, columns) => setDrillRow({ row, columns })}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Drill panel */}
      {drillRow && (
        <DrillPanel
          row={drillRow.row}
          columns={drillRow.columns}
          onClose={() => setDrillRow(null)}
          onAsk={(q) => { submit(q); setDrillRow(null); }}
        />
      )}

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3 space-y-2">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your GL data… (Enter to send, Shift+Enter for new line)"
            className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/20 focus:border-[#1B3A5C]"
            rows={1}
            disabled={submitting}
          />
          <Button
            onClick={() => submit(input)}
            disabled={!input.trim() || submitting}
            className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 h-[44px] px-3"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Powered by 3-layer AI pipeline · PII masked before AI processing · Results computed server-side
        </p>
      </div>
    </div>
  );
}

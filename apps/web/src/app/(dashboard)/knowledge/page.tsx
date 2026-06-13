"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Sparkles, RefreshCw, TrendingUp, AlertCircle,
  CheckCircle2, ZapOff, Loader2, Database,
} from "lucide-react";

interface Stats {
  rowsTotal:         number;
  rowsByVerdict:     Record<string, number>;
  rowsBySource:      Record<string, number>;
  rowsWithEmbedding: number;
  embeddingCoverage: number;
  proxy: {
    last30d: {
      total:         number;
      withKnowledge: number;
      hitRate:       number;
      hitRatePct:    number;
    };
  };
}

const VERDICT_META: Record<string, { label: string; tone: string }> = {
  NORMAL:      { label: "Confirmed normal", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INVESTIGATE: { label: "Flagged",          tone: "bg-amber-50 text-amber-700 border-amber-200"     },
  ANNOTATED:   { label: "Annotated",        tone: "bg-indigo-50 text-indigo-700 border-indigo-200"  },
  REJECTED:    { label: "Rejected",         tone: "bg-rose-50 text-rose-700 border-rose-200"        },
};

const SOURCE_META: Record<string, string> = {
  SCAN_ISSUE:     "Scan issues",
  RECONCILIATION: "Reconciliations",
  FLUX_VARIANCE:  "Flux variances",
  AGENT_QUESTION: "Agent questions",
  MANUAL:         "Manual entries",
};

export default function KnowledgePage() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/knowledge/stats");
      if (res.ok) setStats(await res.json() as Stats);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function backfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/v1/knowledge/backfill-embeddings", { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { embedded: number; failed: number; hasMore: boolean };
        setBackfillResult(
          data.embedded > 0
            ? `Embedded ${data.embedded} row(s)${data.hasMore ? " — more pending, run again" : ""}.${data.failed > 0 ? ` ${data.failed} failed (Ollama unreachable?).` : ""}`
            : data.failed > 0
              ? `${data.failed} failed. Check Ollama is running on the configured URL.`
              : "Nothing to embed — all rows up to date."
        );
        load();
      } else {
        const err = await res.json() as { error?: string };
        setBackfillResult(typeof err.error === "string" ? err.error : "Backfill failed");
      }
    } finally { setBackfilling(false); }
  }

  if (loading && !stats) {
    return (
      <div className="max-w-4xl mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-4xl mx-auto py-8 text-center text-sm text-slate-500">
        Could not load knowledge stats.
      </div>
    );
  }

  const hitPct = stats.proxy.last30d.hitRatePct;
  const embedPct = Math.round(stats.embeddingCoverage * 100);

  return (
    <div className="max-w-4xl mx-auto py-2 space-y-6">
      {/* Header */}
      <div className="bg-hero-emerald rounded-xl p-5 border border-emerald-100">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-600 text-white p-2.5 shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900">Your knowledge base</h1>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              Every &quot;Is this normal?&quot; answer becomes permanent context. The longer you use AIQL, the more LLM calls get answered from your own confirmed knowledge — not from fresh inference.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Big-number cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BigStat
          icon={<Database className="h-4 w-4" />}
          tone="indigo"
          label="Knowledge entries"
          value={stats.rowsTotal.toLocaleString("en-IN")}
          sub={
            stats.rowsTotal === 0
              ? "Answer your first \"is this normal?\" prompt to build the base"
              : `${Object.entries(stats.rowsBySource).map(([k, v]) => `${v} ${SOURCE_META[k] ?? k}`).join(" · ")}`
          }
        />
        <BigStat
          icon={<TrendingUp className="h-4 w-4" />}
          tone="emerald"
          label="Knowledge hit rate (30d)"
          value={`${hitPct}%`}
          sub={
            stats.proxy.last30d.total === 0
              ? "No proxied calls yet — start using the LLM proxy to track this"
              : `${stats.proxy.last30d.withKnowledge} of ${stats.proxy.last30d.total} calls used your knowledge`
          }
        />
        <BigStat
          icon={<Sparkles className="h-4 w-4" />}
          tone="amber"
          label="Embedded for fuzzy match"
          value={`${embedPct}%`}
          sub={
            stats.rowsTotal === 0
              ? "—"
              : `${stats.rowsWithEmbedding} of ${stats.rowsTotal} rows embedded`
          }
        />
      </div>

      {/* Embedding action card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-amber-50 p-2 shrink-0">
            <Sparkles className="h-4 w-4 text-amber-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Vector embeddings</p>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              When a knowledge row is embedded, future questions match it semantically — even when the wording differs. Embeddings are computed locally via Ollama (<code className="text-[11px] bg-slate-100 px-1 rounded">nomic-embed-text</code>); your data never leaves the box.
            </p>
            {embedPct < 100 && stats.rowsTotal > 0 && (
              <div role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {stats.rowsTotal - stats.rowsWithEmbedding} row(s) without embeddings.
                  Click <strong>Backfill</strong> to embed them now (requires Ollama running locally).
                </span>
              </div>
            )}
          </div>
          {stats.rowsTotal > stats.rowsWithEmbedding && (
            <Button size="sm" onClick={backfill} disabled={backfilling}>
              {backfilling
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Backfill
            </Button>
          )}
        </div>
        {backfillResult && (
          <p className="mt-2 text-xs text-slate-600 pl-9">{backfillResult}</p>
        )}
      </div>

      {/* Verdict + Source breakdown */}
      {stats.rowsTotal > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BreakdownCard
            title="By verdict"
            entries={Object.entries(stats.rowsByVerdict).map(([k, v]) => ({
              key:   k,
              label: VERDICT_META[k]?.label ?? k,
              count: v,
              tone:  VERDICT_META[k]?.tone ?? "bg-slate-50 text-slate-700 border-slate-200",
            }))}
            total={stats.rowsTotal}
          />
          <BreakdownCard
            title="By source"
            entries={Object.entries(stats.rowsBySource).map(([k, v]) => ({
              key:   k,
              label: SOURCE_META[k] ?? k,
              count: v,
              tone:  "bg-slate-50 text-slate-700 border-slate-200",
            }))}
            total={stats.rowsTotal}
          />
        </div>
      )}

      {/* Empty state guidance */}
      {stats.rowsTotal === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
          <ZapOff className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No knowledge captured yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Open any active close period. When the system flags an anomaly, you&apos;ll see &quot;Is this normal?&quot; — your answer becomes the first knowledge entry.
          </p>
        </div>
      )}

      {/* Pitch line */}
      {stats.rowsTotal > 0 && stats.proxy.last30d.total > 0 && (
        <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-emerald-50/30 to-white p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-slate-900">
              {stats.proxy.last30d.withKnowledge} LLM call{stats.proxy.last30d.withKnowledge !== 1 ? "s" : ""} answered with your own knowledge in the last 30 days.
            </p>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Each one means the model started with your CA&apos;s prior context — not a blank slate. This number compounds. As your knowledge base grows, the percentage rises.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function BigStat({ icon, tone, label, value, sub }: {
  icon:  React.ReactNode;
  tone:  "indigo" | "emerald" | "amber";
  label: string;
  value: string;
  sub:   string;
}) {
  const toneCls = {
    indigo:  "bg-indigo-50  text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50   text-amber-700",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`rounded-md p-1.5 ${toneCls}`}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{sub}</p>
    </div>
  );
}

function BreakdownCard({ title, entries, total }: {
  title:   string;
  entries: Array<{ key: string; label: string; count: number; tone: string }>;
  total:   number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{title}</p>
      <div className="space-y-2">
        {entries.map((e) => {
          const pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
          return (
            <div key={e.key} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className={`pill ${e.tone}`}>{e.label}</span>
                <span className="text-slate-700 tabular-nums">{e.count} <span className="text-slate-400">({pct}%)</span></span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-slate-700/60 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

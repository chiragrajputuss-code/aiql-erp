"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search, AlertCircle, AlertTriangle, TrendingUp, Info, CheckCircle2,
  Loader2, ChevronDown, ArrowRight, ShieldCheck, Sparkles,
  Lock, Play, Activity,
} from "lucide-react";
import {
  SAMPLE_REPORT, SAMPLE_SOURCES, ANALYSIS_STEPS, ANALYSIS_STATS,
  type SampleFinding, type SampleSeverity, type SampleCategory,
} from "@/lib/investigations/sample-report";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function useCountUp(target: number, durationMs: number, run: boolean) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, durationMs, run]);
  return val;
}

const SEV: Record<SampleSeverity, { icon: React.ReactNode; border: string; pill: string; impact: string; label: string }> = {
  critical:    { icon: <AlertCircle className="h-5 w-5 text-red-600" />,      border: "border-l-[6px] border-l-red-600 bg-red-50/60",  pill: "bg-red-600 text-white border-red-600",            impact: "text-red-600",     label: "CRITICAL" },
  warning:     { icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, border: "border-l-4 border-l-amber-400 bg-amber-50/30",   pill: "bg-amber-500 text-white border-amber-500",        impact: "text-amber-600",   label: "NEEDS ATTENTION" },
  opportunity: { icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,  border: "border-l-4 border-l-emerald-400 bg-emerald-50/30", pill: "bg-emerald-600 text-white border-emerald-600",    impact: "text-emerald-600", label: "OPPORTUNITY" },
  info:        { icon: <Info className="h-5 w-5 text-blue-400" />,           border: "border-l-4 border-l-blue-300 bg-blue-50/30",    pill: "bg-blue-100 text-blue-700 border-blue-200",       impact: "text-slate-700",   label: "FYI" },
};

const CATEGORY_LABELS: Record<SampleCategory, string> = {
  compliance:       "GST & Compliance",
  risk:             "Risk & Control",
  financial_health: "Financial Health",
  operations:       "Vendor & Operations",
  opportunity:      "Opportunity",
};

type Phase = "sources" | "analysing" | "report";

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-[#1B3A5C] text-lg tracking-tight">Account<span className="text-blue-600">IQ</span></Link>
        <div className="flex items-center gap-2">
          <Link href="/contact" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5">Book a demo</Link>
          <Link href="/signup" className="text-sm font-semibold bg-[#1B3A5C] text-white px-4 py-1.5 rounded-lg hover:bg-[#1B3A5C]/90">
            Run this on your books
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Phase 1: Sources detected ────────────────────────────────────────────────

function SourcesPanel({ onRun }: { onRun: () => void }) {
  return (
    <div>
      <div className="text-center mb-7">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> 2 sources connected &amp; auto-detected
        </span>
        <h2 className="text-xl font-bold text-slate-900 mt-3">Ready to investigate {SAMPLE_REPORT.company}</h2>
        <p className="text-sm text-muted-foreground mt-1">AccountIQ recognised these documents automatically — no mapping, no setup.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {SAMPLE_SOURCES.map((s) => (
          <div key={s.fileName} className="rounded-xl border border-slate-200 bg-white p-4 relative overflow-hidden">
            <div className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3" /> Detected
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xl">{s.icon}</div>
              <div className="min-w-0">
                <p className="font-mono text-xs text-slate-500 truncate">{s.fileName}</p>
                <p className="font-semibold text-slate-900 text-sm">{s.kind}</p>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-600">
              <span><b className="text-slate-900">{s.rows.toLocaleString("en-IN")}</b> rows</span>
              <span>{s.sizeLabel}</span>
              <span className="text-emerald-700">{Math.round(s.confidence * 100)}% match</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Recognised as {s.detectedAs}</p>
              <div className="flex flex-wrap gap-1">
                {s.recognised.map((c) => (
                  <span key={c} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{c}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Privacy reassurance at the point of trust */}
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-xs text-emerald-800">
          Vendor names, references and amounts are <b>encrypted &amp; masked</b> before analysis — never exposed to any AI model.
        </span>
      </div>

      <div className="text-center mt-6">
        <button
          onClick={onRun}
          className="inline-flex items-center gap-2 bg-[#1B3A5C] text-white px-7 py-3.5 rounded-xl font-semibold text-base hover:bg-[#1B3A5C]/90 shadow-lg shadow-[#1B3A5C]/20 transition-all hover:scale-[1.02]"
        >
          <Play className="h-4 w-4" /> Run Investigation
        </button>
        <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
          <Lock className="h-3 w-3" /> Read-only · your books are never modified
        </p>
      </div>
    </div>
  );
}

// ─── Phase 2: Live analysis ───────────────────────────────────────────────────

function AnalysingPanel({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const total = ANALYSIS_STEPS.length;
  const run = true;

  const txn  = useCountUp(ANALYSIS_STATS.transactionsScanned, 3600, run);
  const inv  = useCountUp(ANALYSIS_STATS.purchaseInvoices,    3600, run);
  const pay  = useCountUp(ANALYSIS_STATS.paymentsScanned,     3600, run);

  useEffect(() => {
    if (step >= total) { const t = setTimeout(onDone, 650); return () => clearTimeout(t); }
    const t = setTimeout(() => setStep((s) => s + 1), 430);
    return () => clearTimeout(t);
  }, [step, total, onDone]);

  const pct = Math.round((Math.min(step, total) / total) * 100);

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="flex items-center gap-2 text-[#1B3A5C] mb-1">
        <Activity className="h-5 w-5 animate-pulse" />
        <span className="font-semibold">Reviewing {SAMPLE_REPORT.company}&apos;s financial records…</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Cross-referencing the ledger with GST filings and 12 months of history.</p>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-1">
        <div className="h-full bg-gradient-to-r from-[#1B3A5C] to-blue-500 transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-right text-[11px] text-muted-foreground mb-5">{pct}%</p>

      {/* Live counters */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <LiveStat label="Transactions scanned" value={txn} />
        <LiveStat label="Invoices matched" value={inv} />
        <LiveStat label="Payments checked" value={pay} />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {ANALYSIS_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-300 ${
                done ? "border-slate-200 bg-white" : active ? "border-[#1B3A5C]/30 bg-[#1B3A5C]/[0.03]" : "border-transparent opacity-40"
              }`}
            >
              {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                : active ? <Loader2 className="h-4 w-4 text-[#1B3A5C] animate-spin shrink-0" />
                : <div className="h-4 w-4 rounded-full border-2 border-slate-200 shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="text-sm text-slate-700">{s.label}</span>
                <span className="text-xs text-slate-400 ml-2">{s.detail}</span>
              </div>
              {done && (
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${
                  s.tone === "alert" ? "bg-red-50 text-red-600 border border-red-200"
                  : s.tone === "good" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-500"
                }`}>{s.result}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
      <p className="text-2xl font-bold text-[#1B3A5C] tabular-nums">{value.toLocaleString("en-IN")}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

function EvidenceBlock({ ev }: { ev: SampleFinding["evidence"][number] }) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-700 mb-2">{ev.description}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-slate-100">
              {ev.columns.map((c) => <th key={c} className="pr-4 pb-1.5 font-medium whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {ev.rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="pr-4 py-1.5 whitespace-nowrap text-slate-700 tabular-nums">
                    {typeof cell === "number" && ev.columns[j]?.includes("₹") ? cell.toLocaleString("en-IN") : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({ f, defaultOpen }: { f: SampleFinding; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const meta = SEV[f.severity];

  return (
    <div className={`rounded-lg border border-slate-200 ${meta.border} transition-shadow hover:shadow-sm ${f.severity === "critical" ? "shadow-sm" : ""}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          {meta.icon}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${meta.pill}`}>{meta.label}</span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{CATEGORY_LABELS[f.category]}</span>
              {f.impactRs !== null && f.impactRs > 0 && (
                <span className={`font-extrabold tabular-nums ml-auto ${f.severity === "critical" ? "text-xl" : "text-base"} ${meta.impact}`}>{formatINR(f.impactRs)}</span>
              )}
            </div>
            <p className={`font-semibold text-slate-900 mt-1.5 ${f.severity === "critical" ? "text-base" : "text-[15px]"}`}>{f.title}</p>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{f.conclusion}</p>
          </div>
        </div>

        <div className="mt-3 ml-8 rounded-lg bg-white/80 border border-slate-200 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-[#1B3A5C]" />
            <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Recommended action</p>
          </div>
          <p className="text-sm text-slate-800">{f.recommendation.action}</p>
          <div className="flex gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground flex-wrap">
            <span><b className="text-slate-600 font-medium">Owner:</b> {f.recommendation.owner}</span>
            <span><b className="text-slate-600 font-medium">Priority:</b> {f.recommendation.priority.replace("_", " ")}</span>
            {f.recommendation.deadline && <span><b className="text-slate-600 font-medium">By:</b> {f.recommendation.deadline}</span>}
          </div>
          <p className="text-[11px] text-emerald-700 mt-1.5 font-medium">✓ {f.recommendation.expectedBenefit}</p>
        </div>

        <div className="mt-2 ml-8 text-[11px] text-muted-foreground">
          <b className="text-slate-600 font-medium">Resolves when:</b> {f.resolvesWhen}
        </div>

        <button onClick={() => setOpen((o) => !o)} className="mt-2.5 ml-8 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Hide" : "Show"} supporting transactions &amp; how to verify
        </button>

        {open && (
          <div className="mt-3 ml-8 space-y-3">
            {f.evidence.map((ev, i) => <EvidenceBlock key={i} ev={ev} />)}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-1">How to verify this yourself</p>
              <ol className="list-decimal list-inside text-xs text-slate-600 space-y-0.5">
                {f.verificationSteps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Phase 3: Report ──────────────────────────────────────────────────────────

function ReportPanel({ onReplay }: { onReplay: () => void }) {
  const r = SAMPLE_REPORT;
  const [filter, setFilter] = useState<"all" | SampleSeverity>("all");
  const impact = useCountUp(r.totalImpactRs, 1100, true);
  const health = useCountUp(r.healthScore, 1100, true);
  const filtered = r.findings.filter((f) => filter === "all" || f.severity === filter);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Investigation complete · {r.findings.length} findings
        </span>
        <button onClick={onReplay} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5" /> Replay
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Critical" value={r.criticalCount} cls="border-red-200 bg-red-50/40 text-red-700" />
        <SummaryCard label="Needs attention" value={r.warningCount} cls="border-amber-200 bg-amber-50/30 text-amber-700" />
        <SummaryCard label="Opportunities" value={r.opportunityCount} cls="border-emerald-200 bg-emerald-50/30 text-emerald-700" />
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Money in play</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{formatINR(impact)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Financial health {health}/100</p>
        </div>
      </div>

      {/* Exec summary */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 mb-5">
        <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide mb-1">Executive summary</p>
        <p className="text-sm text-slate-700 leading-relaxed">{r.executiveSummary}</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        {(["all", "critical", "warning", "opportunity"] as const).map((s) => {
          const count = s === "all" ? r.findings.length : r.findings.filter((f) => f.severity === s).length;
          const active = filter === s;
          const lbl = s === "all" ? "All findings" : s === "warning" ? "needs attention" : s;
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                active ? "bg-[#1B3A5C] text-white border-[#1B3A5C]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}>
              {lbl} ({count})
            </button>
          );
        })}
      </div>

      {/* Findings */}
      <div className="space-y-2.5">
        {filtered.map((f, i) => <FindingCard key={f.code} f={f} defaultOpen={i === 0 && filter === "all"} />)}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-5 pt-4 border-t border-slate-200">
        <Lock className="h-3 w-3" />
        <span>Analysed {new Date(r.resolvedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · read-only · AccountIQ never modifies your books.</span>
      </div>

      {/* CTA */}
      <div className="mt-8 rounded-2xl bg-gradient-to-br from-[#1B3A5C] to-[#15314d] text-white p-7 text-center">
        <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-white/90" />
        <h2 className="text-xl font-bold">That ran in seconds. On your books, it runs every month.</h2>
        <p className="text-white/80 text-sm mt-2 max-w-xl mx-auto">
          Upload your ledger and GST data — AccountIQ tells you what deserves attention, with the evidence and the action, before month-end.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-5">
          <Link href="/signup" className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-6 py-3 rounded-xl font-bold hover:bg-slate-100">
            Run it on your books <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/contact" className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/10">
            Book a demo
          </Link>
        </div>
        <p className="text-white/50 text-xs mt-3">No credit card · Read-only · Setup in minutes</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SampleReportPage() {
  const [phase, setPhase] = useState<Phase>("sources");
  const replay = useCallback(() => setPhase("analysing"), []);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Sample banner */}
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Live sample on fictional data ({SAMPLE_REPORT.company} · {SAMPLE_REPORT.period}). This is exactly what AccountIQ produces on your own books.</span>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <Search className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Financial Investigation</h1>
        </div>

        {phase === "sources"   && <SourcesPanel onRun={() => setPhase("analysing")} />}
        {phase === "analysing" && <AnalysingPanel onDone={() => setPhase("report")} />}
        {phase === "report"    && <ReportPanel onReplay={replay} />}
      </div>
    </div>
  );
}

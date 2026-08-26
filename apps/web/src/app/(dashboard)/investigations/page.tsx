"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, AlertCircle, AlertTriangle, TrendingUp, Info,
  Loader2, RefreshCw, ChevronDown, ShieldCheck, Clock,
  Lightbulb, Presentation, Printer, ArrowLeft, Download, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "opportunity" | "info";

interface Evidence {
  source:      string;
  description: string;
  query:       string;
  rows:        Record<string, unknown>[];
  amountRs:    number | null;
  confidence:  number;
  references:  string[];
}

interface Recommendation {
  action:          string;
  owner:           string;
  priority:        string;
  expectedBenefit: string;
  deadline:        string | null;
}

interface Finding {
  id:               string;
  code:             string;
  category:         string;
  severity:         Severity;
  title:            string;
  impactRs:         number | null;
  businessQuestion: string;
  conclusion:       string;
  llmSummary:       string | null;
  resolvesWhen:     string;
  changeStatus:     "new" | "carried" | null;
  firstSeenPeriod:  string | null;
  evidence:         Evidence[];
  recommendation:   Recommendation | null;
  verificationSteps: string[];
}

interface ResolvedFinding {
  id:            string;
  code:          string;
  title:         string;
  category:      string;
  impactRs:      number | null;
  resolvedAt:    string | null;
  disposition:   "recovered" | "not_an_issue" | null;
  dispositionAt: string | null;
}

interface Ledger {
  foundTotalRs:    number;
  resolvedTotalRs: number;
  openTotalRs:     number;
  firstRunAt:      string | null;
}

interface HistoryRun {
  runId:         string;
  period:        string;
  startedAt:     string;
  status:        string;
  healthScore:   number | null;
  totalImpactRs: number;
  criticalCount: number;
  counts:        { new: number; carried: number; resolved: number };
  resolvedRs:    number;
}

interface Outcome {
  investigationId: string;
  status:          string;
  reason:          string | null;
  findingCount:    number;
}

interface ProactiveObservation {
  kind:         string;
  title:        string;
  detail:       string;
  impactRs:     number | null;
  relatedCodes: string[];
  narrated?:    string;
}

interface BriefItem { code: string; title: string; severity: string; impactRs: number | null; }
interface BoardDecision { action: string; priority: string; benefit: string; }
interface BoardBrief {
  headline: { period: string; healthScore: number; totalAtRiskRs: number; totalOpportunityRs: number };
  risks:                 BriefItem[];
  opportunities:         BriefItem[];
  cashAndWorkingCapital: BriefItem[];
  recommendedDecisions:  BoardDecision[];
  narratedSummary:       string;
}

interface ClientOption {
  connectionId: string;
  displayName:  string;
  periodStart:  string | null;
  periodEnd:    string | null;
}

interface Run {
  id:               string;
  connectionId:     string | null;
  period:           string;
  status:           string;
  snapshotId:       string;
  resolvedAt:       string;
  completedAt:      string | null;
  healthScore:      number | null;
  totalImpactRs:    number;
  criticalCount:    number;
  warningCount:     number;
  opportunityCount: number;
  executiveSummary: string | null;
  outcomes:         Outcome[];
  counts:           { new: number; carried: number; resolved: number };
  resolvedRs:       number;
  ledger:           Ledger;
  findings:         Finding[];
  resolvedFindings: ResolvedFinding[];
  proactiveObservation: ProactiveObservation | null;
  boardBrief:           BoardBrief | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatINR(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const SEV: Record<Severity, { icon: React.ReactNode; border: string; pill: string; label: string }> = {
  critical:    { icon: <AlertCircle className="h-5 w-5 text-red-500" />,    border: "border-l-red-500 bg-red-50/30",    pill: "bg-red-100 text-red-700 border-red-200",       label: "CRITICAL" },
  warning:     { icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, border: "border-l-amber-400 bg-amber-50/20", pill: "bg-amber-100 text-amber-700 border-amber-200", label: "WARNING" },
  opportunity: { icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,  border: "border-l-emerald-400 bg-emerald-50/20", pill: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "OPPORTUNITY" },
  info:        { icon: <Info className="h-5 w-5 text-blue-400" />,           border: "border-l-blue-300 bg-blue-50/20",   pill: "bg-blue-100 text-blue-700 border-blue-200",    label: "INFO" },
};

// ─── Finding card with evidence drill-down ────────────────────────────────────

function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const meta = SEV[f.severity];

  return (
    <div className={`border-l-4 rounded-lg border border-slate-200 ${meta.border}`}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {meta.icon}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] ${meta.pill}`}>{meta.label}</Badge>
              {f.changeStatus === "new" && (
                <Badge className="text-[10px] bg-violet-100 text-violet-700 border-violet-200">NEW</Badge>
              )}
              {f.changeStatus === "carried" && f.firstSeenPeriod && (
                <Badge className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">
                  CARRIED since {f.firstSeenPeriod}
                </Badge>
              )}
              {f.impactRs !== null && f.impactRs > 0 && (
                <span className="text-sm font-semibold text-slate-800">{formatINR(f.impactRs)}</span>
              )}
            </div>
            <p className="font-medium text-sm mt-1">{f.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{f.llmSummary || f.conclusion}</p>
          </div>
        </div>

        {/* Recommendation */}
        {f.recommendation && (
          <div className="mt-3 ml-8 rounded-md bg-white/70 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Recommended action</p>
            <p className="text-sm mt-1">{f.recommendation.action}</p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <span><strong className="text-slate-600">Owner:</strong> {f.recommendation.owner}</span>
              <span><strong className="text-slate-600">Priority:</strong> {f.recommendation.priority.replace("_", " ")}</span>
              {f.recommendation.deadline && <span><strong className="text-slate-600">By:</strong> {f.recommendation.deadline}</span>}
            </div>
            <p className="text-xs text-emerald-700 mt-1.5">✓ {f.recommendation.expectedBenefit}</p>
          </div>
        )}

        {/* Resolves when */}
        <div className="mt-2 ml-8 text-xs text-muted-foreground">
          <strong className="text-slate-600">Resolves when:</strong> {f.resolvesWhen}
        </div>

        {/* Evidence toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 ml-8 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Hide" : "Show"} evidence ({f.evidence.length}) &amp; verification
        </button>

        {open && (
          <div className="mt-2 ml-8 space-y-3">
            {/* Verification steps */}
            {f.verificationSteps.length > 0 && (
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">How to verify</p>
                <ol className="list-decimal list-inside text-xs text-slate-600 space-y-0.5">
                  {f.verificationSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}

            {/* Evidence */}
            {f.evidence.map((e, i) => (
              <div key={i} className="rounded-md bg-white border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-700">{e.description}</p>
                  <span className="text-[10px] text-muted-foreground">conf {Math.round(e.confidence * 100)}%</span>
                </div>
                {e.references.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">Refs: {e.references.join(", ")}</p>
                )}
                {e.rows.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <EvidenceTable rows={e.rows} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0] ?? {}).slice(0, 6);
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="text-left text-muted-foreground">
          {cols.map((c) => <th key={c} className="pr-3 pb-1 font-medium whitespace-nowrap">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 8).map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            {cols.map((c) => <td key={c} className="pr-3 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Board Meeting Mode ───────────────────────────────────────────────────────

function BoardView({ run, onBack }: { run: Run; onBack: () => void }) {
  const b = run.boardBrief!;
  const bullets = b.narratedSummary.split("\n").map((s) => s.replace(/^[•\-\s]+/, "").trim()).filter(Boolean);

  const sevDot: Record<string, string> = { critical: "bg-red-500", warning: "bg-amber-500", opportunity: "bg-emerald-500", info: "bg-blue-400" };
  const Section = ({ title, items }: { title: string; items: BriefItem[] }) =>
    items.length === 0 ? null : (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-2">{title}</h3>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.code} className="flex items-center justify-between gap-4 text-sm border-b border-slate-100 pb-1.5">
              <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${sevDot[it.severity] ?? "bg-slate-400"}`} />{it.title}</span>
              {it.impactRs !== null && it.impactRs > 0 && <span className="font-semibold tabular-nums shrink-0">{formatINR(it.impactRs)}</span>}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-auto">
      <style>{`@media print { body * { visibility: hidden; } #board-print, #board-print * { visibility: visible; } #board-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to report
        </button>
        <Button onClick={() => window.print()} className="gap-2 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {/* Printable brief */}
      <div id="board-print" className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between border-b-2 border-[#1B3A5C] pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1B3A5C]">Board Briefing</h1>
            <p className="text-sm text-slate-500">Financial investigation · {b.headline.period}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold text-slate-900">{b.headline.healthScore}<span className="text-base text-slate-400">/100</span></p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">Financial health</p>
          </div>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-4">
            <p className="text-xs text-red-600 font-semibold uppercase tracking-wide">At risk</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{formatINR(b.headline.totalAtRiskRs)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Opportunity</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(b.headline.totalOpportunityRs)}</p>
          </div>
        </div>

        {/* Summary bullets */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-2">Summary</h3>
          <ul className="space-y-1.5">
            {bullets.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-[#1B3A5C]">•</span>{line}</li>
            ))}
          </ul>
        </div>

        <Section title="Major Risks" items={b.risks} />
        <Section title="Major Opportunities" items={b.opportunities} />
        <Section title="Cash & Working Capital" items={b.cashAndWorkingCapital} />

        {/* Recommended decisions */}
        {b.recommendedDecisions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-2">Recommended Decisions</h3>
            <ol className="space-y-2">
              {b.recommendedDecisions.map((d, i) => (
                <li key={i} className="text-sm border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-800">{d.action}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 shrink-0">{d.priority.replace("_", " ")}</span>
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">✓ {d.benefit}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-4 mt-8">
          Generated by AcctQAI · snapshot {run.snapshotId} · {new Date(run.resolvedAt).toLocaleString("en-IN")} · read-only, evidence-backed.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const LAST_CLIENT_KEY = "acctqai:investigations:lastConnectionId";

export default function InvestigationsPage() {
  const searchParams = useSearchParams();
  const [run, setRun]         = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState(false);

  // ── Client switcher (practice mode) ──
  const [clients, setClients]           = useState<ClientOption[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // ── Period selector (history) ──
  const [history, setHistory]     = useState<HistoryRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null); // null = latest

  async function loadClients(): Promise<ClientOption[]> {
    try {
      const res = await fetch("/api/v1/investigations/clients");
      if (!res.ok) return [];
      const data = await res.json();
      return data.clients as ClientOption[];
    } catch {
      return [];
    } finally {
      setClientsLoaded(true);
    }
  }

  async function loadHistory(forConnectionId: string | null) {
    try {
      const qs  = forConnectionId ? `?connectionId=${encodeURIComponent(forConnectionId)}` : "";
      const res = await fetch(`/api/v1/investigations/history${qs}`);
      if (!res.ok) { setHistory([]); return; }
      const data = await res.json();
      setHistory(data.runs as HistoryRun[]);
    } catch {
      setHistory([]);
    }
  }

  async function loadReport(forConnectionId: string | null, forRunId: string | null = null) {
    setLoading(true);
    setError(null);
    try {
      const qs = forRunId
        ? `?runId=${encodeURIComponent(forRunId)}`
        : forConnectionId ? `?connectionId=${encodeURIComponent(forConnectionId)}` : "";
      const res = await fetch(`/api/v1/investigations/report${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRun(data.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  function selectPeriod(runId: string | null) {
    setSelectedRunId(runId);
    loadReport(connectionId, runId);
  }

  async function dispositionFinding(id: string, disposition: "recovered" | "not_an_issue") {
    try {
      const res = await fetch(`/api/v1/investigations/findings/${id}/disposition`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ disposition }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setRun((prev) => prev && {
        ...prev,
        resolvedFindings: prev.resolvedFindings.map((f) =>
          f.id === id ? { ...f, disposition: data.disposition, dispositionAt: data.dispositionAt } : f
        ),
      });
    } catch { /* best-effort — leave the buttons in place to retry */ }
  }

  async function runInvestigation() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/investigations/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(connectionId ? { connectionId } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.detail ? `${body.error}: ${body.detail}` : body?.error;
        throw new Error(msg ?? (await res.text()));
      }
      setSelectedRunId(null); // a fresh run is always the latest
      await Promise.all([loadReport(connectionId), loadHistory(connectionId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation failed");
    } finally {
      setRunning(false);
    }
  }

  function selectClient(id: string | null) {
    setConnectionId(id);
    setSelectedRunId(null);
    try {
      if (id) localStorage.setItem(LAST_CLIENT_KEY, id);
      else localStorage.removeItem(LAST_CLIENT_KEY);
    } catch { /* localStorage unavailable — selection just won't persist */ }
    loadReport(id);
    loadHistory(id);
  }

  // On mount: load the client list, pick a sensible default — an explicit
  // ?connectionId= (e.g. the "View"/"Run" link from the practice dashboard)
  // wins, then last-viewed if still valid, then the most recent client, then
  // the legacy org-wide view — then load that client's report.
  useEffect(() => {
    (async () => {
      const list = await loadClients();
      setClients(list);

      let initial: string | null = null;
      const fromUrl = searchParams.get("connectionId");
      if (fromUrl && list.some((c) => c.connectionId === fromUrl)) initial = fromUrl;
      if (!initial) {
        try {
          const saved = localStorage.getItem(LAST_CLIENT_KEY);
          if (saved && list.some((c) => c.connectionId === saved)) initial = saved;
        } catch { /* ignore */ }
      }
      if (!initial && list.length > 0) initial = list[0].connectionId;

      setConnectionId(initial);
      try {
        if (initial) localStorage.setItem(LAST_CLIENT_KEY, initial);
      } catch { /* ignore */ }
      await Promise.all([loadReport(initial), loadHistory(initial)]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (boardMode && run?.boardBrief) {
    return <BoardView run={run} onBack={() => setBoardMode(false)} />;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Search className="h-6 w-6 text-indigo-600" />
            Investigations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            We investigate your books and surface what deserves attention — with the evidence and the action to take.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {run && (
            <a
              href={`/api/v1/investigations/report/export${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ""}`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
              title="Download the client-facing Health Check PDF"
            >
              <Download className="h-4 w-4" /> Download PDF
            </a>
          )}
          {run?.boardBrief && (
            <Button variant="outline" onClick={() => setBoardMode(true)} className="gap-2">
              <Presentation className="h-4 w-4" /> Board Meeting Mode
            </Button>
          )}
          <Button onClick={runInvestigation} disabled={running} className="gap-2 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {run ? "Run Again" : "Run Investigation"}
          </Button>
        </div>
      </div>

      {/* Client switcher — only shown once at least one GL client book exists.
          A single-business account with one connection still sees it, so it's
          always clear which book is loaded; this is what makes practice mode
          usable once a firm adds a second client. */}
      {clientsLoaded && clients.length > 0 && (
        <div className="flex items-center gap-2 -mt-2 flex-wrap">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <label htmlFor="client-switcher" className="text-xs text-muted-foreground shrink-0">Client book:</label>
          <select
            id="client-switcher"
            value={connectionId ?? ""}
            onChange={(e) => selectClient(e.target.value || null)}
            className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white max-w-xs"
          >
            {clients.map((c) => (
              <option key={c.connectionId} value={c.connectionId}>
                {c.displayName}{c.periodEnd ? ` — ${c.periodEnd.slice(0, 7)}` : ""}
              </option>
            ))}
          </select>

          {/* Period selector — jump to any past run for this client, CURRENT
              or SUPERSEDED, so history stays reachable instead of only ever
              showing the latest. */}
          {history.length > 1 && (
            <>
              <Clock className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
              <label htmlFor="period-selector" className="text-xs text-muted-foreground shrink-0">Period:</label>
              <select
                id="period-selector"
                value={selectedRunId ?? history[0]?.runId ?? ""}
                onChange={(e) => selectPeriod(e.target.value || null)}
                className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white max-w-xs"
              >
                {history.map((h, i) => (
                  <option key={h.runId} value={h.runId}>
                    {h.period}{i === 0 ? " (latest)" : ""}
                    {h.criticalCount > 0 ? ` — ${h.criticalCount} critical` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50"><CardContent className="pt-4 text-sm text-red-700">{error}</CardContent></Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading…
        </div>
      )}

      {!loading && !run && (
        <Card className="border-dashed border-slate-300">
          <CardContent className="py-14 text-center">
            <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-600">No investigation has run yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Upload your GL and GSTR-2B, then run an investigation. We&apos;ll check vendor ITC risk and tell you which credits are in danger — before the reversal hits.
            </p>
            <Button onClick={runInvestigation} disabled={running} className="mt-4 gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Run your first investigation
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && run && (
        <>
          {run.status !== "CURRENT" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Viewing {run.period} — a past period, superseded by a later run. Switch the period selector above to jump back to the latest.
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-red-200 bg-red-50/30"><CardContent className="pt-4">
              <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Critical</p>
              <p className="text-3xl font-bold text-red-700 mt-1">{run.criticalCount}</p>
            </CardContent></Card>
            <Card className="border-amber-200 bg-amber-50/20"><CardContent className="pt-4">
              <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Warnings</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{run.warningCount}</p>
            </CardContent></Card>
            <Card className="border-emerald-200 bg-emerald-50/20"><CardContent className="pt-4">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Opportunities</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{run.opportunityCount}</p>
            </CardContent></Card>
            <Card className="border-slate-200"><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Financial Impact</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatINR(run.totalImpactRs)}</p>
              {run.healthScore !== null && <p className="text-xs text-muted-foreground mt-0.5">Health score: {run.healthScore}/100</p>}
            </CardContent></Card>
          </div>

          {/* Executive summary */}
          {run.executiveSummary && (
            <Card className="border-indigo-100 bg-indigo-50/30">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Executive summary</p>
                <p className="text-sm text-slate-700">{run.executiveSummary}</p>
              </CardContent>
            </Card>
          )}

          {/* One more thing — proactive observation */}
          {run.proactiveObservation && (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 flex gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Lightbulb className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">One more thing</p>
                <p className="text-sm text-slate-700 mt-1">{run.proactiveObservation.narrated || run.proactiveObservation.detail}</p>
              </div>
            </div>
          )}

          {/* Findings */}
          {run.findings.length === 0 ? (
            <Card className="border-emerald-200 bg-emerald-50/20">
              <CardContent className="py-10 text-center">
                <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                <p className="font-medium text-slate-700">No issues found for {run.period}</p>
                <p className="text-sm text-muted-foreground mt-1">Your books look clean across the checks we ran.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {run.findings.map((f) => <FindingCard key={f.id} f={f} />)}
            </div>
          )}

          {/* No longer appearing — findings from the prior run this one was
              compared against that don't show up again (absence-as-evidence).
              Wording discipline: "no longer appears", never "recovered" —
              the product can prove a finding is gone, not that money moved. */}
          {run.resolvedFindings.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  No longer appearing since last run
                </p>
                {run.resolvedRs > 0 && (
                  <span className="text-sm font-semibold text-emerald-700">{formatINR(run.resolvedRs)}</span>
                )}
              </div>
              {run.ledger.firstRunAt && (
                <p className="text-xs text-emerald-700/80 mt-1">
                  Since {formatMonthYear(run.ledger.firstRunAt)}, AcctQAI has identified {formatINR(run.ledger.foundTotalRs)} for this client, of which {formatINR(run.ledger.resolvedTotalRs)} no longer appears.
                </p>
              )}
              <ul className="mt-2 space-y-1.5">
                {run.resolvedFindings.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 text-sm text-slate-700 border-b border-emerald-100 last:border-0 pb-1.5 last:pb-0">
                    <span>{f.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.impactRs !== null && f.impactRs > 0 && (
                        <span className="text-xs font-medium text-emerald-700">{formatINR(f.impactRs)}</span>
                      )}
                      {f.disposition ? (
                        <span className="text-[10px] text-muted-foreground">
                          {f.disposition === "recovered" ? "Marked recovered" : "Marked not an issue"}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => dispositionFinding(f.id, "recovered")}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                          >
                            Recovered
                          </button>
                          <button
                            onClick={() => dispositionFinding(f.id, "not_an_issue")}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                          >
                            Was not an issue
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skipped investigations */}
          {run.outcomes.some((o) => o.status === "skipped") && (
            <div className="text-xs text-muted-foreground">
              {run.outcomes.filter((o) => o.status === "skipped").map((o) => (
                <p key={o.investigationId}>Skipped <strong>{o.investigationId}</strong> — {o.reason}</p>
              ))}
            </div>
          )}

          {/* Trust footer (Principle 4) */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2 border-t border-slate-100">
            <Clock className="h-3 w-3" />
            <span>
              Based on snapshot <code className="font-mono">{run.snapshotId}</code>, resolved at{" "}
              {new Date(run.resolvedAt).toLocaleString("en-IN")}. New uploads require a fresh run to be included.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

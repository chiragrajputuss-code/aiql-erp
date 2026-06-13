"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, Clock, XCircle, AlertTriangle, Circle,
  ChevronLeft, TrendingUp, CalendarDays, Target, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  status: string;
  category: string;
  sortOrder: number;
  completedAt: string | null;
  dependsOnIds: string[];
  reconciliations: { id: string; name: string; status: string; variance: number | null }[];
}

interface Period {
  id: string;
  name: string;
  status: string;
  completionPct: number;
  startDate: string;
  endDate: string;
  targetCompletionDate: string | null;
  completedAt: string | null;
  tasks: Task[];
}

interface Progress {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  blocked: number;
  pending: number;
  pct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatINR(n: number | null) {
  if (n === null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(0)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CFODashboardPage({ params }: { params: { periodId: string } }) {
  const { periodId } = params;
  const [period,   setPeriod]   = useState<Period | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch(`/api/v1/close/periods/${periodId}`)
      .then((r) => r.json())
      .then((data: { period: Period; progress: Progress }) => {
        setPeriod(data.period);
        setProgress(data.progress);
      })
      .finally(() => setLoading(false));
  }, [periodId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 py-2">
        <div className="h-8 w-48 rounded bg-slate-100 animate-pulse" />
        <div className="h-48 rounded-xl bg-slate-50 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />
          <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!period || !progress) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center">
        <p className="text-sm text-slate-500">Period not found.</p>
        <Link href="/close"><Button variant="ghost" size="sm" className="mt-2">← Back</Button></Link>
      </div>
    );
  }

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const startedAt   = new Date(period.startDate);
  const now         = new Date();
  const daysElapsed = Math.max(0, daysBetween(startedAt, now));
  const target      = period.targetCompletionDate ? new Date(period.targetCompletionDate) : null;
  const daysToTarget = target ? daysBetween(now, target) : null;

  // Estimate completion: if we've done X% in N days, ETA = N / (X/100) days from start
  const eta = period.completionPct > 0 && period.completionPct < 100
    ? (() => {
        const totalDays = Math.ceil(daysElapsed / (period.completionPct / 100));
        const etaDate   = new Date(startedAt.getTime() + totalDays * 86_400_000);
        return etaDate;
      })()
    : null;

  const onTrack = target && eta ? eta <= target : true;

  // Blockers: failed tasks + tasks blocking others
  const failedTasks  = period.tasks.filter((t) => t.status === "FAILED");
  const blockedTasks = period.tasks.filter((t) => t.status === "BLOCKED");

  // Activity: recently completed tasks sorted by completion time
  const recentActivity = period.tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    .slice(0, 5);

  // Reconciliations with failures
  const reconIssues = period.tasks.flatMap((t) =>
    t.reconciliations.filter((r) => r.status === "FAILED" && r.variance && r.variance > 0)
      .map((r) => ({ taskTitle: t.title, ...r }))
  );

  return (
    <div className="max-w-5xl mx-auto space-y-5 py-2">

      {/* Back nav */}
      <div>
        <Link href={`/close/${periodId}`} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to checklist
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CFO Dashboard</p>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">{period.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {formatDate(period.startDate)} – {formatDate(period.endDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Hero progress card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="text-sm text-slate-500">Close progress</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-5xl font-bold text-slate-900">{period.completionPct}</span>
              <span className="text-2xl text-slate-400">%</span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {progress.completed} of {progress.total} tasks complete
            </p>
          </div>

          <div className="flex gap-3">
            <StatusChip count={progress.completed} label="Done"     color="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatusChip count={progress.inProgress} label="Active"  color="blue"    icon={<Clock        className="h-4 w-4" />} />
            <StatusChip count={progress.failed}    label="Failed"   color="red"     icon={<XCircle      className="h-4 w-4" />} />
            <StatusChip count={progress.blocked}   label="Blocked"  color="amber"   icon={<AlertTriangle className="h-4 w-4" />} />
            <StatusChip count={progress.pending}   label="Pending"  color="slate"   icon={<Circle       className="h-4 w-4" />} />
          </div>
        </div>

        <div className="mt-5 space-y-1.5">
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                period.completionPct >= 100 ? "bg-emerald-500" :
                period.completionPct >= 60  ? "bg-blue-500"    :
                period.completionPct >= 30  ? "bg-amber-400"   : "bg-slate-300"
              }`}
              style={{ width: `${period.completionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Schedule + ETA row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Days elapsed"
          value={`${daysElapsed}d`}
          sub={`since ${formatDate(period.startDate)}`}
        />
        <InfoCard
          icon={<Target className="h-4 w-4" />}
          label="Target date"
          value={target ? formatDate(target.toISOString()) : "Not set"}
          sub={daysToTarget !== null
            ? daysToTarget < 0
              ? `${Math.abs(daysToTarget)}d overdue`
              : daysToTarget === 0 ? "Due today" : `${daysToTarget}d remaining`
            : undefined}
          subTone={daysToTarget !== null && daysToTarget < 0 ? "red" : daysToTarget !== null && daysToTarget <= 3 ? "amber" : "slate"}
        />
        <InfoCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Estimated completion"
          value={eta ? formatDate(eta.toISOString()) : period.completionPct >= 100 ? "Complete" : "—"}
          sub={eta && target ? (onTrack ? "On track" : "Behind schedule") : undefined}
          subTone={eta && target ? (onTrack ? "emerald" : "red") : "slate"}
        />
      </div>

      {/* Blockers + Recon issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Blockers */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">What's holding up the close</h2>
          </div>

          {failedTasks.length === 0 && blockedTasks.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No blockers. Close is progressing smoothly.</p>
          ) : (
            <div className="space-y-2">
              {failedTasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-medium">{t.sortOrder}. {t.title}</p>
                    <p className="text-xs text-red-600">Failed — needs attention</p>
                  </div>
                </div>
              ))}
              {blockedTasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 font-medium">{t.sortOrder}. {t.title}</p>
                    <p className="text-xs text-amber-600">Waiting on upstream dependencies</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reconciliation issues */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-slate-900">Reconciliation issues</h2>
          </div>

          {reconIssues.length === 0 ? (
            <p className="text-sm text-slate-500 italic">All reconciliations pass or pending.</p>
          ) : (
            <div className="space-y-2">
              {reconIssues.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-medium truncate">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.taskTitle}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                    {formatINR(r.variance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent activity */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No tasks completed yet.</p>
        ) : (
          <div className="space-y-2.5">
            {recentActivity.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">{t.title}</span> marked complete
                  </p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(t.completedAt!).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-between items-center pt-2 pb-8">
        <Link href={`/close/${periodId}`}>
          <Button variant="outline" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to checklist
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Presentational helpers ───────────────────────────────────────────────────

function StatusChip({ count, label, color, icon }: {
  count: number; label: string; color: "emerald" | "blue" | "red" | "amber" | "slate"; icon: React.ReactNode;
}) {
  const colorMap = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue:    "bg-blue-50    border-blue-200    text-blue-700",
    red:     "bg-red-50     border-red-200     text-red-700",
    amber:   "bg-amber-50   border-amber-200   text-amber-700",
    slate:   "bg-slate-50   border-slate-200   text-slate-600",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[color]} ${count === 0 ? "opacity-40" : ""}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-0.5">{count}</p>
    </div>
  );
}

function InfoCard({ icon, label, value, sub, subTone = "slate" }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  subTone?: "slate" | "emerald" | "amber" | "red";
}) {
  const subColor = {
    slate:   "text-slate-500",
    emerald: "text-emerald-600",
    amber:   "text-amber-600",
    red:     "text-red-600",
  }[subTone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
        {icon} {label}
      </div>
      <p className="text-xl font-semibold text-slate-900 mt-1.5">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>}
    </div>
  );
}

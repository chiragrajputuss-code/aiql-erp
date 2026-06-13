"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, Clock, AlertTriangle, Plus, ChevronRight,
  Calendar, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewClosePeriodDialog } from "@/components/close/new-period-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskSummary {
  id: string;
  status: string;
}

interface Period {
  id: string;
  name: string;
  periodType: string;
  status: string;
  completionPct: number;
  startDate: string;
  endDate: string;
  targetCompletionDate: string | null;
  createdAt: string;
  tasks: TaskSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING:     { label: "Not started", color: "text-slate-500 bg-slate-100" },
  IN_PROGRESS: { label: "In progress", color: "text-blue-700 bg-blue-50 border border-blue-200" },
  COMPLETED:   { label: "Completed",   color: "text-emerald-700 bg-emerald-50 border border-emerald-200" },
  CANCELLED:   { label: "Cancelled",   color: "text-slate-400 bg-slate-50" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return diff;
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const color =
    status === "COMPLETED" ? "bg-emerald-500" :
    pct >= 75 ? "bg-blue-500" :
    pct >= 40 ? "bg-amber-500" :
    "bg-slate-300";

  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CloseManagerPage() {
  const [periods, setPeriods]   = useState<Period[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/close/periods");
      if (res.ok) {
        const data = await res.json() as { periods: Period[] };
        setPeriods(data.periods);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const active   = periods.filter((p) => p.status !== "COMPLETED" && p.status !== "CANCELLED");
  const archived = periods.filter((p) => p.status === "COMPLETED" || p.status === "CANCELLED");

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-2">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Close Manager</h1>
          <p className="text-sm text-slate-500 mt-0.5">Month-end and quarter-end close workflow</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Close Period
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-100 bg-slate-50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && periods.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No close periods yet</p>
          <p className="text-sm text-slate-500 mt-1">Start your first month-end close to track progress across 14 tasks.</p>
          <Button size="sm" className="mt-4" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Close Period
          </Button>
        </div>
      )}

      {/* Active periods */}
      {!loading && active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active</h2>
          {active.map((p) => <PeriodCard key={p.id} period={p} />)}
        </section>
      )}

      {/* Archived periods */}
      {!loading && archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completed</h2>
          {archived.map((p) => <PeriodCard key={p.id} period={p} />)}
        </section>
      )}

      <NewClosePeriodDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onCreated={(period) => {
          setPeriods((prev) => [period as Period, ...prev]);
          setShowDialog(false);
        }}
      />
    </div>
  );
}

// ─── Period card ──────────────────────────────────────────────────────────────

function PeriodCard({ period }: { period: Period }) {
  const meta   = STATUS_META[period.status] ?? STATUS_META.PENDING!;
  const days   = daysLeft(period.targetCompletionDate);
  const total  = period.tasks.length;
  const done   = period.tasks.filter((t) => t.status === "COMPLETED").length;
  const failed = period.tasks.filter((t) => t.status === "FAILED").length;
  const blocked = period.tasks.filter((t) => t.status === "BLOCKED").length;

  return (
    <Link href={`/close/${period.id}`}>
      <div className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900 truncate">{period.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                {meta.label}
              </span>
              {failed > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium text-red-700 bg-red-50 border border-red-200">
                  {failed} failed
                </span>
              )}
              {blocked > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium text-amber-700 bg-amber-50 border border-amber-200">
                  {blocked} blocked
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(period.startDate)} – {formatDate(period.endDate)}
              </span>
              {days !== null && period.status !== "COMPLETED" && (
                <span className={`flex items-center gap-1 ${days < 0 ? "text-red-500" : days <= 3 ? "text-amber-600" : "text-slate-500"}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                </span>
              )}
              {failed > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {failed} task{failed > 1 ? "s" : ""} need attention
                </span>
              )}
            </div>

            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{done} of {total} tasks complete</span>
                <span className="font-medium text-slate-700">{period.completionPct}%</span>
              </div>
              <ProgressBar pct={period.completionPct} status={period.status} />
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 mt-1 shrink-0 transition-colors" />
        </div>
      </div>
    </Link>
  );
}

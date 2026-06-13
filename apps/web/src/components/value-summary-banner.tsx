"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, IndianRupee, Sparkles, AlertCircle, ArrowRight, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  hasConnections:       boolean;
  hasDemoConnections:   boolean;
  connectionCount:      number;
  totalAnomalies:       number;
  totalExposureInr:     number;
  totalReconciliations: number;
  autoResolvedCount:    number;
  timeSavedHours:       number;
  topIssueTypes:        Array<{ code: string; count: number; exposure: number }>;
  computedAt:           string;
  source:               "cache" | "fresh";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupees(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
  return `${sign}₹${Math.round(abs)}`;
}

function formatHours(h: number): string {
  if (h < 1)   return `${Math.round(h * 60)} min`;
  if (h < 24)  return `${h.toFixed(1)} hrs`;
  const days   = Math.floor(h / 8);
  const remHrs = h - days * 8;
  if (remHrs < 0.5) return `${days} workday${days !== 1 ? "s" : ""}`;
  return `${days}d ${remHrs.toFixed(1)}h`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ValueSummaryBanner(): JSX.Element {
  const router = useRouter();
  const [summary, setSummary]           = useState<Summary | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);

  const [loadingDemo, setLoadingDemo]   = useState(false);
  const [demoError, setDemoError]       = useState<string | null>(null);
  const [loadingUnload, setLoadingUnload] = useState(false);
  const [unloadError, setUnloadError]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);

  // ── Auto-dismiss success message after 5 s ───────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 5000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Fetch summary (re-runs when refreshKey changes) ──────────────────────────
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/v1/insights/summary")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Summary) => {
        if (mounted) {
          setSummary(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, [refreshKey]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleLoadDemo = useCallback(async (): Promise<void> => {
    setLoadingDemo(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/v1/onboarding/load-demo", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setSuccessMsg("Demo data loaded! Explore 3 sample company books below.");
      router.refresh();           // revalidate server components
      setRefreshKey((k) => k + 1); // re-fetch summary without page reload
    } catch (err) {
      setDemoError((err as Error).message);
    } finally {
      setLoadingDemo(false);
    }
  }, [router]);

  const handleUnloadDemo = useCallback(async (): Promise<void> => {
    setLoadingUnload(true);
    setUnloadError(null);
    try {
      const res = await fetch("/api/v1/onboarding/unload-demo", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setSuccessMsg(null);
      router.refresh();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setUnloadError((err as Error).message);
    } finally {
      setLoadingUnload(false);
    }
  }, [router]);

  // ── Success flash (persists across state transitions until auto-dismissed) ────
  const SuccessFlash = successMsg ? (
    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 mb-4 text-sm text-emerald-700">
      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
      {successMsg}
    </div>
  ) : null;

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-6 mb-6 animate-pulse">
        <div className="flex flex-col sm:flex-row gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1">
              <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
              <div className="h-8 w-28 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 mb-6 flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
        <p className="text-sm text-rose-600">
          Couldn&apos;t load AIQL impact summary: {error}
        </p>
      </div>
    );
  }

  // ── Empty state — no connections yet ──────────────────────────────────────────
  if (!summary?.hasConnections) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1B3A5C]/20 bg-gradient-to-br from-blue-50/50 to-white p-6 mb-6">
        {SuccessFlash}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-[#1B3A5C]/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[#1B3A5C]" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 leading-tight">
                Connect your first client to see your impact
              </p>
              <p className="text-sm text-slate-500 mt-1">
                AIQL surfaces anomalies, reconciles balances, and tells you exactly how much time it saved.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={handleLoadDemo}
              disabled={loadingDemo}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-[#1B3A5C] bg-white border border-[#1B3A5C]/30 hover:bg-[#1B3A5C]/5 rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
            >
              {loadingDemo ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading demo…</>
              ) : (
                <>Try with sample data</>
              )}
            </button>
            <Link
              href="/connections/new"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[#1B3A5C] hover:bg-[#15304d] rounded-lg px-4 py-2 transition-colors"
            >
              Upload your data
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {demoError && (
          <p className="mt-3 text-xs text-rose-600 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {demoError}
          </p>
        )}
        <p className="mt-3 text-[11px] text-slate-400 leading-snug">
          Sample data loads 3 real Indian SME books (textiles, electronics, IT services) so you can explore the dashboard, scanner, and query studio without uploading your client data first.
        </p>
      </div>
    );
  }

  // ── Active state — three stat cards, time saved leads ─────────────────────────
  const cycleWord = summary.connectionCount === 1 ? "client" : "clients";

  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-[#1B3A5C]/[0.03] via-white to-white p-6 mb-6">
      {SuccessFlash}

      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          AIQL impact · {summary.connectionCount} {cycleWord}
        </p>
        <div className="flex items-center gap-3">
          {summary.hasDemoConnections && (
            <button
              onClick={handleUnloadDemo}
              disabled={loadingUnload}
              title="Remove sample data"
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
            >
              {loadingUnload
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Trash2 className="w-3 h-3" />}
              {loadingUnload ? "Removing…" : "Remove demo data"}
            </button>
          )}
          <p className="text-[11px] text-slate-300">
            {summary.source === "cache" ? "Cached " : "Updated "}
            {new Date(summary.computedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {unloadError && (
        <p className="text-xs text-rose-600 flex items-center gap-1.5 mb-3">
          <AlertCircle className="w-3.5 h-3.5" /> {unloadError}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-0 sm:divide-x sm:divide-slate-100">

        {/* Stat 1 — TIME SAVED (lead) */}
        <div className="sm:pr-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time saved</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 leading-none tracking-tight">
            {formatHours(summary.timeSavedHours)}
          </p>
          <p className="text-xs text-slate-400 mt-2 leading-snug">
            vs. manual review across {summary.connectionCount} {cycleWord}
            <span
              className="inline-block ml-1 cursor-help text-slate-300"
              title="Based on industry benchmarks: 1.5 min per voucher review, 45 min per manual reconciliation, plus close overhead. Estimate, not measurement."
            >ⓘ</span>
          </p>
        </div>

        {/* Stat 2 — ₹ FLAGGED */}
        <div className="sm:px-6">
          <div className="flex items-center gap-2 mb-2">
            <IndianRupee className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Exposure flagged</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 leading-none tracking-tight">
            {formatRupees(summary.totalExposureInr)}
          </p>
          <p className="text-xs text-slate-400 mt-2 leading-snug">
            across {summary.totalAnomalies.toLocaleString("en-IN")} anomal{summary.totalAnomalies === 1 ? "y" : "ies"} detected
          </p>
        </div>

        {/* Stat 3 — AUTO-RESOLVED (compounding moat) */}
        <div className="sm:pl-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Auto-resolved</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 leading-none tracking-tight">
            {summary.autoResolvedCount}
          </p>
          <p className="text-xs text-slate-400 mt-2 leading-snug">
            {summary.autoResolvedCount === 0
              ? "Capture knowledge during close to grow this number"
              : `AIQL handled these from learned patterns`}
          </p>
        </div>
      </div>

      {/* Optional second row — top issue types as small tags */}
      {summary.topIssueTypes.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-50 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider mr-1">Top issues:</span>
          {summary.topIssueTypes.slice(0, 4).map((it) => (
            <span
              key={it.code}
              className="inline-flex items-center gap-1.5 text-[11px] bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1"
            >
              <span className="font-medium text-slate-600">
                {it.code.replace(/_/g, " ")}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{formatRupees(it.exposure)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Upload real data CTA — shown while demo connections are present */}
      {summary.hasDemoConnections && (
        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            You&apos;re viewing sample data. Upload a real client file to see your actual numbers.
          </p>
          <Link
            href="/connections/new"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1B3A5C] hover:underline shrink-0"
          >
            Upload data <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

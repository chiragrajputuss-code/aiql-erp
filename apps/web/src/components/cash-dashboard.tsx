"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ValueSummaryBanner } from "@/components/value-summary-banner";
import {
  RefreshCw, ExternalLink, AlertCircle, Upload,
  TrendingUp, TrendingDown, Minus,
  Banknote, ArrowDownLeft, ArrowUpRight, Activity, Receipt, Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection  { id: string; displayName: string; erpType: string }
interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; rowCount: number }

interface DashboardCard {
  templateId: string; title: string; position: number;
  sql: string | null; result: QueryResult | null;
  error: string | null; executionTimeMs: number;
}

interface Props {
  userName: string | null; queriesUsed: number;
  queryLimit: number; connections: Connection[];
}

// ─── Per-template visual config ───────────────────────────────────────────────

const CARD_META: Record<string, {
  icon:   React.ElementType;
  accent: string;   // left border + icon bg
  iconCls: string;  // icon color
}> = {
  "cash-balance":            { icon: Banknote,       accent: "border-l-emerald-400",  iconCls: "text-emerald-600 bg-emerald-50"  },
  "debtors-top-10":          { icon: ArrowDownLeft,  accent: "border-l-blue-400",     iconCls: "text-blue-600   bg-blue-50"      },
  "creditors-top-10":        { icon: ArrowUpRight,   accent: "border-l-orange-400",   iconCls: "text-orange-600 bg-orange-50"    },
  "cash-flow-monthly":       { icon: Activity,       accent: "border-l-indigo-400",   iconCls: "text-indigo-600 bg-indigo-50"    },
  "expense-by-voucher-type": { icon: Receipt,        accent: "border-l-rose-400",     iconCls: "text-rose-600   bg-rose-50"      },
  "cost-centre-breakdown":   { icon: Building2,      accent: "border-l-slate-400",    iconCls: "text-slate-600  bg-slate-100"    },
};

const TEMPLATE_QUESTIONS: Record<string, string> = {
  "cash-balance":            "What is the cash and bank balance?",
  "debtors-top-10":          "Top 10 debtors outstanding",
  "creditors-top-10":        "Top 10 creditors outstanding",
  "cash-flow-monthly":       "Monthly cash flow report",
  "expense-by-voucher-type": "Expenses by voucher type",
  "cost-centre-breakdown":   "Cost centre breakdown by department",
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatINR(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : null;
  return n !== null && !isNaN(n) ? n : null;
}

// ─── Headline extraction ──────────────────────────────────────────────────────

function extractHeadline(card: DashboardCard): { value: string; sub: string; trend: "up" | "down" | "flat" | null } {
  const { result, templateId } = card;
  if (!result || result.rows.length === 0) return { value: "No data", sub: "—", trend: null };

  const rows = result.rows;
  const cols = result.columns;

  const numericCol = (prefer: string[]) =>
    prefer.find((p) => cols.includes(p)) ??
    cols.find((c) => toNumber(rows[0][c]) !== null &&
      !c.toLowerCase().includes("count") && !c.toLowerCase().includes("rank"));

  switch (templateId) {
    case "cash-balance": {
      const col = numericCol(["balance", "net_balance", "closing_balance", "net"]);
      if (!col) break;
      const total = rows.reduce((s, r) => s + (toNumber(r[col]) ?? 0), 0);
      return { value: formatINR(total), sub: `across ${rows.length} account${rows.length !== 1 ? "s" : ""}`, trend: total >= 0 ? "up" : "down" };
    }
    case "debtors-top-10": {
      const col = numericCol(["outstanding", "receivable", "net_balance", "balance"]);
      if (!col) break;
      const total = rows.reduce((s, r) => s + (toNumber(r[col]) ?? 0), 0);
      return { value: formatINR(total), sub: `from ${rows.length} debtor${rows.length !== 1 ? "s" : ""}`, trend: "up" };
    }
    case "creditors-top-10": {
      const col = numericCol(["outstanding", "payable", "net_balance", "balance"]);
      if (!col) break;
      const total = rows.reduce((s, r) => s + (toNumber(r[col]) ?? 0), 0);
      return { value: formatINR(total), sub: `to ${rows.length} creditor${rows.length !== 1 ? "s" : ""}`, trend: "down" };
    }
    case "cash-flow-monthly": {
      const netCol = numericCol(["net_flow", "net", "net_balance"]);
      if (!netCol) break;
      const latest = toNumber(rows[0][netCol]) ?? 0;
      const monthCol = cols.find((c) => c.toLowerCase().includes("month") || c.toLowerCase().includes("period"));
      const label = monthCol ? `in ${String(rows[0][monthCol])}` : "latest month";
      return { value: formatINR(latest), sub: label, trend: latest >= 0 ? "up" : "down" };
    }
    case "expense-by-voucher-type": {
      const col = numericCol(["total_amount", "total", "amount"]);
      if (!col) break;
      const total = rows.reduce((s, r) => s + (toNumber(r[col]) ?? 0), 0);
      return { value: formatINR(total), sub: `across ${rows.length} categor${rows.length !== 1 ? "ies" : "y"}`, trend: "down" };
    }
    case "cost-centre-breakdown": {
      const col = numericCol(["total", "amount", "expenses"]);
      if (!col) break;
      const total = rows.reduce((s, r) => s + (toNumber(r[col]) ?? 0), 0);
      return { value: formatINR(total), sub: `${rows.length} cost centre${rows.length !== 1 ? "s" : ""}`, trend: null };
    }
  }

  const firstNumCol = cols.find((c) => toNumber(rows[0][c]) !== null);
  if (firstNumCol) {
    const total = rows.reduce((s, r) => s + (toNumber(r[firstNumCol]) ?? 0), 0);
    return { value: formatINR(total), sub: `${rows.length} row${rows.length !== 1 ? "s" : ""}`, trend: null };
  }
  return { value: String(rows.length), sub: "rows", trend: null };
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ rows, valueCol }: { rows: Record<string, unknown>[]; valueCol: string }) {
  const values = rows.map((r) => toNumber(r[valueCol]) ?? 0).reverse();
  if (values.length < 2) return null;

  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const W = 96; const H = 32;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = 2 + (H - 4) - ((v - min) / range) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const last  = values[values.length - 1];
  const color = last >= values[0] ? "#10b981" : "#f43f5e";

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round" opacity="0.7" points={pts} />
      {/* Dot on last point */}
      <circle
        cx={(W).toFixed(1)}
        cy={(2 + (H - 4) - ((last - min) / range) * (H - 4)).toFixed(1)}
        r="2.5" fill={color} opacity="0.9"
      />
    </svg>
  );
}

// ─── Card skeleton ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 border-l-4 border-l-slate-200 bg-white p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-3 w-28 bg-slate-100 rounded" />
        <div className="h-7 w-7 bg-slate-100 rounded-lg" />
      </div>
      <div className="h-9 w-32 bg-slate-200 rounded mb-2" />
      <div className="h-3 w-24 bg-slate-100 rounded mb-5" />
      <div className="space-y-2 pt-3 border-t border-slate-50">
        {[80, 65, 72].map((w, i) => (
          <div key={i} className="flex justify-between">
            <div className={`h-2.5 bg-slate-100 rounded`} style={{ width: `${w}%` }} />
            <div className="h-2.5 w-12 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard card ───────────────────────────────────────────────────────────

function DashCard({ card, question, refreshing }: { card: DashboardCard; question: string; refreshing: boolean }) {
  const meta = CARD_META[card.templateId] ?? CARD_META["cost-centre-breakdown"];
  const Icon = meta.icon;

  if (card.error) {
    return (
      <div className={`rounded-xl border border-slate-100 border-l-4 ${meta.accent} bg-white p-5`}>
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">{card.title}</p>
          <span className={`p-1.5 rounded-lg ${meta.iconCls}`}>
            <AlertCircle className="w-3.5 h-3.5" />
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-500">Unable to load</p>
        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{card.error}</p>
        <div className="mt-4 pt-3 border-t border-slate-50">
          <a href={`/query?q=${encodeURIComponent(question)}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#1B3A5C] transition-colors">
            Try in Studio <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  }

  const { value, sub, trend } = extractHeadline(card);
  const rows   = card.result?.rows ?? [];
  const cols   = card.result?.columns ?? [];

  const netCol      = cols.find((c) => c.toLowerCase().includes("net") || c.toLowerCase().includes("flow"));
  const hasSparkline = card.templateId === "cash-flow-monthly" && rows.length >= 3 && netCol;
  const hasPreview   = !hasSparkline && rows.length > 0 && cols.length >= 2 && card.templateId !== "cash-balance";

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendCls  = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-rose-500" : "text-slate-300";

  return (
    <div className={`
      rounded-xl border border-slate-100 border-l-4 ${meta.accent}
      bg-white p-5 flex flex-col gap-0
      transition-all duration-150
      hover:shadow-[0_4px_24px_rgba(0,0,0,0.07)] hover:-translate-y-px
      ${refreshing ? "opacity-60" : "opacity-100"}
    `}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-400 leading-tight pr-2">
          {card.title}
        </p>
        <span className={`p-1.5 rounded-lg shrink-0 ${meta.iconCls}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* Headline + sparkline */}
      <div className="flex items-end justify-between gap-3 mb-0.5">
        <div>
          <p className="text-3xl font-bold text-slate-900 leading-none tracking-tight">{value}</p>
          <p className="text-xs text-slate-400 mt-1.5 leading-snug">{sub}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {trend && <TrendIcon className={`w-4 h-4 ${trendCls}`} />}
          {hasSparkline && netCol && <Sparkline rows={rows} valueCol={netCol} />}
        </div>
      </div>

      {/* Row preview */}
      {hasPreview && (
        <div className="mt-4 space-y-1.5">
          <div className="h-px bg-slate-50" />
          {rows.slice(0, 3).map((row, i) => {
            const label  = String(row[cols[0]] ?? "—").slice(0, 24);
            const numCol = cols.find((c) => toNumber(row[c]) !== null && c !== cols[0]);
            const amount = numCol ? toNumber(row[numCol]) : null;
            return (
              <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-xs text-slate-500 truncate">{label}</span>
                {amount !== null && (
                  <span className="text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                    {formatINR(amount)}
                  </span>
                )}
              </div>
            );
          })}
          {rows.length > 3 && (
            <p className="text-xs text-slate-400 pt-0.5">+{rows.length - 3} more</p>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-auto pt-4">
        <a href={`/query?q=${encodeURIComponent(question)}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3A5C]/70 hover:text-[#1B3A5C] transition-colors">
          View in Studio <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CashDashboard({ userName, queriesUsed, queryLimit, connections }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId]       = useState(connections[0]?.id ?? "");
  const [cards, setCards]                 = useState<DashboardCard[] | null>(null);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async (connId: string, isRefresh = false) => {
    if (!connId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/v1/dashboard?connectionId=${connId}`);
      const data = await res.json() as { cards: DashboardCard[]; connectionId: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to load dashboard"); return; }
      setCards(data.cards.sort((a, b) => a.position - b.position));
      setLastRefreshed(new Date());
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (selectedId) load(selectedId); }, [load, selectedId]);

  const usagePct = Math.min(100, Math.round((queriesUsed / queryLimit) * 100));
  const now      = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  // ── Empty state ──────────────────────────────────────────────────────────
  if (connections.length === 0) {
    return (
      <div className="max-w-5xl mx-auto pb-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Cash Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Your financial summary at a glance</p>
        </div>

        <ValueSummaryBanner />

        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-20 px-6 text-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
            <Upload className="w-6 h-6 text-[#1B3A5C]" />
          </div>
          <div className="max-w-sm">
            <p className="font-semibold text-slate-800 text-base">No data uploaded yet</p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Upload a CSV or Excel file with your GL data and your Cash Dashboard will populate automatically.
            </p>
          </div>
          <Button
            onClick={() => router.push("/connections/new")}
            className="bg-[#1B3A5C] hover:bg-[#15304d] text-white rounded-lg px-6"
          >
            Upload your first file
          </Button>
          <p className="text-xs text-slate-400">Supports .csv, .xlsx, .xls — up to 50 MB</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-0">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting}{userName ? `, ${userName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>Cash Dashboard</span>
            {lastRefreshed && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">
                  Updated {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          {connections.length > 1 && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 sm:flex-none text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/20 sm:max-w-[180px]"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(selectedId, true)}
            disabled={loading || refreshing}
            className="gap-1.5 text-xs border-slate-200 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── AIQL impact banner (org-level, doesn't change with connection selector) ── */}
      <ValueSummaryBanner />

      {/* ── Usage pill ── */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full px-3 py-1.5 text-xs text-slate-500">
          <div className={`w-1.5 h-1.5 rounded-full ${usagePct >= 90 ? "bg-red-400" : usagePct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} />
          <span>{queriesUsed} <span className="text-slate-300">/</span> {queryLimit} queries this month</span>
          <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${usagePct >= 90 ? "bg-red-400" : usagePct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
        {usagePct >= 90 && (
          <a href="/settings/billing" className="text-xs font-medium text-rose-600 hover:underline">
            Upgrade plan →
          </a>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-5 flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Card grid ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !cards
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : (cards ?? []).map((card) => (
              <DashCard
                key={card.templateId}
                card={card}
                question={TEMPLATE_QUESTIONS[card.templateId] ?? card.title}
                refreshing={refreshing}
              />
            ))
        }
      </div>

    </div>
  );
}

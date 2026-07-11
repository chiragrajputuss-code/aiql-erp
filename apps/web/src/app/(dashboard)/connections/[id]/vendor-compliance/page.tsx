"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskBand = "red" | "amber" | "green";

interface VendorPeriod {
  period:          string;
  invoicesTotal:   number;
  invoicesAtRisk:  number;
  amountAtRisk:    number;
}

interface VendorRow {
  vendorName:           string;
  vendorGstin:          string | null;
  riskBand:             RiskBand;
  latestPeriod:         string | null;
  latestAmountAtRisk:   number;
  latestInvoicesAtRisk: number;
  latestInvoicesTotal:  number;
  totalAmountAtRisk:    number;
  periods:              VendorPeriod[];
}

interface Summary {
  latestPeriod:      string;
  totalVendors:      number;
  redCount:          number;
  amberCount:        number;
  greenCount:        number;
  totalAmountAtRisk: number;
}

interface ScoreboardData {
  vendors: VendorRow[];
  periods: string[];
  summary: Summary | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const BAND_META: Record<RiskBand, { label: string; color: string; pillColor: string; icon: React.ReactNode }> = {
  red: {
    label:     "High Risk",
    color:     "border-l-red-500 bg-red-50/30",
    pillColor: "bg-red-100 text-red-700 border border-red-200",
    icon:      <ShieldAlert className="h-4 w-4 text-red-500" />,
  },
  amber: {
    label:     "Medium Risk",
    color:     "border-l-amber-400 bg-amber-50/20",
    pillColor: "bg-amber-100 text-amber-700 border border-amber-200",
    icon:      <AlertTriangle className="h-4 w-4 text-amber-500" />,
  },
  green: {
    label:     "Low Risk",
    color:     "border-l-green-500 bg-green-50/20",
    pillColor: "bg-green-100 text-green-700 border border-green-200",
    icon:      <ShieldCheck className="h-4 w-4 text-green-500" />,
  },
};

// ─── Spark bar: mini period trend for each vendor ─────────────────────────────

function RiskRatioBar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  const color = pct > 30 ? "bg-red-400" : pct > 10 ? "bg-amber-400" : "bg-green-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ─── Expandable vendor row ─────────────────────────────────────────────────────

function VendorCard({ vendor }: { vendor: VendorRow }) {
  const [expanded, setExpanded] = useState(false);
  const meta   = BAND_META[vendor.riskBand];
  const ratio  = vendor.latestInvoicesTotal > 0
    ? vendor.latestInvoicesAtRisk / vendor.latestInvoicesTotal
    : 0;

  return (
    <div className={`border-l-4 rounded-lg border border-slate-200 overflow-hidden ${meta.color}`}>
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        onClick={() => setExpanded((e) => !e)}
      >
        {meta.icon}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{vendor.vendorName}</p>
          {vendor.vendorGstin && (
            <p className="text-xs text-muted-foreground font-mono">{vendor.vendorGstin}</p>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <RiskRatioBar ratio={ratio} />
          {vendor.latestAmountAtRisk > 0 && (
            <span className="text-sm font-semibold text-red-600">
              {formatINR(vendor.latestAmountAtRisk)} at risk
            </span>
          )}
          <Badge className={`text-xs ${meta.pillColor}`}>{meta.label}</Badge>
          <span className="text-muted-foreground text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left pb-2 font-medium">Period</th>
                <th className="text-right pb-2 font-medium">Total invoices</th>
                <th className="text-right pb-2 font-medium">At risk</th>
                <th className="text-right pb-2 font-medium">Amount at risk</th>
                <th className="text-right pb-2 font-medium">Risk ratio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendor.periods.map((p) => {
                const r = p.invoicesTotal > 0 ? p.invoicesAtRisk / p.invoicesTotal : 0;
                return (
                  <tr key={p.period} className="text-xs">
                    <td className="py-1.5 font-mono text-slate-600">{p.period}</td>
                    <td className="py-1.5 text-right">{p.invoicesTotal}</td>
                    <td className="py-1.5 text-right text-red-600">{p.invoicesAtRisk}</td>
                    <td className="py-1.5 text-right font-medium">{p.amountAtRisk > 0 ? formatINR(p.amountAtRisk) : "—"}</td>
                    <td className="py-1.5 text-right"><RiskRatioBar ratio={r} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Risk band is the trailing average of invoices at risk. High Risk (&gt;30%), Medium Risk (&gt;10%), Low Risk (≤10%).
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function VendorCompliancePage({ params }: { params: { id: string } }) {
  const [data, setData]       = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<"all" | RiskBand>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/connections/${params.id}/vendor-compliance`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [params.id]);

  const filtered = data?.vendors.filter((v) => filter === "all" || v.riskBand === filter) ?? [];

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href={`/connections/${params.id}`}><ArrowLeft className="h-4 w-4" />Connection</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-violet-600" />
            Vendor ITC Scorecard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tracks which vendors haven&apos;t filed GSTR-1 — so you know which ITC claims are at risk before the reversal hits.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="pt-4">
              <p className="text-xs text-red-600 font-medium uppercase tracking-wide">High Risk</p>
              <p className="text-3xl font-bold text-red-700 mt-1">{data.summary.redCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">vendors</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/20">
            <CardContent className="pt-4">
              <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Medium Risk</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{data.summary.amberCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">vendors</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/20">
            <CardContent className="pt-4">
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Low Risk</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{data.summary.greenCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">vendors</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">ITC at Risk</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatINR(data.summary.totalAmountAtRisk)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.summary.latestPeriod}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter chips */}
      {data && data.vendors.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["all", "red", "amber", "green"] as const).map((band) => {
            const count =
              band === "all" ? data.vendors.length :
              band === "red" ? data.summary?.redCount ?? 0 :
              band === "amber" ? data.summary?.amberCount ?? 0 :
              data.summary?.greenCount ?? 0;
            const active = filter === band;
            return (
              <button
                key={band}
                onClick={() => setFilter(band)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? band === "red"   ? "bg-red-600 text-white border-red-600"
                    : band === "amber" ? "bg-amber-500 text-white border-amber-500"
                    : band === "green" ? "bg-green-600 text-white border-green-600"
                    : "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {band === "all" ? "All" : BAND_META[band].label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading vendor data…
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && data?.vendors.length === 0 && (
        <Card className="border-dashed border-slate-300">
          <CardContent className="py-12 text-center">
            <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-600">No vendor compliance data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a GSTR-2B file and run reconciliation to populate this scorecard.
            </p>
            <Button asChild size="sm" className="mt-4" variant="outline">
              <Link href={`/connections/${params.id}/reconcile`}>Go to Reconcile</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((v) => (
            <VendorCard key={v.vendorName} vendor={v} />
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            Showing {filtered.length} of {data?.vendors.length} vendors. Data persisted from uploaded GSTR-2B reconciliations.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && data && data.vendors.length > 0 && (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No vendors in this risk band.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

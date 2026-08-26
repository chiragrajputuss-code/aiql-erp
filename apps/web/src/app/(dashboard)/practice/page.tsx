"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Building2, Loader2, AlertCircle, ArrowUpDown, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientRow {
  connectionId:      string;
  clientName:        string;
  lastRunAt:          string | null;
  period:             string | null;
  healthScore:        number | null;
  criticalCount:      number;
  warningCount:       number;
  opportunityCount:   number;
  totalImpactRs:      number;
  openFindingsCount:  number;
  hasGl:              boolean;
  hasGstr2b:          boolean;
}

interface Summary {
  totalClients:  number;
  neverRunCount: number;
  totalAtRiskRs: number;
}

type SortKey = "criticalCount" | "totalImpactRs" | "clientName" | "lastRunAt";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const STALE_DAYS = 45;

function isStale(lastRunAt: string | null): boolean {
  if (!lastRunAt) return false;
  return (Date.now() - new Date(lastRunAt).getTime()) / 86_400_000 > STALE_DAYS;
}

function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return "Never run";
  return new Date(lastRunAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PracticePage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("criticalCount");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/practice/overview?limit=50");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setClients(data.clients);
        setSummary(data.summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load practice overview");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const sorted = useMemo(() => {
    const rows = [...clients];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "clientName") cmp = a.clientName.localeCompare(b.clientName);
      else if (sortKey === "lastRunAt") cmp = (a.lastRunAt ?? "").localeCompare(b.lastRunAt ?? "");
      else if (sortKey === "criticalCount") cmp = a.criticalCount - b.criticalCount || a.totalImpactRs - b.totalImpactRs;
      else cmp = a.totalImpactRs - b.totalImpactRs;
      return sortDesc ? -cmp : cmp;
    });
    return rows;
  }, [clients, sortKey, sortDesc]);

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th className={`px-3 py-2 text-left font-medium select-none ${className ?? ""}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900">
        {label} <ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-indigo-600" />
          Practice
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          One row per client book — sorted by what needs attention first.
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50"><CardContent className="pt-4 text-sm text-red-700">{error}</CardContent></Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading…
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Header strip */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Clients</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{summary.totalClients}</p>
            </CardContent></Card>
            <Card className={summary.neverRunCount > 0 ? "border-amber-200 bg-amber-50/20" : ""}>
              <CardContent className="pt-4">
                <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Never run</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{summary.neverRunCount}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/20"><CardContent className="pt-4">
              <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Total ₹ at risk</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{formatINR(summary.totalAtRiskRs)}</p>
            </CardContent></Card>
          </div>

          {clients.length === 0 ? (
            <Card className="border-dashed border-slate-300">
              <CardContent className="py-14 text-center">
                <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-600">No client books yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Upload a General Ledger to add your first client.
                </p>
                <Link href="/connections/new">
                  <Button className="mt-4">Add a connection</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-muted-foreground">
                  <tr>
                    <SortHeader label="Client" k="clientName" />
                    <SortHeader label="Last run" k="lastRunAt" />
                    <SortHeader label="Critical" k="criticalCount" className="text-center" />
                    <th className="px-3 py-2 text-center font-medium">Needs attention</th>
                    <SortHeader label="₹ at risk" k="totalImpactRs" className="text-right" />
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((c) => {
                    const stale = isStale(c.lastRunAt);
                    const neverRun = c.lastRunAt === null;
                    return (
                      <tr key={c.connectionId} className="hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{c.clientName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {!c.hasGstr2b && (
                              <span className="text-[10px] text-slate-400">GSTR-2B not uploaded</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          <span className={neverRun ? "text-slate-400" : stale ? "text-amber-600" : ""}>
                            {formatLastRun(c.lastRunAt)}
                          </span>
                          {stale && !neverRun && (
                            <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-700 border-amber-200">stale</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {c.criticalCount > 0
                            ? <Badge className="bg-red-100 text-red-700 border-red-200">{c.criticalCount}</Badge>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {c.warningCount > 0
                            ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">{c.warningCount}</Badge>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-800">
                          {c.totalImpactRs > 0 ? formatINR(c.totalImpactRs) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/investigations?connectionId=${encodeURIComponent(c.connectionId)}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            <Search className="h-3 w-3" />
                            {neverRun || stale ? "Run" : "View"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@aiql/pulse-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PulseAlert {
  id:         string;
  severity:   string;
  category:   string;
  title:      string;
  detail:     string | null;
  actionUrl:  string | null;
  isSnoozed:  boolean;
}

interface DigestSnapshot {
  cashAndBankBalance: number | null;
  totalReceivables:   number | null;
  totalPayables:      number | null;
  glPeriodStart:      string | null;
  glPeriodEnd:        string | null;
}

interface Digest {
  id:          string;
  generatedAt: Date | string;
  alerts:      PulseAlert[];
  digestJson:  string;
}

interface Props {
  digest:       Digest;
  connectionId: string;
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
  if (severity === "review")   return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  return <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />;
}

function severityBadgeClass(severity: string): string {
  if (severity === "critical") return "bg-red-50 border border-red-100";
  if (severity === "review")   return "bg-amber-50 border border-amber-100";
  return "bg-blue-50 border border-blue-100";
}

// ─── Single alert row ─────────────────────────────────────────────────────────

function AlertRow({ alert, connectionId }: { alert: PulseAlert; connectionId: string }) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const actionLink = alert.actionUrl
    ? alert.actionUrl.startsWith("/")
      ? `/connections/${connectionId}${alert.actionUrl.replace(`/connections/${connectionId}`, "")}`
      : alert.actionUrl
    : null;

  return (
    <div className={`rounded-lg px-4 py-3 flex gap-3 ${severityBadgeClass(alert.severity)}`}>
      <SeverityIcon severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{alert.title}</p>
        {alert.detail && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{alert.detail}</p>
        )}
        {actionLink && (
          <Link
            href={actionLink}
            className="inline-block mt-1.5 text-xs font-medium text-indigo-600 hover:underline"
          >
            View details →
          </Link>
        )}
      </div>
      <button
        onClick={() => setHidden(true)}
        title="Hide for this session (use Settings to permanently mute)"
        className="text-xs text-slate-400 hover:text-slate-600 self-start mt-0.5 shrink-0"
      >
        Hide
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PulseDigestView({ digest, connectionId }: Props) {
  const generatedAt = new Date(digest.generatedAt);
  const dateStr = generatedAt.toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Parse snapshot from digestJson
  let snapshot: DigestSnapshot | null = null;
  try {
    const parsed = JSON.parse(digest.digestJson) as { snapshot?: DigestSnapshot };
    snapshot = parsed.snapshot ?? null;
  } catch { /* ignore */ }

  // Muted categories already excluded server-side; sort critical first
  const critical  = digest.alerts.filter((a) => a.severity === "critical");
  const nonCrit   = digest.alerts.filter((a) => a.severity !== "critical");
  const allActive = [...critical, ...nonCrit];

  const snapshotItems = snapshot ? [
    { label: "Cash & Bank",  value: snapshot.cashAndBankBalance },
    { label: "Receivables",  value: snapshot.totalReceivables },
    { label: "Payables",     value: snapshot.totalPayables },
  ].filter((i) => i.value !== null) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Latest — {dateStr}
        </p>
      </div>

      {allActive.length === 0 ? (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-5 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700">All clear</p>
            <p className="text-xs text-green-600 mt-0.5">No urgent items for today. Your books look clean.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {allActive.map((alert) => (
            <AlertRow key={alert.id} alert={alert} connectionId={connectionId} />
          ))}
        </div>
      )}

      {snapshotItems.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Financial Snapshot
          </p>
          <div className="space-y-1.5">
            {snapshotItems.map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold text-slate-800">{formatINR(value!)}</span>
              </div>
            ))}
          </div>
          {(snapshot?.glPeriodStart || snapshot?.glPeriodEnd) && (
            <p className="text-[11px] text-slate-400 mt-2">
              Period: {snapshot.glPeriodStart ?? "?"} — {snapshot.glPeriodEnd ?? "?"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

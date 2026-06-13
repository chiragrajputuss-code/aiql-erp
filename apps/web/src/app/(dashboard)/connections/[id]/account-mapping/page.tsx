"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, AlertCircle, RefreshCw, ChevronLeft, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  accountName:   string;
  accountType:   string;
  confidence:    number;
  isConfirmed:   boolean;
  reconRelevant: boolean;
  source?:       "group" | "pattern" | "llm" | "manual" | "unknown";
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  group:   { label: "Auto",     color: "bg-emerald-100 text-emerald-700" },
  pattern: { label: "Pattern",  color: "bg-blue-100 text-blue-700" },
  llm:     { label: "AI",       color: "bg-violet-100 text-violet-700" },
  manual:  { label: "Confirmed", color: "bg-slate-200 text-slate-700" },
  unknown: { label: "Unsure",   color: "bg-amber-100 text-amber-700" },
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "BANK",               label: "Bank / Cash" },
  { value: "RECEIVABLE",         label: "Accounts Receivable (Debtors)" },
  { value: "PAYABLE",            label: "Accounts Payable (Creditors)" },
  { value: "TAX",                label: "GST / Tax" },
  { value: "INVENTORY",          label: "Inventory / Stock" },
  { value: "FIXED_ASSET",        label: "Fixed Assets" },
  { value: "CURRENT_ASSET",      label: "Current Assets" },
  { value: "CURRENT_LIABILITY",  label: "Current Liabilities" },
  { value: "REVENUE",            label: "Revenue / Sales" },
  { value: "COGS",               label: "Cost of Goods Sold" },
  { value: "EXPENSE",            label: "Expenses" },
  { value: "OTHER_INCOME",       label: "Other Income" },
  { value: "EQUITY",             label: "Capital / Equity" },
  { value: "UNKNOWN",            label: "Unclassified / Other" },
];

const TYPE_COLOR: Record<string, string> = {
  BANK:              "bg-blue-100 text-blue-800",
  CASH:              "bg-blue-100 text-blue-800",
  RECEIVABLE:        "bg-emerald-100 text-emerald-800",
  PAYABLE:           "bg-amber-100 text-amber-800",
  TAX:               "bg-violet-100 text-violet-800",
  INVENTORY:         "bg-orange-100 text-orange-800",
  FIXED_ASSET:       "bg-slate-100 text-slate-700",
  CURRENT_ASSET:     "bg-teal-100 text-teal-800",
  CURRENT_LIABILITY: "bg-red-100 text-red-700",
  REVENUE:           "bg-green-100 text-green-800",
  EXPENSE:           "bg-rose-100 text-rose-800",
  UNKNOWN:           "bg-slate-100 text-slate-500",
};

function ConfidencePill({ pct }: { pct: number }) {
  const color = pct >= 85 ? "bg-emerald-100 text-emerald-700"
    : pct >= 50 ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-600";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {pct}% match
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountMappingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { returnTo?: string };
}) {
  const connectionId = params.id;
  const returnTo = searchParams.returnTo ?? "/close";
  const router   = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [accounts, setAccounts]       = useState<AccountRow[]>([]);
  const [loading,  setLoading]        = useState(true);
  const [saving,   setSaving]         = useState(false);
  const [filter,   setFilter]         = useState<"all" | "recon" | "unclassified">("recon");
  const [dirty,    setDirty]          = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/account-mapping`);
      if (res.ok) {
        const data = await res.json() as {
          displayName: string;
          accounts:    AccountRow[];
        };
        setDisplayName(data.displayName);
        setAccounts(data.accounts);
      }
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);

  function changeType(index: number, newType: string) {
    setAccounts((prev) =>
      prev.map((a, i) =>
        i === index ? { ...a, accountType: newType, confidence: 1, isConfirmed: true } : a
      )
    );
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/account-mapping`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ accounts }),
      });
      if (res.ok) {
        setDirty(false);
        router.push(returnTo);
      }
    } finally {
      setSaving(false);
    }
  }

  const filtered = accounts.filter((a) => {
    if (filter === "recon")          return a.reconRelevant;
    if (filter === "unclassified")   return a.accountType === "UNKNOWN";
    return true;
  });

  const reconAccounts     = accounts.filter((a) => a.reconRelevant);
  const unclassifiedCount = accounts.filter((a) => a.accountType === "UNKNOWN").length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">

      {/* Header */}
      <div>
        <button
          onClick={() => router.push(returnTo)}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="text-xl font-semibold text-slate-900">Account Mapping</h1>
        <p className="text-sm text-slate-500 mt-1">
          <span className="font-medium text-slate-700">{displayName}</span> — review how each GL account is classified. We auto-detected these from your data.
        </p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Why does this matter?</p>
          <p className="mt-0.5 text-blue-700">
            Reconciliations use these mappings to find the right accounts — bank accounts for bank recon, creditors for AP recon, etc. Confirm or correct any wrong classifications, then save. This is a one-time setup per file.
          </p>
        </div>
      </div>

      {/* Stats + filter */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("recon")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === "recon"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Recon accounts ({reconAccounts.length})
          </button>
          <button
            onClick={() => setFilter("unclassified")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === "unclassified"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Unclassified
            {unclassifiedCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                {unclassifiedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({accounts.length})
          </button>
        </div>

        <Button size="sm" onClick={save} disabled={saving || loading}>
          {saving
            ? <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
            : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />}
          Confirm & save
        </Button>
      </div>

      {/* Account list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No accounts in this category.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_180px_100px] gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Account name</span>
            <span>Type</span>
            <span>Match</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100">
            {filtered.map((account, i) => {
              const realIdx = accounts.indexOf(account);
              const typeColor = TYPE_COLOR[account.accountType] ?? TYPE_COLOR.UNKNOWN!;

              return (
                <div
                  key={account.accountName}
                  className={`grid grid-cols-[1fr_180px_100px] gap-4 px-4 py-3 items-center
                    ${account.accountType === "UNKNOWN" ? "bg-amber-50/40" : "bg-white"}`}
                >
                  {/* Account name */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {account.accountName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {account.isConfirmed ? (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Confirmed
                        </span>
                      ) : account.source && SOURCE_META[account.source] ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SOURCE_META[account.source]!.color}`}>
                          {SOURCE_META[account.source]!.label}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Type selector */}
                  <div>
                    <select
                      value={account.accountType}
                      onChange={(e) => changeType(realIdx, e.target.value)}
                      className={`w-full text-xs rounded-md border px-2 py-1.5 font-medium cursor-pointer
                        focus:outline-none focus:ring-2 focus:ring-blue-500 ${typeColor} border-transparent`}
                    >
                      {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Confidence */}
                  <div>
                    <ConfidencePill pct={Math.round(account.confidence * 100)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom save */}
      <div className="flex justify-between items-center pb-8">
        <p className="text-xs text-slate-500">
          {accounts.filter((a) => a.isConfirmed).length} of {accounts.length} accounts confirmed
        </p>
        <Button onClick={save} disabled={saving || loading}>
          {saving
            ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Confirm & save mapping
        </Button>
      </div>
    </div>
  );
}

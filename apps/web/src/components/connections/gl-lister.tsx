"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, ChevronLeft, ChevronRight, Settings2, Eye, EyeOff,
  Check, X, AlertCircle, RefreshCw, Filter, ScanLine,
  Plus, ChevronDown, Maximize2, TrendingUp, TrendingDown,
  Minus, Pencil, RotateCcw, ShieldAlert, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlRow extends Record<string, unknown> {
  _row_id?:   number;
  _excluded?: boolean;
}
interface Pagination { page: number; pageSize: number; total: number; totalPages: number; }
interface ApiResponse { rows: GlRow[]; columns: string[]; voucherTypes: string[]; pagination: Pagination; }

type ScanSeverity = "critical" | "review" | "info";
interface ScanIssue { code: string; severity: ScanSeverity; title: string; description: string; affectedRows: number; exposure: number | null; examples: Record<string, unknown>[]; affectedRefNos?: string[]; }
interface ScanResult { issues: ScanIssue[]; bySeverity: Record<ScanSeverity, number>; totalIssues: number; totalExposure: number; }

interface ScanOverlay {
  bySeverity:    Record<ScanSeverity, number>;
  totalIssues:   number;
  totalExposure: number;
  issues:        ScanIssue[];
  /** reference_number → worst severity (per-voucher checks) */
  refSeverity:  Map<string, ScanSeverity>;
  /** reference_number → issue list */
  refIssues:    Map<string, { title: string; severity: ScanSeverity; code: string }[]>;
  /** all reference numbers flagged — for server-side refNos filter */
  flaggedRefs:  Set<string>;
  /** account_name → worst severity (account-level checks: debtors aging, sign anomalies) */
  acctSeverity: Map<string, ScanSeverity>;
  /** account_name → issue list */
  acctIssues:   Map<string, { title: string; severity: ScanSeverity; code: string }[]>;
  /** all account names flagged — for server-side acctNos filter */
  flaggedAccts: Set<string>;
  /** ISO timestamp of when the scan was run */
  scannedAt: string;
}

const SEVERITY_RANK: Record<ScanSeverity, number> = { critical: 2, review: 1, info: 0 };

// ─── Constants ────────────────────────────────────────────────────────────────

const DISPLAY_PRIORITY = [
  "transaction_date","voucher_type","reference_number",
  "account_name","party_name","vendor_name","customer_name",
  "debit_amount","credit_amount","net_amount","description","account_code",
];
const NUMERIC_COLS  = new Set(["debit_amount","credit_amount","net_amount"]);
const DATE_COLS     = new Set(["transaction_date"]);
const EDITABLE_COLS = new Set([
  "transaction_date","account_name","party_name","vendor_name","customer_name",
  "debit_amount","credit_amount","net_amount","reference_number","voucher_type",
  "description","account_code",
]);
const FIELD_SECTIONS = [
  { label:"Transaction", icon:"🗓", fields:["transaction_date","voucher_type","reference_number"] },
  { label:"Account",     icon:"🏦", fields:["account_name","account_code","party_name","vendor_name","customer_name"] },
  { label:"Amounts",     icon:"₹",  fields:["debit_amount","credit_amount","net_amount"] },
  { label:"Notes",       icon:"📝", fields:["description"] },
];

// Skeleton column widths – fixed to avoid hydration mismatch
const SKELETON_WIDTHS = [
  [42,55,68,52,72,45],[58,44,75,65,48,60],[66,70,52,58,62,55],
  [44,62,68,48,70,52],[72,52,60,72,44,66],[56,66,56,66,54,58],[48,74,62,50,60,68],
];

const STORAGE_KEY      = (id: string) => `gl-lister-cols-v2-${id}`;
const SCAN_STORAGE_KEY = (id: string) => `gl-scan-v1-${id}`;

const ISSUE_LABELS: Record<string, string> = {
  tds_potentially_missed: "TDS?",
  duplicate_transactions: "Duplicate",
  gst_mismatch:           "GST mismatch",
  trial_balance_mismatch: "Trial balance",
  debtors_overdue:        "Overdue",
  sign_anomalies:         "Wrong sign",
  missing_fields:         "Missing data",
  date_outliers:          "Date outlier",
  period_completeness:    "Incomplete",
  unclassified_accounts:  "Unclassified",
};

function issuePillStyle(sev: ScanSeverity): string {
  if (sev === "critical") return "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-rose-100 text-rose-700 border-rose-200 whitespace-nowrap";
  if (sev === "review")   return "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200 whitespace-nowrap";
  return                         "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-blue-100 text-blue-700 border-blue-200 whitespace-nowrap";
}

type IssueRef = { title: string; severity: ScanSeverity; code: string };
type SerializedScan = {
  bySeverity:    Record<ScanSeverity, number>;
  totalIssues:   number;
  totalExposure: number;
  issues:        ScanIssue[];
  refSeverity:   [string, ScanSeverity][];
  refIssues:     [string, IssueRef[]][];
  flaggedRefs:   string[];
  acctSeverity:  [string, ScanSeverity][];
  acctIssues:    [string, IssueRef[]][];
  flaggedAccts:  string[];
  scannedAt:     string;
};

function serializeScan(o: ScanOverlay): string {
  const s: SerializedScan = {
    bySeverity:    o.bySeverity,
    totalIssues:   o.totalIssues,
    totalExposure: o.totalExposure,
    issues:        o.issues,
    refSeverity:   [...o.refSeverity.entries()],
    refIssues:     [...o.refIssues.entries()],
    flaggedRefs:   [...o.flaggedRefs],
    acctSeverity:  [...o.acctSeverity.entries()],
    acctIssues:    [...o.acctIssues.entries()],
    flaggedAccts:  [...o.flaggedAccts],
    scannedAt:     o.scannedAt,
  };
  return JSON.stringify(s);
}

function deserializeScan(raw: string): ScanOverlay | null {
  try {
    const s = JSON.parse(raw) as SerializedScan;
    return {
      bySeverity:    s.bySeverity,
      totalIssues:   s.totalIssues,
      totalExposure: s.totalExposure,
      issues:        s.issues        ?? [],
      refSeverity:   new Map(s.refSeverity),
      refIssues:     new Map(s.refIssues),
      flaggedRefs:   new Set(s.flaggedRefs),
      acctSeverity:  new Map(s.acctSeverity  ?? []),
      acctIssues:    new Map(s.acctIssues    ?? []),
      flaggedAccts:  new Set(s.flaggedAccts  ?? []),
      scannedAt:     s.scannedAt,
    };
  } catch { return null; }
}

function sortColumns(cols: string[]): string[] {
  const canonical = DISPLAY_PRIORITY.filter((c) => cols.includes(c));
  const rest      = cols.filter((c) => !c.startsWith("_") && !DISPLAY_PRIORITY.includes(c));
  return [...canonical, ...rest];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

function fmtAmount(v: unknown): string {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (isNaN(n) || n === 0) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCell(col: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (NUMERIC_COLS.has(col)) return fmtAmount(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
    return new Date(v).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
  return String(v);
}

function colLabel(c: string) {
  return c.replace(/_/g," ").replace(/\b\w/g,(ch)=>ch.toUpperCase());
}

// Voucher type → color mapping
function voucherColors(type: string): { bg: string; text: string; border: string; accent: string } {
  const t = type.toLowerCase();
  if (t.includes("sales") || t.includes("receipt"))
    return { bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",accent:"bg-emerald-500" };
  if (t.includes("purchase") || t.includes("payment") || t.includes("bp"))
    return { bg:"bg-blue-50",text:"text-blue-700",border:"border-blue-200",accent:"bg-blue-500" };
  if (t.includes("journal") || t.includes("jv"))
    return { bg:"bg-purple-50",text:"text-purple-700",border:"border-purple-200",accent:"bg-purple-500" };
  if (t.includes("contra"))
    return { bg:"bg-orange-50",text:"text-orange-700",border:"border-orange-200",accent:"bg-orange-500" };
  if (t.includes("credit") && t.includes("note"))
    return { bg:"bg-pink-50",text:"text-pink-700",border:"border-pink-200",accent:"bg-pink-500" };
  return { bg:"bg-slate-100",text:"text-slate-600",border:"border-slate-200",accent:"bg-slate-400" };
}

// ─── Skeleton loading rows ────────────────────────────────────────────────────

function SkeletonRow({ colCount, widths }: { colCount: number; widths: number[] }) {
  return (
    <tr className="border-b border-slate-100">
      {Array.from({ length: colCount }, (_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 rounded-full bg-slate-100 animate-pulse" style={{ width: `${widths[i % widths.length]}%` }} />
        </td>
      ))}
      <td className="px-3 py-3.5"><div className="h-3.5 w-12 rounded-full bg-slate-100 animate-pulse" /></td>
    </tr>
  );
}

// ─── Voucher type pill ────────────────────────────────────────────────────────

function VoucherPill({ type, size = "sm" }: { type: string; size?: "sm" | "xs" }) {
  const c = voucherColors(type);
  const displayType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${c.bg} ${c.text} ${c.border} ${
      size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs"
    }`}>
      {displayType}
    </span>
  );
}

// ─── Amount card (for detail panel) ──────────────────────────────────────────

function AmountCard({ label, value, type }: { label: string; value: unknown; type: "debit"|"credit"|"net" }) {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : 0;
  const hasValue = !isNaN(n) && n !== 0;

  const styles = {
    debit:  { bg:"bg-rose-50",   border:"border-rose-100",   text:"text-rose-700",    sub:"text-rose-400",   Icon:TrendingDown },
    credit: { bg:"bg-emerald-50",border:"border-emerald-100",text:"text-emerald-700", sub:"text-emerald-400",Icon:TrendingUp },
    net:    { bg: hasValue && n < 0 ? "bg-rose-50" : "bg-slate-50",
              border: hasValue && n < 0 ? "border-rose-100" : "border-slate-200",
              text: hasValue && n < 0 ? "text-rose-700" : hasValue ? "text-slate-800" : "text-slate-400",
              sub: "text-slate-400", Icon:Minus },
  }[type];

  const { Icon } = styles;

  return (
    <div className={`flex-1 rounded-xl border ${styles.bg} ${styles.border} px-4 py-3`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${styles.sub}`} />
        <p className={`text-[10px] font-bold uppercase tracking-widest ${styles.sub}`}>{label}</p>
      </div>
      <p className={`text-lg font-bold tabular-nums leading-tight ${styles.text}`}>
        {hasValue ? fmtAmount(value) : <span className="text-slate-300 font-normal">—</span>}
      </p>
    </div>
  );
}

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({
  col, value, connectionId, rowId, onSaved,
}: { col: string; value: unknown; connectionId: string; rowId: number; onSaved: (col: string, v: unknown) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    let init = "";
    if (value !== null && value !== undefined) {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) init = value.slice(0, 10);
      else init = String(value);
    }
    setDraft(init);
    setError("");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/gl-rows/${rowId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: col, value: draft === "" ? null : draft }),
      });
      if (!res.ok) { const b = await res.json() as { error?: string }; setError(b.error ?? "Save failed"); return; }
      onSaved(col, draft === "" ? null : draft);
      setEditing(false);
    } catch { setError("Network error"); }
    finally  { setSaving(false); }
  }

  const editable = EDITABLE_COLS.has(col);
  const isEmpty  = value === null || value === undefined || value === "";
  const isAmount = NUMERIC_COLS.has(col);
  const isDate   = DATE_COLS.has(col);

  if (editing) {
    return (
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type={isDate ? "date" : isAmount ? "number" : "text"}
            value={draft}
            step={isAmount ? "0.01" : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key==="Enter") void save(); if (e.key==="Escape") setEditing(false); }}
            className="h-8 text-sm flex-1 bg-white"
          />
          <button onClick={save} disabled={saving}
            className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0">
            {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button onClick={() => setEditing(false)}
            className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 flex items-center justify-center shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle className="h-3 w-3"/>{error}</p>}
      </div>
    );
  }

  return (
    <button type="button" onClick={editable ? startEdit : undefined}
      className={`flex-1 group flex items-center justify-between min-h-[36px] rounded-lg px-3 py-2 text-left transition-all ${
        editable ? "hover:bg-white hover:shadow-sm cursor-text" : "cursor-default"
      }`}>
      <span className={`text-sm leading-relaxed ${isEmpty ? "text-slate-300 italic" : isAmount ? "font-mono font-medium" : ""} ${
        isAmount && !isEmpty
          ? col === "debit_amount"  ? "text-rose-600"
          : col === "credit_amount" ? "text-emerald-600"
          : "text-slate-800"
          : isEmpty ? "" : "text-slate-800"
      }`}>
        {col === "voucher_type" && !isEmpty ? <VoucherPill type={String(value)} /> : fmtCell(col, value)}
      </span>
      {editable && !isEmpty && (
        <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-400 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      {editable && isEmpty && (
        <span className="text-[11px] text-slate-300 group-hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100">click to add</span>
      )}
    </button>
  );
}

// ─── Row detail panel ─────────────────────────────────────────────────────────

function RowDetailPanel({
  row, rowIndex, totalRows, allColumns, connectionId,
  scanIssues,
  onClose, onPrev, onNext, onRowChange, onExcludeToggle,
}: {
  row: GlRow; rowIndex: number; totalRows: number; allColumns: string[];
  connectionId: string;
  scanIssues?: { title: string; severity: ScanSeverity; code: string }[];
  onClose: ()=>void; onPrev: ()=>void; onNext: ()=>void;
  onRowChange: (field: string, value: unknown)=>void;
  onExcludeToggle: ()=>void;
}) {
  const rowId    = row._row_id as number | undefined;
  const excluded = !!row._excluded;
  const refNo    = row.reference_number as string | undefined;
  const txDate   = row.transaction_date as string | undefined;
  const vtType   = row.voucher_type     as string | undefined;
  const acctName = (row.account_name || row.party_name || row.vendor_name || row.customer_name) as string | undefined;

  const vColors  = vtType ? voucherColors(vtType) : null;

  const tableColSet = new Set(allColumns);
  const sections = FIELD_SECTIONS
    .map((s) => ({ ...s, fields: s.fields.filter((f) => tableColSet.has(f)) }))
    .filter((s) => s.fields.length > 0);
  const coveredFields = new Set(FIELD_SECTIONS.flatMap((s) => s.fields));
  const otherFields   = allColumns.filter((c) => !coveredFields.has(c) && !c.startsWith("_"));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")    onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight")onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[520px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">

        {/* Voucher-type accent bar */}
        {vColors && <div className={`h-1 w-full shrink-0 ${vColors.accent}`} />}

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {refNo
                ? <span className="text-base font-bold text-slate-900 font-mono">{refNo}</span>
                : <span className="text-base font-medium text-slate-400 italic">No reference</span>
              }
              {vtType && <VoucherPill type={vtType} />}
              {excluded && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-rose-50 text-rose-600 border-rose-200">
                  <EyeOff className="h-2.5 w-2.5" />EXCLUDED
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {txDate && (
                <p className="text-xs text-slate-500">
                  {new Date(txDate).toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
                </p>
              )}
              {acctName && <span className="text-xs text-slate-300">·</span>}
              {acctName && <p className="text-xs text-slate-500 truncate">{String(acctName)}</p>}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <button onClick={onPrev} disabled={rowIndex === 0} title="Previous (←)"
              className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] text-slate-400 w-16 text-center tabular-nums font-medium">
              {rowIndex + 1} / {totalRows}
            </span>
            <button onClick={onNext} disabled={rowIndex === totalRows - 1} title="Next (→)"
              className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={onClose} title="Close (Esc)"
              className="ml-1 h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40">

          {/* Amount cards */}
          {(tableColSet.has("debit_amount") || tableColSet.has("credit_amount")) && (
            <div className="px-5 pt-5 pb-1">
              <div className="flex gap-3">
                {tableColSet.has("debit_amount")  && <AmountCard label="Debit"  value={row.debit_amount}  type="debit"  />}
                {tableColSet.has("credit_amount") && <AmountCard label="Credit" value={row.credit_amount} type="credit" />}
                {tableColSet.has("net_amount")    && <AmountCard label="Net"    value={row.net_amount}    type="net"    />}
              </div>
            </div>
          )}

          {/* Excluded banner */}
          {excluded && (
            <div className="mx-5 mt-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-center gap-3">
              <EyeOff className="h-4 w-4 text-rose-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-700">Excluded from scans</p>
                <p className="text-xs text-rose-500 mt-0.5">This entry is hidden from data quality checks and close analysis.</p>
              </div>
              {rowId != null && (
                <button onClick={onExcludeToggle}
                  className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 transition-colors">
                  <RotateCcw className="h-3 w-3" />Restore
                </button>
              )}
            </div>
          )}

          {/* Field sections */}
          <div className="px-5 py-5 space-y-5">
            {sections.map((section) => {
              // Skip Amounts section if we already show the amount cards (avoid duplication)
              const isAmountsSection = section.label === "Amounts";
              const hasAmountCards   = tableColSet.has("debit_amount") || tableColSet.has("credit_amount");
              if (isAmountsSection && hasAmountCards) {
                // Still render but only if it has editable content; show a compact editable form
                return (
                  <div key={section.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base leading-none">{section.icon}</span>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{section.label}</p>
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-slate-300 italic">click value to edit</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100 shadow-sm">
                      {section.fields.map((field) => (
                        <div key={field} className="flex items-center min-h-[44px] px-4">
                          <span className="text-xs font-medium text-slate-400 w-28 shrink-0">{colLabel(field)}</span>
                          {rowId != null ? (
                            <EditableField col={field} value={row[field]} connectionId={connectionId} rowId={rowId} onSaved={onRowChange} />
                          ) : (
                            <span className={`text-sm px-3 py-2 flex-1 font-mono ${
                              field === "debit_amount"  ? "text-rose-600" :
                              field === "credit_amount" ? "text-emerald-600" : "text-slate-700"
                            }`}>{fmtCell(field, row[field])}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <div key={section.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base leading-none">{section.icon}</span>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{section.label}</p>
                    <div className="flex-1 h-px bg-slate-200" />
                    {section.label !== "Notes" && (
                      <span className="text-[10px] text-slate-300 italic">click value to edit</span>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100 shadow-sm">
                    {section.fields.map((field) => {
                      const val = row[field];
                      const isEmpty = val === null || val === undefined || val === "";
                      return (
                        <div key={field} className="flex items-center min-h-[44px] px-4">
                          <span className="text-xs font-medium text-slate-400 w-28 shrink-0">{colLabel(field)}</span>
                          {rowId != null ? (
                            <EditableField col={field} value={val} connectionId={connectionId} rowId={rowId} onSaved={onRowChange} />
                          ) : (
                            <span className={`text-sm px-3 py-2 flex-1 ${isEmpty ? "text-slate-300 italic" : "text-slate-800"}`}>
                              {fmtCell(field, val)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Other fields */}
            {otherFields.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Other Fields</p>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100 shadow-sm">
                  {otherFields.map((field) => (
                    <div key={field} className="flex items-center min-h-[44px] px-4">
                      <span className="text-xs font-medium text-slate-400 w-28 shrink-0">{colLabel(field)}</span>
                      <span className="text-sm text-slate-700 px-3 py-2 flex-1">{fmtCell(field, row[field])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scan issues for this row */}
            {scanIssues && scanIssues.length > 0 && (
              <ScanIssuesList issues={scanIssues} />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            Row <span className="font-mono font-medium text-slate-500">{rowId ?? "—"}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="text-[10px]">Press ← → to navigate</span>
          </p>
          {rowId != null && (
            <button onClick={onExcludeToggle}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                excluded
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              }`}>
              {excluded
                ? <><Eye className="h-3.5 w-3.5" />Restore to scans</>
                : <><EyeOff className="h-3.5 w-3.5" />Exclude from scans</>}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Issue guidance & resolution types ───────────────────────────────────────

type IssueStatus = "resolved" | "intentional";
type ResolutionMap = Record<string, IssueStatus>;

const RESOLUTION_KEY = (id: string) => `gl-resolution-v1-${id}`;

const ISSUE_GUIDANCE: Record<string, {
  steps: string[];
  involve: string;
  urgency: "before-close" | "this-week" | "monitor";
}> = {
  tds_potentially_missed: {
    steps: [
      "List all vendor payments above ₹30,000 (single) or ₹1,00,000 (annual aggregate) in the period",
      "Apply TDS at correct rate — 1% for contractors (194C), 10% for professionals (194J), 2% for technical services",
      "Deposit TDS via Challan 281 before the 7th of the following month to avoid interest",
      "File Form 26Q quarterly and issue Form 16A to vendors within 15 days of filing",
    ],
    involve: "Accounts team + Chartered Accountant",
    urgency: "before-close",
  },
  duplicate_transactions: {
    steps: [
      "Cross-check both vouchers against physical bills or GRNs (Goods Receipt Notes)",
      "If genuinely duplicate: exclude one entry and add a note referencing the original voucher number",
      "If both are genuine (e.g. two separate deliveries): add distinct reference numbers to differentiate",
      "Reconcile with vendor statement to confirm which entry is correct",
    ],
    involve: "Accounts team",
    urgency: "before-close",
  },
  gst_mismatch: {
    steps: [
      "Verify state of supply — CGST+SGST apply for intra-state, IGST for inter-state transactions",
      "Check if the vendor GSTIN state code matches the place of supply on the invoice",
      "Raise a credit note or GST amendment if the wrong tax head was applied",
      "Reconcile with GSTR-2B to catch any mismatches in vendor filings",
    ],
    involve: "Accounts team + GST Consultant + CA",
    urgency: "before-close",
  },
  trial_balance_mismatch: {
    steps: [
      "Run a ledger-wise trial balance in your ERP to isolate the exact accounts causing the mismatch",
      "Look for missing closing entries — depreciation, provisions, prepaid expenses, and accruals are common culprits",
      "Verify all journal entries are balanced (total debits must equal total credits for each voucher)",
      "Check if any entries were posted to a summary account instead of the correct sub-ledger",
    ],
    involve: "CFO + Chartered Accountant",
    urgency: "before-close",
  },
  debtors_overdue: {
    steps: [
      "Prepare an age-wise debtor statement (30/60/90/120+ day buckets) and share with sales and collections",
      "Send formal reminders to debtors outstanding beyond 60 days; escalate beyond 90 days",
      "Evaluate if a provision for doubtful debts is required and book the journal entry",
      "Discuss with your CA whether any accounts should be written off for tax purposes",
    ],
    involve: "Sales team + Collections + CFO + CA",
    urgency: "this-week",
  },
  sign_anomalies: {
    steps: [
      "Review each flagged account — a credit balance in an asset/expense account usually signals an error or reversal entry",
      "Check whether the voucher was posted with correct Dr/Cr account heads",
      "For genuine credit balances (advance received, customer overpayment), add a description explaining the reason",
      "If it is a data entry error, pass a correcting journal entry with proper narration",
    ],
    involve: "Accounts team",
    urgency: "before-close",
  },
  missing_fields: {
    steps: [
      "Filter and list all rows with missing transaction dates and update from original vouchers",
      "For zero-amount rows: verify if it was a non-monetary transaction (contra entry, notes) or a data entry gap",
      "Ensure all mandatory fields (date, amount, account) are filled before generating financial statements",
    ],
    involve: "Accounts data entry team",
    urgency: "before-close",
  },
  date_outliers: {
    steps: [
      "Verify the flagged dates against original source documents (bills, bank statements)",
      "Correct any data entry errors by passing a reversal and re-entering with the correct date",
      "For valid future-dated entries (advance bookings, provisions), add a narration explaining the date",
    ],
    involve: "Accounts team",
    urgency: "this-week",
  },
  period_completeness: {
    steps: [
      "Identify which months or voucher types are missing entries for the period",
      "Check with the business team whether transactions were genuinely nil or were simply not entered",
      "If entries are missing, re-enter or import from the source ERP/bank statements",
    ],
    involve: "Accounts team + Business operations",
    urgency: "monitor",
  },
  unclassified_accounts: {
    steps: [
      "Review flagged account names — they don't map to standard GL categories (assets, liabilities, income, expense)",
      "Create proper account heads in your chart of accounts and reclassify these transactions",
      "Update your ERP account master to prevent future entries under unclassified names",
    ],
    involve: "Accounts team + CA",
    urgency: "this-week",
  },
};

const URGENCY_LABEL: Record<string, { label: string; className: string }> = {
  "before-close": { label: "Must resolve before close",  className: "text-rose-600 bg-rose-50 border-rose-200" },
  "this-week":    { label: "Action needed this week",    className: "text-amber-600 bg-amber-50 border-amber-200" },
  "monitor":      { label: "Monitor",                    className: "text-blue-600 bg-blue-50 border-blue-200" },
};

interface IsolatedIssue {
  code: string; title: string; severity: ScanSeverity; label: string;
  refNos: string[]; acctNos: string[];
}

const ISSUE_FIX_HINT: Record<string, string> = {
  duplicate_transactions:  "Use the 👁 eye icon on the row to exclude one of each duplicate pair after verifying against the original bill or GRN",
  trial_balance_mismatch:  "Re-export the GL from your ERP with all voucher types selected and the correct date range — the mismatch is almost always a partial export",
  gst_mismatch:            "Click ⊞ to open each voucher — CGST and SGST must be equal for intra-state; correct the GST account heads in your ERP and re-export",
  tds_potentially_missed:  "Click ⊞ on each row to review — if TDS was filed in a separate journal, mark the issue as intentional in the scan panel",
  debtors_overdue:         "Send collection reminders for outstanding balances; click ⊞ to add a note or use 👁 to exclude any written-off accounts",
  sign_anomalies:          "Click ⊞ to open each flagged account's rows and verify whether the balance direction is due to an advance or a posting error",
  missing_fields:          "Click ⊞ on any row to fill in the missing transaction date or amount using inline editing",
  date_outliers:           "Click ⊞ on any row to correct the transaction date — use the date picker to set the right value",
  period_completeness:     "Re-export from your ERP with the correct date range and all voucher types — the current file appears to cover only part of the period",
  unclassified_accounts:   "Visit Account Mapping to assign GL categories; rows under unclassified accounts are excluded from financial reports until classified",
};

// Issues where the problem is missing/aggregate data — we cannot point to specific "bad" rows
const STRUCTURAL_ISSUES = new Set(["trial_balance_mismatch", "period_completeness"]);

function calcReadinessScore(issues: ScanIssue[], resolutions: ResolutionMap): number {
  if (issues.length === 0) return 100;
  const W: Record<ScanSeverity, number> = { critical: 3, review: 2, info: 1 };
  const total    = issues.reduce((s, i) => s + W[i.severity], 0);
  const resolved = issues.filter((i) => resolutions[i.code]).reduce((s, i) => s + W[i.severity], 0);
  return total === 0 ? 100 : Math.round((resolved / total) * 100);
}

// ─── Score ring (SVG) ─────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score === 100 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#f1f5f9" strokeWidth="7" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
      />
      <text x="44" y="40" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">{score}</text>
      <text x="44" y="56" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="sans-serif">/ 100</text>
    </svg>
  );
}

// ─── Scan results panel ───────────────────────────────────────────────────────

function ScanResultsPanel({
  overlay, resolutions, onResolve, onIsolateIssue, onClose,
}: {
  overlay: ScanOverlay;
  resolutions: ResolutionMap;
  onResolve: (code: string, status: IssueStatus | null) => void;
  onIsolateIssue: (issue: ScanIssue) => void;
  onClose: () => void;
}) {
  const { issues, bySeverity, totalExposure, scannedAt } = overlay;
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  const score         = calcReadinessScore(issues, resolutions);
  const resolvedCount = Object.keys(resolutions).length;
  const unresolvedCritical = issues.filter((i) => i.severity === "critical" && !resolutions[i.code]).length;

  const readinessText =
    score === 100 ? "Ready to close!" :
    score >= 80   ? "Nearly ready" :
    score >= 50   ? "Work in progress" :
                    "Needs attention";
  const readinessColor =
    score === 100 ? "text-emerald-600" :
    score >= 60   ? "text-amber-600"   :
                    "text-rose-600";
  const barColor =
    score === 100 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  const fmtExp = (n: number) => {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`;
    return `₹${n.toFixed(0)}`;
  };

  const scannedLabel = (() => {
    try {
      const d = new Date(scannedAt);
      return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  })();

  const sorted = [...issues].sort((a, b) => {
    const aResolved = !!resolutions[a.code];
    const bResolved = !!resolutions[b.code];
    if (aResolved !== bResolved) return aResolved ? 1 : -1;
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });

  function fmtExampleValue(k: string, v: unknown): string {
    if (v === null || v === undefined) return "—";
    if ((k.includes("amount") || k.includes("balance") || k.includes("imbalance") || k.includes("exposure"))
        && typeof v === "number") return fmtAmount(v);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
      return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    return String(v);
  }

  const SKIP_KEYS = new Set(["_row_id", "_excluded"]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[600px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <ShieldAlert className="h-5 w-5 text-violet-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900">Scan Results</h2>
            {scannedLabel && <p className="text-xs text-slate-400 mt-0.5">Scanned {scannedLabel}</p>}
          </div>
          <button onClick={onClose}
            className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Close readiness score ── */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white shrink-0">
          {score === 100 ? (
            <div className="flex items-center gap-4 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4">
              <span className="text-3xl">🎉</span>
              <div>
                <p className="text-base font-bold text-emerald-700">Your GL is clean!</p>
                <p className="text-sm text-emerald-600 mt-0.5">All issues resolved — ready to close this period.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <ScoreRing score={score} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Close readiness</p>
                <p className={`text-lg font-bold leading-tight ${readinessColor}`}>{readinessText}</p>
                <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${score}%`, backgroundColor: barColor }} />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {resolvedCount} of {issues.length} issue{issues.length !== 1 ? "s" : ""} resolved
                  {unresolvedCritical > 0 && (
                    <span className="ml-1.5 text-rose-500 font-medium">· {unresolvedCritical} critical remaining</span>
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 text-right">
                {bySeverity.critical > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />{bySeverity.critical} Critical
                  </span>
                )}
                {bySeverity.review > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{bySeverity.review} Review
                  </span>
                )}
                {totalExposure > 0 && (
                  <span className="text-xs font-semibold text-rose-600">{fmtExp(totalExposure)} exposure</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Issues list ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {sorted.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">No issues found</div>
          )}

          {sorted.map((issue) => {
            const isResolved = !!resolutions[issue.code];
            const isExpanded = !isResolved || expandedCodes.has(issue.code);
            const guidance   = ISSUE_GUIDANCE[issue.code];
            const urgency    = guidance ? URGENCY_LABEL[guidance.urgency] : null;
            const exampleKeys = issue.examples.length > 0
              ? Object.keys(issue.examples[0]).filter((k) => !SKIP_KEYS.has(k))
              : [];

            if (isResolved && !isExpanded) {
              return (
                <button key={issue.code} type="button"
                  onClick={() => setExpandedCodes((s) => { const n = new Set(s); n.add(issue.code); return n; })}
                  className="w-full flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-left hover:bg-emerald-50 transition-colors">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm text-slate-600 flex-1 leading-snug">{issue.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    resolutions[issue.code] === "intentional"
                      ? "bg-blue-50 text-blue-600 border-blue-200"
                      : "bg-emerald-100 text-emerald-700 border-emerald-200"
                  }`}>
                    {resolutions[issue.code] === "intentional" ? "Intentional" : "Resolved"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              );
            }

            return (
              <div key={issue.code} className={`rounded-xl border overflow-hidden transition-all ${
                isResolved ? "border-emerald-200" :
                issue.severity === "critical" ? "border-rose-200" :
                issue.severity === "review"   ? "border-amber-200" : "border-blue-200"
              }`}>
                {/* Issue header */}
                <div className={`flex items-start gap-3 px-4 py-3 ${
                  isResolved ? "bg-emerald-50/60" :
                  issue.severity === "critical" ? "bg-rose-50/60" :
                  issue.severity === "review"   ? "bg-amber-50/50" : "bg-blue-50/40"
                }`}>
                  <span className={issuePillStyle(issue.severity)}>
                    {ISSUE_LABELS[issue.code] ?? issue.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{issue.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{issue.description}</p>
                  </div>
                  {isResolved && (
                    <button onClick={() => setExpandedCodes((s) => { const n = new Set(s); n.delete(issue.code); return n; })}
                      className="text-slate-300 hover:text-slate-500 shrink-0 mt-0.5">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Stats + urgency */}
                <div className="flex items-center gap-4 px-4 py-2.5 bg-white border-t border-slate-100 flex-wrap">
                  <span className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{issue.affectedRows.toLocaleString("en-IN")}</span> rows affected
                  </span>
                  {issue.exposure != null && issue.exposure > 0 && (
                    <span className="text-xs text-slate-500">
                      <span className="font-semibold text-rose-600">{fmtExp(issue.exposure)}</span> exposure
                    </span>
                  )}
                  {urgency && (
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgency.className}`}>
                      {urgency.label}
                    </span>
                  )}
                </div>

                {/* What to do */}
                {guidance && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">What to do</p>
                    <ol className="space-y-1.5">
                      {guidance.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                          <span className="shrink-0 h-4 w-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2.5 text-[10px] text-slate-400">
                      <span className="font-semibold">Involve:</span> {guidance.involve}
                    </p>
                  </div>
                )}

                {/* Trial balance: Dr/Cr breakdown table (replaces generic examples) */}
                {issue.code === "trial_balance_mismatch" && issue.examples.length > 0 && (
                  <div className="border-t border-slate-100 bg-white">
                    <p className="px-4 pt-2.5 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Accounts with biggest imbalance
                    </p>
                    <div className="px-4 pb-3">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-100">
                            <th className="text-left pb-1.5 font-semibold">Account</th>
                            <th className="text-right pb-1.5 font-semibold">Dr total</th>
                            <th className="text-right pb-1.5 font-semibold">Cr total</th>
                            <th className="text-right pb-1.5 font-semibold">Net gap</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {issue.examples.slice(0, 6).map((ex, i) => {
                            const net = toNum(ex.net ?? ex.dr) - (ex.net !== undefined ? 0 : toNum(ex.cr));
                            const netVal = ex.net !== undefined ? toNum(ex.net) : toNum(ex.dr) - toNum(ex.cr);
                            return (
                              <tr key={i} className="text-slate-600">
                                <td className="py-1.5 pr-3 font-medium max-w-[160px] truncate">{String(ex.account_name ?? "—")}</td>
                                <td className="py-1.5 text-right text-rose-600 font-mono tabular-nums">{fmtAmount(ex.dr ?? 0)}</td>
                                <td className="py-1.5 text-right text-emerald-600 font-mono tabular-nums">{fmtAmount(ex.cr ?? 0)}</td>
                                <td className={`py-1.5 text-right font-mono font-bold tabular-nums ${netVal > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                  {netVal > 0 ? "+" : ""}{fmtAmount(Math.abs(netVal))} {netVal > 0 ? "Dr" : "Cr"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
                        These accounts have more debits than credits (or vice versa). The missing entries were not included in the GL export — they exist in your ERP but aren't in this file.
                      </p>
                    </div>
                  </div>
                )}

                {/* Generic examples for non-structural, non-trial-balance issues */}
                {issue.code !== "trial_balance_mismatch" && issue.examples.length > 0 && exampleKeys.length > 0 && (
                  <div className="border-t border-slate-100 bg-white">
                    <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Examples</p>
                    <div className="px-4 pb-3 space-y-1.5">
                      {issue.examples.slice(0, 4).map((ex, i) => {
                        const pairs = exampleKeys
                          .filter((k) => ex[k] !== null && ex[k] !== undefined && ex[k] !== "")
                          .slice(0, 6);
                        if (pairs.length === 0) return null;
                        return (
                          <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-[11px]">
                            {pairs.map((k) => (
                              <span key={k} className="flex items-center gap-1">
                                <span className="text-slate-400">{colLabel(k)}:</span>
                                <span className="text-slate-700 font-medium">{fmtExampleValue(k, ex[k])}</span>
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Structural issue explanation (no row-level fix possible) */}
                {STRUCTURAL_ISSUES.has(issue.code) && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      <span className="font-semibold text-slate-600">Why can't we show specific rows?</span>{" "}
                      {issue.code === "trial_balance_mismatch"
                        ? "The problem is entries that are missing from the file — they exist in your ERP but weren't exported. There are no specific \"bad\" rows to point to; the fix is re-exporting with complete data."
                        : "This issue reflects the overall coverage of the uploaded file, not individual transaction errors."}
                    </p>
                  </div>
                )}

                {/* Footer: View rows + resolution */}
                {(() => {
                  const isStructural = STRUCTURAL_ISSUES.has(issue.code);
                  const isoRefNos  = isStructural ? [] : (issue.affectedRefNos ?? []).filter(Boolean);
                  const isoAcctNos = isStructural || isoRefNos.length > 0 ? [] :
                    issue.examples.map((ex) => ex.account_name as string | undefined).filter((a): a is string => typeof a === "string" && a.length > 0);
                  const canIsolate = isoRefNos.length > 0 || isoAcctNos.length > 0;
                  const viewBtn = canIsolate ? (
                    <button onClick={() => { onIsolateIssue(issue); onClose(); }}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors shrink-0">
                      <Filter className="h-3 w-3" />View affected rows →
                    </button>
                  ) : null;

                  return isResolved ? (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-emerald-100 bg-emerald-50/40">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          resolutions[issue.code] === "intentional"
                            ? "bg-blue-50 text-blue-600 border-blue-200"
                            : "bg-emerald-100 text-emerald-700 border-emerald-200"
                        }`}>
                          <Check className="h-2.5 w-2.5" />
                          {resolutions[issue.code] === "intentional" ? "Marked intentional" : "Marked resolved"}
                        </span>
                        {canIsolate && (
                          <button onClick={() => { onIsolateIssue(issue); onClose(); }}
                            className="text-xs text-slate-400 hover:text-violet-600 underline underline-offset-2 transition-colors">
                            View rows
                          </button>
                        )}
                      </div>
                      <button onClick={() => { onResolve(issue.code, null); setExpandedCodes((s) => { const n = new Set(s); n.delete(issue.code); return n; }); }}
                        className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors">
                        Reopen
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-white flex-wrap">
                      {viewBtn}
                      <div className="flex items-center gap-2 ml-auto">
                        <button onClick={() => onResolve(issue.code, "resolved")}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                          <Check className="h-3 w-3" />Mark resolved
                        </button>
                        <button onClick={() => onResolve(issue.code, "intentional")}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                          Mark as intentional
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Scan summary bar ─────────────────────────────────────────────────────────

function ScanSummaryBar({ overlay, resolutions, showFlagged, onToggleFlagged, onDismiss, onViewResults }: {
  overlay: ScanOverlay;
  resolutions: ResolutionMap;
  showFlagged: boolean;
  onToggleFlagged: () => void;
  onDismiss: () => void;
  onViewResults: () => void;
}) {
  const { bySeverity, totalIssues, totalExposure, flaggedRefs, flaggedAccts, scannedAt } = overlay;
  const score = calcReadinessScore(overlay.issues, resolutions);
  const hasRowRefs   = flaggedRefs.size > 0 || flaggedAccts.size > 0;
  const flaggedCount = flaggedRefs.size + flaggedAccts.size;

  const fmtExp = (n: number) => {
    if (n >= 10_000_000) return `₹${(n/10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000)    return `₹${(n/100_000).toFixed(1)}L`;
    if (n >= 1_000)      return `₹${(n/1_000).toFixed(0)}K`;
    return `₹${n.toFixed(0)}`;
  };

  const scannedLabel = (() => {
    try {
      const d = new Date(scannedAt);
      return `Scanned ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    } catch { return ""; }
  })();

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 overflow-hidden shadow-sm">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-700">Scan results</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{totalIssues} issue{totalIssues !== 1 ? "s" : ""} found</span>
          <span className="text-xs text-slate-400">·</span>
          <span className={`text-xs font-bold tabular-nums ${score === 100 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-rose-600"}`}>
            {score === 100 ? "✓ Ready to close" : `${score}% ready`}
          </span>
          {totalExposure > 0 && (
            <>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-semibold text-slate-700">{fmtExp(totalExposure)} exposure</span>
            </>
          )}
          {hasRowRefs && (
            <>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-violet-600 font-medium">{flaggedCount} rows flagged</span>
            </>
          )}
          {scannedLabel && (
            <>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400">{scannedLabel}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {bySeverity.critical > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {bySeverity.critical} Critical
            </span>
          )}
          {bySeverity.review > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {bySeverity.review} Review
            </span>
          )}
          {bySeverity.info > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              {bySeverity.info} Info
            </span>
          )}
          <button
            onClick={onToggleFlagged}
            disabled={!hasRowRefs}
            title={!hasRowRefs ? "No row-level flagged entries for this scan" : undefined}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              showFlagged
                ? "border-violet-500 bg-violet-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {showFlagged
              ? "Show all rows"
              : hasRowRefs
                ? `Show ${flaggedCount} flagged`
                : "No row matches"}
          </button>
          <button onClick={onViewResults}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">
            View results →
          </button>
          <button onClick={onDismiss} className="text-slate-300 hover:text-slate-500 transition-colors ml-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Severity legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-rose-100 text-rose-700 border-rose-200">Label</span>
          Critical issue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200">Label</span>
          Needs review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-blue-100 text-blue-700 border-blue-200">Label</span>
          Informational
        </span>
        <span className="ml-auto">Each badge shows exactly why the row is flagged · click row to see details</span>
      </div>
    </div>
  );
}

// ─── Scan issues display (in detail panel) ────────────────────────────────────

function ScanIssuesList({ issues }: { issues: { title: string; severity: ScanSeverity; code: string }[] }) {
  if (issues.length === 0) return null;
  const severityStyle: Record<ScanSeverity, { pill: string; icon: string }> = {
    critical: { pill: "bg-rose-100 text-rose-700 border-rose-200",   icon: "🔴" },
    review:   { pill: "bg-amber-100 text-amber-700 border-amber-200", icon: "🟡" },
    info:     { pill: "bg-blue-100 text-blue-700 border-blue-200",    icon: "🔵" },
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base leading-none">⚠️</span>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Scan Issues</p>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100 shadow-sm">
        {issues.map((issue) => {
          const s = severityStyle[issue.severity];
          return (
            <div key={issue.code} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.pill}`}>
                {s.icon} {issue.severity.toUpperCase()}
              </span>
              <p className="text-sm text-slate-700 leading-snug">{issue.title}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Column chooser ───────────────────────────────────────────────────────────

function ColumnChooser({ allColumns, visible, onChange, onClose }: {
  allColumns: string[]; visible: Set<string>;
  onChange: (next: Set<string>) => void; onClose: () => void;
}) {
  const sorted = sortColumns(allColumns);
  function toggle(col: string) {
    const next = new Set(visible);
    if (next.has(col)) { if (next.size > 1) next.delete(col); } else next.add(col);
    onChange(next);
  }
  return (
    <div className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50/80">
        <p className="text-xs font-semibold text-slate-700">Visible columns</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {sorted.map((col) => (
          <button key={col} type="button" onClick={() => toggle(col)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 text-left transition-colors">
            <span className={`h-4 w-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
              visible.has(col) ? "bg-slate-900 border-slate-900" : "border-slate-300"
            }`}>
              {visible.has(col) && <Check className="h-2.5 w-2.5 text-white" />}
            </span>
            <span className={visible.has(col) ? "text-slate-800 font-medium" : "text-slate-400"}>{colLabel(col)}</span>
          </button>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
        <button onClick={() => onChange(new Set(sorted))}
          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium">Show all</button>
      </div>
    </div>
  );
}

// ─── Active filter chips ──────────────────────────────────────────────────────

function FilterChips({ search, startDate, endDate, voucherType, flaggedOnly, onClear }: {
  search: string; startDate: string; endDate: string; voucherType: string; flaggedOnly: boolean;
  onClear: (key: "search"|"dates"|"voucherType"|"flaggedOnly") => void;
}) {
  const chips = [
    search      && { key:"search"      as const, label:`"${search}"`,            icon:"🔍" },
    (startDate || endDate) && {
      key:"dates" as const,
      label: startDate && endDate ? `${new Date(startDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})} – ${new Date(endDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`
        : startDate ? `From ${new Date(startDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`
        : `To ${new Date(endDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`,
      icon:"📅",
    },
    voucherType && { key:"voucherType" as const, label: voucherType.charAt(0).toUpperCase()+voucherType.slice(1), icon:"🏷" },
    flaggedOnly && { key:"flaggedOnly" as const, label:"Excluded only", icon:"⛔" },
  ].filter(Boolean) as { key: "search"|"dates"|"voucherType"|"flaggedOnly"; label: string; icon: string }[];

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-slate-400 font-medium">Filters:</span>
      {chips.map((chip) => (
        <span key={chip.key}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          <span>{chip.icon}</span>
          {chip.label}
          <button onClick={() => onClear(chip.key)} className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── Page totals bar ──────────────────────────────────────────────────────────

function PageTotals({ rows, columns }: { rows: GlRow[]; columns: string[] }) {
  if (!columns.includes("debit_amount") && !columns.includes("credit_amount")) return null;
  const totalDebit  = rows.reduce((s, r) => s + (typeof r.debit_amount  === "number" ? r.debit_amount  : 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (typeof r.credit_amount === "number" ? r.credit_amount : 0), 0);
  if (totalDebit === 0 && totalCredit === 0) return null;
  return (
    <div className="flex items-center gap-6 text-xs">
      {totalDebit > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          <span className="text-slate-500">Page debits:</span>
          <span className="font-semibold text-rose-600 font-mono">{fmtAmount(totalDebit)}</span>
        </span>
      )}
      {totalCredit > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-slate-500">Page credits:</span>
          <span className="font-semibold text-emerald-600 font-mono">{fmtAmount(totalCredit)}</span>
        </span>
      )}
    </div>
  );
}

// ─── Main lister ─────────────────────────────────────────────────────────────

export function GlLister({
  connectionId, glMinDate, glMaxDate,
}: { connectionId: string; glMinDate?: string; glMaxDate?: string }) {
  const [data,    setData]    = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const [search,      setSearch]      = useState("");
  const [startDate,   setStartDate]   = useState("");
  const [endDate,     setEndDate]     = useState("");
  const [voucherType, setVoucherType] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page,        setPage]        = useState(1);

  const [visibleCols,    setVisibleCols]    = useState<Set<string>>(new Set());
  const [showColChooser, setShowColChooser] = useState(false);
  const [showFilters,    setShowFilters]    = useState(false);
  const [detailIdx,      setDetailIdx]      = useState<number | null>(null);

  // Scan overlay
  const [scanOverlay,    setScanOverlay]    = useState<ScanOverlay | null>(null);
  const [loadingScan,    setLoadingScan]    = useState(false);
  const [scanError,      setScanError]      = useState("");
  const [showFlaggedScan, setShowFlaggedScan] = useState(false);
  const [showScanPanel,  setShowScanPanel]  = useState(false);
  const [resolutions,    setResolutions]    = useState<ResolutionMap>({});
  const [isolatedIssue,  setIsolatedIssue]  = useState<IsolatedIssue | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Load persisted scan overlay + resolutions on mount
  useEffect(() => {
    const stored = localStorage.getItem(SCAN_STORAGE_KEY(connectionId));
    if (stored) {
      const overlay = deserializeScan(stored);
      if (overlay) setScanOverlay(overlay);
    }
    const storedRes = localStorage.getItem(RESOLUTION_KEY(connectionId));
    if (storedRes) {
      try { setResolutions(JSON.parse(storedRes) as ResolutionMap); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  // Persist scan overlay whenever it changes
  useEffect(() => {
    if (scanOverlay) {
      localStorage.setItem(SCAN_STORAGE_KEY(connectionId), serializeScan(scanOverlay));
    }
  }, [scanOverlay, connectionId]);

  useEffect(() => { setPage(1); }, [debouncedSearch, startDate, endDate, voucherType, flaggedOnly, showFlaggedScan, isolatedIssue]);

  // CSVs for server-side scan filters
  // Isolated issue takes priority; falls back to "show all flagged" mode
  const flaggedRefsCsv  = showFlaggedScan && scanOverlay && scanOverlay.flaggedRefs.size  > 0
    ? [...scanOverlay.flaggedRefs].join(",")  : "";
  const flaggedAcctsCsv = showFlaggedScan && scanOverlay && scanOverlay.flaggedAccts.size > 0
    ? [...scanOverlay.flaggedAccts].join(",") : "";
  const activeRefsCsv   = isolatedIssue ? isolatedIssue.refNos.join(",")  : flaggedRefsCsv;
  const activeAcctsCsv  = isolatedIssue ? isolatedIssue.acctNos.join(",") : flaggedAcctsCsv;

  const fetchRows = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const url = new URL(`/api/v1/connections/${connectionId}/gl-rows`, window.location.origin);
      url.searchParams.set("page",     String(page));
      url.searchParams.set("pageSize", "50");
      if (debouncedSearch) url.searchParams.set("search",      debouncedSearch);
      if (startDate)       url.searchParams.set("startDate",   startDate);
      if (endDate)         url.searchParams.set("endDate",     endDate);
      if (voucherType)     url.searchParams.set("voucherType", voucherType);
      if (flaggedOnly)     url.searchParams.set("flaggedOnly", "true");
      // Server-side scan filters — isolated issue or all-flagged mode
      if (activeRefsCsv)  url.searchParams.set("refNos",  activeRefsCsv);
      if (activeAcctsCsv) url.searchParams.set("acctNos", activeAcctsCsv);
      const res  = await fetch(url.toString());
      if (!res.ok) { const b = await res.json() as { error?:string; detail?:string }; setError(b.detail??b.error??"Failed to load"); return; }
      const json = await res.json() as ApiResponse;
      setData(json);
      if (!visibleCols.size && json.columns.length > 0) {
        const stored = localStorage.getItem(STORAGE_KEY(connectionId));
        if (stored) {
          try { const p = JSON.parse(stored) as string[]; const v = new Set(p.filter((c)=>json.columns.includes(c))); if (v.size>0){ setVisibleCols(v); return; } } catch { /* ignore */ }
        }
        setVisibleCols(new Set(sortColumns(json.columns).slice(0, 7)));
      }
    } catch (err) { setError((err as Error).message); }
    finally       { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, page, debouncedSearch, startDate, endDate, voucherType, flaggedOnly, visibleCols.size, activeRefsCsv, activeAcctsCsv]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => {
    if (visibleCols.size > 0) localStorage.setItem(STORAGE_KEY(connectionId), JSON.stringify([...visibleCols]));
  }, [visibleCols, connectionId]);

  async function toggleExclude(rowIdx: number) {
    const row   = data?.rows[rowIdx]; const rowId = row?._row_id as number|undefined;
    if (!row || rowId == null) return;
    const next = !row._excluded;
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/gl-rows/${rowId}`, {
        method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ exclude: next }),
      });
      if (!res.ok) return;
      setData((prev) => { if (!prev) return prev; const rows=[...prev.rows]; rows[rowIdx]={...rows[rowIdx],_excluded:next}; return {...prev,rows}; });
    } catch { /* ignore */ }
  }

  function applyEdit(rowIdx: number, field: string, value: unknown) {
    setData((prev) => { if (!prev) return prev; const rows=[...prev.rows]; rows[rowIdx]={...rows[rowIdx],[field]:value}; return {...prev,rows}; });
  }

  function clearFilter(key: "search"|"dates"|"voucherType"|"flaggedOnly") {
    if (key==="search")      setSearch("");
    if (key==="dates")       { setStartDate(""); setEndDate(""); }
    if (key==="voucherType") setVoucherType("");
    if (key==="flaggedOnly") setFlaggedOnly(false);
  }

  async function loadScanOverlay() {
    setLoadingScan(true);
    setScanError("");
    // Use filter dates if set, otherwise the GL date range, otherwise a wide default
    const sd = startDate || glMinDate || "2000-01-01";
    const ed = endDate   || glMaxDate || "2100-12-31";
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/scan`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: new Date(sd).toISOString(),
          endDate:   new Date(ed).toISOString(),
        }),
      });
      if (!res.ok) {
        const b = await res.json() as { error?: string; detail?: string };
        setScanError(b.detail ?? b.error ?? "Scan failed");
        return;
      }
      const result = await res.json() as ScanResult;

      // Build two parallel maps:
      //  refSeverity/refIssues  — keyed by reference_number (per-voucher checks)
      //  acctSeverity/acctIssues — keyed by account_name  (account-level checks: debtors, sign)
      const refSeverity  = new Map<string, ScanSeverity>();
      const refIssues    = new Map<string, IssueRef[]>();
      const acctSeverity = new Map<string, ScanSeverity>();
      const acctIssues   = new Map<string, IssueRef[]>();

      function upsert(
        sevMap: Map<string, ScanSeverity>,
        issMap: Map<string, IssueRef[]>,
        key: string,
        issue: ScanIssue,
      ) {
        const existing = sevMap.get(key);
        if (!existing || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[existing]) {
          sevMap.set(key, issue.severity);
        }
        const list = issMap.get(key) ?? [];
        if (!list.find((i) => i.code === issue.code)) {
          list.push({ title: issue.title, severity: issue.severity, code: issue.code });
        }
        issMap.set(key, list);
      }

      for (const issue of result.issues) {
        // ── Voucher-level: prefer full affectedRefNos, fall back to example keys ──
        const refNos: string[] =
          issue.affectedRefNos && issue.affectedRefNos.length > 0
            ? issue.affectedRefNos
            : issue.examples.flatMap((ex) =>
                [ex.reference_number, ex.vch_a, ex.vch_b]
                  .filter((k): k is string => typeof k === "string" && k.length > 0),
              );
        for (const key of refNos) upsert(refSeverity, refIssues, key, issue);

        // ── Account-level: examples that have account_name but no reference_number ──
        // (trial_balance_mismatch, debtors_overdue, sign_anomalies, unclassified_accounts)
        for (const ex of issue.examples) {
          const acct = ex.account_name as string | undefined;
          if (acct && typeof acct === "string" && acct.length > 0 && !ex.reference_number) {
            upsert(acctSeverity, acctIssues, acct, issue);
          }
        }
      }

      setScanOverlay({
        bySeverity:    result.bySeverity,
        totalIssues:   result.totalIssues,
        totalExposure: result.totalExposure,
        issues:        result.issues,
        refSeverity,
        refIssues,
        flaggedRefs:   new Set(refSeverity.keys()),
        acctSeverity,
        acctIssues,
        flaggedAccts:  new Set(acctSeverity.keys()),
        scannedAt:     new Date().toISOString(),
      });
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setLoadingScan(false);
    }
  }

  function dismissScanOverlay() {
    setScanOverlay(null);
    setScanError("");
    setShowFlaggedScan(false);
    setShowScanPanel(false);
    setIsolatedIssue(null);
    setResolutions({});
    localStorage.removeItem(SCAN_STORAGE_KEY(connectionId));
    localStorage.removeItem(RESOLUTION_KEY(connectionId));
  }

  function handleIsolateIssue(issue: ScanIssue) {
    const refNos  = (issue.affectedRefNos ?? []).filter(Boolean);
    const acctNos = refNos.length === 0
      ? issue.examples
          .map((ex) => ex.account_name as string | undefined)
          .filter((a): a is string => typeof a === "string" && a.length > 0)
      : [];
    setIsolatedIssue({
      code:     issue.code,
      title:    issue.title,
      severity: issue.severity,
      label:    ISSUE_LABELS[issue.code] ?? issue.title,
      refNos,
      acctNos,
    });
    setShowFlaggedScan(false);
  }

  function handleResolve(code: string, status: IssueStatus | null) {
    setResolutions((prev) => {
      const next = { ...prev };
      if (status === null) delete next[code]; else next[code] = status;
      localStorage.setItem(RESOLUTION_KEY(connectionId), JSON.stringify(next));
      return next;
    });
  }

  const allCols  = data ? sortColumns(data.columns.filter((c) => !c.startsWith("_"))) : [];
  const showCols = allCols.filter((c) => visibleCols.has(c));
  const vtypes   = data?.voucherTypes ?? [];
  const pag      = data?.pagination;
  const rows     = data?.rows ?? [];
  const activeFilterCount = [debouncedSearch, startDate||endDate, voucherType, flaggedOnly?"1":""].filter(Boolean).length;
  const detailRow = detailIdx != null ? rows[detailIdx] : null;

  function rowScanIssues(row: GlRow): IssueRef[] {
    if (!scanOverlay) return [];
    const ref = row.reference_number as string | undefined;
    const refList = ref ? (scanOverlay.refIssues.get(ref) ?? []) : [];
    const acct = (row.account_name ?? row.party_name ?? row.vendor_name ?? row.customer_name) as string | undefined;
    const acctList = acct ? (scanOverlay.acctIssues.get(acct) ?? []) : [];
    // Merge, deduplicating by issue code
    const merged = [...refList];
    for (const i of acctList) { if (!merged.find((m) => m.code === i.code)) merged.push(i); }
    return merged;
  }

  // Server already filters when flaggedRefsCsv is set; just map to index pairs here
  const displayRows = rows.map((r, i) => ({ r, i }));

  return (
    <div className="space-y-3">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, account name…" className="pl-9 h-9 text-sm bg-white" />
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
            showFilters || activeFilterCount > 0
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}>
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 h-5 w-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setFlaggedOnly((v) => !v)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
            flaggedOnly
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}>
          <EyeOff className="h-3.5 w-3.5" />
          {flaggedOnly ? "Showing excluded" : "Excluded only"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowColChooser((v) => !v)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
                showColChooser ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}>
              <Settings2 className="h-3.5 w-3.5" />
              Columns
            </button>
            {showColChooser && data && (
              <ColumnChooser allColumns={data.columns.filter((c)=>!c.startsWith("_"))} visible={visibleCols}
                onChange={(next)=>setVisibleCols(next)} onClose={()=>setShowColChooser(false)} />
            )}
          </div>
          {/* Inline scan overlay — highlights issues directly in the table */}
          {scanOverlay ? (
            <button onClick={dismissScanOverlay}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-colors">
              <ScanLine className="h-3.5 w-3.5" />Clear scan
            </button>
          ) : (
            <button onClick={() => void loadScanOverlay()} disabled={loadingScan}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-violet-200 bg-white text-violet-700 text-sm font-medium hover:bg-violet-50 disabled:opacity-50 transition-colors">
              {loadingScan
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />}
              {loadingScan ? "Scanning…" : "Highlight issues"}
            </button>
          )}
          <Button asChild size="sm" className="gap-1.5 h-9 text-sm">
            <Link href="/close"><Plus className="h-3.5 w-3.5" />New close period</Link>
          </Button>
        </div>
      </div>

      {/* ── Expanded filter bar ── */}
      {showFilters && (
        <div className="flex items-end gap-4 flex-wrap rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Start date</p>
            <Input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="h-8 text-sm w-38" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">End date</p>
            <Input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="h-8 text-sm w-38" />
          </div>
          {vtypes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Voucher type</p>
              <div className="relative">
                <select value={voucherType} onChange={(e)=>setVoucherType(e.target.value)}
                  className="h-8 text-sm rounded-lg border border-slate-200 bg-white pl-3 pr-8 appearance-none min-w-[140px] focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <option value="">All types</option>
                  {vtypes.map((vt)=><option key={vt} value={vt}>{vt.charAt(0).toUpperCase()+vt.slice(1)}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}
          {(startDate||endDate||voucherType) && (
            <button onClick={()=>{setStartDate("");setEndDate("");setVoucherType("");}}
              className="text-xs text-slate-400 hover:text-slate-600 underline mt-auto pb-1 transition-colors">
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Issue isolation banner ── */}
      {isolatedIssue && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
          isolatedIssue.severity === "critical" ? "border-rose-200 bg-rose-50/70" :
          isolatedIssue.severity === "review"   ? "border-amber-200 bg-amber-50/70" :
                                                  "border-blue-200 bg-blue-50/60"
        }`}>
          <span className={`${issuePillStyle(isolatedIssue.severity)} mt-0.5 shrink-0`}>
            {isolatedIssue.label}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-snug">{isolatedIssue.title}</p>
            {ISSUE_FIX_HINT[isolatedIssue.code] && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{ISSUE_FIX_HINT[isolatedIssue.code]}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowScanPanel(true)}
              className="text-xs font-medium text-violet-600 hover:text-violet-800 underline underline-offset-2 transition-colors whitespace-nowrap">
              ← Back to results
            </button>
            <button onClick={() => setIsolatedIssue(null)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 border border-slate-200 bg-white px-2.5 py-1 rounded-lg transition-colors">
              <X className="h-3 w-3" />Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Active filter chips ── */}
      <FilterChips search={debouncedSearch} startDate={startDate} endDate={endDate}
        voucherType={voucherType} flaggedOnly={flaggedOnly} onClear={clearFilter} />

      {/* ── Stats row ── */}
      {pag && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{pag.total.toLocaleString("en-IN")}</span>{" "}
              row{pag.total!==1?"s":""}{activeFilterCount>0 && <span className="text-indigo-500 ml-1 text-xs">(filtered)</span>}
            </p>
            <PageTotals rows={rows} columns={allCols} />
          </div>
          {pag.totalPages > 1 && (
            <p className="text-xs text-slate-400 tabular-nums">Page {pag.page} of {pag.totalPages}</p>
          )}
        </div>
      )}

      {/* ── Load error ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* ── Scan error ── */}
      {scanError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />{scanError}
          <button onClick={() => setScanError("")} className="ml-auto text-amber-400 hover:text-amber-600"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Scan summary bar ── */}
      {scanOverlay && (
        <ScanSummaryBar
          overlay={scanOverlay}
          resolutions={resolutions}
          showFlagged={showFlaggedScan}
          onToggleFlagged={() => setShowFlaggedScan((v) => !v)}
          onDismiss={dismissScanOverlay}
          onViewResults={() => setShowScanPanel(true)}
        />
      )}

      {/* ── Table ── */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {/* Thin loading bar */}
        {loading && data && (
          <div className="h-0.5 bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-500 animate-pulse w-1/3 ml-auto" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                {showCols.map((col) => (
                  <th key={col} className={`px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap ${
                    NUMERIC_COLS.has(col) ? "text-right" : "text-left"
                  }`}>
                    {colLabel(col)}
                  </th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Skeleton rows */}
              {loading && !data && SKELETON_WIDTHS.slice(0, Math.min(7, showCols.length > 0 ? 7 : 7)).map((w, i) => (
                <SkeletonRow key={i} colCount={showCols.length || 6} widths={w} />
              ))}

              {/* Empty state */}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={showCols.length + 1} className="px-4 py-16 text-center">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-sm font-medium text-slate-700">No rows found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {activeFilterCount > 0 ? "Try adjusting your filters" : "No data loaded yet"}
                    </p>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {displayRows.map(({ r: row, i: rowIdx }) => {
                const rowId       = row._row_id as number | undefined;
                const excluded    = !!row._excluded;
                const isOpen      = detailIdx === rowIdx;
                return (
                  <tr key={rowId ?? rowIdx}
                    className={`group transition-all ${
                      isOpen   ? "bg-indigo-50/80 border-l-[3px] border-l-indigo-400" :
                      excluded ? "bg-rose-50/30 opacity-50" :
                                 "hover:bg-slate-50/80"
                    }`}>

                    {showCols.map((col) => {
                      const v = row[col];
                      const empty = v === null || v === undefined || v === "";
                      return (
                        <td key={col} className={`px-4 py-3 whitespace-nowrap ${
                          NUMERIC_COLS.has(col) ? "text-right" : ""
                        } ${excluded ? "line-through" : ""}`}>
                          {col === "voucher_type" && !empty ? (
                            <VoucherPill type={String(v)} size="xs" />
                          ) : NUMERIC_COLS.has(col) ? (
                            <span className={`font-mono text-sm ${empty ? "text-slate-200" :
                              col==="debit_amount"  ? "text-rose-600 font-medium" :
                              col==="credit_amount" ? "text-emerald-600 font-medium" :
                              "text-slate-700"
                            }`}>
                              {empty ? "—" : fmtAmount(v)}
                            </span>
                          ) : (
                            <span className={`${empty ? "text-slate-300" : "text-slate-700"} ${
                              col==="account_name"||col==="party_name"||col==="vendor_name"||col==="customer_name"
                                ? "font-medium" : ""
                            }`}>
                              {empty ? "—" : String(v)}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Row actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        {/* Labeled issue badges — click to open scan results panel */}
                        {!isOpen && rowScanIssues(row).map((issue) => (
                          <button key={issue.code} onClick={() => setShowScanPanel(true)}
                            className={`${issuePillStyle(issue.severity)} cursor-pointer hover:opacity-80 transition-opacity`}>
                            {ISSUE_LABELS[issue.code] ?? issue.title.slice(0, 15)}
                          </button>
                        ))}
                        {rowId != null && (
                          <button title={excluded?"Restore row":"Exclude from scans"}
                            onClick={()=>void toggleExclude(rowIdx)}
                            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                              excluded
                                ? "text-rose-400 bg-rose-50 border border-rose-100 hover:bg-rose-100"
                                : "text-slate-300 hover:text-slate-500 hover:bg-slate-100 opacity-0 group-hover:opacity-100"
                            }`}>
                            {excluded ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button title="View & edit details"
                          onClick={()=>setDetailIdx(isOpen?null:rowIdx)}
                          className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                            isOpen
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                              : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100"
                          }`}>
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {pag && pag.totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button disabled={page<=1||loading} onClick={()=>setPage((p)=>p-1)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({length:Math.min(pag.totalPages,7)},(_,i)=>{
              const p=pag.totalPages<=7?i+1:i<3?i+1:i===3?-1:pag.totalPages-(6-i);
              if (p===-1) return <span key="ell" className="px-1.5 text-xs text-slate-300">…</span>;
              return (
                <button key={p} onClick={()=>setPage(p)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors ${
                    p===page ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                  }`}>{p}</button>
              );
            })}
          </div>
          <button disabled={page>=pag.totalPages||loading} onClick={()=>setPage((p)=>p+1)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Next<ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Excluded legend ── */}
      {rows.some((r)=>r._excluded) && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
          <span className="h-2 w-2 rounded-full bg-rose-300" />
          Dimmed rows are excluded from scans and close analysis.
          <button onClick={()=>setFlaggedOnly((v)=>!v)}
            className="text-rose-400 hover:text-rose-600 underline underline-offset-2 transition-colors">
            {flaggedOnly?"Show all rows":"View excluded only"}
          </button>
        </div>
      )}

      {/* ── Scan results panel ── */}
      {showScanPanel && scanOverlay && (
        <ScanResultsPanel
          overlay={scanOverlay}
          resolutions={resolutions}
          onResolve={handleResolve}
          onIsolateIssue={handleIsolateIssue}
          onClose={() => setShowScanPanel(false)}
        />
      )}

      {/* ── Detail panel ── */}
      {detailRow && detailIdx != null && (
        <RowDetailPanel
          row={detailRow} rowIndex={detailIdx} totalRows={rows.length}
          allColumns={allCols} connectionId={connectionId}
          scanIssues={rowScanIssues(detailRow)}
          onClose={()=>setDetailIdx(null)}
          onPrev={()=>setDetailIdx((i)=>i!=null&&i>0?i-1:i)}
          onNext={()=>setDetailIdx((i)=>i!=null&&i<rows.length-1?i+1:i)}
          onRowChange={(field,value)=>{ if(detailIdx!=null) applyEdit(detailIdx,field,value); }}
          onExcludeToggle={()=>{ if(detailIdx!=null) void toggleExclude(detailIdx); }}
        />
      )}
    </div>
  );
}

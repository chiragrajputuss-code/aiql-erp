/**
 * Shared helpers for the New Close Period wizard. Imported by step1/2/3 and
 * the main dialog. Keeps the dialog file focused on the state machine.
 */

import { Info, Check } from "lucide-react";

// ─── Date / number formatters ───────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function getDefaultDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const target = new Date(year, month + 1, 10);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    name: `${MONTH_NAMES[month]} ${year} Close`,
    start: fmt(start),
    end:   fmt(end),
    target: fmt(target),
  };
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRows(n: number) {
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L rows`;
  if (n >= 1_000)   return `${(n / 1_000).toFixed(1)}K rows`;
  return `${n} rows`;
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

export function HelpTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex" tabIndex={0} aria-label={text} role="tooltip">
      <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" aria-hidden="true" />
      <span
        className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block group-focus-within:block
                   w-64 rounded-md bg-slate-900 text-white text-xs px-2.5 py-1.5 leading-relaxed
                   shadow-lg pointer-events-none"
      >
        {text}
      </span>
    </span>
  );
}

// ─── Step indicators ────────────────────────────────────────────────────────

export function MobileStepLabel({ step, hasIntent }: { step: 1 | 2 | 3; hasIntent: boolean }) {
  const total = hasIntent ? 3 : 2;
  const current = hasIntent ? step : step === 3 ? 2 : 1;
  const labels = hasIntent
    ? { 1: "Setup", 2: "Focus", 3: "Preview" }
    : { 1: "Setup", 2: "Preview", 3: "Preview" };
  return <>Step {current} of {total} — <span className="font-medium text-slate-700">{labels[step]}</span></>;
}

export function StepIndicator({ step, hasIntent }: { step: 1 | 2 | 3; hasIntent: boolean }) {
  const totalSteps = hasIntent ? 3 : 2;
  const labels = hasIntent ? ["Setup", "Focus", "Preview"] : ["Setup", "Preview"];
  const activeIdx = hasIntent ? step - 1 : step === 3 ? 1 : 0;

  return (
    <ol
      className="hidden sm:flex items-center gap-1.5 text-xs"
      aria-label={`Step ${activeIdx + 1} of ${totalSteps}`}
    >
      {labels.map((label, i) => (
        <li
          key={i}
          className="flex items-center gap-1.5"
          aria-current={i === activeIdx ? "step" : undefined}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${
              i === activeIdx
                ? "bg-slate-900 text-white"
                : i < activeIdx
                ? "bg-emerald-500 text-white"
                : "bg-slate-100 text-slate-400"
            }`}
            aria-hidden="true"
          >
            {i < activeIdx ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={i === activeIdx ? "font-medium text-slate-900" : "text-slate-500"}>
            {label}
          </span>
          {i < labels.length - 1 && <span className="text-slate-300" aria-hidden="true">→</span>}
        </li>
      ))}
    </ol>
  );
}

// ─── Sample prompts (Step 2 placeholder + chips) ────────────────────────────

export const SAMPLE_PROMPTS = [
  "We paid a one-time bonus in March, please flag it",
  "Focus on bank and salary; skip flux this month",
  'Watch "Petty Cash - Mumbai" carefully',
  "GST rate changed mid-month — review CGST/SGST closely",
  "Inventory count happened, please check stock balances",
  "Quick close, only essentials needed",
];

// ─── Local upload + connection types (used across step1) ────────────────────

export interface UploadedFile {
  id:           string;
  originalName: string;
  rowCount:     number;
  tableName:    string;
  createdAt:    string;
}

export interface Connection {
  id:           string;
  displayName:  string;
  erpType:      string;
  status:       string;
  createdAt:    string;
  uploadedFile: UploadedFile | null;
  /** Earliest transaction_date in the GL table. YYYY-MM-DD or null if not yet computed. */
  glMinDate:    string | null;
  /** Latest transaction_date in the GL table. YYYY-MM-DD or null if not yet computed. */
  glMaxDate:    string | null;
}

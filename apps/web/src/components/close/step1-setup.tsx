"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle, FileSpreadsheet, FileText, Calendar,
  CheckSquare, Square, Repeat, Info,
} from "lucide-react";
import {
  type CloseProfile,
  type ContextHintsResponse as ContextHints,
  type PreferencesResponse,
  PROFILE_META, PROFILE_ORDER,
} from "@/lib/close-types";
import { HelpTip, formatDate, formatRows, type Connection } from "./wizard-shared";

export interface Step1Form {
  name: string;
  startDate: string;
  endDate: string;
  targetCompletionDate: string;
  profile: CloseProfile;
}

export interface Step1Props {
  form: Step1Form;
  setForm: React.Dispatch<React.SetStateAction<Step1Form>>;
  connections: Connection[];
  selectedIds: Set<string>;
  loadingConns: boolean;
  totalRows: number;
  toggle: (id: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  hints: ContextHints | null;
  prefs: PreferencesResponse | null;
  applyLastClose: () => void;
  requestApplyLastClose: () => void;
  cancelApplyLastClose: () => void;
  showLastClosePreview: boolean;
  /** Auto-fill start/end from a connection's GL date range. */
  applyGlDates: (minDate: string, maxDate: string) => void;
}

// ─── GL period badge helper ───────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function GlPeriodBadge({ minDate, maxDate }: { minDate: string | null; maxDate: string | null }) {
  if (!minDate || !maxDate) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
      <Calendar className="h-2.5 w-2.5" />
      {fmtDate(minDate)} – {fmtDate(maxDate)}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Step1Setup(props: Step1Props) {
  const {
    form, setForm, connections, selectedIds, loadingConns, totalRows,
    toggle, selectAll, clearAll, hints, prefs, applyLastClose,
    requestApplyLastClose, cancelApplyLastClose, showLastClosePreview,
    applyGlDates,
  } = props;

  return (
    <>
      {/* Period name + dates */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Period name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. April 2026 Close"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="start">Start date</Label>
            <Input id="start" type="date" value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end">End date</Label>
            <Input id="end" type="date" value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target">Target completion date <span className="text-slate-400 font-normal">(optional)</span></Label>
          <Input id="target" type="date" value={form.targetCompletionDate}
            onChange={(e) => setForm((f) => ({ ...f, targetCompletionDate: e.target.value }))} />
        </div>

        {/* Warn if selected connections have GL data outside the chosen period */}
        {(() => {
          const selected = connections.filter((c) => selectedIds.has(c.id));
          const outOfRange = selected.filter((c) => {
            if (!c.glMinDate || !c.glMaxDate || !form.startDate || !form.endDate) return false;
            const glMax = new Date(c.glMaxDate);
            const glMin = new Date(c.glMinDate);
            const ps = new Date(form.startDate);
            const pe = new Date(form.endDate);
            return glMax < ps || glMin > pe;
          });
          if (outOfRange.length === 0) return null;
          const first = outOfRange[0];
          return (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>{first.displayName}</strong> has GL data from{" "}
                <strong>{first.glMinDate && fmtDate(first.glMinDate)}</strong> to{" "}
                <strong>{first.glMaxDate && fmtDate(first.glMaxDate)}</strong> — outside your selected period.{" "}
                {first.glMinDate && first.glMaxDate && (
                  <button
                    type="button"
                    onClick={() => applyGlDates(first.glMinDate!, first.glMaxDate!)}
                    className="underline font-semibold hover:text-amber-900"
                  >
                    Use data dates
                  </button>
                )}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Profile picker */}
      <div className="space-y-2 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            How should we shape this close?
            <HelpTip text="Pick a starting profile — the wizard adapts the task list to your data and (for Adaptive) your free-text instructions." />
          </Label>
          {prefs?.hasPrevious && !showLastClosePreview && (
            <button
              type="button"
              onClick={requestApplyLastClose}
              className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              <Repeat className="h-3 w-3" />
              Same as last close
              {prefs.lastProfile && <span className="text-slate-400">({prefs.lastProfile})</span>}
            </button>
          )}
        </div>

        {/* Same-as-last preview/confirmation panel */}
        {showLastClosePreview && prefs?.hasPrevious && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Repeat className="h-4 w-4 text-indigo-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-900">This will set:</p>
                <ul className="mt-1 space-y-0.5 text-xs text-indigo-900">
                  <li>
                    <span className="text-indigo-600">Profile:</span>{" "}
                    <span className="font-medium">{prefs.lastProfile ?? "STANDARD"}</span>
                  </li>
                  {prefs.lastIntent && (
                    <li>
                      <span className="text-indigo-600">Prompt:</span>{" "}
                      <span className="italic">"{prefs.lastIntent.slice(0, 90)}{prefs.lastIntent.length > 90 ? "…" : ""}"</span>
                    </li>
                  )}
                </ul>
                {(form.profile !== (prefs.lastProfile ?? "STANDARD") || form.profile === "ADAPTIVE") && (
                  <p className="mt-1.5 text-[11px] text-indigo-700">
                    Your current selection will be replaced.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={cancelApplyLastClose}
                className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyLastClose}
                className="text-[11px] px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROFILE_ORDER.map((key) => {
            const meta = PROFILE_META[key];
            const Icon = meta.icon;
            const selected = form.profile === key;
            const isSuggestedYearEnd = hints?.yearEndLikely && key === "YEAR_END";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, profile: key }))}
                aria-pressed={selected}
                aria-label={`${meta.label}: ${meta.description}`}
                className={`text-left rounded-lg border p-3 transition-all relative focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 ${
                  selected
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-300"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`shrink-0 rounded-md p-1.5 ${
                    selected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{meta.label}</span>
                      {meta.badge && (
                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                          {meta.badge}
                        </span>
                      )}
                      {isSuggestedYearEnd && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                          AI: Likely
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{meta.tagline}</p>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{meta.description}</p>
                    <p className="text-[11px] text-slate-400 mt-1">~ {meta.estTasks}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* File selector */}
      <div className="space-y-2 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <Label>Include data from these uploads</Label>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedIds.size} of {connections.length} selected
              {totalRows > 0 && ` · ${formatRows(totalRows)} total`}
            </p>
          </div>
          {connections.length > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={selectAll} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5">
                All
              </button>
              <button type="button" onClick={clearAll} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5">
                None
              </button>
            </div>
          )}
        </div>

        {loadingConns ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-50 animate-pulse" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">No uploads found</p>
            <p className="text-xs text-slate-500 mt-0.5">Upload a GL file first from Connections.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {connections.map((c) => {
              const selected = selectedIds.has(c.id);
              const file = c.uploadedFile;
              if (!file) return null;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    selected
                      ? "border-blue-200 bg-blue-50/50 ring-1 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="mt-0.5">
                    {selected
                      ? <CheckSquare className="h-4 w-4 text-blue-600" />
                      : <Square className="h-4 w-4 text-slate-300" />}
                  </div>
                  <div className={`rounded-md p-1.5 shrink-0 ${selected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.displayName}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{formatRows(file.rowCount)}</span>
                      {c.status !== "ACTIVE" && <span className="text-amber-600 font-medium">{c.status}</span>}
                    </div>
                    {/* GL date range — the most important thing to show the user */}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <GlPeriodBadge minDate={c.glMinDate} maxDate={c.glMaxDate} />
                      {c.glMinDate && c.glMaxDate && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); applyGlDates(c.glMinDate!, c.glMaxDate!); }}
                          className="text-[10px] text-slate-400 hover:text-indigo-600 hover:underline transition-colors"
                        >
                          Use these dates
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

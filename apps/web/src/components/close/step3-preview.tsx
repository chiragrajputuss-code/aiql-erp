"use client";

import { Loader2, Sparkles, Plus, Minus } from "lucide-react";
import {
  type CloseProfile,
  type PreviewResponse,
} from "@/lib/close-types";

export interface Step3Props {
  preview:    PreviewResponse | null;
  loading:    boolean;
  error:      string;
  profile:    CloseProfile;
  userIntent: string;
}

export function Step3Preview({ preview, loading, error, profile, userIntent }: Step3Props) {
  if (loading) {
    return (
      <div
        className="py-12 flex flex-col items-center justify-center gap-2 text-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700">Generating tasks…</p>
        {profile === "ADAPTIVE" && userIntent && (
          <p className="text-xs text-slate-500 max-w-md">
            Reading your prompt, scanning data, and building a task list tailored to this close.
          </p>
        )}
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <div className="font-medium mb-1">Could not generate preview</div>
        <p className="text-xs">{error || "No preview data."}</p>
      </div>
    );
  }

  const tasksByCategory: Record<string, typeof preview.template.tasks> = {};
  for (const t of preview.template.tasks) {
    const cat = t.category;
    if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
    tasksByCategory[cat]!.push(t);
  }

  const categoryOrder = ["REVIEW", "RECONCILIATION", "FLUX_ANALYSIS", "CUSTOM", "REPORTING", "APPROVAL"];
  const sortedCategories = Object.keys(tasksByCategory).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-indigo-50/30 to-slate-50 p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-indigo-100 text-indigo-700 p-2">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{preview.template.name}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {preview.template.tasks.length} task{preview.template.tasks.length !== 1 ? "s" : ""} ·
              {" "}{preview.scanSummary.criticalCount} critical issue{preview.scanSummary.criticalCount !== 1 ? "s" : ""}
              {" · "}{preview.scanSummary.reviewCount} review item{preview.scanSummary.reviewCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Diff vs STANDARD baseline */}
        {preview.diff && (preview.diff.addedCount > 0 || preview.diff.removedCount > 0) && (
          <div className="mt-3 pt-3 border-t border-slate-200/60">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              vs Standard close
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {preview.diff.addedCount > 0 && (
                <span className="inline-flex items-center gap-1 pill bg-emerald-50 text-emerald-700 border-emerald-200">
                  <Plus className="h-3 w-3" />
                  {preview.diff.addedCount} added
                </span>
              )}
              {preview.diff.removedCount > 0 && (
                <span className="inline-flex items-center gap-1 pill bg-rose-50 text-rose-700 border-rose-200">
                  <Minus className="h-3 w-3" />
                  {preview.diff.removedCount} removed
                </span>
              )}
              <span className="text-[11px] text-slate-500">
                {preview.diff.unchangedCount} kept · {preview.diff.chosenCount} total
              </span>
            </div>
            {preview.diff.added.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-emerald-700 hover:underline select-none">
                  Show added tasks ({preview.diff.added.length})
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-3">
                  {preview.diff.added.map((t) => (
                    <li key={t.key} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                      <Plus className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{t.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.diff.removed.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-rose-700 hover:underline select-none">
                  Show removed tasks ({preview.diff.removed.length})
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-3">
                  {preview.diff.removed.map((t) => (
                    <li key={t.key} className="text-[11px] text-slate-500 line-through flex items-start gap-1.5">
                      <Minus className="h-3 w-3 text-rose-500 shrink-0 mt-0.5" />
                      <span>{t.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {preview.intent && preview.intent.confidence > 0.3 && (
          <div className="mt-3 pt-3 border-t border-slate-200/60">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              AI understood
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{preview.intent.rationale}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {preview.intent.focusAreas.slice(0, 6).map((a) => (
                <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                  focus: {a}
                </span>
              ))}
              {preview.intent.exclusions.map((e) => (
                <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
                  skip: {e}
                </span>
              ))}
              {preview.intent.watchAccounts.slice(0, 4).map((w) => (
                <span key={w} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                  watch: {w}
                </span>
              ))}
            </div>
            {preview.intent.ambiguities.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-500">
                <span className="font-medium">Unclear:</span> {preview.intent.ambiguities.join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task list grouped by category */}
      <div className="space-y-3">
        {sortedCategories.map((cat) => {
          const tasks = tasksByCategory[cat]!;
          return (
            <div key={cat}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                {cat.replace("_", " ")} <span className="text-slate-300">·</span> {tasks.length}
              </div>
              <ol className="space-y-1">
                {tasks.map((t) => {
                  const isUserFlagged = t.key.startsWith("watch-") || t.key === "user-risk-review";
                  return (
                    <li
                      key={t.key}
                      className={`flex items-start gap-2.5 rounded-md px-2.5 py-1.5 ${
                        isUserFlagged ? "bg-amber-50/40 border border-amber-100" : "bg-slate-50/40"
                      }`}
                    >
                      <span className={`mt-0.5 h-4 w-4 rounded-full text-[10px] flex items-center justify-center font-semibold ${
                        isUserFlagged ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-600"
                      }`}>
                        {t.sortOrder}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-slate-800">{t.title}</span>
                          {isUserFlagged && (
                            <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-semibold">
                              YOUR FOCUS
                            </span>
                          )}
                          {t.hasReconciliation && (
                            <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              auto-checked
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>

      {/* Reasoning trace (collapsible) */}
      {preview.reasoning.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 select-none">
            Why these tasks? <span className="text-slate-400">({preview.reasoning.length} decisions)</span>
          </summary>
          <ul className="px-3 pb-3 pt-1 space-y-1 text-[11px] text-slate-500">
            {preview.reasoning.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-slate-300 mt-0.5">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

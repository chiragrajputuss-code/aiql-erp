"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle, X, Repeat, Lightbulb, Loader2, Sparkles,
} from "lucide-react";
import {
  type ContextHintsResponse as ContextHints,
  type PreferencesResponse,
} from "@/lib/close-types";
import { HelpTip, SAMPLE_PROMPTS } from "./wizard-shared";

export interface Step2Props {
  userIntent:         string;
  setUserIntent:      (v: string) => void;
  hints:              ContextHints | null;
  loadingHints:       boolean;
  prefs:              PreferencesResponse | null;
  showEmptyWarning:   boolean;
  onSwitchToStandard: () => void;
}

export function Step2Intent(props: Step2Props) {
  const {
    userIntent, setUserIntent, hints, loadingHints, prefs,
    showEmptyWarning, onSwitchToStandard,
  } = props;

  // Rotating placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (userIntent.length > 0) return;  // pause rotation while typing
    intervalRef.current = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % SAMPLE_PROMPTS.length);
    }, 3500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [userIntent.length]);

  const placeholder = `e.g. "${SAMPLE_PROMPTS[placeholderIdx]}"`;

  function applySuggestion(text: string) {
    if (userIntent.includes(text)) return;
    const sep = userIntent.trim().length > 0 ? "; " : "";
    setUserIntent(userIntent + sep + text);
  }

  return (
    <div className="space-y-4">
      {showEmptyWarning && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-amber-900 font-medium text-xs">No prompt entered</p>
            <p className="text-amber-800 text-xs mt-0.5 leading-relaxed">
              Without a focus prompt, Adaptive produces the same task list as Standard. Add instructions, or switch to the Standard profile for clarity.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={onSwitchToStandard}
                className="text-[11px] font-medium text-amber-900 hover:text-amber-700 underline"
              >
                Switch to Standard profile
              </button>
              <span className="text-[11px] text-amber-700">
                or click <span className="font-medium">Next</span> again to continue with Adaptive (empty)
              </span>
            </div>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="userIntent" className="flex items-center gap-1.5">
          What&apos;s special about this close?
          <HelpTip text="In English, Hindi or Hinglish — anything you'd tell your CA. The AI builds custom watch tasks from this." />
        </Label>
        <p className="text-xs text-slate-500 mt-0.5">
          One or two sentences. Mention what to focus on, what to skip, or any one-off events.
        </p>
        <Textarea
          id="userIntent"
          value={userIntent}
          onChange={(e) => setUserIntent(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5 min-h-[88px] text-sm"
          maxLength={2000}
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-slate-400">
            {userIntent.length} / 2000 chars
          </span>
          {userIntent.length > 0 && (
            <button
              type="button"
              onClick={() => setUserIntent("")}
              className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Last-close memory */}
      {prefs?.hasPrevious && prefs.lastIntent && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
          <div className="flex items-start gap-2">
            <Repeat className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-indigo-900">Last close prompt</p>
              <p className="text-xs text-slate-600 italic mt-0.5 line-clamp-2">&quot;{prefs.lastIntent}&quot;</p>
              <button
                type="button"
                onClick={() => setUserIntent(prefs.lastIntent ?? "")}
                className="text-[11px] text-indigo-700 hover:underline mt-1"
              >
                Use the same prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart suggestions */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-semibold text-slate-700">Smart suggestions from your data</span>
          {loadingHints && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </div>

        {!hints && !loadingHints && (
          <p className="text-xs text-slate-500">No suggestions available yet — pick uploads in Step 1 to load context.</p>
        )}

        {hints && hints.suggestions.length === 0 && (
          <p className="text-xs text-slate-500">No specific issues detected. The standard template covers your data shape well.</p>
        )}

        {hints && hints.suggestions.length > 0 && (
          <div className="space-y-1.5">
            {hints.suggestions.slice(0, 5).map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applySuggestion(s.label)}
                className="w-full text-left flex items-start gap-2 rounded-md p-2 hover:bg-white border border-transparent hover:border-slate-200 transition-colors group"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5 group-hover:text-amber-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700">{s.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.hint}</p>
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-600">
                  + add
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sample prompts */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">Or start from a sample:</p>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_PROMPTS.slice(0, 4).map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setUserIntent(s)}
              className="text-[11px] px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

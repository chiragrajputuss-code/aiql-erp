"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2, AlertTriangle, MessageSquarePlus, X, Loader2, BookOpen,
  ThumbsUp, Search, Ban,
} from "lucide-react";

/**
 * KnowledgeCapturePrompt
 *
 * The "Is this normal?" feedback widget that turns every anomaly into
 * permanent learning. Renders inline below an anomaly card. On mount,
 * looks up whether we've already captured knowledge for this pattern;
 * if so, shows the prior answer with an "update?" link. Otherwise shows
 * three quick verdict buttons + an annotation textarea.
 *
 * The pattern key is derived client-side via the close-engine helpers
 * by the parent component (so the component itself stays small).
 */

type Verdict = "NORMAL" | "INVESTIGATE" | "ANNOTATED" | "REJECTED";
type AutoApply = "ALWAYS" | "ONCE" | "NEVER";
type Source = "SCAN_ISSUE" | "RECONCILIATION" | "FLUX_VARIANCE" | "AGENT_QUESTION" | "MANUAL";

export interface KnowledgeCapturePromptProps {
  /** Stable pattern key — same across closes for the same anomaly shape. */
  patternKey:   string;
  source:       Source;
  /** Optional structured ref kept alongside the answer for display context. */
  sourceRef?:   Record<string, unknown>;
  /** Connection scope — null for org-wide knowledge. */
  connectionId: string | null;
  /** Period id (close period) the answer is being given in. */
  periodId?:    string;
  /** What we're asking the user to confirm — shown verbatim. */
  context:      string;
  /** Default question text — overridable for surface-specific phrasing. */
  question?:    string;
  /** Called after a successful capture (parent can refresh/dismiss). */
  onCaptured?:  (verdict: Verdict) => void;
}

interface KnowledgeMatch {
  id:                 string;
  answer:             string;
  verdict:            Verdict;
  autoApply:          AutoApply;
  reaffirmationCount: number;
  lastReaffirmedAt:   string;
  annotation:         string | null;
}

export function KnowledgeCapturePrompt(props: KnowledgeCapturePromptProps) {
  const {
    patternKey, source, sourceRef, connectionId, periodId, context,
    question = "Is this normal for your business?", onCaptured,
  } = props;

  const [match, setMatch]       = useState<KnowledgeMatch | null>(null);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmit] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [autoApply, setAutoApply] = useState<AutoApply>("ALWAYS");
  const [error, setError]       = useState("");

  // ─── Initial lookup ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/v1/knowledge/lookup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, patternKey }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { match: KnowledgeMatch | null } | null) => {
        if (cancelled) return;
        setMatch(data?.match ?? null);
        if (data?.match?.annotation) setAnnotation(data.match.annotation);
        if (data?.match?.autoApply)  setAutoApply(data.match.autoApply);
      })
      .catch(() => { /* leave match=null */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [connectionId, patternKey]);

  async function record(verdict: Verdict, ann?: string | null) {
    setSubmit(true);
    setError("");
    try {
      const res = await fetch("/api/v1/knowledge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          patternKey,
          context,
          answer:     ann ?? defaultAnswer(verdict),
          source,
          sourceRef,
          verdict,
          annotation: ann ?? null,
          autoApply:  verdict === "REJECTED" ? "NEVER" : autoApply,
          periodId,
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(typeof body.error === "string" ? body.error : "Failed to save");
        return;
      }
      const saved = await res.json() as KnowledgeMatch;
      setMatch(saved);
      setShowEdit(false);
      onCaptured?.(verdict);
    } catch {
      setError("Network error");
    } finally {
      setSubmit(false);
    }
  }

  // ─── Render: prior knowledge exists → show summary + edit affordance ──
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking your knowledge base…
      </div>
    );
  }

  if (match && !showEdit) {
    return (
      <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/40 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5">
            {VERDICT_ICON[match.verdict]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-slate-700">
              {VERDICT_LABEL[match.verdict]}
              {match.reaffirmationCount > 1 && (
                <span className="text-slate-400 font-normal">
                  {" "}· confirmed {match.reaffirmationCount}× before
                </span>
              )}
            </p>
            {match.annotation && (
              <p className="text-[11px] text-slate-600 italic mt-0.5 line-clamp-2">
                &quot;{match.annotation}&quot;
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="text-[10px] text-indigo-600 hover:underline mt-1 inline-flex items-center gap-1"
            >
              <BookOpen className="h-2.5 w-2.5" />
              Update or change verdict
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: no prior knowledge OR user chose to edit → show form ─────
  return (
    <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50/30 p-2.5">
      <div className="flex items-start gap-2 mb-2">
        <BookOpen className="h-3.5 w-3.5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-slate-800">{question}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Your answer is saved to this org&apos;s knowledge base — future closes can auto-resolve the same pattern.
          </p>
        </div>
        {showEdit && (
          <button
            type="button"
            onClick={() => setShowEdit(false)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
            aria-label="Cancel edit"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <VerdictButton
          icon={<ThumbsUp className="h-3 w-3" />}
          label="Yes — normal"
          tone="emerald"
          loading={submitting}
          onClick={() => record("NORMAL")}
        />
        <VerdictButton
          icon={<MessageSquarePlus className="h-3 w-3" />}
          label="Add note"
          tone="indigo"
          loading={submitting}
          onClick={() => {
            // Toggle the annotation textarea visible
            setShowEdit(true);
            // If they're already showing edit, submit the annotation
            if (showEdit) {
              const ann = annotation.trim();
              if (!ann) { setError("Add a note before saving"); return; }
              void record("ANNOTATED", ann);
            }
          }}
        />
        <VerdictButton
          icon={<Search className="h-3 w-3" />}
          label="Investigate"
          tone="amber"
          loading={submitting}
          onClick={() => record("INVESTIGATE", annotation.trim() || null)}
        />
        {match && (
          <VerdictButton
            icon={<Ban className="h-3 w-3" />}
            label="This isn't right"
            tone="rose"
            loading={submitting}
            onClick={() => record("REJECTED")}
          />
        )}
      </div>

      {(showEdit || annotation) && (
        <div className="mt-2">
          <textarea
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            placeholder="Optional context — e.g. 'Annual bonus, paid every March'"
            rows={2}
            maxLength={1000}
            className="w-full text-[11px] rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <div className="flex items-center justify-between mt-1">
            <select
              value={autoApply}
              onChange={(e) => setAutoApply(e.target.value as AutoApply)}
              className="text-[10px] text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none"
            >
              <option value="ALWAYS">Auto-resolve every period</option>
              <option value="ONCE">Just this period</option>
              <option value="NEVER">Always re-ask</option>
            </select>
            <span className="text-[10px] text-slate-400">{annotation.length} / 1000</span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-[10px] text-rose-600">{error}</p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function defaultAnswer(v: Verdict): string {
  switch (v) {
    case "NORMAL":      return "Confirmed normal";
    case "INVESTIGATE": return "Flagged for investigation";
    case "REJECTED":    return "Rejected as outdated/incorrect";
    case "ANNOTATED":   return "Annotated";
  }
}

const VERDICT_LABEL: Record<Verdict, string> = {
  NORMAL:      "You confirmed this is normal",
  INVESTIGATE: "You flagged this to investigate",
  ANNOTATED:   "You annotated this",
  REJECTED:    "You marked this as wrong",
};

const VERDICT_ICON: Record<Verdict, React.ReactNode> = {
  NORMAL:      <CheckCircle2     className="h-3.5 w-3.5 text-emerald-600" />,
  INVESTIGATE: <AlertTriangle    className="h-3.5 w-3.5 text-amber-600"   />,
  ANNOTATED:   <MessageSquarePlus className="h-3.5 w-3.5 text-indigo-600" />,
  REJECTED:    <Ban              className="h-3.5 w-3.5 text-rose-600"    />,
};

interface VerdictButtonProps {
  icon:    React.ReactNode;
  label:   string;
  tone:    "emerald" | "indigo" | "amber" | "rose";
  loading: boolean;
  onClick: () => void;
}

function VerdictButton({ icon, label, tone, loading, onClick }: VerdictButtonProps) {
  const cls = {
    emerald: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
    indigo:  "border-indigo-200 text-indigo-700 hover:bg-indigo-50",
    amber:   "border-amber-200 text-amber-700 hover:bg-amber-50",
    rose:    "border-rose-200 text-rose-700 hover:bg-rose-50",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-white transition-colors disabled:opacity-50 ${cls}`}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Check, AlertCircle, ArrowLeft, ArrowRight,
} from "lucide-react";
import {
  type CloseProfile,
  type PreviewResponse,
  type PreferencesResponse,
  type ContextHintsResponse as ContextHints,
} from "@/lib/close-types";
import {
  StepIndicator, MobileStepLabel, getDefaultDates,
  type Connection,
} from "./wizard-shared";
import { Step1Setup } from "./step1-setup";
import { Step2Intent } from "./step2-intent";
import { Step3Preview } from "./step3-preview";

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onCreated:    (period: unknown) => void;
}

// ─── Main dialog ────────────────────────────────────────────────────────────

export function NewClosePeriodDialog({ open, onOpenChange, onCreated }: Props) {
  const defaults = getDefaultDates();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — setup state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingConns, setLoadingConns] = useState(false);
  const [form, setForm] = useState({
    name:                 defaults.name,
    startDate:            defaults.start,
    endDate:              defaults.end,
    targetCompletionDate: defaults.target,
    profile:              "STANDARD" as CloseProfile,
  });

  // Step 2 — intent state
  const [userIntent, setUserIntent] = useState("");
  const [hints, setHints] = useState<ContextHints | null>(null);
  const [loadingHints, setLoadingHints] = useState(false);
  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null);

  // Step 3 — preview state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Submission state
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  // Set when the user tries to advance from Step 2 with an empty Adaptive prompt.
  const [emptyIntentWarning, setEmptyIntentWarning] = useState(false);

  // "Same as last close" two-step confirmation state
  const [showLastClosePreview, setShowLastClosePreview] = useState(false);

  // ── Reset on close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep(1);
      setError("");
      setSaving(false);
      setUserIntent("");
      setPreview(null);
      setPreviewError("");
      setEmptyIntentWarning(false);
      setShowLastClosePreview(false);
    }
  }, [open]);

  // Reset warning whenever the user starts typing
  useEffect(() => {
    if (userIntent.trim().length > 0 && emptyIntentWarning) setEmptyIntentWarning(false);
  }, [userIntent, emptyIntentWarning]);

  // ── Fetch connections + prefs on open ──────────────────────────────────
  useEffect(() => {
    if (!open) return;

    setLoadingConns(true);
    fetch("/api/internal/connections")
      .then((r) => r.json())
      .then((data: Connection[] | { connections?: Connection[] }) => {
        const list = Array.isArray(data) ? data : (data.connections ?? []);
        const usable = list.filter((c) => c.uploadedFile?.tableName);
        setConnections(usable);
        setSelectedIds(new Set(usable.map((c) => c.id)));
        // Auto-fill period dates from the single connection's actual GL range
        // so new users don't accidentally use today's month against Q1 2025 data.
        if (usable.length === 1 && usable[0].glMinDate && usable[0].glMaxDate) {
          setForm((f) => ({
            ...f,
            startDate: usable[0].glMinDate!,
            endDate:   usable[0].glMaxDate!,
          }));
        }
      })
      .catch(() => setError("Failed to load uploads"))
      .finally(() => setLoadingConns(false));

    fetch("/api/v1/close/preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((data: PreferencesResponse | null) => setPrefs(data))
      .catch(() => setPrefs(null));
  }, [open]);

  // ── Fetch context hints when entering Step 2 (or Step 1 with selection) ──
  const primaryConnId = useMemo(
    () => Array.from(selectedIds)[0] ?? null,
    [selectedIds]
  );

  const fetchHints = useCallback(async () => {
    if (!primaryConnId) return;
    setLoadingHints(true);
    try {
      const url = new URL("/api/v1/close/data-context-hints", window.location.origin);
      url.searchParams.set("connectionId", primaryConnId);
      url.searchParams.set("startDate", new Date(form.startDate).toISOString());
      url.searchParams.set("endDate",   new Date(form.endDate).toISOString());
      const res = await fetch(url.toString());
      if (res.ok) setHints(await res.json() as ContextHints);
    } catch { /* best-effort */ }
    finally  { setLoadingHints(false); }
  }, [primaryConnId, form.startDate, form.endDate]);

  // Auto-fetch hints when reaching step 1 with a selection
  useEffect(() => {
    if (open && step === 1 && primaryConnId) fetchHints();
  }, [open, step, primaryConnId, fetchHints]);

  const totalRows = useMemo(() =>
    connections
      .filter((c) => selectedIds.has(c.id))
      .reduce((sum, c) => sum + (c.uploadedFile?.rowCount ?? 0), 0),
    [connections, selectedIds]
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(connections.map((c) => c.id))); }
  function clearAll()  { setSelectedIds(new Set()); }

  function applyGlDates(minDate: string, maxDate: string) {
    setForm((f) => ({
      ...f,
      startDate: minDate,
      endDate:   maxDate,
    }));
  }

  // ── Step navigation ─────────────────────────────────────────────────────

  function canAdvanceFromStep1(): string | null {
    if (selectedIds.size === 0) return "Select at least one upload to include.";
    if (!form.name.trim()) return "Period name is required.";
    if (!form.startDate || !form.endDate) return "Start and end dates are required.";
    if (new Date(form.endDate) < new Date(form.startDate)) return "End date must be after start date.";
    return null;
  }

  async function checkAccountMappings(): Promise<{ ok: boolean; redirectTo?: string }> {
    const ids = Array.from(selectedIds);
    const checks = await Promise.all(
      ids.map((id) =>
        fetch(`/api/v1/connections/${id}/account-mapping`)
          .then((r) => r.json())
          .then((d: { allConfirmed?: boolean }) => ({ id, confirmed: d.allConfirmed ?? false }))
          .catch(() => ({ id, confirmed: false }))
      )
    );
    const unconfirmed = checks.find((c) => !c.confirmed);
    if (unconfirmed) {
      return {
        ok:        false,
        redirectTo: `/connections/${unconfirmed.id}/account-mapping?returnTo=%2Fclose`,
      };
    }
    return { ok: true };
  }

  async function goToStep2() {
    setError("");
    const validation = canAdvanceFromStep1();
    if (validation) { setError(validation); return; }

    const mapCheck = await checkAccountMappings();
    if (!mapCheck.ok && mapCheck.redirectTo) {
      onOpenChange(false);
      window.location.href = mapCheck.redirectTo;
      return;
    }

    if (!hints) await fetchHints();

    // Skip Step 2 for non-ADAPTIVE profiles — go straight to preview
    if (form.profile !== "ADAPTIVE") {
      void goToStep3();
      return;
    }
    setStep(2);
  }

  async function goToStep3(opts: { force?: boolean } = {}) {
    setError("");
    if (
      step === 2 &&
      form.profile === "ADAPTIVE" &&
      userIntent.trim().length === 0 &&
      !opts.force &&
      !emptyIntentWarning
    ) {
      setEmptyIntentWarning(true);
      return;
    }
    setEmptyIntentWarning(false);
    setStep(3);
    setLoadingPreview(true);
    setPreviewError("");
    try {
      const res = await fetch("/api/v1/close/periods/preview", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: primaryConnId,
          startDate:    new Date(form.startDate).toISOString(),
          endDate:      new Date(form.endDate).toISOString(),
          profile:      form.profile,
          userIntent:   form.profile === "ADAPTIVE" ? userIntent : undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json() as { error?: string; detail?: string };
        setPreviewError(errBody.detail ?? errBody.error ?? "Failed to generate preview.");
        return;
      }
      setPreview(await res.json() as PreviewResponse);
    } catch (err) {
      setPreviewError((err as Error).message ?? "Network error");
    } finally {
      setLoadingPreview(false);
    }
  }

  function back() {
    setError("");
    if (step === 3) setStep(form.profile === "ADAPTIVE" ? 2 : 1);
    else if (step === 2) setStep(1);
  }

  // ── Final submit ────────────────────────────────────────────────────────

  async function handleCreate() {
    setError("");
    setSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/v1/close/periods", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionIds:        ids,
          name:                 form.name.trim(),
          startDate:            new Date(form.startDate).toISOString(),
          endDate:              new Date(form.endDate).toISOString(),
          targetCompletionDate: form.targetCompletionDate
            ? new Date(form.targetCompletionDate).toISOString()
            : undefined,
          mode:                 "adaptive",
          profile:              form.profile,
          userIntent:           form.profile === "ADAPTIVE" ? userIntent : undefined,
          intentSummary:        preview?.intent ?? undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json() as { error?: string };
        setError(typeof errBody.error === "string" ? errBody.error : "Failed to create period.");
        return;
      }

      const period = await res.json() as { id: string; reasoning?: string[] };
      if (period.reasoning && typeof window !== "undefined") {
        sessionStorage.setItem(`close-reasoning-${period.id}`, JSON.stringify(period.reasoning));
      }
      onCreated(period);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── "Same as last close" handlers ───────────────────────────────────────

  function requestApplyLastClose() {
    if (!prefs?.hasPrevious) return;
    setShowLastClosePreview(true);
  }

  function applyLastClose() {
    if (!prefs?.hasPrevious) return;
    setForm((f) => ({ ...f, profile: prefs.lastProfile ?? "STANDARD" }));
    if (prefs.lastIntent) setUserIntent(prefs.lastIntent);
    setShowLastClosePreview(false);
  }

  function cancelApplyLastClose() {
    setShowLastClosePreview(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>New Close Period</DialogTitle>
            <StepIndicator step={step} hasIntent={form.profile === "ADAPTIVE"} />
          </div>
          {/* Mobile-only compact step indicator */}
          <p className="sm:hidden text-xs text-slate-500 mt-1" aria-live="polite">
            <MobileStepLabel step={step} hasIntent={form.profile === "ADAPTIVE"} />
          </p>
        </DialogHeader>

        <div className="pt-2 space-y-5">
          {step === 1 && (
            <Step1Setup
              form={form}
              setForm={setForm}
              connections={connections}
              selectedIds={selectedIds}
              loadingConns={loadingConns}
              totalRows={totalRows}
              toggle={toggle}
              selectAll={selectAll}
              clearAll={clearAll}
              hints={hints}
              prefs={prefs}
              applyLastClose={applyLastClose}
              requestApplyLastClose={requestApplyLastClose}
              cancelApplyLastClose={cancelApplyLastClose}
              showLastClosePreview={showLastClosePreview}
              applyGlDates={applyGlDates}
            />
          )}

          {step === 2 && (
            <Step2Intent
              userIntent={userIntent}
              setUserIntent={setUserIntent}
              hints={hints}
              loadingHints={loadingHints}
              prefs={prefs}
              showEmptyWarning={emptyIntentWarning}
              onSwitchToStandard={() => {
                setForm((f) => ({ ...f, profile: "STANDARD" }));
                setEmptyIntentWarning(false);
                void goToStep3({ force: true });
              }}
            />
          )}

          {step === 3 && (
            <Step3Preview
              preview={preview}
              loading={loadingPreview}
              error={previewError}
              profile={form.profile}
              userIntent={userIntent}
            />
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4 border-t border-slate-100 mt-2">
          {step === 1 ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={goToStep2} disabled={selectedIds.size === 0}>
                {form.profile === "ADAPTIVE" ? "Next: describe focus" : "Next: preview"}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button type="button" onClick={() => { void goToStep3(); }}>
                Next: preview
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button type="button" onClick={handleCreate} disabled={saving || loadingPreview || !!previewError}>
                {saving
                  ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  : <Check className="h-4 w-4 mr-2" />}
                Create period
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

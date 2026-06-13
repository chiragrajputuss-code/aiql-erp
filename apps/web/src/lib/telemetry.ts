/**
 * Lightweight structured-log telemetry for API routes.
 *
 * Usage:
 *
 *   const t = telemetryStart("close.preview");
 *   // ... do work
 *   t.tag({ profile: "ADAPTIVE", hadIntent: true });
 *   t.done({ status: 200, taskCount: 14 });
 *
 * Output: a single JSON line per request, picked up by log aggregation.
 * No-ops in test envs to keep output clean.
 */

interface TelemetryHandle {
  /** Attach contextual fields to the eventual log line. Cheap to call. */
  tag(extra: Record<string, unknown>): void;
  /** Emit the final log line with duration_ms + result. */
  done(result?: Record<string, unknown>): void;
  /** Emit an error log line. Pairs with `done` semantically — use one or the other. */
  fail(err: unknown, result?: Record<string, unknown>): void;
}

export function telemetryStart(event: string, initial: Record<string, unknown> = {}): TelemetryHandle {
  const t0 = Date.now();
  const accumulated: Record<string, unknown> = { ...initial };

  const emit = (level: "info" | "error", payload: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
    // eslint-disable-next-line no-console
    const log = level === "error" ? console.error : console.log;
    log("[telemetry]", JSON.stringify({
      event,
      level,
      duration_ms: Date.now() - t0,
      ts: new Date().toISOString(),
      ...accumulated,
      ...payload,
    }));
  };

  return {
    tag(extra) { Object.assign(accumulated, extra); },
    done(result) { emit("info", result ?? {}); },
    fail(err, result) {
      const message = err instanceof Error ? err.message : String(err);
      emit("error", { error: message, ...(result ?? {}) });
    },
  };
}

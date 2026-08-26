-- Phase 3.6 (history API): persist RunDiff counts on the run itself so the
-- history list can be a single indexed query instead of recomputing the
-- diff (or worse, guessing from resolvedAt timestamps) for every past run.
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "newCount"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "carriedCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "resolvedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "resolvedRs"    DOUBLE PRECISION NOT NULL DEFAULT 0;

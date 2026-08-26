-- ============================================================
-- Migration: reasoning_tier1
-- Date: 2026-07-02
-- Additive & RDS-safe: ADD COLUMN IF NOT EXISTS only.
-- Adds the "one more thing" observation and Board Meeting Mode
-- brief to each investigation run (computed, LLM-narrated).
-- ============================================================

ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "proactiveObservationJson" TEXT;
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "boardBriefJson" TEXT;

-- ============================================================
-- Migration: investigation_engine
-- Date: 2026-06-26
-- Safe for AWS RDS: CREATE TYPE/TABLE IF NOT EXISTS, guarded FK
-- NEVER use prisma db push on production (drops dynamic tables)
-- ============================================================

-- ─── Enum: InvestigationRunStatus ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "InvestigationRunStatus" AS ENUM ('RUNNING', 'CURRENT', 'SUPERSEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table: investigation_runs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "investigation_runs" (
  "id"               TEXT NOT NULL,
  "orgId"            TEXT NOT NULL,
  "period"           TEXT NOT NULL,
  "snapshotId"       TEXT NOT NULL,
  "resolvedAt"       TIMESTAMP(3) NOT NULL,
  "status"           "InvestigationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "triggeredBy"      TEXT NOT NULL,
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"      TIMESTAMP(3),
  "durationMs"       INTEGER,
  "healthScore"      INTEGER,
  "totalImpactRs"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "criticalCount"    INTEGER NOT NULL DEFAULT 0,
  "warningCount"     INTEGER NOT NULL DEFAULT 0,
  "opportunityCount" INTEGER NOT NULL DEFAULT 0,
  "executiveSummary" TEXT,
  "investigationsJson" TEXT NOT NULL,

  CONSTRAINT "investigation_runs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "investigation_runs"
    ADD CONSTRAINT "investigation_runs_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organisations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "investigation_runs_orgId_status_idx"
  ON "investigation_runs" ("orgId", "status");

CREATE INDEX IF NOT EXISTS "investigation_runs_orgId_period_idx"
  ON "investigation_runs" ("orgId", "period");

-- ─── Table: investigation_findings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "investigation_findings" (
  "id"                 TEXT NOT NULL,
  "runId"              TEXT NOT NULL,
  "investigationId"    TEXT NOT NULL,
  "code"               TEXT NOT NULL,
  "category"           TEXT NOT NULL,
  "severity"           TEXT NOT NULL,
  "title"              TEXT NOT NULL,
  "impactRs"           DOUBLE PRECISION,
  "businessQuestion"   TEXT NOT NULL,
  "conclusion"         TEXT NOT NULL,
  "llmSummary"         TEXT,
  "evidenceJson"       TEXT NOT NULL,
  "recommendationJson" TEXT NOT NULL,
  "verificationJson"   TEXT NOT NULL,
  "resolvesWhen"       TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'open',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "investigation_findings_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "investigation_findings"
    ADD CONSTRAINT "investigation_findings_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "investigation_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "investigation_findings_runId_severity_idx"
  ON "investigation_findings" ("runId", "severity");

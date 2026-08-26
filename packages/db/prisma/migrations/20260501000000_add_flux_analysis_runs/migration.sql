CREATE TABLE "flux_analysis_runs" (
  "id"                 TEXT NOT NULL,
  "taskId"             TEXT NOT NULL,
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd"   TIMESTAMP(3) NOT NULL,
  "priorPeriodStart"   TIMESTAMP(3) NOT NULL,
  "priorPeriodEnd"     TIMESTAMP(3) NOT NULL,
  "totalAccounts"      INTEGER NOT NULL DEFAULT 0,
  "materialCount"      INTEGER NOT NULL DEFAULT 0,
  "totalAbsVariance"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "resultJson"         TEXT NOT NULL,
  "durationMs"         INTEGER NOT NULL DEFAULT 0,
  "lastRunAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "flux_analysis_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flux_analysis_runs_taskId_key" UNIQUE ("taskId")
);

ALTER TABLE "flux_analysis_runs"
  ADD CONSTRAINT "flux_analysis_runs_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "close_tasks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

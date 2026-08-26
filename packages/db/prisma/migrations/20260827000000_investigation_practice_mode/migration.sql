-- Practice mode: per-client investigation runs, cross-run finding continuity,
-- per-client column mappings. Written by hand and applied via
-- `prisma migrate deploy` — this project's DB is AWS RDS, so `prisma db push`
-- must never be used. Every statement is idempotent so this is safe to re-run.

-- ── InvestigationRun: which client book, and what it was diffed against ─────
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "comparedToRunId" TEXT;

DO $$ BEGIN
  ALTER TABLE "investigation_runs"
    ADD CONSTRAINT "investigation_runs_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Replaces the old (orgId, period) index — a client-scoped lookup is now the
-- common query shape (report/history/run routes all filter by connectionId).
DROP INDEX IF EXISTS "investigation_runs_orgId_period_idx";
CREATE INDEX IF NOT EXISTS "investigation_runs_orgId_connectionId_period_idx"
  ON "investigation_runs" ("orgId", "connectionId", "period");

-- ── InvestigationFinding: cross-run continuity (NEW / CARRIED / RESOLVED) ───
ALTER TABLE "investigation_findings" ADD COLUMN IF NOT EXISTS "changeStatus"    TEXT;
ALTER TABLE "investigation_findings" ADD COLUMN IF NOT EXISTS "firstSeenPeriod" TEXT;
ALTER TABLE "investigation_findings" ADD COLUMN IF NOT EXISTS "resolvedAt"      TIMESTAMP(3);
ALTER TABLE "investigation_findings" ADD COLUMN IF NOT EXISTS "matchKey"        TEXT;

CREATE INDEX IF NOT EXISTS "investigation_findings_runId_changeStatus_idx"
  ON "investigation_findings" ("runId", "changeStatus");
CREATE INDEX IF NOT EXISTS "investigation_findings_matchKey_idx"
  ON "investigation_findings" ("matchKey");

-- Existing rows predate practice mode: leave changeStatus/matchKey NULL
-- (unknown), never fabricate "new" for history we didn't actually diff.

-- ── OrgColumnMapping: scope mappings to a client, not the whole org ─────────
ALTER TABLE "org_column_mappings" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;

DO $$ BEGIN
  ALTER TABLE "org_column_mappings"
    ADD CONSTRAINT "org_column_mappings_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The original constraint (org, sourceColumnName) would let client A's
-- mapping silently overwrite client B's the moment two connections exist
-- under one org. Replace it with a COALESCE-based unique index: NULL
-- connectionId (an org-level default) still collapses to one row per column
-- name, while each real connectionId gets its own independent mapping.
-- Prisma's schema-level @@unique([orgId, connectionId, sourceColumnName])
-- does not express the NULL-collapsing behaviour on its own (Postgres treats
-- distinct NULLs as non-equal in a plain composite unique index) — this
-- expression index is what actually enforces it; the schema-level annotation
-- documents intent for anyone reading schema.prisma.
DROP INDEX IF EXISTS "org_column_mappings_orgId_sourceColumnName_key";
CREATE UNIQUE INDEX IF NOT EXISTS "org_column_mappings_org_conn_col_key"
  ON "org_column_mappings" ("orgId", COALESCE("connectionId", ''), "sourceColumnName");

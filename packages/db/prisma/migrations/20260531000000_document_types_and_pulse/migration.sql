-- ============================================================
-- Migration: document_types_and_pulse
-- Date: 2026-05-31
-- Safe for AWS RDS: uses ADD COLUMN IF NOT EXISTS throughout
-- NEVER use prisma db push on production (drops dynamic tables)
-- ============================================================

-- ─── New Enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM (
    'GL',
    'TDS_RETURN_26Q',
    'GSTR_1',
    'GSTR_3B',
    'ITR',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UploadDataIntent" AS ENUM (
    'CURRENT_OPERATIONAL',
    'HISTORICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PulseCadence" AS ENUM (
    'DAILY',
    'WEEKLY',
    'OFF'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Alter uploaded_files — add document type metadata ────────────────────────

ALTER TABLE "uploaded_files"
  ADD COLUMN IF NOT EXISTS "documentType"       "DocumentType" NOT NULL DEFAULT 'GL',
  ADD COLUMN IF NOT EXISTS "dataIntent"         "UploadDataIntent" NOT NULL DEFAULT 'CURRENT_OPERATIONAL',
  ADD COLUMN IF NOT EXISTS "detectedType"       "DocumentType",
  ADD COLUMN IF NOT EXISTS "detectedConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "periodStart"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "periodEnd"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "userConfirmedType"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "schemaVersion"      TEXT;

-- ─── Alter query_logs — add user feedback field ───────────────────────────────

ALTER TABLE "query_logs"
  ADD COLUMN IF NOT EXISTS "feedback" TEXT;

-- ─── Create workspace_documents ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workspace_documents" (
    "id"                 TEXT NOT NULL,
    "connectionId"       TEXT NOT NULL,
    "documentType"       "DocumentType" NOT NULL,
    "dataIntent"         "UploadDataIntent" NOT NULL DEFAULT 'CURRENT_OPERATIONAL',
    "originalName"       TEXT NOT NULL,
    "mimeType"           TEXT NOT NULL,
    "sizeBytes"          INTEGER NOT NULL,
    "rowCount"           INTEGER NOT NULL DEFAULT 0,
    "tableName"          TEXT NOT NULL,
    "columnMapping"      TEXT NOT NULL,
    "s3Key"              TEXT,
    "expiresAt"          TIMESTAMP(3) NOT NULL,
    "detectedType"       "DocumentType",
    "detectedConfidence" DOUBLE PRECISION,
    "periodStart"        TIMESTAMP(3),
    "periodEnd"          TIMESTAMP(3),
    "userConfirmedType"  BOOLEAN NOT NULL DEFAULT false,
    "schemaVersion"      TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_documents_connectionId_documentType_idx"
  ON "workspace_documents"("connectionId", "documentType");

ALTER TABLE "workspace_documents"
  DROP CONSTRAINT IF EXISTS "workspace_documents_connectionId_fkey";

ALTER TABLE "workspace_documents"
  ADD CONSTRAINT "workspace_documents_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Create pulse_subscriptions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pulse_subscriptions" (
    "id"                TEXT NOT NULL,
    "orgId"             TEXT NOT NULL,
    "connectionId"      TEXT NOT NULL,
    "cadence"           "PulseCadence" NOT NULL DEFAULT 'WEEKLY',
    "emailEnabled"      BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled"      BOOLEAN NOT NULL DEFAULT true,
    "snoozedCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt"        TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pulse_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pulse_subscriptions_connectionId_key"
  ON "pulse_subscriptions"("connectionId");

CREATE INDEX IF NOT EXISTS "pulse_subscriptions_orgId_idx"
  ON "pulse_subscriptions"("orgId");

ALTER TABLE "pulse_subscriptions"
  DROP CONSTRAINT IF EXISTS "pulse_subscriptions_orgId_fkey";

ALTER TABLE "pulse_subscriptions"
  ADD CONSTRAINT "pulse_subscriptions_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pulse_subscriptions"
  DROP CONSTRAINT IF EXISTS "pulse_subscriptions_connectionId_fkey";

ALTER TABLE "pulse_subscriptions"
  ADD CONSTRAINT "pulse_subscriptions_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Create pulse_digests ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pulse_digests" (
    "id"             TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "connectionId"   TEXT NOT NULL,
    "digestJson"     TEXT NOT NULL,
    "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailSentAt"    TIMESTAMP(3),
    "emailDelivered" BOOLEAN NOT NULL DEFAULT false,
    "shareToken"     TEXT NOT NULL,

    CONSTRAINT "pulse_digests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pulse_digests_shareToken_key"
  ON "pulse_digests"("shareToken");

CREATE INDEX IF NOT EXISTS "pulse_digests_connectionId_generatedAt_idx"
  ON "pulse_digests"("connectionId", "generatedAt");

ALTER TABLE "pulse_digests"
  DROP CONSTRAINT IF EXISTS "pulse_digests_subscriptionId_fkey";

ALTER TABLE "pulse_digests"
  ADD CONSTRAINT "pulse_digests_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "pulse_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Create pulse_alerts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pulse_alerts" (
    "id"           TEXT NOT NULL,
    "digestId"     TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "category"     TEXT NOT NULL,
    "severity"     TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "detail"       TEXT,
    "actionUrl"    TEXT,
    "detailJson"   TEXT,
    "isSnoozed"    BOOLEAN NOT NULL DEFAULT false,
    "snoozedAt"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pulse_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pulse_alerts_connectionId_createdAt_idx"
  ON "pulse_alerts"("connectionId", "createdAt");

ALTER TABLE "pulse_alerts"
  DROP CONSTRAINT IF EXISTS "pulse_alerts_digestId_fkey";

ALTER TABLE "pulse_alerts"
  ADD CONSTRAINT "pulse_alerts_digestId_fkey"
  FOREIGN KEY ("digestId") REFERENCES "pulse_digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

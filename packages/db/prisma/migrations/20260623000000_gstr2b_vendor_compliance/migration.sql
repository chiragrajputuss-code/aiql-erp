-- ============================================================
-- Migration: gstr2b_vendor_compliance
-- Date: 2026-06-23
-- Safe for AWS RDS: ALTER TYPE ADD VALUE + CREATE TABLE IF NOT EXISTS
-- NEVER use prisma db push on production (drops dynamic tables)
-- ============================================================

-- ─── Add GSTR_2B to DocumentType enum ────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in some
-- Postgres versions, so this must be its own statement (no DO $$ wrapper).
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'GSTR_2B';

-- ─── New table: vendor_compliance_records ────────────────────────────────────
-- Persisted per-vendor GST-filing risk, written once per processed GSTR-2B
-- reconciliation run. Must survive the 90-day expiry on workspace_documents.

CREATE TABLE IF NOT EXISTS "vendor_compliance_records" (
  "id"             TEXT NOT NULL,
  "connectionId"   TEXT NOT NULL,
  "vendorName"     TEXT NOT NULL,
  "vendorGstin"    TEXT,
  "period"         TEXT NOT NULL,
  "invoicesTotal"  INTEGER NOT NULL,
  "invoicesAtRisk" INTEGER NOT NULL,
  "amountAtRisk"   DOUBLE PRECISION NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vendor_compliance_records_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "vendor_compliance_records"
    ADD CONSTRAINT "vendor_compliance_records_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_compliance_records_connectionId_vendorName_period_key"
  ON "vendor_compliance_records" ("connectionId", "vendorName", "period");

CREATE INDEX IF NOT EXISTS "vendor_compliance_records_connectionId_vendorGstin_idx"
  ON "vendor_compliance_records" ("connectionId", "vendorGstin");

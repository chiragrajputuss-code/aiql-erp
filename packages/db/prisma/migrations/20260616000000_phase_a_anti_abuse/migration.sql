-- Phase A anti-abuse fields on organisations
ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "signupIp"            TEXT,
  ADD COLUMN IF NOT EXISTS "deviceFingerprint"   TEXT,
  ADD COLUMN IF NOT EXISTS "lifetimeQueriesUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "closeRunsUsed"       INTEGER NOT NULL DEFAULT 0;

-- Signup abuse log table
CREATE TABLE IF NOT EXISTS "signup_abuse_logs" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "ip"          TEXT NOT NULL,
  "fingerprint" TEXT,
  "email"       TEXT NOT NULL,
  "orgId"       TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "signup_abuse_logs_ip_createdAt_idx"
  ON "signup_abuse_logs"("ip", "createdAt");

CREATE INDEX IF NOT EXISTS "signup_abuse_logs_fingerprint_idx"
  ON "signup_abuse_logs"("fingerprint");

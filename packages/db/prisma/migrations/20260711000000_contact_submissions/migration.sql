-- Inbound contact / demo requests from the public site.
-- Idempotent (IF NOT EXISTS) so it is safe to re-run against RDS.

CREATE TABLE IF NOT EXISTS "contact_submissions" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "subject"    TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "emailed"    BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contact_submissions_createdAt_idx" ON "contact_submissions" ("createdAt");
CREATE INDEX IF NOT EXISTS "contact_submissions_email_idx"     ON "contact_submissions" ("email");

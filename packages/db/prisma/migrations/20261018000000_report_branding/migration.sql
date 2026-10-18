-- Client-report branding: the firm name + contact line shown as "Prepared by"
-- on the client-facing Health Check PDF. Null falls back to the org name.
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "reportBrandName"    TEXT;
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "reportBrandContact" TEXT;

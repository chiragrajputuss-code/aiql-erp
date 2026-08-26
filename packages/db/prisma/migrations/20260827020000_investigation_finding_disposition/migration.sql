-- Phase 3.7 (resolved-value ledger): a human-confirmed disposition on a
-- resolved finding — "Recovered" or "Was not an issue" — since AcctQAI can
-- prove a finding no longer appears but not that money reached a bank
-- account. Also produces the disposition labels needed to tune precision.
ALTER TABLE "investigation_findings" ADD COLUMN IF NOT EXISTS "disposition"   TEXT;
ALTER TABLE "investigation_findings" ADD COLUMN IF NOT EXISTS "dispositionAt" TIMESTAMP(3);

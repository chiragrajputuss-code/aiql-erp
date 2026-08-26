-- Add connectionIds array to close_periods
ALTER TABLE "close_periods"
  ADD COLUMN "connectionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: existing rows get [connectionId] as their array
UPDATE "close_periods"
  SET "connectionIds" = ARRAY["connectionId"]
  WHERE array_length("connectionIds", 1) IS NULL;

-- CreateEnum
CREATE TYPE "CloseProfile" AS ENUM ('STANDARD', 'QUICK', 'YEAR_END', 'ADAPTIVE');

-- AlterTable
ALTER TABLE "close_periods"
  ADD COLUMN "closeProfile"        "CloseProfile" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "userIntent"          TEXT,
  ADD COLUMN "intentSummaryJson"   TEXT,
  ADD COLUMN "customWatchItems"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "profileSnapshotJson" TEXT;

-- CreateTable
CREATE TABLE "org_close_preferences" (
    "id"                     TEXT NOT NULL,
    "orgId"                  TEXT NOT NULL,
    "lastProfile"            "CloseProfile",
    "lastIntent"             TEXT,
    "lastIntentSummaryJson"  TEXT,
    "lastCustomWatchItems"   TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastClosedAt"           TIMESTAMP(3),
    "usageCountJson"         TEXT NOT NULL DEFAULT '{}',
    "recurringPatternsJson"  TEXT NOT NULL DEFAULT '[]',
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_close_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_close_preferences_orgId_key" ON "org_close_preferences"("orgId");

-- AddForeignKey
ALTER TABLE "org_close_preferences"
  ADD CONSTRAINT "org_close_preferences_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organisations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

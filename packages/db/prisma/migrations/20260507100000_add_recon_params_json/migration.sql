-- AlterTable
ALTER TABLE "reconciliations"
  ADD COLUMN "paramsJson" TEXT NOT NULL DEFAULT '[]';

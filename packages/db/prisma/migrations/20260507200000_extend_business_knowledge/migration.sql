-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('SCAN_ISSUE', 'RECONCILIATION', 'FLUX_VARIANCE', 'AGENT_QUESTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "KnowledgeVerdict" AS ENUM ('NORMAL', 'INVESTIGATE', 'ANNOTATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AutoApplyPolicy" AS ENUM ('ALWAYS', 'ONCE', 'NEVER');

-- AlterTable
ALTER TABLE "org_business_knowledge"
  ADD COLUMN "source"        "KnowledgeSource"  NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "sourceRefJson" TEXT,
  ADD COLUMN "verdict"       "KnowledgeVerdict" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "annotation"    TEXT,
  ADD COLUMN "autoApply"     "AutoApplyPolicy"  NOT NULL DEFAULT 'ALWAYS',
  ADD COLUMN "historyJson"   TEXT               NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "org_business_knowledge_orgId_source_idx" ON "org_business_knowledge"("orgId", "source");

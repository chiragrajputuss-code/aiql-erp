-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ErpType" AS ENUM ('TALLY', 'ZOHO_BOOKS', 'QUICKBOOKS', 'XERO', 'SAP', 'ORACLE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'LOW_CONFIDENCE');

-- CreateEnum
CREATE TYPE "ClosePeriodStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CloseTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('RECONCILIATION', 'REVIEW', 'APPROVAL', 'FLUX_ANALYSIS', 'REPORTING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SensitivityLevel" AS ENUM ('STANDARD', 'HIGH', 'MAXIMUM');

-- CreateEnum
CREATE TYPE "LLMProvider" AS ENUM ('AIQL_MANAGED', 'AZURE_OPENAI', 'OPENAI', 'GEMINI', 'GROQ', 'OLLAMA');

-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "queriesUsed" INTEGER NOT NULL DEFAULT 0,
    "queryLimit" INTEGER NOT NULL DEFAULT 500,
    "queriesResetAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "llmProvider" "LLMProvider",
    "llmApiKey" TEXT,
    "llmModel" TEXT,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "notifySlack" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "orgId" TEXT NOT NULL,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokenisation_configs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tokeniseVendors" BOOLEAN NOT NULL DEFAULT true,
    "tokeniseCustomers" BOOLEAN NOT NULL DEFAULT true,
    "tokeniseEmployees" BOOLEAN NOT NULL DEFAULT true,
    "tokeniseAmounts" BOOLEAN NOT NULL DEFAULT true,
    "tokeniseAccounts" BOOLEAN NOT NULL DEFAULT true,
    "tokeniseProjects" BOOLEAN NOT NULL DEFAULT true,
    "sensitivityLevel" "SensitivityLevel" NOT NULL DEFAULT 'STANDARD',
    "accountPattern" TEXT,
    "customEntities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customStripList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokenisation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_connections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "erpType" "ErpType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "credentialsArn" TEXT NOT NULL,
    "schemaCacheJson" TEXT,
    "schemaCachedAt" TIMESTAMP(3),
    "entityDictionaryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_logs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT,
    "question" TEXT NOT NULL,
    "tokenisedQuestion" TEXT,
    "generatedSql" TEXT,
    "confidence" DOUBLE PRECISION,
    "verdict" TEXT,
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "executionTimeMs" INTEGER,
    "fromCache" BOOLEAN NOT NULL DEFAULT false,
    "fromTemplate" TEXT,
    "status" "QueryStatus" NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER,
    "errorMessage" TEXT,
    "tokenisationAuditJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "close_periods" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "status" "ClosePeriodStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "targetCompletionDate" TIMESTAMP(3),
    "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "close_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "close_tasks" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "autoComplete" BOOLEAN NOT NULL DEFAULT false,
    "status" "CloseTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dependsOnIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "close_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceQuery" TEXT NOT NULL,
    "targetQuery" TEXT NOT NULL,
    "detailQuery" TEXT,
    "varianceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ReconStatus" NOT NULL DEFAULT 'PENDING',
    "sourceBalance" DOUBLE PRECISION,
    "targetBalance" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "aiExplanation" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "tokenisation_configs_orgId_key" ON "tokenisation_configs"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokenisation_configs" ADD CONSTRAINT "tokenisation_configs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_connections" ADD CONSTRAINT "erp_connections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_periods" ADD CONSTRAINT "close_periods_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_periods" ADD CONSTRAINT "close_periods_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_tasks" ADD CONSTRAINT "close_tasks_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "close_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_tasks" ADD CONSTRAINT "close_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "close_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

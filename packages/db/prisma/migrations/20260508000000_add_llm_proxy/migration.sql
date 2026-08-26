-- CreateEnum
CREATE TYPE "LlmProxyProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GROQ', 'AZURE_OPENAI');

-- CreateTable
CREATE TABLE "llm_proxy_api_keys" (
    "id"           TEXT NOT NULL,
    "orgId"        TEXT NOT NULL,
    "provider"     "LlmProxyProvider" NOT NULL,
    "name"         TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyTail"      TEXT NOT NULL,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt"   TIMESTAMP(3),
    "callCount"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_proxy_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_proxy_api_keys_orgId_provider_idx" ON "llm_proxy_api_keys"("orgId", "provider");

-- AddForeignKey
ALTER TABLE "llm_proxy_api_keys"
  ADD CONSTRAINT "llm_proxy_api_keys_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organisations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "llm_proxy_audit_logs" (
    "id"               TEXT NOT NULL,
    "orgId"            TEXT NOT NULL,
    "provider"         "LlmProxyProvider" NOT NULL,
    "model"            TEXT NOT NULL,
    "maskedJson"       TEXT NOT NULL DEFAULT '[]',
    "promptChars"      INTEGER NOT NULL DEFAULT 0,
    "responseChars"    INTEGER NOT NULL DEFAULT 0,
    "tokensIn"         INTEGER NOT NULL DEFAULT 0,
    "tokensOut"        INTEGER NOT NULL DEFAULT 0,
    "upstreamStatus"   INTEGER NOT NULL DEFAULT 0,
    "knowledgeApplied" INTEGER NOT NULL DEFAULT 0,
    "durationMs"       INTEGER NOT NULL DEFAULT 0,
    "errorMessage"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_proxy_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_proxy_audit_logs_orgId_createdAt_idx" ON "llm_proxy_audit_logs"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "llm_proxy_audit_logs"
  ADD CONSTRAINT "llm_proxy_audit_logs_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organisations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

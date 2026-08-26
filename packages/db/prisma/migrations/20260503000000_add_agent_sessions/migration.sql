-- Agent Sessions
CREATE TABLE "agent_sessions" (
  "id"               TEXT NOT NULL,
  "orgId"            TEXT NOT NULL,
  "taskId"           TEXT,
  "agentType"        TEXT NOT NULL,
  "state"            TEXT NOT NULL DEFAULT 'investigating',
  "iteration"        INTEGER NOT NULL DEFAULT 0,
  "toolCallCount"    INTEGER NOT NULL DEFAULT 0,
  "totalCostInr"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalTokensIn"    INTEGER NOT NULL DEFAULT 0,
  "totalTokensOut"   INTEGER NOT NULL DEFAULT 0,
  "durationMs"       INTEGER NOT NULL DEFAULT 0,
  "stopReason"       TEXT,
  "conversationJson" TEXT NOT NULL DEFAULT '[]',
  "toolCallsJson"    TEXT NOT NULL DEFAULT '[]',
  "reasoningJson"    TEXT NOT NULL DEFAULT '[]',
  "questionsJson"    TEXT,
  "answersJson"      TEXT NOT NULL DEFAULT '[]',
  "reportJson"       TEXT,
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"      TIMESTAMP(3),

  CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_sessions_orgId_idx"  ON "agent_sessions"("orgId");
CREATE INDEX "agent_sessions_taskId_idx" ON "agent_sessions"("taskId");

ALTER TABLE "agent_sessions"
  ADD CONSTRAINT "agent_sessions_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "agent_sessions_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "close_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Org Business Knowledge
CREATE TABLE "org_business_knowledge" (
  "id"                   TEXT NOT NULL,
  "orgId"                TEXT NOT NULL,
  "connectionId"         TEXT,
  "patternKey"           TEXT NOT NULL,
  "context"              TEXT NOT NULL,
  "answer"               TEXT NOT NULL,
  "confidence"           DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "firstLearnedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReaffirmedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reaffirmationCount"   INTEGER NOT NULL DEFAULT 1,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_business_knowledge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_business_knowledge_orgId_connectionId_patternKey_key"
    UNIQUE ("orgId", "connectionId", "patternKey")
);

CREATE INDEX "org_business_knowledge_org_conn_idx"
  ON "org_business_knowledge"("orgId", "connectionId");

ALTER TABLE "org_business_knowledge"
  ADD CONSTRAINT "org_business_knowledge_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

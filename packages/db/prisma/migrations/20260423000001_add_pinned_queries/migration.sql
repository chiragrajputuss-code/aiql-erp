CREATE TABLE "pinned_queries" (
    "id"           TEXT NOT NULL,
    "orgId"        TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "templateId"   TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "position"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pinned_queries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pinned_queries_connectionId_templateId_key"
    ON "pinned_queries"("connectionId", "templateId");

ALTER TABLE "pinned_queries"
    ADD CONSTRAINT "pinned_queries_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pinned_queries"
    ADD CONSTRAINT "pinned_queries_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

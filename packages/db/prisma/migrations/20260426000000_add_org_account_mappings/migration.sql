CREATE TABLE "org_account_mappings" (
  "id"           TEXT NOT NULL,
  "orgId"        TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "accountName"  TEXT NOT NULL,
  "accountType"  TEXT NOT NULL,
  "confidence"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isConfirmed"  BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_account_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_account_mappings_connectionId_accountName_key"
    UNIQUE ("connectionId", "accountName")
);

ALTER TABLE "org_account_mappings"
  ADD CONSTRAINT "org_account_mappings_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "org_account_mappings_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

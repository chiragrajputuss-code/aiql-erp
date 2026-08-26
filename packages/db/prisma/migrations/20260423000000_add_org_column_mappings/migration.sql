-- CreateTable
CREATE TABLE "org_column_mappings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sourceColumnName" TEXT NOT NULL,
    "canonicalField" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_column_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_column_mappings_orgId_sourceColumnName_key" ON "org_column_mappings"("orgId", "sourceColumnName");

-- AddForeignKey
ALTER TABLE "org_column_mappings" ADD CONSTRAINT "org_column_mappings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

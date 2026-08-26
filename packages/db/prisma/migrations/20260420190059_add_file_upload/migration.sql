-- AlterEnum
ALTER TYPE "ErpType" ADD VALUE 'FILE_UPLOAD';

-- AlterTable
ALTER TABLE "erp_connections" ALTER COLUMN "credentialsArn" SET DEFAULT '';

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "tableName" TEXT NOT NULL,
    "columnMapping" TEXT NOT NULL,
    "s3Key" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_connectionId_key" ON "uploaded_files"("connectionId");

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

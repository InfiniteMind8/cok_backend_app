-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'COMMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "ImportSession" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "committedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "confirmedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdEntityId" TEXT,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSession_actorId_idx" ON "ImportSession"("actorId");

-- CreateIndex
CREATE INDEX "ImportSession_status_createdAt_idx" ON "ImportSession"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRecord_sessionId_status_idx" ON "ImportRecord"("sessionId", "status");

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

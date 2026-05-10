-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OK', 'WARNING', 'MISMATCH');

-- CreateTable
CREATE TABLE "ReconciliationReport" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReconciliationStatus" NOT NULL,
    "details" JSONB NOT NULL,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationReport_status_acknowledgedAt_idx" ON "ReconciliationReport"("status", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "ReconciliationReport_runAt_idx" ON "ReconciliationReport"("runAt");

-- AddForeignKey
ALTER TABLE "ReconciliationReport" ADD CONSTRAINT "ReconciliationReport_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

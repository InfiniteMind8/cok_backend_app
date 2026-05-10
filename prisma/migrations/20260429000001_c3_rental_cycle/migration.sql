-- CreateEnum
CREATE TYPE "CycleUnit" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'ENDING_SOON', 'EXPIRED', 'CANCELLED');

-- AlterTable: PropertyTenancy — add cycle tracking columns
ALTER TABLE "PropertyTenancy"
  ADD COLUMN "cycleUnit"      "CycleUnit"   NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "leaseStatus"    "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "nextPaymentDue" TIMESTAMP(3);

-- CreateTable: RentalExtensionRequest
CREATE TABLE "RentalExtensionRequest" (
  "id"                  TEXT         NOT NULL,
  "tenancyId"           TEXT         NOT NULL,
  "requestedById"       TEXT         NOT NULL,
  "requestedNewEndDate" TIMESTAMP(3) NOT NULL,
  "reason"              TEXT,
  "status"              "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"        TEXT,
  "reviewedAt"          TIMESTAMP(3),
  "decisionNote"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RentalExtensionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalExtensionRequest_tenancyId_idx" ON "RentalExtensionRequest"("tenancyId");
CREATE INDEX "RentalExtensionRequest_status_idx"    ON "RentalExtensionRequest"("status");
CREATE INDEX "RentalExtensionRequest_requestedById_idx" ON "RentalExtensionRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "RentalExtensionRequest" ADD CONSTRAINT "RentalExtensionRequest_tenancyId_fkey"
  FOREIGN KEY ("tenancyId") REFERENCES "PropertyTenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalExtensionRequest" ADD CONSTRAINT "RentalExtensionRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalExtensionRequest" ADD CONSTRAINT "RentalExtensionRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

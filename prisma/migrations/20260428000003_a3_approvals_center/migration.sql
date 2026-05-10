-- Migration: A.3 — Approvals Center (PropertyTransferRequest + VoucherRequest)

-- RequestStatus enum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- PropertyTransferRequest table
CREATE TABLE "PropertyTransferRequest" (
    "id"             TEXT NOT NULL,
    "propertyId"     TEXT NOT NULL,
    "fromUserId"     TEXT NOT NULL,
    "toUserId"       TEXT NOT NULL,
    "requestedBy"    TEXT NOT NULL,
    "notes"          TEXT,
    "status"         "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "declinedReason" TEXT,
    "reviewedBy"     TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyTransferRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyTransferRequest_status_idx" ON "PropertyTransferRequest"("status");
CREATE INDEX "PropertyTransferRequest_propertyId_idx" ON "PropertyTransferRequest"("propertyId");

ALTER TABLE "PropertyTransferRequest"
    ADD CONSTRAINT "PropertyTransferRequest_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- VoucherRequest table
CREATE TABLE "VoucherRequest" (
    "id"             TEXT NOT NULL,
    "recipientId"    TEXT NOT NULL,
    "requestedBy"    TEXT NOT NULL,
    "amountKcrd"     DECIMAL(20,8) NOT NULL,
    "description"    TEXT,
    "message"        TEXT,
    "expiresAt"      TIMESTAMP(3),
    "status"         "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "declinedReason" TEXT,
    "voucherCode"    TEXT,
    "reviewedBy"     TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherRequest_status_idx" ON "VoucherRequest"("status");
CREATE INDEX "VoucherRequest_recipientId_idx" ON "VoucherRequest"("recipientId");

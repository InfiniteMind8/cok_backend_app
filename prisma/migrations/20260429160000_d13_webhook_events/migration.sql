-- D.13: add soft-delete fields to User
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deactivationReason" TEXT;

-- D.13: WebhookEvent table for idempotency (svix-id as PK)
CREATE TABLE "WebhookEvent" (
    "id"             TEXT NOT NULL,
    "source"         TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "payload"        JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processedAt"    TIMESTAMP(3),
    "errorMessage"   TEXT,
    "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

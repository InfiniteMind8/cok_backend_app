-- A.2: Add effectiveTo to FeeSchedule (append-only history) and create AuditLog table

ALTER TABLE "FeeSchedule" ADD COLUMN "effectiveTo" TIMESTAMP(3);

CREATE INDEX "FeeSchedule_effectiveTo_idx" ON "FeeSchedule"("effectiveTo");

CREATE TABLE "AuditLog" (
    "id"        TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "entity"    TEXT NOT NULL,
    "entityId"  TEXT,
    "actorId"   TEXT NOT NULL,
    "before"    JSONB,
    "after"     JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

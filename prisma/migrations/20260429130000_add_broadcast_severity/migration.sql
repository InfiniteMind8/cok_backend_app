-- D.6: Add AnnouncementSeverity enum and emergency broadcast fields to CommunityUpdate

CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'URGENT', 'CRITICAL');

ALTER TABLE "CommunityUpdate" ADD COLUMN "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO';
ALTER TABLE "CommunityUpdate" ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CommunityUpdate_isEmergency_idx" ON "CommunityUpdate"("isEmergency");

-- CreateEnum
CREATE TYPE "AnnouncementTargetType" AS ENUM ('COMMUNITY_WIDE', 'ROLE', 'VISITOR_GROUP', 'SPECIFIC_USERS');

-- AlterTable
ALTER TABLE "CommunityUpdate" ADD COLUMN     "targetGroupId" TEXT,
ADD COLUMN     "targetRole" "Role",
ADD COLUMN     "targetType" "AnnouncementTargetType" NOT NULL DEFAULT 'COMMUNITY_WIDE',
ADD COLUMN     "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "VisitorGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VisitorGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorGroupMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "VisitorGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorGroup_name_key" ON "VisitorGroup"("name");

-- CreateIndex
CREATE INDEX "VisitorGroup_archived_idx" ON "VisitorGroup"("archived");

-- CreateIndex
CREATE INDEX "VisitorGroupMembership_userId_removedAt_idx" ON "VisitorGroupMembership"("userId", "removedAt");

-- CreateIndex
CREATE INDEX "VisitorGroupMembership_groupId_removedAt_idx" ON "VisitorGroupMembership"("groupId", "removedAt");

-- CreateIndex
CREATE INDEX "CommunityUpdate_targetType_idx" ON "CommunityUpdate"("targetType");

-- CreateIndex
CREATE INDEX "CommunityUpdate_targetGroupId_idx" ON "CommunityUpdate"("targetGroupId");

-- AddForeignKey
ALTER TABLE "CommunityUpdate" ADD CONSTRAINT "CommunityUpdate_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "VisitorGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroup" ADD CONSTRAINT "VisitorGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroupMembership" ADD CONSTRAINT "VisitorGroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroupMembership" ADD CONSTRAINT "VisitorGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VisitorGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroupMembership" ADD CONSTRAINT "VisitorGroupMembership_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

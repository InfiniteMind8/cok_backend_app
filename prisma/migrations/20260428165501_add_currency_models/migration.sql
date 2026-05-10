-- CreateEnum
CREATE TYPE "DisplayCurrency" AS ENUM ('KCRD', 'USD', 'GYD');

-- CreateEnum
CREATE TYPE "PromotionDirection" AS ENUM ('FIAT_TO_KCRD', 'KCRD_TO_FIAT');

-- CreateEnum
CREATE TYPE "PromotionEligibility" AS ENUM ('ALL', 'FOUNDING_MEMBERS', 'RESIDENTS_ONLY', 'SPECIFIC_USERS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'FIAT_CONVERSION';
ALTER TYPE "TransactionType" ADD VALUE 'CONVERSION_BONUS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayCurrency" "DisplayCurrency" NOT NULL DEFAULT 'KCRD',
ADD COLUMN     "foundingMember" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "vehiclePlates" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ConversionRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "DisplayCurrency" NOT NULL,
    "quoteCurrency" "DisplayCurrency" NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "setBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionPromotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bonusPercent" DECIMAL(5,2) NOT NULL,
    "direction" "PromotionDirection" NOT NULL,
    "eligibility" "PromotionEligibility" NOT NULL,
    "eligibleUserIds" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversionRate_baseCurrency_quoteCurrency_effectiveTo_idx" ON "ConversionRate"("baseCurrency", "quoteCurrency", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionRate_baseCurrency_quoteCurrency_effectiveFrom_key" ON "ConversionRate"("baseCurrency", "quoteCurrency", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ConversionPromotion_active_startsAt_endsAt_idx" ON "ConversionPromotion"("active", "startsAt", "endsAt");

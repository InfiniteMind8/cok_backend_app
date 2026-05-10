-- Migration: 20260428000004_b3_intake_forms
-- Prompt B.3: Intake form completion — schema extensions

-- New enums
CREATE TYPE "PropertyStatus" AS ENUM ('VACANT', 'OCCUPIED', 'UNDER_CONSTRUCTION');
CREATE TYPE "AttachmentEntityType" AS ENUM ('PROPERTY', 'USER', 'ISSUE', 'LEASE', 'VOUCHER_REQUEST');

-- Extend User with role-agnostic profile fields
ALTER TABLE "User"
  ADD COLUMN "preferredName"         TEXT,
  ADD COLUMN "phone"                 TEXT,
  ADD COLUMN "gender"                TEXT,
  ADD COLUMN "nationalIdType"        TEXT,
  ADD COLUMN "nationalIdNumber"      TEXT,
  ADD COLUMN "emergencyContactName"  TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "householdSize"         INTEGER,
  ADD COLUMN "vehiclePlates"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notes"                 TEXT;

-- Visitor-specific profile table
CREATE TABLE "VisitorProfile" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "visitPurpose"      TEXT,
  "expectedArrival"   TIMESTAMP(3),
  "expectedDeparture" TIMESTAMP(3),
  "hostId"            TEXT,
  CONSTRAINT "VisitorProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VisitorProfile_userId_key" ON "VisitorProfile"("userId");
ALTER TABLE "VisitorProfile"
  ADD CONSTRAINT "VisitorProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitorProfile"
  ADD CONSTRAINT "VisitorProfile_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vendor-specific profile table
CREATE TABLE "VendorProfile" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "businessName"         TEXT,
  "businessCategory"     TEXT,
  "payoutMethod"         TEXT,
  "kcrdWalletPreference" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");
ALTER TABLE "VendorProfile"
  ADD CONSTRAINT "VendorProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend Property with spec fields
ALTER TABLE "Property"
  ADD COLUMN "lotNumber"            TEXT,
  ADD COLUMN "sizeSqm"              DECIMAL(10,2),
  ADD COLUMN "bedrooms"             INTEGER,
  ADD COLUMN "bathrooms"            INTEGER,
  ADD COLUMN "parkingSpots"         INTEGER,
  ADD COLUMN "yearBuilt"            INTEGER,
  ADD COLUMN "propertyStatus"       "PropertyStatus" NOT NULL DEFAULT 'VACANT',
  ADD COLUMN "currentValuationKcrd" DECIMAL(20,2),
  ADD COLUMN "notes"                TEXT;

-- Extend PropertyTenancy with lease fields
ALTER TABLE "PropertyTenancy"
  ADD COLUMN "startDate"     TIMESTAMP(3),
  ADD COLUMN "endDate"       TIMESTAMP(3),
  ADD COLUMN "depositAmount" DECIMAL(20,2);

-- Extend Issue with report fields
ALTER TABLE "Issue"
  ADD COLUMN "title"             TEXT,
  ADD COLUMN "location"          TEXT,
  ADD COLUMN "propertyId"        TEXT,
  ADD COLUMN "contactPreference" TEXT;
ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Attachment table
CREATE TABLE "Attachment" (
  "id"         TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "sizeBytes"  BIGINT NOT NULL,
  "name"       TEXT NOT NULL,
  "entityType" "AttachmentEntityType" NOT NULL,
  "entityId"   TEXT NOT NULL,
  "fieldName"  TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");
CREATE INDEX "Attachment_uploadedBy_idx" ON "Attachment"("uploadedBy");

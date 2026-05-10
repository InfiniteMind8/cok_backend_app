-- D.11: Add encryption metadata fields to Attachment
ALTER TABLE "Attachment" ADD COLUMN "sha256" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attachment" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attachment" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attachment" ADD COLUMN "iv" BYTEA;

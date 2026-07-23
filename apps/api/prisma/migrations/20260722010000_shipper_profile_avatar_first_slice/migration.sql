ALTER TYPE "FilePurpose" ADD VALUE 'avatar';

ALTER TABLE "ShipperProfile" ADD COLUMN "avatarFileId" TEXT;

CREATE UNIQUE INDEX "ShipperProfile_avatarFileId_key" ON "ShipperProfile"("avatarFileId");

ALTER TABLE "ShipperProfile"
ADD CONSTRAINT "ShipperProfile_avatarFileId_fkey"
FOREIGN KEY ("avatarFileId") REFERENCES "FileObject"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

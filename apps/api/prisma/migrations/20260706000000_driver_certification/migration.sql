CREATE TYPE "CertificationStatus" AS ENUM ('unsubmitted', 'reviewing', 'approved', 'rejected');

CREATE TABLE "DriverIdentityCertification" (
    "driverId" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "identityNumber" TEXT NOT NULL,
    "identityFrontFileId" TEXT NOT NULL,
    "identityBackFileId" TEXT NOT NULL,
    "status" "CertificationStatus" NOT NULL DEFAULT 'reviewing',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverIdentityCertification_pkey" PRIMARY KEY ("driverId")
);

CREATE TABLE "DriverVehicleCertification" (
    "driverId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "vehicleLengthText" TEXT NOT NULL,
    "loadCapacityText" TEXT NOT NULL,
    "hasTailboard" BOOLEAN NOT NULL DEFAULT false,
    "drivingLicenseFileId" TEXT NOT NULL,
    "vehiclePhotoFileId" TEXT NOT NULL,
    "status" "CertificationStatus" NOT NULL DEFAULT 'reviewing',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverVehicleCertification_pkey" PRIMARY KEY ("driverId")
);

ALTER TABLE "DriverIdentityCertification"
ADD CONSTRAINT "DriverIdentityCertification_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverVehicleCertification"
ADD CONSTRAINT "DriverVehicleCertification_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

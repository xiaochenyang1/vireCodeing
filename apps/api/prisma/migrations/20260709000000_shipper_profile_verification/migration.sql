CREATE TABLE "ShipperIdentityVerification" (
    "shipperId" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "identityFrontFileId" TEXT NOT NULL,
    "identityBackFileId" TEXT NOT NULL,
    "faceVerified" BOOLEAN NOT NULL DEFAULT true,
    "status" "CertificationStatus" NOT NULL DEFAULT 'reviewing',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipperIdentityVerification_pkey" PRIMARY KEY ("shipperId")
);

CREATE TABLE "ShipperEnterpriseVerification" (
    "shipperId" TEXT NOT NULL,
    "enterpriseName" TEXT NOT NULL,
    "creditCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "legalId" TEXT NOT NULL,
    "enterprisePhone" TEXT NOT NULL,
    "licenseFileId" TEXT NOT NULL,
    "status" "CertificationStatus" NOT NULL DEFAULT 'reviewing',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipperEnterpriseVerification_pkey" PRIMARY KEY ("shipperId")
);

ALTER TABLE "ShipperIdentityVerification"
ADD CONSTRAINT "ShipperIdentityVerification_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipperEnterpriseVerification"
ADD CONSTRAINT "ShipperEnterpriseVerification_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

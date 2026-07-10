CREATE TYPE "DriverCertificationType" AS ENUM ('identity', 'vehicle');

CREATE TABLE "DriverCertificationReviewEvent" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "reviewerAdminId" TEXT NOT NULL,
    "certificationType" "DriverCertificationType" NOT NULL,
    "fromStatus" "CertificationStatus" NOT NULL,
    "toStatus" "CertificationStatus" NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCertificationReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DriverCertificationReviewEvent_driver_created_idx"
ON "DriverCertificationReviewEvent"("driverId", "createdAt");

CREATE INDEX "DriverCertificationReviewEvent_reviewer_created_idx"
ON "DriverCertificationReviewEvent"("reviewerAdminId", "createdAt");

ALTER TABLE "DriverCertificationReviewEvent"
ADD CONSTRAINT "DriverCertificationReviewEvent_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverCertificationReviewEvent"
ADD CONSTRAINT "DriverCertificationReviewEvent_reviewerAdminId_fkey"
FOREIGN KEY ("reviewerAdminId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "ShipperVerificationType" AS ENUM ('identity', 'enterprise');

CREATE TABLE "ShipperVerificationReviewEvent" (
    "id" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "reviewerAdminId" TEXT NOT NULL,
    "verificationType" "ShipperVerificationType" NOT NULL,
    "fromStatus" "CertificationStatus" NOT NULL,
    "toStatus" "CertificationStatus" NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipperVerificationReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipperVerificationReviewEvent_shipper_created_idx"
ON "ShipperVerificationReviewEvent"("shipperId", "createdAt");

CREATE INDEX "ShipperVerificationReviewEvent_reviewer_created_idx"
ON "ShipperVerificationReviewEvent"("reviewerAdminId", "createdAt");

ALTER TABLE "ShipperVerificationReviewEvent"
ADD CONSTRAINT "ShipperVerificationReviewEvent_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipperVerificationReviewEvent"
ADD CONSTRAINT "ShipperVerificationReviewEvent_reviewerAdminId_fkey"
FOREIGN KEY ("reviewerAdminId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

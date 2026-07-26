CREATE TABLE "ShipperInvoiceReviewEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerAdminId" TEXT NOT NULL,
    "fromStatus" "CertificationStatus" NOT NULL,
    "toStatus" "CertificationStatus" NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipperInvoiceReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipperInvoiceReviewEvent_application_created_idx"
ON "ShipperInvoiceReviewEvent"("applicationId", "createdAt");

CREATE INDEX "ShipperInvoiceReviewEvent_reviewer_created_idx"
ON "ShipperInvoiceReviewEvent"("reviewerAdminId", "createdAt");

ALTER TABLE "ShipperInvoiceReviewEvent"
ADD CONSTRAINT "ShipperInvoiceReviewEvent_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "ShipperInvoiceApplication"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipperInvoiceReviewEvent"
ADD CONSTRAINT "ShipperInvoiceReviewEvent_reviewerAdminId_fkey"
FOREIGN KEY ("reviewerAdminId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

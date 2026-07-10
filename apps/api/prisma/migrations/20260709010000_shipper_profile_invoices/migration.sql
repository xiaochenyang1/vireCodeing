CREATE TABLE "ShipperInvoiceApplication" (
    "id" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "invoiceTitleType" TEXT NOT NULL,
    "invoiceTitle" TEXT NOT NULL,
    "receiverEmail" TEXT NOT NULL,
    "orderIds" JSONB NOT NULL,
    "orderNos" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CertificationStatus" NOT NULL DEFAULT 'reviewing',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipperInvoiceApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipperInvoiceApplication_shipper_created_idx"
ON "ShipperInvoiceApplication"("shipperId", "createdAt");

ALTER TABLE "ShipperInvoiceApplication"
ADD CONSTRAINT "ShipperInvoiceApplication_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

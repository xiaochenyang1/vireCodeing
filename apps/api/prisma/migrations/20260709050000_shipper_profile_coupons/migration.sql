CREATE TABLE "ShipperCoupon" (
    "id" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'usable',
    "conditionText" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "minOrderAmountCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "sourceText" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedOrderNo" TEXT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ShipperCoupon_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipperCoupon_shipper_status_issued_idx" ON "ShipperCoupon"("shipperId", "status", "issuedAt");
CREATE INDEX "ShipperCoupon_shipper_valid_until_idx" ON "ShipperCoupon"("shipperId", "validUntil");

ALTER TABLE "ShipperCoupon" ADD CONSTRAINT "ShipperCoupon_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

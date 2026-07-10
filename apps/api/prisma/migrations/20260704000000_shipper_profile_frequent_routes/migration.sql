CREATE TABLE "ShipperFrequentRoutes" (
    "shipperId" TEXT NOT NULL,
    "routes" JSONB NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipperFrequentRoutes_pkey" PRIMARY KEY ("shipperId")
);

ALTER TABLE "ShipperFrequentRoutes"
ADD CONSTRAINT "ShipperFrequentRoutes_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

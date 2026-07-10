CREATE TABLE "ShipperAddressBook" (
    "shipperId" TEXT NOT NULL,
    "addresses" JSONB NOT NULL,
    "contacts" JSONB NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipperAddressBook_pkey" PRIMARY KEY ("shipperId")
);

ALTER TABLE "ShipperAddressBook"
ADD CONSTRAINT "ShipperAddressBook_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

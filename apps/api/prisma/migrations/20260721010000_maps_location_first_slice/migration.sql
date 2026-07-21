-- CreateEnum
CREATE TYPE "OrderLocationGeocodeStatus" AS ENUM ('none', 'sandbox', 'manual', 'failed');

-- CreateEnum
CREATE TYPE "DriverLocationSource" AS ENUM ('manual', 'device', 'sandbox');

-- AlterTable
ALTER TABLE "OrderLocation"
ADD COLUMN "latitude" DECIMAL(10,7),
ADD COLUMN "longitude" DECIMAL(10,7),
ADD COLUMN "geocodeStatus" "OrderLocationGeocodeStatus" NOT NULL DEFAULT 'none',
ADD COLUMN "geocodedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriverLocationSnapshot" (
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "source" "DriverLocationSource" NOT NULL DEFAULT 'device',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverLocationSnapshot_pkey" PRIMARY KEY ("driverId")
);

-- CreateIndex
CREATE INDEX "DriverLocationSnapshot_order_recorded_idx" ON "DriverLocationSnapshot"("orderId", "recordedAt");

-- CreateIndex
CREATE INDEX "DriverLocationSnapshot_recorded_idx" ON "DriverLocationSnapshot"("recordedAt");

-- AddForeignKey
ALTER TABLE "DriverLocationSnapshot" ADD CONSTRAINT "DriverLocationSnapshot_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationSnapshot" ADD CONSTRAINT "DriverLocationSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

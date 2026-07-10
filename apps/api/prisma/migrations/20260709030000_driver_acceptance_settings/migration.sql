-- CreateTable
CREATE TABLE "DriverAcceptanceSettings" (
    "driverId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "maxDistanceKm" INTEGER NOT NULL DEFAULT 50,
    "vehicleTypePreferences" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAcceptanceSettings_pkey" PRIMARY KEY ("driverId")
);

-- AddForeignKey
ALTER TABLE "DriverAcceptanceSettings" ADD CONSTRAINT "DriverAcceptanceSettings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

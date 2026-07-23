-- CreateTable
CREATE TABLE "DriverProfile" (
    "driverId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarFileId" TEXT,
    "phoneProtectionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "loginProtectionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "orderNotificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "promotionNotificationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "privacyConfirmedAt" TIMESTAMP(3),
    "privacyPolicyVersion" TEXT,
    "privacyPolicyVersionTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("driverId")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_avatarFileId_key" ON "DriverProfile"("avatarFileId");

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "FileObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_driverProfileAvatar_fkey" FOREIGN KEY ("driverProfileAvatar") REFERENCES "DriverProfile"("driverId") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('shipper', 'driver', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('login', 'register', 'reset');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('identity', 'cargo', 'exception', 'receipt', 'invoice');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('pending', 'uploaded', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userType" "UserType" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipperProfile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "identityStatus" TEXT NOT NULL DEFAULT 'unverified',
    "enterpriseStatus" TEXT NOT NULL DEFAULT 'unverified',

    CONSTRAINT "ShipperProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "AuthSession_refresh_lookup_idx" ON "AuthSession"("refreshTokenHash", "deviceId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_user_device_active_idx" ON "AuthSession"("userId", "deviceId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_user_active_idx" ON "AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "VerificationCode_active_lookup_idx" ON "VerificationCode"("phone", "purpose", "consumedAt", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationCode_rate_lookup_idx" ON "VerificationCode"("phone", "purpose", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipperProfile" ADD CONSTRAINT "ShipperProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DriverWithdrawalStatus" AS ENUM ('reviewing', 'paid', 'rejected');

-- CreateTable
CREATE TABLE "DriverWithdrawal" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "bankAccountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankAccountMasked" TEXT NOT NULL,
    "status" "DriverWithdrawalStatus" NOT NULL DEFAULT 'reviewing',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverWithdrawal_driver_created_idx" ON "DriverWithdrawal"("driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverWithdrawal" ADD CONSTRAINT "DriverWithdrawal_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

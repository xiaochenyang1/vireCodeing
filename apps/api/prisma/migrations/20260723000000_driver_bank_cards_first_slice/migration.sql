-- CreateTable
CREATE TABLE "DriverBankCard" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "bankAccountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankAccountNo" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DriverBankCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverBankCard_driver_account_unique" ON "DriverBankCard"("driverId", "bankAccountNo");

-- CreateIndex
CREATE INDEX "DriverBankCard_driver_created_idx" ON "DriverBankCard"("driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverBankCard" ADD CONSTRAINT "DriverBankCard_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

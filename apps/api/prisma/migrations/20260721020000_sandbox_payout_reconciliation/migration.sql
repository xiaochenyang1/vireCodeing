-- AlterTable
ALTER TABLE "DriverWithdrawal"
ADD COLUMN "payoutChannel" TEXT,
ADD COLUMN "providerPayoutNo" TEXT,
ADD COLUMN "payoutExecutedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DriverWithdrawal_provider_payout_no_idx" ON "DriverWithdrawal"("providerPayoutNo");

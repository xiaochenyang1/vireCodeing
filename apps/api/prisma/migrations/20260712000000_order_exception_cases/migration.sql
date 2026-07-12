-- CreateEnum
CREATE TYPE "OrderExceptionCaseSourceRole" AS ENUM ('shipper', 'driver');

-- CreateEnum
CREATE TYPE "OrderExceptionCaseStatus" AS ENUM ('pending', 'processing', 'resolved', 'closed');

-- CreateTable
CREATE TABLE "OrderExceptionCase" (
    "id" TEXT NOT NULL,
    "caseNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "sourceRole" "OrderExceptionCaseSourceRole" NOT NULL,
    "typeLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachmentFileIds" JSONB NOT NULL DEFAULT '[]',
    "status" "OrderExceptionCaseStatus" NOT NULL DEFAULT 'pending',
    "resolutionText" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderExceptionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderExceptionCaseAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "fromStatus" "OrderExceptionCaseStatus" NOT NULL,
    "toStatus" "OrderExceptionCaseStatus" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderExceptionCaseAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderExceptionCase_caseNo_key" ON "OrderExceptionCase"("caseNo");

-- CreateIndex
CREATE UNIQUE INDEX "OrderExceptionCase_sourceEventId_key" ON "OrderExceptionCase"("sourceEventId");

-- CreateIndex
CREATE INDEX "OrderExceptionCase_status_created_idx" ON "OrderExceptionCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderExceptionCase_order_created_idx" ON "OrderExceptionCase"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderExceptionCase_reporter_created_idx" ON "OrderExceptionCase"("reporterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderExceptionCaseAction_case_created_idx" ON "OrderExceptionCaseAction"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderExceptionCaseAction_admin_created_idx" ON "OrderExceptionCaseAction"("adminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderExceptionCase" ADD CONSTRAINT "OrderExceptionCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExceptionCase" ADD CONSTRAINT "OrderExceptionCase_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OrderEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExceptionCase" ADD CONSTRAINT "OrderExceptionCase_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExceptionCaseAction" ADD CONSTRAINT "OrderExceptionCaseAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "OrderExceptionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExceptionCaseAction" ADD CONSTRAINT "OrderExceptionCaseAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

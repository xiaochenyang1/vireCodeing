-- CreateEnum
CREATE TYPE "InboxMessageCategory" AS ENUM ('order', 'system', 'service', 'finance');

-- CreateEnum
CREATE TYPE "InboxMessageAudience" AS ENUM ('shipper', 'driver', 'admin');

-- CreateEnum
CREATE TYPE "PushDeliveryStatus" AS ENUM ('succeeded', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audience" "InboxMessageAudience" NOT NULL,
    "category" "InboxMessageCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNo" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "PushDeliveryStatus" NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxMessage_user_unread_created_idx" ON "InboxMessage"("userId", "unread", "createdAt");

-- CreateIndex
CREATE INDEX "InboxMessage_user_created_idx" ON "InboxMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxMessage_order_created_idx" ON "InboxMessage"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxMessage_reference_idx" ON "InboxMessage"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_message_created_idx" ON "PushDeliveryAttempt"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryAttempt_status_created_idx" ON "PushDeliveryAttempt"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDeliveryAttempt" ADD CONSTRAINT "PushDeliveryAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InboxMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

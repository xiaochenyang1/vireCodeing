-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('pending', 'processing', 'resolved');

-- CreateTable
CREATE TABLE "ShipperSupportTicket" (
    "id" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'pending',
    "statusHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipperSupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipperSupportTicket_shipper_created_idx" ON "ShipperSupportTicket"("shipperId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipperSupportTicket_shipper_status_created_idx" ON "ShipperSupportTicket"("shipperId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ShipperSupportTicket" ADD CONSTRAINT "ShipperSupportTicket_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

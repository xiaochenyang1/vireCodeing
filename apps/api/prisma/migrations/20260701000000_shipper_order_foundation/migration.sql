-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('waiting', 'loading', 'transporting', 'confirming', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('fixed', 'negotiable');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cod', 'online');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'waiting',
    "pricingMode" "PricingMode" NOT NULL,
    "priceCents" INTEGER,
    "payablePriceCents" INTEGER,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "couponId" TEXT,
    "couponTitle" TEXT,
    "couponDiscountCents" INTEGER,
    "pickupTime" TIMESTAMP(3) NOT NULL,
    "expectedDeliveryText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCargo" (
    "orderId" TEXT NOT NULL,
    "cargoType" TEXT NOT NULL,
    "weightText" TEXT NOT NULL,
    "volumeText" TEXT,
    "quantityText" TEXT NOT NULL,
    "description" TEXT,
    "cargoPhotoCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderCargo_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "OrderLocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "noteText" TEXT,

    CONSTRAINT "OrderLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRequirement" (
    "orderId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "vehicleLengthText" TEXT,
    "needTailboard" BOOLEAN NOT NULL DEFAULT false,
    "needTarp" BOOLEAN NOT NULL DEFAULT false,
    "valueAddedServicesText" TEXT,

    CONSTRAINT "OrderRequirement_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "noteText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_shipper_status_created_idx" ON "Order"("shipperId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shipper_created_idx" ON "Order"("shipperId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderLocation_order_type_idx" ON "OrderLocation"("orderId", "type");

-- CreateIndex
CREATE INDEX "OrderEvent_order_created_idx" ON "OrderEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCargo" ADD CONSTRAINT "OrderCargo_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLocation" ADD CONSTRAINT "OrderLocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRequirement" ADD CONSTRAINT "OrderRequirement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

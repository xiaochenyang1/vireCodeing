-- CreateTable
CREATE TABLE "OrderIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "responseSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderIdempotencyRecord_actor_operation_key_unique" ON "OrderIdempotencyRecord"("actorUserId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderIdempotencyRecord_order_created_idx" ON "OrderIdempotencyRecord"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderIdempotencyRecord_expires_idx" ON "OrderIdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "OrderIdempotencyRecord" ADD CONSTRAINT "OrderIdempotencyRecord_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderIdempotencyRecord" ADD CONSTRAINT "OrderIdempotencyRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

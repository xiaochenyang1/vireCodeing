-- CreateTable
CREATE TABLE "AdminCouponIssueIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "responseSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCouponIssueIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminCouponIssueIdempotency_actor_operation_key_unique" ON "AdminCouponIssueIdempotencyRecord"("actorAdminId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AdminCouponIssueIdempotency_expires_idx" ON "AdminCouponIssueIdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminCouponIssueIdempotencyRecord" ADD CONSTRAINT "AdminCouponIssueIdempotencyRecord_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

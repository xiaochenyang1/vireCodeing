-- Allow multiple refunds per payment order (partial change-request refunds).
-- Drop the 1:1 unique constraint on Refund.paymentOrderId and add lookup indexes.

DROP INDEX IF EXISTS "Refund_paymentOrderId_key";

CREATE INDEX "Refund_payment_created_idx" ON "Refund"("paymentOrderId", "createdAt");
CREATE INDEX "Refund_payment_status_created_idx" ON "Refund"("paymentOrderId", "status", "createdAt");

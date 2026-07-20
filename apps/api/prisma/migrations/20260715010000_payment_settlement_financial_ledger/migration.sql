BEGIN;

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM (
  'not_required',
  'pending',
  'escrowed',
  'settled',
  'failed',
  'cancelled',
  'refund_pending',
  'refunded',
  'refund_failed',
  'legacy_unverified'
);

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('sandbox', 'wechat', 'alipay');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM (
  'pending',
  'processing',
  'escrowed',
  'settled',
  'failed',
  'expired',
  'cancelled',
  'refund_pending',
  'refunded',
  'refund_failed'
);

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM (
  'online_payment_escrow',
  'online_order_settlement',
  'offline_order_settlement',
  'online_refund',
  'driver_withdrawal'
);

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM (
  'gateway_clearing',
  'platform_escrow',
  'driver_payable',
  'platform_revenue',
  'offline_clearing'
);

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "FinancialOutboxStatus" AS ENUM ('pending', 'processing', 'completed', 'dead');

-- ExtendTable
ALTER TABLE "Order"
ADD COLUMN "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'legacy_unverified',
ADD COLUMN "assignedDriverId" TEXT,
ADD COLUMN "paymentSettledAt" TIMESTAMP(3),
ADD COLUMN "refundedAt" TIMESTAMP(3);

-- ExtendTable
ALTER TABLE "DriverWithdrawal"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestFingerprint" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processedByAdminId" TEXT,
ADD COLUMN "processedAt" TIMESTAMP(3),
ADD COLUMN "financialTransactionId" TEXT;

ALTER TABLE "DriverWithdrawal"
ADD CONSTRAINT "DriverWithdrawal_amountCents_positive_chk" CHECK ("amountCents" > 0),
ADD CONSTRAINT "DriverWithdrawal_version_nonnegative_chk" CHECK ("version" >= 0);

-- Backfill only a single evidenced driver actor. Ambiguous or invalid history stays NULL.
LOCK TABLE "OrderEvent" IN SHARE MODE;

WITH "UniqueDriverAcceptance" AS (
  SELECT
    event."orderId",
    MIN(event."actorUserId") AS "driverId"
  FROM "OrderEvent" event
  JOIN "User" actor
    ON actor."id" = event."actorUserId"
   AND actor."userType" = 'driver'
  WHERE event."eventType" = 'driver_accepted'
  GROUP BY event."orderId"
  HAVING COUNT(DISTINCT event."actorUserId") = 1
)
UPDATE "Order" target
SET "assignedDriverId" = acceptance."driverId"
FROM "UniqueDriverAcceptance" acceptance
WHERE target."id" = acceptance."orderId";

-- CreateTable
CREATE TABLE "PaymentOrder" (
  "id" TEXT NOT NULL,
  "paymentNo" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shipperId" TEXT NOT NULL,
  "channel" "PaymentChannel" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'pending',
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "clientPayload" JSONB,
  "providerTradeNo" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentOrder_amountCents_positive_chk" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
  "id" TEXT NOT NULL,
  "transactionNo" TEXT NOT NULL,
  "type" "FinancialTransactionType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "orderId" TEXT,
  "paymentOrderId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialTransaction_amountCents_positive_chk" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "refundNo" TEXT NOT NULL,
  "paymentOrderId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shipperId" TEXT NOT NULL,
  "channel" "PaymentChannel" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'pending',
  "providerRefundNo" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "processingStartedAt" TIMESTAMP(3),
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "financialTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_amountCents_positive_chk" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "Settlement" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentOrderId" TEXT,
  "driverId" TEXT NOT NULL,
  "grossAmountCents" INTEGER NOT NULL,
  "platformFeeRateBps" INTEGER NOT NULL,
  "platformFeeCents" INTEGER NOT NULL,
  "driverNetAmountCents" INTEGER NOT NULL,
  "financialTransactionId" TEXT NOT NULL,
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Settlement_amounts_consistent_chk" CHECK (
    "grossAmountCents" > 0
    AND "platformFeeRateBps" >= 0
    AND "platformFeeRateBps" <= 10000
    AND "platformFeeCents" >= 0
    AND "driverNetAmountCents" > 0
    AND "platformFeeCents" + "driverNetAmountCents" = "grossAmountCents"
  )
);

-- CreateTable
CREATE TABLE "PaymentCallbackEvent" (
  "id" TEXT NOT NULL,
  "channel" "PaymentChannel" NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "paymentOrderId" TEXT,
  "refundId" TEXT,
  "rawPayloadHash" TEXT NOT NULL,
  "processingResult" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentCallbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLedgerEntry" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "accountType" "FinancialAccountType" NOT NULL,
  "accountUserId" TEXT,
  "direction" "LedgerDirection" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialLedgerEntry_sequence_nonnegative_chk" CHECK ("sequence" >= 0),
  CONSTRAINT "FinancialLedgerEntry_amountCents_positive_chk" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "DriverWallet" (
  "driverId" TEXT NOT NULL,
  "availableCents" INTEGER NOT NULL DEFAULT 0,
  "reservedCents" INTEGER NOT NULL DEFAULT 0,
  "withdrawnCents" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DriverWallet_pkey" PRIMARY KEY ("driverId"),
  CONSTRAINT "DriverWallet_balances_nonnegative_chk" CHECK ("availableCents" >= 0 AND "reservedCents" >= 0 AND "withdrawnCents" >= 0),
  CONSTRAINT "DriverWallet_version_nonnegative_chk" CHECK ("version" >= 0)
);

-- CreateTable
CREATE TABLE "FinancialOutboxEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "refundId" TEXT,
  "payload" JSONB NOT NULL,
  "status" "FinancialOutboxStatus" NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "claimedBy" TEXT,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialOutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialOutboxEvent_attempts_valid_chk" CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
  "id" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "beforeState" JSONB,
  "afterState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_paymentNo_key" ON "PaymentOrder"("paymentNo");
CREATE UNIQUE INDEX "PaymentOrder_shipper_idempotency_key_unique" ON "PaymentOrder"("shipperId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentOrder_channel_provider_trade_no_unique" ON "PaymentOrder"("channel", "providerTradeNo");
CREATE UNIQUE INDEX "PaymentOrder_order_active_unique"
ON "PaymentOrder"("orderId")
WHERE "status" IN ('pending', 'processing', 'escrowed', 'refund_pending');
CREATE INDEX "PaymentOrder_order_created_idx" ON "PaymentOrder"("orderId", "createdAt");
CREATE INDEX "PaymentOrder_shipper_status_created_idx" ON "PaymentOrder"("shipperId", "status", "createdAt");

CREATE UNIQUE INDEX "FinancialTransaction_transactionNo_key" ON "FinancialTransaction"("transactionNo");
CREATE UNIQUE INDEX "FinancialTransaction_type_reference_unique" ON "FinancialTransaction"("type", "referenceId");
CREATE INDEX "FinancialTransaction_order_occurred_idx" ON "FinancialTransaction"("orderId", "occurredAt");
CREATE INDEX "FinancialTransaction_payment_occurred_idx" ON "FinancialTransaction"("paymentOrderId", "occurredAt");
CREATE INDEX "FinancialTransaction_type_occurred_idx" ON "FinancialTransaction"("type", "occurredAt");

CREATE UNIQUE INDEX "Refund_refundNo_key" ON "Refund"("refundNo");
CREATE UNIQUE INDEX "Refund_paymentOrderId_key" ON "Refund"("paymentOrderId");
CREATE UNIQUE INDEX "Refund_financialTransactionId_key" ON "Refund"("financialTransactionId");
CREATE UNIQUE INDEX "Refund_channel_provider_refund_no_unique" ON "Refund"("channel", "providerRefundNo");
CREATE INDEX "Refund_order_created_idx" ON "Refund"("orderId", "createdAt");
CREATE INDEX "Refund_shipper_status_created_idx" ON "Refund"("shipperId", "status", "createdAt");

CREATE UNIQUE INDEX "Settlement_orderId_key" ON "Settlement"("orderId");
CREATE UNIQUE INDEX "Settlement_paymentOrderId_key" ON "Settlement"("paymentOrderId");
CREATE UNIQUE INDEX "Settlement_financialTransactionId_key" ON "Settlement"("financialTransactionId");
CREATE INDEX "Settlement_driver_settled_idx" ON "Settlement"("driverId", "settledAt");

CREATE UNIQUE INDEX "PaymentCallbackEvent_channel_event_unique" ON "PaymentCallbackEvent"("channel", "eventId");
CREATE INDEX "PaymentCallbackEvent_payment_created_idx" ON "PaymentCallbackEvent"("paymentOrderId", "createdAt");
CREATE INDEX "PaymentCallbackEvent_refund_created_idx" ON "PaymentCallbackEvent"("refundId", "createdAt");

CREATE UNIQUE INDEX "FinancialLedgerEntry_transaction_sequence_unique" ON "FinancialLedgerEntry"("transactionId", "sequence");
CREATE INDEX "FinancialLedgerEntry_account_created_idx" ON "FinancialLedgerEntry"("accountType", "accountUserId", "createdAt");

CREATE UNIQUE INDEX "FinancialOutboxEvent_aggregate_event_unique" ON "FinancialOutboxEvent"("eventType", "aggregateType", "aggregateId");
CREATE INDEX "FinancialOutboxEvent_claim_idx" ON "FinancialOutboxEvent"("status", "availableAt", "createdAt");
CREATE INDEX "FinancialOutboxEvent_lease_expires_idx" ON "FinancialOutboxEvent"("leaseExpiresAt");

CREATE UNIQUE INDEX "FinancialAuditLog_actor_action_key_unique" ON "FinancialAuditLog"("actorAdminId", "action", "idempotencyKey");
CREATE INDEX "FinancialAuditLog_entity_created_idx" ON "FinancialAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "FinancialAuditLog_actor_created_idx" ON "FinancialAuditLog"("actorAdminId", "createdAt");

CREATE UNIQUE INDEX "DriverWithdrawal_financialTransactionId_key" ON "DriverWithdrawal"("financialTransactionId");
CREATE UNIQUE INDEX "DriverWithdrawal_driver_idempotency_key_unique" ON "DriverWithdrawal"("driverId", "idempotencyKey");
CREATE INDEX "DriverWithdrawal_status_created_idx" ON "DriverWithdrawal"("status", "createdAt");

CREATE INDEX "Order_driver_status_created_idx" ON "Order"("assignedDriverId", "status", "createdAt");
CREATE INDEX "Order_payment_business_status_created_idx" ON "Order"("paymentStatus", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_financialTransactionId_fkey" FOREIGN KEY ("financialTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_financialTransactionId_fkey" FOREIGN KEY ("financialTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentCallbackEvent" ADD CONSTRAINT "PaymentCallbackEvent_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentCallbackEvent" ADD CONSTRAINT "PaymentCallbackEvent_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverWallet" ADD CONSTRAINT "DriverWallet_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOutboxEvent" ADD CONSTRAINT "FinancialOutboxEvent_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialAuditLog" ADD CONSTRAINT "FinancialAuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverWithdrawal" ADD CONSTRAINT "DriverWithdrawal_processedByAdminId_fkey" FOREIGN KEY ("processedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DriverWithdrawal" ADD CONSTRAINT "DriverWithdrawal_financialTransactionId_fkey" FOREIGN KEY ("financialTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ledger entries are append-only. Corrections must use a new reversing transaction.
CREATE FUNCTION "prevent_financial_ledger_entry_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'financial ledger entries are immutable';
END;
$$;

CREATE TRIGGER "FinancialLedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "FinancialLedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION "prevent_financial_ledger_entry_mutation"();

-- Check both the transaction header and every appended entry at commit time.
CREATE FUNCTION "assert_financial_transaction_balanced"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_id TEXT;
  entry_count BIGINT;
  signed_balance BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'FinancialTransaction' THEN
    transaction_id := NEW."id";
  ELSE
    transaction_id := NEW."transactionId";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "FinancialTransaction"
    WHERE "id" = transaction_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(
      SUM(CASE WHEN "direction" = 'credit' THEN "amountCents" ELSE -"amountCents" END),
      0
    )
  INTO entry_count, signed_balance
  FROM "FinancialLedgerEntry"
  WHERE "transactionId" = transaction_id;

  IF entry_count < 2 OR signed_balance <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'financial transaction is unbalanced: transactionId=%s entryCount=%s signedBalance=%s',
        transaction_id,
        entry_count,
        signed_balance
      );
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "FinancialTransaction_balance_deferred"
AFTER INSERT ON "FinancialTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "assert_financial_transaction_balanced"();

CREATE CONSTRAINT TRIGGER "FinancialLedgerEntry_balance_deferred"
AFTER INSERT ON "FinancialLedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "assert_financial_transaction_balanced"();

COMMIT;

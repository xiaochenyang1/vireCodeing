-- Add new enum values first. PostgreSQL forbids using a freshly added enum
-- value inside the same transaction that adds it, so these ALTER TYPE
-- statements run (and auto-commit) before the DDL transaction below.
ALTER TYPE "OrderExceptionCaseCompensationStatus" ADD VALUE IF NOT EXISTS 'executed';
ALTER TYPE "FinancialTransactionType" ADD VALUE IF NOT EXISTS 'order_compensation';

-- CreateEnum
CREATE TYPE "OrderExceptionCaseAppealStatus" AS ENUM (
  'none',
  'requested',
  'rejected',
  'accepted'
);

BEGIN;

-- AlterTable
ALTER TABLE "OrderExceptionCase"
ADD COLUMN "compensationTransactionId" TEXT,
ADD COLUMN "compensationExecutedAt" TIMESTAMP(3),
ADD COLUMN "appealStatus" "OrderExceptionCaseAppealStatus" NOT NULL DEFAULT 'none',
ADD COLUMN "appealReason" TEXT,
ADD COLUMN "appealRequestedAt" TIMESTAMP(3);

-- The prior compensation-consistency constraint predates the 'executed' status
-- and would reject it. Drop it and recreate a version that also accepts an
-- executed compensation (which keeps its target role and amount).
ALTER TABLE "OrderExceptionCase"
DROP CONSTRAINT "OrderExceptionCase_compensation_consistency_chk";

ALTER TABLE "OrderExceptionCase"
ADD CONSTRAINT "OrderExceptionCase_compensation_consistency_chk"
CHECK (
  (
    "compensationStatus" IS NULL
    AND "compensationTargetRole" IS NULL
    AND "compensationAmountCents" IS NULL
    AND "compensationUpdatedAt" IS NULL
  )
  OR (
    "compensationStatus" = 'not_required'
    AND "compensationTargetRole" IS NULL
    AND "compensationAmountCents" IS NULL
    AND "compensationUpdatedAt" IS NOT NULL
  )
  OR (
    "compensationStatus" IN ('pending', 'offline_completed', 'executed')
    AND "compensationTargetRole" IS NOT NULL
    AND "compensationAmountCents" IS NOT NULL
    AND "compensationAmountCents" > 0
    AND "compensationUpdatedAt" IS NOT NULL
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderExceptionCase_compensationTransactionId_key"
ON "OrderExceptionCase"("compensationTransactionId");

-- AddForeignKey
ALTER TABLE "OrderExceptionCase"
ADD CONSTRAINT "OrderExceptionCase_compensationTransactionId_fkey"
FOREIGN KEY ("compensationTransactionId")
REFERENCES "FinancialTransaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Executed compensation must carry a linked ledger transaction and execution
-- time; every other compensation state must not reference a transaction.
ALTER TABLE "OrderExceptionCase"
ADD CONSTRAINT "OrderExceptionCase_compensation_execution_chk"
CHECK (
  (
    "compensationStatus" = 'executed'
    AND "compensationTransactionId" IS NOT NULL
    AND "compensationExecutedAt" IS NOT NULL
    AND "compensationTargetRole" IS NOT NULL
    AND "compensationAmountCents" IS NOT NULL
    AND "compensationAmountCents" > 0
  )
  OR (
    "compensationStatus" IS DISTINCT FROM 'executed'
    AND "compensationTransactionId" IS NULL
    AND "compensationExecutedAt" IS NULL
  )
);

-- Appeal reason and request time travel together; only a requested appeal keeps
-- a stored reason once it is raised.
ALTER TABLE "OrderExceptionCase"
ADD CONSTRAINT "OrderExceptionCase_appeal_consistency_chk"
CHECK (
  (
    "appealStatus" = 'none'
    AND "appealReason" IS NULL
    AND "appealRequestedAt" IS NULL
  )
  OR (
    "appealStatus" IN ('requested', 'rejected', 'accepted')
    AND "appealReason" IS NOT NULL
    AND "appealRequestedAt" IS NOT NULL
  )
);

COMMIT;

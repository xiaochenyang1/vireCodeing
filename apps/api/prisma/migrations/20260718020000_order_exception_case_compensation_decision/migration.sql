BEGIN;

-- CreateEnum
CREATE TYPE "OrderExceptionCaseCompensationStatus" AS ENUM (
  'not_required',
  'pending',
  'offline_completed'
);

-- AlterTable
ALTER TABLE "OrderExceptionCase"
ADD COLUMN "compensationStatus" "OrderExceptionCaseCompensationStatus",
ADD COLUMN "compensationTargetRole" "OrderExceptionCaseSourceRole",
ADD COLUMN "compensationAmountCents" INTEGER,
ADD COLUMN "compensationUpdatedAt" TIMESTAMP(3),
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
    "compensationStatus" IN ('pending', 'offline_completed')
    AND "compensationTargetRole" IS NOT NULL
    AND "compensationAmountCents" IS NOT NULL
    AND "compensationAmountCents" > 0
    AND "compensationUpdatedAt" IS NOT NULL
  )
);

COMMIT;

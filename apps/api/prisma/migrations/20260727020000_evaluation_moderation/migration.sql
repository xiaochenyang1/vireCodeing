-- CreateEnum
CREATE TYPE "EvaluationModerationStatus" AS ENUM ('visible', 'hidden');

-- CreateTable
CREATE TABLE "EvaluationModeration" (
    "evaluationEventId" TEXT NOT NULL,
    "status" "EvaluationModerationStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "moderatedByAdminId" TEXT NOT NULL,
    "moderatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationModeration_pkey" PRIMARY KEY ("evaluationEventId"),
    CONSTRAINT "EvaluationModeration_version_check" CHECK ("version" >= 1),
    CONSTRAINT "EvaluationModeration_reason_length_check" CHECK (char_length("reason") BETWEEN 2 AND 200)
);

-- CreateTable
CREATE TABLE "EvaluationModerationAction" (
    "id" TEXT NOT NULL,
    "evaluationEventId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "fromStatus" "EvaluationModerationStatus" NOT NULL,
    "toStatus" "EvaluationModerationStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationModerationAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EvaluationModerationAction_version_check" CHECK ("fromVersion" >= 0 AND "toVersion" = "fromVersion" + 1),
    CONSTRAINT "EvaluationModerationAction_reason_length_check" CHECK (char_length("reason") BETWEEN 2 AND 200)
);

-- CreateIndex
CREATE INDEX "EvaluationModeration_status_moderated_idx" ON "EvaluationModeration"("status", "moderatedAt");

-- CreateIndex
CREATE INDEX "EvaluationModeration_admin_moderated_idx" ON "EvaluationModeration"("moderatedByAdminId", "moderatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationModerationAction_event_version_unique" ON "EvaluationModerationAction"("evaluationEventId", "toVersion");

-- CreateIndex
CREATE INDEX "EvaluationModerationAction_event_created_idx" ON "EvaluationModerationAction"("evaluationEventId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationModerationAction_admin_created_idx" ON "EvaluationModerationAction"("adminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "EvaluationModeration" ADD CONSTRAINT "EvaluationModeration_evaluationEventId_fkey" FOREIGN KEY ("evaluationEventId") REFERENCES "OrderEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationModeration" ADD CONSTRAINT "EvaluationModeration_moderatedByAdminId_fkey" FOREIGN KEY ("moderatedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationModerationAction" ADD CONSTRAINT "EvaluationModerationAction_evaluationEventId_fkey" FOREIGN KEY ("evaluationEventId") REFERENCES "EvaluationModeration"("evaluationEventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationModerationAction" ADD CONSTRAINT "EvaluationModerationAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

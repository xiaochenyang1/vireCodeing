-- CreateEnum
CREATE TYPE "EvaluationAppealStatus" AS ENUM ('requested', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "EvaluationAppeal" (
    "id" TEXT NOT NULL,
    "evaluationEventId" TEXT NOT NULL,
    "appellantUserId" TEXT NOT NULL,
    "status" "EvaluationAppealStatus" NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "moderationVersion" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolutionReason" TEXT,
    "resolvedByAdminId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationAppeal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EvaluationAppeal_version_check" CHECK ("version" >= 1),
    CONSTRAINT "EvaluationAppeal_moderation_version_check" CHECK ("moderationVersion" >= 1),
    CONSTRAINT "EvaluationAppeal_reason_length_check" CHECK (char_length("reason") BETWEEN 6 AND 500),
    CONSTRAINT "EvaluationAppeal_resolution_check" CHECK (
      (
        "status" = 'requested'
        AND "resolutionReason" IS NULL
        AND "resolvedByAdminId" IS NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "status" IN ('accepted', 'rejected')
        AND char_length("resolutionReason") BETWEEN 2 AND 500
        AND "resolvedByAdminId" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
      )
    )
);

-- CreateTable
CREATE TABLE "EvaluationAppealAction" (
    "id" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" "EvaluationAppealStatus",
    "toStatus" "EvaluationAppealStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationAppealAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EvaluationAppealAction_version_check" CHECK (
      "fromVersion" >= 0
      AND "toVersion" = "fromVersion" + 1
    ),
    CONSTRAINT "EvaluationAppealAction_transition_check" CHECK (
      (
        "fromStatus" IS NULL
        AND "fromVersion" = 0
        AND "toStatus" = 'requested'
      )
      OR
      (
        "fromStatus" = 'requested'
        AND "fromVersion" >= 1
        AND "toStatus" IN ('accepted', 'rejected')
      )
    ),
    CONSTRAINT "EvaluationAppealAction_reason_length_check" CHECK (char_length("reason") BETWEEN 2 AND 500)
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAppeal_open_event_unique"
ON "EvaluationAppeal"("evaluationEventId")
WHERE "status" = 'requested';

-- CreateIndex
CREATE INDEX "EvaluationAppeal_event_submitted_idx" ON "EvaluationAppeal"("evaluationEventId", "submittedAt");

-- CreateIndex
CREATE INDEX "EvaluationAppeal_status_submitted_idx" ON "EvaluationAppeal"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "EvaluationAppeal_appellant_submitted_idx" ON "EvaluationAppeal"("appellantUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "EvaluationAppeal_resolver_resolved_idx" ON "EvaluationAppeal"("resolvedByAdminId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAppealAction_appeal_version_unique" ON "EvaluationAppealAction"("appealId", "toVersion");

-- CreateIndex
CREATE INDEX "EvaluationAppealAction_appeal_created_idx" ON "EvaluationAppealAction"("appealId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationAppealAction_actor_created_idx" ON "EvaluationAppealAction"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "EvaluationAppeal" ADD CONSTRAINT "EvaluationAppeal_evaluationEventId_fkey" FOREIGN KEY ("evaluationEventId") REFERENCES "OrderEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAppeal" ADD CONSTRAINT "EvaluationAppeal_appellantUserId_fkey" FOREIGN KEY ("appellantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAppeal" ADD CONSTRAINT "EvaluationAppeal_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAppealAction" ADD CONSTRAINT "EvaluationAppealAction_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "EvaluationAppeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAppealAction" ADD CONSTRAINT "EvaluationAppealAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

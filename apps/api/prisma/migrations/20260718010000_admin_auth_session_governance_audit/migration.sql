BEGIN;

-- CreateEnum
CREATE TYPE "AdminAuthSessionGovernanceAuditAction" AS ENUM (
  'revoke_session',
  'revoke_other_sessions',
  'revoke_account_sessions'
);

-- CreateEnum
CREATE TYPE "AdminAuthSessionGovernanceAuditResult" AS ENUM ('revoked', 'noop');

-- CreateTable
CREATE TABLE "AdminAuthSessionGovernanceAuditEvent" (
  "id" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "actorAdminPhone" TEXT NOT NULL,
  "action" "AdminAuthSessionGovernanceAuditAction" NOT NULL,
  "result" "AdminAuthSessionGovernanceAuditResult" NOT NULL,
  "requestedSessionId" TEXT,
  "currentDeviceId" TEXT,
  "revokedCount" INTEGER NOT NULL DEFAULT 0,
  "subjects" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminAuthSessionGovernanceAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAuthSessionGovernanceAuditEvent_revokedCount_nonnegative_chk"
    CHECK ("revokedCount" >= 0)
);

-- CreateIndex
CREATE INDEX "AdminAuthSessionGovernanceAuditEvent_actor_created_idx"
ON "AdminAuthSessionGovernanceAuditEvent"("actorAdminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthSessionGovernanceAuditEvent_action_created_idx"
ON "AdminAuthSessionGovernanceAuditEvent"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminAuthSessionGovernanceAuditEvent"
ADD CONSTRAINT "AdminAuthSessionGovernanceAuditEvent_actorAdminId_fkey"
FOREIGN KEY ("actorAdminId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

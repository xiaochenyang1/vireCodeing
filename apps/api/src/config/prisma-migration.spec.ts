import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('Prisma initial migration', () => {
  const migrationPath = join(
    __dirname,
    '..',
    '..',
    'prisma',
    'migrations',
    '20260626000000_stage_1_auth_foundation',
    'migration.sql',
  );

  function readMigration() {
    return readFileSync(migrationPath, 'utf8');
  }

  function readAllMigrations() {
    const migrationsRoot = join(
      __dirname,
      '..',
      '..',
      'prisma',
      'migrations',
    );

    return readdirSync(migrationsRoot)
      .sort()
      .map(directory =>
        readFileSync(join(migrationsRoot, directory, 'migration.sql'), 'utf8'),
      )
      .join('\n');
  }

  function readTargetMigration() {
    const targetPath = join(
      __dirname,
      '..',
      '..',
      'prisma',
      'migrations',
      '20260714010000_shipper_order_create_idempotency_coupon_atomicity',
      'migration.sql',
    );

    return existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
  }

  it('creates the stage 1 auth and profile schema objects', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE TYPE "UserType"');
    expect(sql).toContain('CREATE TYPE "UserStatus"');
    expect(sql).toContain('CREATE TYPE "VerificationPurpose"');
    expect(sql).toContain('CREATE TYPE "FilePurpose"');
    expect(sql).toContain('CREATE TYPE "FileStatus"');
    expect(sql).toContain('CREATE TABLE "User"');
    expect(sql).toContain('"passwordHash" TEXT');
    expect(sql).toContain('CREATE TABLE "AuthSession"');
    expect(sql).toContain('CREATE TABLE "VerificationCode"');
    expect(sql).toContain('CREATE TABLE "FileObject"');
    expect(sql).toContain('CREATE TABLE "ShipperProfile"');
  });

  it('adds indexes and foreign keys required by the auth repository', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE UNIQUE INDEX "User_phone_key"');
    expect(sql).toContain(
      'CREATE INDEX "AuthSession_refresh_lookup_idx" ON "AuthSession"("refreshTokenHash", "deviceId", "revokedAt", "expiresAt")',
    );
    expect(sql).toContain(
      'CREATE INDEX "AuthSession_user_device_active_idx" ON "AuthSession"("userId", "deviceId", "revokedAt")',
    );
    expect(sql).toContain(
      'CREATE INDEX "AuthSession_user_active_idx" ON "AuthSession"("userId", "revokedAt")',
    );
    expect(sql).toContain(
      'CREATE INDEX "VerificationCode_active_lookup_idx" ON "VerificationCode"("phone", "purpose", "consumedAt", "expiresAt", "createdAt")',
    );
    expect(sql).toContain(
      'CREATE INDEX "VerificationCode_rate_lookup_idx" ON "VerificationCode"("phone", "purpose", "createdAt")',
    );
    expect(sql).toContain(
      'ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"',
    );
    expect(sql).toContain(
      'ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerUserId_fkey"',
    );
    expect(sql).toContain(
      'ALTER TABLE "ShipperProfile" ADD CONSTRAINT "ShipperProfile_userId_fkey"',
    );
  });

  it('contains shipper order foundation tables and indexes', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "OrderStatus"');
    expect(sql).toContain('CREATE TYPE "PricingMode"');
    expect(sql).toContain('CREATE TYPE "PaymentMethod"');
    expect(sql).toContain('CREATE TABLE "Order"');
    expect(sql).toContain('CREATE TABLE "OrderCargo"');
    expect(sql).toContain('CREATE TABLE "OrderLocation"');
    expect(sql).toContain('CREATE TABLE "OrderRequirement"');
    expect(sql).toContain('CREATE TABLE "OrderEvent"');
    expect(sql).toContain(
      'CREATE INDEX "Order_shipper_status_created_idx"',
    );
  });

  it('contains the current shipper order draft table', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "OrderDraft"');
    expect(sql).toContain('"draftSnapshot" JSONB NOT NULL');
    expect(sql).toContain(
      'ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_shipperId_fkey"',
    );
  });

  it('contains the current shipper profile address book table', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "ShipperAddressBook"');
    expect(sql).toContain('"addresses" JSONB NOT NULL');
    expect(sql).toContain('"contacts" JSONB NOT NULL');
    expect(sql).toContain('"clientUpdatedAt" TIMESTAMP(3)');
    expect(sql).toContain(
      'ALTER TABLE "ShipperAddressBook"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "ShipperAddressBook_shipperId_fkey"',
    );
  });

  it('contains the current shipper frequent routes table', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "ShipperFrequentRoutes"');
    expect(sql).toContain('"routes" JSONB NOT NULL');
    expect(sql).toContain('"clientUpdatedAt" TIMESTAMP(3)');
    expect(sql).toContain(
      'ALTER TABLE "ShipperFrequentRoutes"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "ShipperFrequentRoutes_shipperId_fkey"',
    );
  });

  it('contains the current shipper invoice application table', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "ShipperInvoiceApplication"');
    expect(sql).toContain('"invoiceType" TEXT NOT NULL');
    expect(sql).toContain('"invoiceTitleType" TEXT NOT NULL');
    expect(sql).toContain('"invoiceTitle" TEXT NOT NULL');
    expect(sql).toContain('"receiverEmail" TEXT NOT NULL');
    expect(sql).toContain('"orderIds" JSONB NOT NULL');
    expect(sql).toContain('"orderNos" JSONB NOT NULL');
    expect(sql).toContain('"amountCents" INTEGER NOT NULL');
    expect(sql).toContain(
      'CREATE INDEX "ShipperInvoiceApplication_shipper_created_idx"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "ShipperInvoiceApplication_shipperId_fkey"',
    );
  });

  it('contains the evaluation file purpose migration', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('ALTER TYPE "FilePurpose" ADD VALUE \'evaluation\'');
  });

  it('stores declared file content metadata for upload confirmation checks', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('ALTER TABLE "FileObject" ADD COLUMN "contentType" TEXT NOT NULL');
    expect(sql).toContain('ALTER TABLE "FileObject" ADD COLUMN "byteSize" INTEGER NOT NULL');
  });

  it('stores object storage callback metadata for uploaded files', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('ALTER TABLE "FileObject" ADD COLUMN "etag" TEXT');
    expect(sql).toContain('ALTER TABLE "FileObject" ADD COLUMN "versionId" TEXT');
  });

  it('contains driver certification tables and enum', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "CertificationStatus"');
    expect(sql).toContain('CREATE TABLE "DriverIdentityCertification"');
    expect(sql).toContain('CREATE TABLE "DriverVehicleCertification"');
    expect(sql).toContain('"identityFrontFileId" TEXT NOT NULL');
    expect(sql).toContain('"drivingLicenseFileId" TEXT NOT NULL');
    expect(sql).toContain('ALTER TABLE "DriverVehicleCertification"\nADD COLUMN "driverLicenseFileId" TEXT');
    expect(sql).toContain('ADD COLUMN "transportQualificationFileId" TEXT');
    expect(sql).toContain('ADD COLUMN "operationPermitFileId" TEXT');
    expect(sql).toContain(
      'ALTER TABLE "DriverIdentityCertification"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "DriverIdentityCertification_driverId_fkey"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "DriverVehicleCertification_driverId_fkey"',
    );
  });

  it('contains driver certification review audit events', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "DriverCertificationType"');
    expect(sql).toContain('CREATE TABLE "DriverCertificationReviewEvent"');
    expect(sql).toContain('"reviewerAdminId" TEXT NOT NULL');
    expect(sql).toContain('"fromStatus" "CertificationStatus" NOT NULL');
    expect(sql).toContain('"toStatus" "CertificationStatus" NOT NULL');
    expect(sql).toContain('CREATE INDEX "DriverCertificationReviewEvent_driver_created_idx"');
    expect(sql).toContain(
      'ADD CONSTRAINT "DriverCertificationReviewEvent_driverId_fkey"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "DriverCertificationReviewEvent_reviewerAdminId_fkey"',
    );
  });

  it('contains driver acceptance settings storage', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "DriverAcceptanceSettings"');
    expect(sql).toContain('"isOnline" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('"maxDistanceKm" INTEGER NOT NULL DEFAULT 50');
    expect(sql).toContain('"vehicleTypePreferences" JSONB NOT NULL DEFAULT \'[]\'');
    expect(sql).toContain(
      'ADD CONSTRAINT "DriverAcceptanceSettings_driverId_fkey"',
    );
  });

  it('contains driver withdrawals storage', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "DriverWithdrawalStatus"');
    expect(sql).toContain('CREATE TABLE "DriverWithdrawal"');
    expect(sql).toContain('"amountCents" INTEGER NOT NULL');
    expect(sql).toContain('"bankAccountName" TEXT NOT NULL');
    expect(sql).toContain('"bankName" TEXT NOT NULL');
    expect(sql).toContain('"bankAccountMasked" TEXT NOT NULL');
    expect(sql).toContain(
      'CREATE INDEX "DriverWithdrawal_driver_created_idx"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "DriverWithdrawal_driverId_fkey"',
    );
  });

  it('contains payment settlement and financial ledger storage', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "OrderPaymentStatus"');
    expect(sql).toContain('CREATE TYPE "PaymentOrderStatus"');
    expect(sql).toContain('CREATE TYPE "RefundStatus"');
    expect(sql).toContain('CREATE TYPE "FinancialTransactionType"');
    expect(sql).toContain('CREATE TYPE "FinancialAccountType"');
    expect(sql).toContain('CREATE TYPE "LedgerDirection"');
    expect(sql).toContain('CREATE TABLE "PaymentOrder"');
    expect(sql).toContain('CREATE TABLE "PaymentCallbackEvent"');
    expect(sql).toContain('CREATE TABLE "Refund"');
    expect(sql).toContain('CREATE TABLE "Settlement"');
    expect(sql).toContain('CREATE TABLE "FinancialTransaction"');
    expect(sql).toContain('CREATE TABLE "FinancialLedgerEntry"');
    expect(sql).toContain('CREATE TABLE "DriverWallet"');
    expect(sql).toContain('CREATE TABLE "FinancialOutboxEvent"');
    expect(sql).toContain('CREATE TABLE "FinancialAuditLog"');
  });

  it('contains admin auth session governance audit storage', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "AdminAuthSessionGovernanceAuditAction"');
    expect(sql).toContain("'revoke_account_sessions'");
    expect(sql).toContain('CREATE TYPE "AdminAuthSessionGovernanceAuditResult"');
    expect(sql).toContain('CREATE TABLE "AdminAuthSessionGovernanceAuditEvent"');
    expect(sql).toContain('"actorAdminPhone" TEXT NOT NULL');
    expect(sql).toContain('"requestedSessionId" TEXT');
    expect(sql).toContain('"currentDeviceId" TEXT');
    expect(sql).toContain('"revokedCount" INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('"subjects" JSONB NOT NULL DEFAULT \'[]\'');
    expect(sql).toContain(
      'CREATE INDEX "AdminAuthSessionGovernanceAuditEvent_actor_created_idx"',
    );
    expect(sql).toContain(
      'CREATE INDEX "AdminAuthSessionGovernanceAuditEvent_action_created_idx"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "AdminAuthSessionGovernanceAuditEvent_actorAdminId_fkey"',
    );
  });

  it('stores shipper coupon lock metadata', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "ShipperCoupon"');
    expect(sql).toContain('"usedOrderNo" TEXT');
    expect(sql).toContain('"usedAt" TIMESTAMP(3)');
    expect(sql).toContain('ALTER TABLE "ShipperCoupon" ADD COLUMN "lockedOrderNo" TEXT');
    expect(sql).toContain('ALTER TABLE "ShipperCoupon" ADD COLUMN "lockedAt" TIMESTAMP(3)');
  });

  it('contains shipper profile verification tables', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "ShipperIdentityVerification"');
    expect(sql).toContain('CREATE TABLE "ShipperEnterpriseVerification"');
    expect(sql).toContain('"faceVerified" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('"licenseFileId" TEXT NOT NULL');
    expect(sql).toContain(
      'ADD CONSTRAINT "ShipperIdentityVerification_shipperId_fkey"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "ShipperEnterpriseVerification_shipperId_fkey"',
    );
  });

  it('stores order event attachment file ids', () => {
    const sql = readAllMigrations();

    expect(sql).toContain(
      'ALTER TABLE "OrderEvent"\nADD COLUMN "attachmentFileIds" JSONB NOT NULL DEFAULT \'[]\'',
    );
  });

  it('stores cargo photo file ids on order cargo records', () => {
    const sql = readAllMigrations();

    expect(sql).toContain(
      'ALTER TABLE "OrderCargo" ADD COLUMN "cargoPhotoFileIds" JSONB NOT NULL DEFAULT \'[]\'',
    );
  });

  it('contains order exception customer service cases and action history', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TYPE "OrderExceptionCaseSourceRole"');
    expect(sql).toContain('CREATE TYPE "OrderExceptionCaseStatus"');
    expect(sql).toContain('CREATE TYPE "OrderExceptionCaseCompensationStatus"');
    expect(sql).toContain('CREATE TABLE "OrderExceptionCase"');
    expect(sql).toContain('CREATE TABLE "OrderExceptionCaseAction"');
    expect(sql).toContain('"compensationStatus" "OrderExceptionCaseCompensationStatus"');
    expect(sql).toContain('"compensationTargetRole" "OrderExceptionCaseSourceRole"');
    expect(sql).toContain('"compensationAmountCents" INTEGER');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "OrderExceptionCase_sourceEventId_key"',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "OrderExceptionCase_caseNo_key"',
    );
    expect(sql).toContain('OrderExceptionCase_status_created_idx');
    expect(sql).toContain('OrderExceptionCaseAction_case_created_idx');
  });

  it('contains order mutation idempotency persistence', () => {
    const sql = readAllMigrations();

    expect(sql).toContain('CREATE TABLE "OrderIdempotencyRecord"');
    expect(sql).toContain('"requestFingerprint" TEXT NOT NULL');
    expect(sql).toContain('"responseSnapshot" JSONB NOT NULL');
    expect(sql).toContain(
      'OrderIdempotencyRecord_actor_operation_key_unique',
    );
    expect(sql).toContain('OrderIdempotencyRecord_expires_idx');
    expect(sql).toContain('REFERENCES "User"("id")');
    expect(sql).toContain('REFERENCES "Order"("id")');
  });

  it('wraps sequence allocation and canonical coupon repair in one transaction', () => {
    const sql = readTargetMigration();
    const beginIndex = sql.indexOf('BEGIN;');
    const sequenceIndex = sql.indexOf('CREATE SEQUENCE "Order_order_no_seq"');
    const canonicalIndex = sql.indexOf(
      'CREATE TEMP TABLE "_CouponCanonicalOwner"',
    );
    const preflightIndex = sql.indexOf('DO $$');
    const preflightEndIndex = sql.indexOf('END $$;', preflightIndex);
    const firstUpdateIndex = sql.indexOf('UPDATE "ShipperCoupon"');
    const commitIndex = sql.lastIndexOf('COMMIT;');

    expect(sql.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql).toMatch(
      /CREATE SEQUENCE "Order_order_no_seq"\s+AS BIGINT\s+START WITH 1\s+INCREMENT BY 1\s+NO CYCLE;/,
    );
    expect(sequenceIndex).toBeGreaterThan(beginIndex);
    expect(canonicalIndex).toBeGreaterThan(sequenceIndex);
    expect(preflightIndex).toBeGreaterThan(canonicalIndex);
    expect(preflightEndIndex).toBeGreaterThan(preflightIndex);
    expect(firstUpdateIndex).toBeGreaterThan(preflightEndIndex);
    expect(commitIndex).toBeGreaterThan(firstUpdateIndex);
  });

  it('blocks coupon and order writes before taking the canonical snapshot', () => {
    const sql = readTargetMigration();
    const couponLockIndex = sql.indexOf(
      'LOCK TABLE "ShipperCoupon" IN SHARE MODE;',
    );
    const orderLockIndex = sql.indexOf('LOCK TABLE "Order" IN SHARE MODE;');
    const canonicalIndex = sql.indexOf(
      'CREATE TEMP TABLE "_CouponCanonicalOwner"',
    );

    expect(couponLockIndex).toBeGreaterThan(sql.indexOf('BEGIN;'));
    expect(orderLockIndex).toBeGreaterThan(couponLockIndex);
    expect(canonicalIndex).toBeGreaterThan(orderLockIndex);
  });

  it('fails closed when an order references a missing coupon row', () => {
    const sql = readTargetMigration();

    expect(sql).toMatch(
      /FROM "Order" o\s+LEFT JOIN "ShipperCoupon" c ON c\."id" = o\."couponId"\s+WHERE o\."couponId" IS NOT NULL\s+AND c\."id" IS NULL/,
    );
    expect(sql).toContain("o.\"id\" || ':' || o.\"orderNo\"");
    expect(sql).toContain('order coupon reference conflict: couponId=%s');
  });

  it('captures canonical owners and fails closed before repairing coupon rows', () => {
    const sql = readTargetMigration();

    expect(sql).toContain('AS "nonCancelledCount"');
    expect(sql).toContain('AS "canonicalOrderId"');
    expect(sql).toContain('AS "canonicalOrderNo"');
    expect(sql).toContain('AS "canonicalStatus"');
    expect(sql).toContain('AS "canonicalOrderIds"');
    expect(sql).toContain('AS "referenceCount"');
    expect(sql).toContain('o."status" <> \'cancelled\'');
    expect(sql).toContain(
      'o."shipperId" IS DISTINCT FROM c."shipperId"',
    );
    expect(sql).toContain('owner."nonCancelledCount" > 1');
    expect(sql).toContain(
      'metadata_order."couponId" IS DISTINCT FROM c."id"',
    );
    expect(sql).toContain('c."status" = \'used\'');
    expect(sql).toContain('owner."canonicalStatus" <> \'completed\'');
    expect(sql).toContain('RAISE EXCEPTION USING MESSAGE = format(');
    expect(sql).toContain('couponId=%s');
    expect(sql).toContain('orderIds=%s');
    expect(sql).toContain('metadataOrderNo=%s');
  });

  it('rejects used coupons without one completed canonical owner', () => {
    const sql = readTargetMigration();
    const preflight = sql.slice(sql.indexOf('DO $$'), sql.indexOf('END $$;'));
    const updates = sql.match(/UPDATE "ShipperCoupon"[\s\S]*?;/g) ?? [];
    const usableUpdate =
      updates.find(update => update.includes('SET "status" = \'usable\'')) ?? '';

    expect(preflight).toMatch(
      /c\."status" = 'used'\s+AND NOT \(\s*owner\."nonCancelledCount" = 1\s+AND owner\."canonicalStatus" = 'completed'\s*\)/,
    );
    expect(preflight).toContain(
      'c."status" NOT IN (\'usable\', \'locked\', \'used\', \'expired\')',
    );
    expect(usableUpdate).toContain(
      'c."status" IN (\'usable\', \'locked\')',
    );
  });

  it('uses the canonical completion time and only rejects real metadata owners', () => {
    const sql = readTargetMigration();

    expect(sql).toContain('AS "canonicalOrderUpdatedAt"');
    expect(sql).toContain(
      '"usedAt" = COALESCE(c."usedAt", owner."canonicalOrderUpdatedAt")',
    );
    expect(sql).toContain(
      'LEFT JOIN "Order" metadata_order ON metadata_order."orderNo" = metadata."orderNo"',
    );
    expect(sql).toContain('metadata_order."id" IS NOT NULL');
    expect(sql).toContain(
      'metadata_order."couponId" IS DISTINCT FROM c."id"',
    );
  });

  it('repairs active completed expired and usable coupons with disjoint updates', () => {
    const sql = readTargetMigration();
    const updates = sql.match(/UPDATE "ShipperCoupon"[\s\S]*?;/g) ?? [];
    const transactionStartUtc = "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')";
    const completedUpdate =
      updates.find(update => update.includes('SET "status" = \'used\'')) ?? '';
    const expiredUpdate =
      updates.find(update => update.includes('SET "status" = \'expired\'')) ?? '';
    const usableUpdate =
      updates.find(update => update.includes('SET "status" = \'usable\'')) ?? '';

    expect(updates).toHaveLength(4);
    expect(updates[0]).toContain('SET "status" = \'locked\'');
    expect(updates[0]).toContain('owner."canonicalStatus" <> \'completed\'');
    expect(updates[0]).toContain(
      `"lockedAt" = COALESCE(c."lockedAt", ${transactionStartUtc})`,
    );
    expect(completedUpdate).toContain(
      'owner."canonicalStatus" = \'completed\'',
    );
    expect(completedUpdate).not.toContain('c."status"');
    expect(expiredUpdate).toContain('c."status" = \'expired\'');
    expect(expiredUpdate).toContain(
      `c."validUntil" <= ${transactionStartUtc}`,
    );
    expect(usableUpdate).toContain(
      'c."status" IN (\'usable\', \'locked\')',
    );
    expect(usableUpdate).toContain(
      `c."validUntil" > ${transactionStartUtc}`,
    );

    for (const update of updates) {
      expect(update).toContain('"lockedOrderNo"');
      expect(update).toContain('"lockedAt"');
      expect(update).toContain('"usedOrderNo"');
      expect(update).toContain('"usedAt"');
    }
  });
});

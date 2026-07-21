import { readFileSync } from 'fs';
import { join } from 'path';

const migrationSqlPath = join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '20260720010000_exception_case_compensation_execution',
  'migration.sql',
);

describe('exception case compensation execution migration', () => {
  const sql = readFileSync(migrationSqlPath, 'utf8');

  it('adds the new enum values outside the DDL transaction', () => {
    const addExecuted = sql.indexOf(
      `ALTER TYPE "OrderExceptionCaseCompensationStatus" ADD VALUE IF NOT EXISTS 'executed'`,
    );
    const addCompensationType = sql.indexOf(
      `ALTER TYPE "FinancialTransactionType" ADD VALUE IF NOT EXISTS 'order_compensation'`,
    );
    const beginIndex = sql.indexOf('BEGIN;');

    expect(addExecuted).toBeGreaterThanOrEqual(0);
    expect(addCompensationType).toBeGreaterThanOrEqual(0);
    expect(beginIndex).toBeGreaterThan(addExecuted);
    expect(beginIndex).toBeGreaterThan(addCompensationType);
  });

  it('creates the appeal status enum', () => {
    expect(sql).toContain('CREATE TYPE "OrderExceptionCaseAppealStatus"');
  });

  it('adds the compensation execution and appeal columns', () => {
    expect(sql).toContain('"compensationTransactionId" TEXT');
    expect(sql).toContain('"compensationExecutedAt" TIMESTAMP(3)');
    expect(sql).toContain(
      '"appealStatus" "OrderExceptionCaseAppealStatus" NOT NULL DEFAULT \'none\'',
    );
    expect(sql).toContain('"appealReason" TEXT');
    expect(sql).toContain('"appealRequestedAt" TIMESTAMP(3)');
  });

  it('links the compensation transaction with a unique foreign key', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "OrderExceptionCase_compensationTransactionId_key"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "OrderExceptionCase_compensationTransactionId_fkey"',
    );
    expect(sql).toContain('REFERENCES "FinancialTransaction"("id")');
  });

  it('rewrites the compensation consistency guard to accept executed', () => {
    expect(sql).toContain(
      'DROP CONSTRAINT "OrderExceptionCase_compensation_consistency_chk"',
    );
    expect(sql).toContain(
      `"compensationStatus" IN ('pending', 'offline_completed', 'executed')`,
    );
  });

  it('guards executed compensation and appeal consistency', () => {
    expect(sql).toContain(
      'ADD CONSTRAINT "OrderExceptionCase_compensation_execution_chk"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "OrderExceptionCase_appeal_consistency_chk"',
    );
  });
});

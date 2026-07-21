import { readFileSync } from 'fs';
import { join } from 'path';

describe('sandbox payout reconciliation migration', () => {
  const migrationSql = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'prisma',
      'migrations',
      '20260721020000_sandbox_payout_reconciliation',
      'migration.sql',
    ),
    'utf8',
  );
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  it('adds payout metadata columns on DriverWithdrawal', () => {
    expect(schema).toContain('payoutChannel          String?');
    expect(schema).toContain('providerPayoutNo       String?');
    expect(schema).toContain('payoutExecutedAt       DateTime?');
    expect(migrationSql).toContain('ADD COLUMN "payoutChannel" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "providerPayoutNo" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "payoutExecutedAt" TIMESTAMP(3)');
    expect(migrationSql).toContain(
      'CREATE INDEX "DriverWithdrawal_provider_payout_no_idx"',
    );
  });
});

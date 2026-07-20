import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('payment settlement financial ledger migration', () => {
  const schemaPath = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
  const migrationPath = join(
    __dirname,
    '..',
    '..',
    'prisma',
    'migrations',
    '20260715010000_payment_settlement_financial_ledger',
    'migration.sql',
  );

  function readSchema() {
    return readFileSync(schemaPath, 'utf8');
  }

  function readMigration() {
    return existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
  }

  it('defines the order payment state and financial domain models', () => {
    const schema = readSchema();

    expect(schema).toMatch(/enum OrderPaymentStatus\s*{[\s\S]*legacy_unverified[\s\S]*}/);
    expect(schema).toMatch(/enum PaymentChannel\s*{[\s\S]*sandbox[\s\S]*wechat[\s\S]*alipay[\s\S]*}/);
    expect(schema).toContain('enum PaymentOrderStatus');
    expect(schema).toContain('enum RefundStatus');
    expect(schema).toContain('enum FinancialTransactionType');
    expect(schema).toContain('enum FinancialAccountType');
    expect(schema).toContain('enum LedgerDirection');
    expect(schema).toContain('enum FinancialOutboxStatus');

    for (const model of [
      'PaymentOrder',
      'PaymentCallbackEvent',
      'Refund',
      'Settlement',
      'FinancialTransaction',
      'FinancialLedgerEntry',
      'DriverWallet',
      'FinancialOutboxEvent',
      'FinancialAuditLog',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it('extends orders and withdrawals with durable financial references', () => {
    const schema = readSchema();

    expect(schema).toMatch(/paymentStatus\s+OrderPaymentStatus\s+@default\(legacy_unverified\)/);
    expect(schema).toMatch(/assignedDriverId\s+String\?/);
    expect(schema).toMatch(/paymentSettledAt\s+DateTime\?/);
    expect(schema).toMatch(/refundedAt\s+DateTime\?/);
    expect(schema).toMatch(/idempotencyKey\s+String\?/);
    expect(schema).toMatch(/requestFingerprint\s+String\?/);
    expect(schema).toContain('financialTransactionId String?');
  });

  it('adds all historical orders as legacy unverified without inventing money facts', () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /ADD COLUMN "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'legacy_unverified'/,
    );
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"Settlement"/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"FinancialTransaction"/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"FinancialLedgerEntry"/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"DriverWallet"/i);
  });

  it('enforces one active payment attempt per order in PostgreSQL', () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "PaymentOrder_order_active_unique"\s+ON "PaymentOrder"\("orderId"\)\s+WHERE "status" IN \('pending', 'processing', 'escrowed', 'refund_pending'\)/,
    );
  });

  it('enforces positive amounts and non-negative wallet balances', () => {
    const sql = readMigration();

    expect(sql).toContain(
      'CONSTRAINT "PaymentOrder_amountCents_positive_chk" CHECK ("amountCents" > 0)',
    );
    expect(sql).toContain(
      'CONSTRAINT "Refund_amountCents_positive_chk" CHECK ("amountCents" > 0)',
    );
    expect(sql).toContain(
      'CONSTRAINT "FinancialLedgerEntry_amountCents_positive_chk" CHECK ("amountCents" > 0)',
    );
    expect(sql).toContain(
      'CONSTRAINT "DriverWallet_balances_nonnegative_chk" CHECK ("availableCents" >= 0 AND "reservedCents" >= 0 AND "withdrawnCents" >= 0)',
    );
    expect(sql).toContain(
      'CONSTRAINT "Settlement_amounts_consistent_chk"',
    );
  });

  it('makes ledger entries immutable', () => {
    const sql = readMigration();

    expect(sql).toContain(
      'CREATE FUNCTION "prevent_financial_ledger_entry_mutation"()',
    );
    expect(sql).toMatch(
      /CREATE TRIGGER "FinancialLedgerEntry_immutable"\s+BEFORE UPDATE OR DELETE ON "FinancialLedgerEntry"/,
    );
    expect(sql).toContain(
      'RAISE EXCEPTION USING ERRCODE = \'55000\'',
    );
  });

  it('checks every financial transaction balance at commit time', () => {
    const sql = readMigration();

    expect(sql).toContain(
      'CREATE FUNCTION "assert_financial_transaction_balanced"()',
    );
    expect(sql).toContain(
      'SUM(CASE WHEN "direction" = \'credit\' THEN "amountCents" ELSE -"amountCents" END)',
    );
    expect(sql).toMatch(
      /CREATE CONSTRAINT TRIGGER "FinancialLedgerEntry_balance_deferred"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*EXECUTE FUNCTION "assert_financial_transaction_balanced"\(\)/,
    );
    expect(sql).toMatch(
      /CREATE CONSTRAINT TRIGGER "FinancialTransaction_balance_deferred"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*EXECUTE FUNCTION "assert_financial_transaction_balanced"\(\)/,
    );
  });
});

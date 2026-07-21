import { buildFinanceReconciliationReport } from './finance-reconciliation';

describe('buildFinanceReconciliationReport', () => {
  it('detects wallet mismatches and paid withdrawals missing payout metadata', async () => {
    const report = await buildFinanceReconciliationReport(
      {
        listWallets: async () => [
          {
            driverId: 'driver-1',
            availableCents: 1000,
            reservedCents: 0,
            withdrawnCents: 0,
          },
        ],
        listSettlements: async () => [
          {
            id: 'settlement-1',
            driverId: 'driver-1',
            driverNetAmountCents: 5000,
            financialTransactionId: 'ft-settlement-1',
          },
        ],
        listWithdrawals: async () => [
          {
            id: 'withdrawal-1',
            driverId: 'driver-1',
            amountCents: 2000,
            status: 'paid',
            providerPayoutNo: null,
            financialTransactionId: null,
          },
        ],
        listFinancialTransactions: async () => [
          {
            id: 'ft-settlement-1',
            type: 'online_order_settlement',
            referenceId: 'settlement-1',
            amountCents: 5000,
          },
        ],
        listLegacyUnverifiedOrders: async () => [
          { id: 'order-legacy-1', orderNo: 'HYLEGACY1' },
        ],
      },
      () => new Date('2026-07-21T12:00:00.000Z'),
    );

    expect(report.summary).toEqual({
      findingCount: 4,
      errorCount: 3,
      warningCount: 1,
    });
    expect(report.findings.map(item => item.code).sort()).toEqual(
      [
        'legacy_unverified_orders',
        'paid_withdrawal_missing_ledger',
        'paid_withdrawal_missing_payout_no',
        'wallet_vs_settlement_mismatch',
      ].sort(),
    );
  });
});

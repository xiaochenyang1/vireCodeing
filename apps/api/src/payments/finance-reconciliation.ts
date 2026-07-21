export type FinanceReconciliationSeverity = 'warning' | 'error';

export type FinanceReconciliationFinding = {
  code: string;
  severity: FinanceReconciliationSeverity;
  entityType: string;
  entityId: string;
  amountCents?: number;
  message: string;
};

export type FinanceReconciliationReport = {
  generatedAtIso: string;
  summary: {
    findingCount: number;
    errorCount: number;
    warningCount: number;
  };
  findings: FinanceReconciliationFinding[];
};

export type FinanceReconciliationSource = {
  listWallets(): Promise<
    Array<{
      driverId: string;
      availableCents: number;
      reservedCents: number;
      withdrawnCents: number;
    }>
  >;
  listSettlements(): Promise<
    Array<{
      id: string;
      driverId: string;
      driverNetAmountCents: number;
      financialTransactionId: string;
    }>
  >;
  listWithdrawals(): Promise<
    Array<{
      id: string;
      driverId: string;
      amountCents: number;
      status: string;
      providerPayoutNo?: string | null;
      financialTransactionId?: string | null;
    }>
  >;
  listFinancialTransactions(): Promise<
    Array<{
      id: string;
      type: string;
      referenceId: string;
      amountCents: number;
    }>
  >;
  listLegacyUnverifiedOrders(): Promise<
    Array<{
      id: string;
      orderNo: string;
    }>
  >;
};

export async function buildFinanceReconciliationReport(
  source: FinanceReconciliationSource,
  now: () => Date = () => new Date(),
): Promise<FinanceReconciliationReport> {
  const [wallets, settlements, withdrawals, transactions, legacyOrders] =
    await Promise.all([
      source.listWallets(),
      source.listSettlements(),
      source.listWithdrawals(),
      source.listFinancialTransactions(),
      source.listLegacyUnverifiedOrders(),
    ]);

  const findings: FinanceReconciliationFinding[] = [];
  const settlementByDriver = new Map<string, number>();
  const withdrawalLedgerByReference = new Map(
    transactions
      .filter(item => item.type === 'driver_withdrawal')
      .map(item => [item.referenceId, item]),
  );
  const settlementLedgerById = new Map(
    transactions
      .filter(item => item.type.endsWith('_order_settlement'))
      .map(item => [item.id, item]),
  );

  for (const settlement of settlements) {
    settlementByDriver.set(
      settlement.driverId,
      (settlementByDriver.get(settlement.driverId) ?? 0) +
        settlement.driverNetAmountCents,
    );
    if (!settlementLedgerById.has(settlement.financialTransactionId)) {
      findings.push({
        code: 'settlement_missing_ledger',
        severity: 'error',
        entityType: 'settlement',
        entityId: settlement.id,
        amountCents: settlement.driverNetAmountCents,
        message: '结算记录缺少对应资金流水',
      });
    }
  }

  for (const wallet of wallets) {
    const settledNet = settlementByDriver.get(wallet.driverId) ?? 0;
    const paidWithdrawals = withdrawals
      .filter(
        item => item.driverId === wallet.driverId && item.status === 'paid',
      )
      .reduce((total, item) => total + item.amountCents, 0);
    const reviewingWithdrawals = withdrawals
      .filter(
        item =>
          item.driverId === wallet.driverId && item.status === 'reviewing',
      )
      .reduce((total, item) => total + item.amountCents, 0);
    const expectedAvailable = settledNet - paidWithdrawals - reviewingWithdrawals;
    const expectedReserved = reviewingWithdrawals;
    const expectedWithdrawn = paidWithdrawals;

    if (
      wallet.availableCents !== expectedAvailable ||
      wallet.reservedCents !== expectedReserved ||
      wallet.withdrawnCents !== expectedWithdrawn
    ) {
      findings.push({
        code: 'wallet_vs_settlement_mismatch',
        severity: 'error',
        entityType: 'driver_wallet',
        entityId: wallet.driverId,
        amountCents: wallet.availableCents - expectedAvailable,
        message: `钱包与结算/提现累计不一致 available=${wallet.availableCents} expected=${expectedAvailable}`,
      });
    }

    if (wallet.reservedCents !== expectedReserved) {
      findings.push({
        code: 'reviewing_withdrawal_reserved_mismatch',
        severity: 'warning',
        entityType: 'driver_wallet',
        entityId: wallet.driverId,
        amountCents: wallet.reservedCents - expectedReserved,
        message: `审核中提现预留金额不一致 reserved=${wallet.reservedCents} expected=${expectedReserved}`,
      });
    }
  }

  for (const withdrawal of withdrawals) {
    if (withdrawal.status !== 'paid') {
      continue;
    }

    if (!withdrawal.providerPayoutNo) {
      findings.push({
        code: 'paid_withdrawal_missing_payout_no',
        severity: 'error',
        entityType: 'driver_withdrawal',
        entityId: withdrawal.id,
        amountCents: withdrawal.amountCents,
        message: '已付款提现缺少 providerPayoutNo',
      });
    }

    if (
      !withdrawal.financialTransactionId &&
      !withdrawalLedgerByReference.has(withdrawal.id)
    ) {
      findings.push({
        code: 'paid_withdrawal_missing_ledger',
        severity: 'error',
        entityType: 'driver_withdrawal',
        entityId: withdrawal.id,
        amountCents: withdrawal.amountCents,
        message: '已付款提现缺少 driver_withdrawal 资金流水',
      });
    }
  }

  for (const order of legacyOrders) {
    findings.push({
      code: 'legacy_unverified_orders',
      severity: 'warning',
      entityType: 'order',
      entityId: order.id,
      message: `历史未核资金订单 ${order.orderNo}`,
    });
  }

  const errorCount = findings.filter(item => item.severity === 'error').length;
  const warningCount = findings.filter(
    item => item.severity === 'warning',
  ).length;

  return {
    generatedAtIso: now().toISOString(),
    summary: {
      findingCount: findings.length,
      errorCount,
      warningCount,
    },
    findings,
  };
}

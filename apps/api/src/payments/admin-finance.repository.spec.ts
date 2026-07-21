import {
  PrismaAdminFinanceRepository,
  type PrismaAdminFinanceClient,
  type PrismaAdminFinanceTransactionClient,
} from './admin-finance.repository';

const NOW = new Date('2026-07-15T08:00:00.000Z');

describe('PrismaAdminFinanceRepository', () => {
  it('lists filtered payments with stable pagination and order drill-down', async () => {
    const prisma = createPrismaClient();
    prisma.paymentOrder.findMany.mockResolvedValue([
      {
        id: 'payment-1',
        paymentNo: 'PAY-1',
        orderId: 'order-1',
        shipperId: 'shipper-1',
        channel: 'wechat',
        amountCents: 31000,
        status: 'escrowed',
        providerTradeNo: 'WX-1',
        failureCode: null,
        failureMessage: null,
        expiresAt: NOW,
        paidAt: NOW,
        settledAt: null,
        cancelledAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    prisma.paymentOrder.count.mockResolvedValue(1);
    const repository = new PrismaAdminFinanceRepository(
      prisma as unknown as PrismaAdminFinanceClient,
    );

    await expect(
      repository.listPayments({
        page: 2,
        pageSize: 20,
        status: 'escrowed',
        orderId: 'order-1',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'payment-1',
          status: 'escrowed',
          paidAtIso: NOW.toISOString(),
        }),
      ],
      total: 1,
      page: 2,
      pageSize: 20,
    });
    expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith({
      where: { status: 'escrowed', orderId: 'order-1' },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
    });
    expect(prisma.paymentOrder.count).toHaveBeenCalledWith({
      where: { status: 'escrowed', orderId: 'order-1' },
    });
  });

  it('builds a finance report snapshot from current payments, refunds, settlements and withdrawals', async () => {
    const prisma = createPrismaClient();
    prisma.paymentOrder.findMany.mockResolvedValue([
      {
        id: 'payment-1',
        paymentNo: 'PAY-1',
        orderId: 'order-1',
        shipperId: 'shipper-1',
        channel: 'wechat',
        amountCents: 31000,
        status: 'escrowed',
        providerTradeNo: null,
        failureCode: null,
        failureMessage: null,
        expiresAt: NOW,
        paidAt: NOW,
        settledAt: null,
        cancelledAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'payment-2',
        paymentNo: 'PAY-2',
        orderId: 'order-2',
        shipperId: 'shipper-2',
        channel: 'alipay',
        amountCents: 15000,
        status: 'refund_failed',
        providerTradeNo: null,
        failureCode: 'provider_failed',
        failureMessage: 'timeout',
        expiresAt: NOW,
        paidAt: NOW,
        settledAt: null,
        cancelledAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    prisma.refund.findMany.mockResolvedValue([
      {
        ...createRefund(),
        status: 'failed',
        amountCents: 8000,
      },
      {
        ...createRefund(),
        id: 'refund-2',
        refundNo: 'RF-2',
        status: 'succeeded',
        amountCents: 5000,
      },
    ]);
    prisma.settlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        orderId: 'order-1',
        paymentOrderId: 'payment-1',
        driverId: 'driver-1',
        grossAmountCents: 31000,
        platformFeeRateBps: 1200,
        platformFeeCents: 3720,
        driverNetAmountCents: 27280,
        financialTransactionId: 'txn-1',
        settledAt: NOW,
        createdAt: NOW,
      },
    ]);
    prisma.driverWithdrawal.findMany.mockResolvedValue([
      {
        id: 'withdrawal-1',
        driverId: 'driver-1',
        amountCents: 12000,
        bankAccountName: '张三',
        bankName: '招商银行',
        bankAccountMasked: '****1234',
        status: 'reviewing',
        version: 3,
        rejectionReason: null,
        processedByAdminId: null,
        processedAt: null,
        payoutChannel: null,
        providerPayoutNo: null,
        payoutExecutedAt: null,
        financialTransactionId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'withdrawal-2',
        driverId: 'driver-2',
        amountCents: 9000,
        bankAccountName: '李四',
        bankName: '中国银行',
        bankAccountMasked: '****5678',
        status: 'paid',
        version: 1,
        rejectionReason: null,
        processedByAdminId: 'admin-1',
        processedAt: NOW,
        payoutChannel: 'sandbox',
        providerPayoutNo: 'sandbox-payout-withdrawal-2',
        payoutExecutedAt: NOW,
        financialTransactionId: 'txn-2',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    prisma.financialOutboxEvent.findMany.mockResolvedValue([
      {
        id: 'outbox-1',
        refundId: 'refund-1',
        status: 'dead',
        attemptCount: 10,
        maxAttempts: 10,
        availableAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'outbox-2',
        refundId: 'refund-2',
        status: 'pending',
        attemptCount: 1,
        maxAttempts: 10,
        availableAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const repository = new PrismaAdminFinanceRepository(
      prisma as unknown as PrismaAdminFinanceClient,
      {
        now: () => NOW,
      },
    );

    await expect(repository.getReport()).resolves.toEqual({
      generatedAtIso: NOW.toISOString(),
      summary: {
        paymentCount: 2,
        paymentAmountCents: 46000,
        refundCount: 2,
        refundAmountCents: 13000,
        settlementCount: 1,
        settlementGrossAmountCents: 31000,
        settlementPlatformFeeCents: 3720,
        settlementDriverNetAmountCents: 27280,
        pendingWithdrawalCount: 1,
        pendingWithdrawalAmountCents: 12000,
        deadRefundOutboxCount: 1,
      },
      paymentStatusBreakdown: [
        { status: 'escrowed', count: 1, amountCents: 31000 },
        { status: 'refund_failed', count: 1, amountCents: 15000 },
      ],
      refundStatusBreakdown: [
        { status: 'failed', count: 1, amountCents: 8000 },
        { status: 'succeeded', count: 1, amountCents: 5000 },
      ],
      withdrawalStatusBreakdown: [
        { status: 'paid', count: 1, amountCents: 9000 },
        { status: 'reviewing', count: 1, amountCents: 12000 },
      ],
      refundOutboxStatusBreakdown: [
        { status: 'dead', count: 1 },
        { status: 'pending', count: 1 },
      ],
      settlementSummary: {
        count: 1,
        grossAmountCents: 31000,
        platformFeeCents: 3720,
        driverNetAmountCents: 27280,
      },
    });
    expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.refund.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      orderBy: { settledAt: 'desc' },
    });
    expect(prisma.driverWithdrawal.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.financialOutboxEvent.findMany).toHaveBeenCalledWith({
      where: { eventType: 'refund.requested' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lists refunds with latest refund outbox summary for admin retry decisions', async () => {
    const prisma = createPrismaClient();
    prisma.refund.findMany.mockResolvedValue([
      {
        ...createRefund(),
        status: 'refund_failed',
      },
    ]);
    prisma.refund.count.mockResolvedValue(1);
    prisma.financialOutboxEvent.findMany.mockResolvedValue([
      {
        id: 'outbox-1',
        refundId: 'refund-1',
        status: 'dead',
        attemptCount: 10,
        maxAttempts: 10,
        availableAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const repository = new PrismaAdminFinanceRepository(
      prisma as unknown as PrismaAdminFinanceClient,
    );

    await expect(
      repository.listRefunds({
        page: 1,
        pageSize: 20,
        status: 'refund_failed',
        orderId: 'order-1',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'refund-1',
          status: 'refund_failed',
          outboxEvent: expect.objectContaining({
            id: 'outbox-1',
            status: 'dead',
            attemptCount: 10,
          }),
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.refund.findMany).toHaveBeenCalledWith({
      where: { status: 'refund_failed', orderId: 'order-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(prisma.financialOutboxEvent.findMany).toHaveBeenCalledWith({
      where: {
        refundId: { in: ['refund-1'] },
        eventType: 'refund.requested',
      },
      orderBy: [{ refundId: 'asc' }, { createdAt: 'desc' }],
    });
  });

  it('filters settlements by orderId for order-to-finance drill-down', async () => {
    const prisma = createPrismaClient();
    prisma.settlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        orderId: 'order-1',
        paymentOrderId: 'payment-1',
        driverId: 'driver-1',
        grossAmountCents: 31000,
        platformFeeRateBps: 1200,
        platformFeeCents: 3720,
        driverNetAmountCents: 27280,
        financialTransactionId: 'txn-1',
        settledAt: NOW,
        createdAt: NOW,
      },
    ]);
    prisma.settlement.count.mockResolvedValue(1);
    const repository = new PrismaAdminFinanceRepository(
      prisma as unknown as PrismaAdminFinanceClient,
    );

    await expect(
      repository.listSettlements({
        page: 1,
        pageSize: 20,
        orderId: 'order-1',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'settlement-1',
          orderId: 'order-1',
          financialTransactionId: 'txn-1',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      orderBy: { settledAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(prisma.settlement.count).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    });
  });

  it('requeues a dead refund with CAS and audit in one transaction', async () => {
    const transaction = {
      financialAuditLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createAuditLog()),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(createRefund()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialOutboxEvent: {
        findFirst: jest.fn().mockResolvedValue(createOutboxEvent()),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = createPrismaClient();
    prisma.$transaction.mockImplementation(
      async (
        callback: (
          transaction: PrismaAdminFinanceTransactionClient,
        ) => Promise<unknown>,
      ) => callback(transaction as PrismaAdminFinanceTransactionClient),
    );
    const repository = new PrismaAdminFinanceRepository(
      prisma as unknown as PrismaAdminFinanceClient,
      {
      now: () => NOW,
      createId: () => 'audit-1',
      },
    );
    const input = createRetryInput();

    await expect(repository.retryRefund(input)).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      refund: { id: 'refund-1', status: 'pending' },
      outboxEvent: { id: 'outbox-1', status: 'pending', attemptCount: 0 },
      auditLog: { id: 'audit-1', action: 'refund.retry' },
    });
    expect(transaction.financialOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'outbox-1', status: 'dead', attemptCount: 10 },
      data: {
        status: 'pending',
        attemptCount: 0,
        availableAt: NOW,
        claimedAt: null,
        leaseExpiresAt: null,
        claimedBy: null,
        processedAt: null,
        lastError: null,
        updatedAt: NOW,
      },
    });
    expect(transaction.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 'refund-1', status: 'failed' },
      data: {
        status: 'pending',
        failureCode: null,
        failureMessage: null,
        failedAt: null,
        updatedAt: NOW,
      },
    });
    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: 'refund_failed' },
      data: {
        status: 'refund_pending',
        failureCode: null,
        failureMessage: null,
        updatedAt: NOW,
      },
    });
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', paymentStatus: 'refund_failed' },
      data: { paymentStatus: 'refund_pending', updatedAt: NOW },
    });
    expect(transaction.financialAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'audit-1',
        actorAdminId: 'admin-1',
        action: 'refund.retry',
        entityId: 'refund-1',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
      }),
    });
  });
});

function createPrismaClient() {
  return {
    $transaction: jest.fn(),
    paymentOrder: { findMany: jest.fn(), count: jest.fn() },
    refund: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    settlement: { findMany: jest.fn(), count: jest.fn() },
    financialTransaction: { findUnique: jest.fn() },
    driverWithdrawal: { findMany: jest.fn(), count: jest.fn() },
    financialAuditLog: { findUnique: jest.fn() },
    financialOutboxEvent: { findFirst: jest.fn(), findMany: jest.fn() },
  };
}

function createRefund() {
  return {
    id: 'refund-1',
    refundNo: 'RF-1',
    paymentOrderId: 'payment-1',
    orderId: 'order-1',
    shipperId: 'shipper-1',
    channel: 'wechat',
    amountCents: 31000,
    reason: '取消订单',
    status: 'failed',
    providerRefundNo: null,
    failureCode: 'provider_request_failed',
    failureMessage: 'timeout',
    processingStartedAt: NOW,
    succeededAt: null,
    failedAt: NOW,
    financialTransactionId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createOutboxEvent() {
  return {
    id: 'outbox-1',
    refundId: 'refund-1',
    status: 'dead',
    attemptCount: 10,
    maxAttempts: 10,
    availableAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createAuditLog() {
  return {
    id: 'audit-1',
    actorAdminId: 'admin-1',
    action: 'refund.retry',
    entityType: 'refund',
    entityId: 'refund-1',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
    requestFingerprint: 'retry-fingerprint',
    requestId: 'request-admin-1',
    reason: '人工确认渠道恢复',
    beforeState: {},
    afterState: {},
    createdAt: NOW,
  };
}

function createRetryInput() {
  return {
    refundId: 'refund-1',
    adminId: 'admin-1',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
    requestFingerprint: 'retry-fingerprint',
    requestId: 'request-admin-1',
    expectedVersion: 10,
    reason: '人工确认渠道恢复',
  };
}

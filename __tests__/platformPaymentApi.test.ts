import {
  createPlatformPaymentApi,
  createSandboxPlatformPaymentSdk,
} from '../src/services/platformPaymentApi';

describe('platform payment api', () => {
  const originalFetch = globalThis.fetch;
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a payment with bearer token, channel body and idempotency key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        replayed: false,
        payment: createPayment(),
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformPaymentApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.createPayment(
      ' order-1 ',
      { channel: 'wechat' },
      idempotencyKey,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': idempotencyKey,
        }),
        body: JSON.stringify({ channel: 'wechat' }),
      }),
    );
  });

  it('gets the latest server payment state by order id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(createPayment({ status: 'escrowed' })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformPaymentApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getLatestPayment('order-1')).resolves.toMatchObject({
      id: 'payment-1',
      status: 'escrowed',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/payments',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reads admin finance report and reconciliation snapshots', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createJsonResponse(createAdminFinanceReport()))
      .mockResolvedValueOnce(
        createJsonResponse(createAdminFinanceReconciliation()),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await expect(api.getAdminFinanceReport()).resolves.toMatchObject({
      summary: {
        paymentCount: 3,
        deadRefundOutboxCount: 1,
      },
    });
    await expect(api.getAdminFinanceReconciliation()).resolves.toMatchObject({
      summary: {
        findingCount: 1,
        errorCount: 1,
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/finance/report',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/finance/reconciliation',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lists admin finance resources with normalized queries', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createJsonResponse(createPage([createPayment()])))
      .mockResolvedValueOnce(createJsonResponse(createPage([createRefund()])))
      .mockResolvedValueOnce(
        createJsonResponse(createPage([createSettlement()])),
      )
      .mockResolvedValueOnce(
        createJsonResponse(createPage([createWithdrawal()])),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await api.listAdminPayments({
      page: 2,
      pageSize: 30,
      status: ' settled ',
      orderId: ' order-1 ',
    });
    await api.listAdminRefunds({ status: ' failed ' });
    await api.listAdminSettlements({ orderId: ' order-2 ' });
    await api.listAdminWithdrawals({ pageSize: 10, status: ' reviewing ' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/finance/payments?page=2&pageSize=30&status=settled&orderId=order-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/finance/refunds?page=1&pageSize=20&status=failed',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/finance/settlements?page=1&pageSize=20&orderId=order-2',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/api/admin/finance/withdrawals?page=1&pageSize=10&status=reviewing',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('gets admin finance ledger transaction detail by transaction id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(createLedgerTransaction()),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await expect(
      api.getAdminLedgerTransaction(' ledger-1 '),
    ).resolves.toMatchObject({
      id: 'ledger-1',
      entries: [expect.objectContaining({ accountType: 'platform_escrow' })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/finance/ledger-transactions/ledger-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retries admin refunds with normalized payload and idempotency key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        kind: 'success',
        replayed: false,
        refund: createRefund({ status: 'pending' }),
        outboxEvent: createOutboxEvent({ status: 'pending', attemptCount: 0 }),
        auditLog: createAuditLog({ action: 'refund.retry' }),
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await api.retryAdminRefund(
      ' refund-1 ',
      { expectedVersion: 2, reason: ' manual retry ' },
      idempotencyKey,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/finance/refunds/refund-1/retry',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': idempotencyKey,
        }),
        body: JSON.stringify({
          expectedVersion: 2,
          reason: 'manual retry',
        }),
      }),
    );
  });

  it('reviews and batch reviews admin withdrawals with normalized payloads', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          kind: 'success',
          replayed: false,
          withdrawal: createWithdrawal({ status: 'paid' }),
          wallet: createWallet(),
          financialTransaction: createLedgerTransaction(),
          auditLog: createAuditLog({ action: 'withdrawal.review' }),
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          kind: 'success',
          replayed: false,
          withdrawal: createWithdrawal({
            status: 'rejected',
            rejectionReason: 'risk',
          }),
          wallet: createWallet(),
          auditLog: createAuditLog({ action: 'withdrawal.review' }),
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          kind: 'success',
          replayed: false,
          action: 'approve',
          withdrawalIds: ['withdrawal-1', 'withdrawal-2'],
          updatedCount: 2,
          items: [
            {
              withdrawal: createWithdrawal({ id: 'withdrawal-1', status: 'paid' }),
              wallet: createWallet(),
              financialTransaction: createLedgerTransaction({
                id: 'ledger-2',
                referenceId: 'withdrawal-1',
              }),
            },
          ],
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    await api.approveAdminWithdrawal(
      ' withdrawal-1 ',
      { expectedVersion: 3, reason: ' passed ' },
      '550e8400-e29b-41d4-a716-446655440001',
    );
    await api.rejectAdminWithdrawal(
      ' withdrawal-2 ',
      { expectedVersion: 4, reason: ' risk issue ' },
      '550e8400-e29b-41d4-a716-446655440002',
    );
    await api.batchReviewAdminWithdrawals(
      {
        action: 'approve',
        reason: ' batch ok ',
        items: [
          { withdrawalId: ' withdrawal-1 ', expectedVersion: 3 },
          { withdrawalId: 'withdrawal-2', expectedVersion: 4 },
        ],
      },
      '550e8400-e29b-41d4-a716-446655440003',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/finance/withdrawals/withdrawal-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 3,
          reason: 'passed',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/finance/withdrawals/withdrawal-2/reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: 4,
          reason: 'risk issue',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/finance/withdrawals/batch-review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          reason: 'batch ok',
          items: [
            { withdrawalId: 'withdrawal-1', expectedVersion: 3 },
            { withdrawalId: 'withdrawal-2', expectedVersion: 4 },
          ],
        }),
      }),
    );
  });

  it('rejects invalid admin finance inputs before sending requests', () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createApi();

    expect(() => api.listAdminPayments({ page: 0 })).toThrow(
      'Platform admin finance page is invalid',
    );
    expect(() =>
      api.retryAdminRefund(
        'refund-1',
        { expectedVersion: -1, reason: 'retry' },
        idempotencyKey,
      ),
    ).toThrow('Platform admin finance expectedVersion is invalid');
    expect(() =>
      api.approveAdminWithdrawal(
        'withdrawal-1',
        { expectedVersion: 0, reason: 'ok' },
        'bad-key',
      ),
    ).toThrow('Platform admin finance Idempotency-Key is invalid');
    expect(() =>
      api.batchReviewAdminWithdrawals(
        {
          action: 'approve',
          reason: 'ok',
          items: [
            { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
            { withdrawalId: ' withdrawal-1 ', expectedVersion: 1 },
          ],
        },
        idempotencyKey,
      ),
    ).toThrow('Platform admin finance withdrawal ids must be unique');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('provides a sandbox sdk that resolves client handoff as succeeded', async () => {
    const sdk = createSandboxPlatformPaymentSdk();

    await expect(
      sdk.openPayment('wechat', { prepayId: 'prepay-1' }),
    ).resolves.toEqual({ status: 'succeeded' });
  });
});

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'request-payment-1',
      timestamp: '2026-07-15T08:00:00.000Z',
    }),
  };
}

function createApi() {
  return createPlatformPaymentApi({
    baseUrl: 'http://localhost:3000/api',
    getAccessToken: () => 'access-token',
  });
}

function createPage(items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    ...overrides,
  };
}

function createAdminFinanceReport(overrides: Record<string, unknown> = {}) {
  return {
    generatedAtIso: '2026-07-25T08:00:00.000Z',
    summary: {
      paymentCount: 3,
      paymentAmountCents: 93000,
      refundCount: 1,
      refundAmountCents: 31000,
      settlementCount: 2,
      settlementGrossAmountCents: 62000,
      settlementPlatformFeeCents: 6200,
      settlementDriverNetAmountCents: 55800,
      pendingWithdrawalCount: 1,
      pendingWithdrawalAmountCents: 12000,
      deadRefundOutboxCount: 1,
    },
    paymentStatusBreakdown: [
      { status: 'settled', count: 2, amountCents: 62000 },
      { status: 'pending', count: 1, amountCents: 31000 },
    ],
    refundStatusBreakdown: [
      { status: 'failed', count: 1, amountCents: 31000 },
    ],
    withdrawalStatusBreakdown: [
      { status: 'reviewing', count: 1, amountCents: 12000 },
    ],
    refundOutboxStatusBreakdown: [
      { status: 'dead', count: 1 },
    ],
    settlementSummary: {
      count: 2,
      grossAmountCents: 62000,
      platformFeeCents: 6200,
      driverNetAmountCents: 55800,
    },
    ...overrides,
  };
}

function createAdminFinanceReconciliation(
  overrides: Record<string, unknown> = {},
) {
  return {
    generatedAtIso: '2026-07-25T08:05:00.000Z',
    summary: {
      findingCount: 1,
      errorCount: 1,
      warningCount: 0,
    },
    findings: [
      {
        code: 'paid_withdrawal_missing_ledger',
        severity: 'error',
        entityType: 'driver_withdrawal',
        entityId: 'withdrawal-1',
        amountCents: 12000,
        message: '已付款提现缺少 driver_withdrawal 资金流水',
      },
    ],
    ...overrides,
  };
}

function createPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    channel: 'wechat',
    amountCents: 31000,
    status: 'pending',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'fingerprint-1',
    clientPayload: { prepayId: 'prepay-1' },
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    createdAtIso: '2026-07-15T08:00:00.000Z',
    updatedAtIso: '2026-07-15T08:00:00.000Z',
    ...overrides,
  };
}

function createRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refund-1',
    refundNo: 'RF-1',
    paymentOrderId: 'payment-1',
    orderId: 'order-1',
    shipperId: 'shipper-1',
    channel: 'wechat',
    amountCents: 31000,
    reason: 'route changed',
    status: 'failed',
    failureCode: 'OUTBOX_DEAD',
    failureMessage: 'dead letter queue',
    failedAtIso: '2026-07-25T08:10:00.000Z',
    financialTransactionId: 'ledger-1',
    outboxEvent: createOutboxEvent(),
    createdAtIso: '2026-07-25T08:00:00.000Z',
    updatedAtIso: '2026-07-25T08:10:00.000Z',
    ...overrides,
  };
}

function createOutboxEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    refundId: 'refund-1',
    status: 'dead',
    attemptCount: 2,
    maxAttempts: 2,
    availableAtIso: '2026-07-25T08:00:00.000Z',
    createdAtIso: '2026-07-25T08:00:00.000Z',
    updatedAtIso: '2026-07-25T08:10:00.000Z',
    ...overrides,
  };
}

function createSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settlement-1',
    orderId: 'order-2',
    paymentOrderId: 'payment-2',
    driverId: 'driver-1',
    grossAmountCents: 31000,
    platformFeeRateBps: 1000,
    platformFeeCents: 3100,
    driverNetAmountCents: 27900,
    financialTransactionId: 'ledger-1',
    settledAtIso: '2026-07-25T08:20:00.000Z',
    createdAtIso: '2026-07-25T08:20:00.000Z',
    ...overrides,
  };
}

function createLedgerTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ledger-1',
    transactionNo: 'TX-1',
    type: 'online_order_settlement',
    referenceId: 'settlement-1',
    orderId: 'order-2',
    paymentOrderId: 'payment-2',
    amountCents: 31000,
    occurredAtIso: '2026-07-25T08:20:00.000Z',
    createdAtIso: '2026-07-25T08:20:00.000Z',
    entries: [
      {
        id: 'entry-1',
        transactionId: 'ledger-1',
        sequence: 1,
        accountType: 'platform_escrow',
        direction: 'debit',
        amountCents: 31000,
        createdAtIso: '2026-07-25T08:20:00.000Z',
      },
    ],
    ...overrides,
  };
}

function createWithdrawal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'withdrawal-1',
    driverId: 'driver-1',
    amountCents: 12000,
    bankAccountName: '张三',
    bankName: '招商银行',
    bankAccountMasked: '****1234',
    status: 'reviewing',
    version: 3,
    createdAtIso: '2026-07-25T08:00:00.000Z',
    updatedAtIso: '2026-07-25T08:00:00.000Z',
    ...overrides,
  };
}

function createWallet(overrides: Record<string, unknown> = {}) {
  return {
    driverId: 'driver-1',
    availableCents: 20000,
    reservedCents: 12000,
    withdrawnCents: 10000,
    version: 4,
    createdAtIso: '2026-07-25T07:00:00.000Z',
    updatedAtIso: '2026-07-25T08:00:00.000Z',
    ...overrides,
  };
}

function createAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    actorAdminId: 'admin-1',
    action: 'refund.retry',
    entityType: 'refund',
    entityId: 'refund-1',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
    requestFingerprint: 'fingerprint-1',
    requestId: 'req-admin-1',
    reason: 'manual retry',
    createdAtIso: '2026-07-25T08:10:00.000Z',
    ...overrides,
  };
}

import type {
  FinancialOutboxEventRecord,
  PaymentOrderRecord,
  PaymentSourceOrderRecord,
  RefundRecord,
} from './dto';
import { FinancialOutboxWorker } from './financial-outbox.worker';
import {
  InMemoryPaymentsRepository,
  PrismaPaymentsRepository,
} from './payments.repository';

const NOW = new Date('2026-07-15T08:00:00.000Z');

describe('FinancialOutboxWorker', () => {
  it('claims a bounded batch before processing refund events', async () => {
    const repository = createRefundRepository();
    const callOrder: string[] = [];
    const claimRefundOutboxEvents =
      repository.claimRefundOutboxEvents.bind(repository);
    jest
      .spyOn(repository, 'claimRefundOutboxEvents')
      .mockImplementation(async input => {
        callOrder.push('claim-transaction-started');
        const claims = await claimRefundOutboxEvents(input);
        callOrder.push('claim-transaction-completed');
        return claims;
      });
    const processor = {
      processRefundOutboxEvent: jest.fn().mockImplementation(async () => {
        callOrder.push('provider-io-started');
      }),
    };
    const worker = new FinancialOutboxWorker(repository, processor, {
      workerId: 'refund-worker-a',
      batchSize: 5,
      leaseDurationMs: 30_000,
      now: () => NOW,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      deadCount: 0,
    });
    expect(processor.processRefundOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          id: 'outbox-1',
          claimedBy: 'refund-worker-a',
        }),
        refund: expect.objectContaining({ id: 'refund-1' }),
        payment: expect.objectContaining({ id: 'payment-1' }),
      }),
    );
    expect(callOrder).toEqual([
      'claim-transaction-started',
      'claim-transaction-completed',
      'provider-io-started',
    ]);
  });

  it('reschedules a temporary provider failure with exponential backoff', async () => {
    const repository = createRefundRepository();
    const processor = {
      processRefundOutboxEvent: jest
        .fn()
        .mockRejectedValue(new Error('provider temporarily unavailable')),
    };
    const worker = new FinancialOutboxWorker(repository, processor, {
      workerId: 'refund-worker-a',
      batchSize: 1,
      leaseDurationMs: 30_000,
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 60_000,
      now: () => NOW,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimedCount: 1,
      succeededCount: 0,
      failedCount: 1,
      deadCount: 0,
    });
    await expect(
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-b',
        limit: 1,
        nowIso: '2026-07-15T08:00:00.999Z',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toEqual([]);
    await expect(
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-b',
        limit: 1,
        nowIso: '2026-07-15T08:00:01.000Z',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          attemptCount: 2,
          availableAtIso: '2026-07-15T08:00:01.000Z',
          claimedBy: 'refund-worker-b',
        }),
        payment: expect.objectContaining({ status: 'refund_failed' }),
        refund: expect.objectContaining({ status: 'processing' }),
      }),
    ]);
  });

  it('marks an event dead after its final provider attempt', async () => {
    const repository = createRefundRepository({ maxAttempts: 1 });
    const processor = {
      processRefundOutboxEvent: jest
        .fn()
        .mockRejectedValue(new Error('provider still unavailable')),
    };
    const worker = new FinancialOutboxWorker(repository, processor, {
      workerId: 'refund-worker-a',
      batchSize: 1,
      retryBaseDelayMs: 1_000,
      now: () => NOW,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimedCount: 1,
      succeededCount: 0,
      failedCount: 1,
      deadCount: 1,
    });
    await expect(
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-b',
        limit: 1,
        nowIso: '2026-07-16T08:00:00.000Z',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toEqual([]);
  });

  it('leases one refund event to only one concurrent worker', async () => {
    const repository = createRefundRepository();

    const [workerAClaims, workerBClaims] = await Promise.all([
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-a',
        limit: 10,
        nowIso: NOW.toISOString(),
        leaseDurationMs: 30_000,
      }),
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-b',
        limit: 10,
        nowIso: NOW.toISOString(),
        leaseDurationMs: 30_000,
      }),
    ]);

    expect([...workerAClaims, ...workerBClaims]).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          id: 'outbox-1',
          status: 'processing',
          attemptCount: 1,
          claimedBy: expect.stringMatching(/^refund-worker-[ab]$/),
          claimedAtIso: NOW.toISOString(),
          leaseExpiresAtIso: '2026-07-15T08:00:30.000Z',
        }),
        refund: expect.objectContaining({
          id: 'refund-1',
          status: 'processing',
          processingStartedAtIso: NOW.toISOString(),
        }),
        payment: expect.objectContaining({ id: 'payment-1' }),
      }),
    ]);
  });

  it('reclaims a processing event only after its lease expires', async () => {
    const repository = createRefundRepository();
    await repository.claimRefundOutboxEvents({
      workerId: 'refund-worker-a',
      limit: 1,
      nowIso: NOW.toISOString(),
      leaseDurationMs: 30_000,
    });

    await expect(
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-b',
        limit: 1,
        nowIso: '2026-07-15T08:00:29.999Z',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toEqual([]);
    await expect(
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-b',
        limit: 1,
        nowIso: '2026-07-15T08:00:30.000Z',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          id: 'outbox-1',
          status: 'processing',
          attemptCount: 2,
          claimedBy: 'refund-worker-b',
          claimedAtIso: '2026-07-15T08:00:30.000Z',
          leaseExpiresAtIso: '2026-07-15T08:01:00.000Z',
        }),
      }),
    ]);
  });

  it('completes an accepted refund request only for the current claim', async () => {
    const repository = createRefundRepository();
    const [claim] = await repository.claimRefundOutboxEvents({
      workerId: 'refund-worker-a',
      limit: 1,
      nowIso: NOW.toISOString(),
      leaseDurationMs: 30_000,
    });

    await expect(
      repository.completeRefundOutboxRequest({
        outboxEventId: claim.event.id,
        workerId: 'refund-worker-b',
        claimAttempt: claim.event.attemptCount,
        providerRefundNo: 'sandbox-refund-1',
        completedAtIso: '2026-07-15T08:00:01.000Z',
      }),
    ).resolves.toEqual({ kind: 'claim-lost' });
    await expect(
      repository.completeRefundOutboxRequest({
        outboxEventId: claim.event.id,
        workerId: 'refund-worker-a',
        claimAttempt: claim.event.attemptCount,
        providerRefundNo: 'sandbox-refund-1',
        completedAtIso: '2026-07-15T08:00:01.000Z',
      }),
    ).resolves.toEqual({
      kind: 'completed',
      event: expect.objectContaining({
        id: 'outbox-1',
        status: 'completed',
        processedAtIso: '2026-07-15T08:00:01.000Z',
      }),
      refund: expect.objectContaining({
        id: 'refund-1',
        status: 'processing',
        providerRefundNo: 'sandbox-refund-1',
      }),
    });
  });

  it('claims PostgreSQL rows with FOR UPDATE SKIP LOCKED', async () => {
    const claimedAt = NOW;
    const leaseExpiresAt = new Date('2026-07-15T08:00:30.000Z');
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        createPrismaOutboxEvent({
          status: 'processing',
          attemptCount: 1,
          claimedAt,
          leaseExpiresAt,
          claimedBy: 'refund-worker-a',
        }),
      ]),
      refund: {
        findUnique: jest.fn().mockResolvedValue(createPrismaRefund()),
        update: jest.fn().mockResolvedValue(
          createPrismaRefund({
            status: 'processing',
            processingStartedAt: claimedAt,
          }),
        ),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(createPrismaPayment()),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.claimRefundOutboxEvents({
        workerId: 'refund-worker-a',
        limit: 10,
        nowIso: NOW.toISOString(),
        leaseDurationMs: 30_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          id: 'outbox-1',
          attemptCount: 1,
          claimedBy: 'refund-worker-a',
        }),
        refund: expect.objectContaining({
          id: 'refund-1',
          status: 'processing',
        }),
        payment: expect.objectContaining({ id: 'payment-1' }),
      }),
    ]);
    const claimSql = transaction.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimSql).toContain('"leaseExpiresAt" <= $1');
    expect(claimSql).toContain('"attemptCount" + 1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.refund.update).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: {
        status: 'processing',
        processingStartedAt: claimedAt,
        failureCode: null,
        failureMessage: null,
        updatedAt: claimedAt,
      },
    });
  });

  it('persists provider acceptance with a PostgreSQL claim-token CAS', async () => {
    const completedAt = new Date('2026-07-15T08:00:01.000Z');
    const processingOutbox = createPrismaOutboxEvent({
      status: 'processing',
      attemptCount: 1,
      claimedAt: NOW,
      leaseExpiresAt: new Date('2026-07-15T08:00:30.000Z'),
      claimedBy: 'refund-worker-a',
    });
    const completedOutbox = createPrismaOutboxEvent({
      status: 'completed',
      attemptCount: 1,
      processedAt: completedAt,
      updatedAt: completedAt,
    });
    const transaction = {
      financialOutboxEvent: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(processingOutbox)
          .mockResolvedValueOnce(completedOutbox),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(createPrismaRefund()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(
          createPrismaRefund({
            status: 'processing',
            providerRefundNo: 'sandbox-refund-1',
            updatedAt: completedAt,
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.completeRefundOutboxRequest({
        outboxEventId: 'outbox-1',
        workerId: 'refund-worker-a',
        claimAttempt: 1,
        providerRefundNo: 'sandbox-refund-1',
        completedAtIso: completedAt.toISOString(),
      }),
    ).resolves.toEqual({
      kind: 'completed',
      event: expect.objectContaining({
        id: 'outbox-1',
        status: 'completed',
      }),
      refund: expect.objectContaining({
        id: 'refund-1',
        providerRefundNo: 'sandbox-refund-1',
      }),
    });
    expect(transaction.financialOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-1',
        status: 'processing',
        claimedBy: 'refund-worker-a',
        attemptCount: 1,
      },
      data: {
        status: 'completed',
        processedAt: completedAt,
        claimedAt: null,
        leaseExpiresAt: null,
        claimedBy: null,
        updatedAt: completedAt,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('marks PostgreSQL refund facts failed and the final outbox attempt dead atomically', async () => {
    const failedAt = new Date('2026-07-15T08:00:01.000Z');
    const nextAvailableAt = new Date('2026-07-15T08:00:02.000Z');
    const processingOutbox = createPrismaOutboxEvent({
      status: 'processing',
      attemptCount: 1,
      maxAttempts: 1,
      claimedAt: NOW,
      leaseExpiresAt: new Date('2026-07-15T08:00:30.000Z'),
      claimedBy: 'refund-worker-a',
    });
    const deadOutbox = createPrismaOutboxEvent({
      status: 'dead',
      attemptCount: 1,
      maxAttempts: 1,
      availableAt: nextAvailableAt,
      processedAt: failedAt,
      lastError: 'provider unavailable',
      updatedAt: failedAt,
    });
    const transaction = {
      financialOutboxEvent: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(processingOutbox)
          .mockResolvedValueOnce(deadOutbox),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(createPrismaRefund()),
        update: jest.fn().mockResolvedValue(
          createPrismaRefund({
            status: 'failed',
            failureCode: 'provider_request_failed',
            failureMessage: 'provider unavailable',
            failedAt,
            updatedAt: failedAt,
          }),
        ),
      },
      paymentOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.failRefundOutboxRequest({
        outboxEventId: 'outbox-1',
        workerId: 'refund-worker-a',
        claimAttempt: 1,
        failureCode: 'provider_request_failed',
        failureMessage: 'provider unavailable',
        failedAtIso: failedAt.toISOString(),
        nextAvailableAtIso: nextAvailableAt.toISOString(),
      }),
    ).resolves.toEqual({
      kind: 'dead',
      event: expect.objectContaining({ status: 'dead' }),
      refund: expect.objectContaining({ status: 'failed' }),
    });
    expect(transaction.financialOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-1',
        status: 'processing',
        claimedBy: 'refund-worker-a',
        attemptCount: 1,
      },
      data: expect.objectContaining({
        status: 'dead',
        availableAt: nextAvailableAt,
        processedAt: failedAt,
        lastError: 'provider unavailable',
      }),
    });
    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: ['refund_pending', 'refund_failed'] },
      },
      data: expect.objectContaining({ status: 'refund_failed' }),
    });
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        paymentStatus: { in: ['refund_pending', 'refund_failed'] },
      },
      data: { paymentStatus: 'refund_failed' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

function createRefundRepository(
  eventOverrides: Partial<FinancialOutboxEventRecord> = {},
) {
  return new InMemoryPaymentsRepository({
    now: () => NOW,
    orders: [createSourceOrder()],
    paymentOrders: [createPayment()],
    refunds: [createRefund()],
    outboxEvents: [createOutboxEvent(eventOverrides)],
  });
}

function createSourceOrder(): PaymentSourceOrderRecord {
  return {
    id: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    status: 'cancelled',
    pricingMode: 'fixed',
    paymentMethod: 'online',
    paymentStatus: 'refund_pending',
    priceCents: 73000,
    payablePriceCents: 73000,
  };
}

function createPayment(): PaymentOrderRecord {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 73000,
    status: 'refund_pending',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'fingerprint-1',
    providerTradeNo: 'sandbox-trade-1',
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    paidAtIso: '2026-07-15T07:59:00.000Z',
    createdAtIso: '2026-07-15T07:45:00.000Z',
    updatedAtIso: NOW.toISOString(),
  };
}

function createRefund(): RefundRecord {
  return {
    id: 'refund-1',
    refundNo: 'RF-PAY-1',
    paymentOrderId: 'payment-1',
    orderId: 'order-1',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 73000,
    reason: 'order_cancelled',
    status: 'pending',
    createdAtIso: NOW.toISOString(),
    updatedAtIso: NOW.toISOString(),
  };
}

function createOutboxEvent(
  overrides: Partial<FinancialOutboxEventRecord> = {},
): FinancialOutboxEventRecord {
  return {
    id: 'outbox-1',
    eventType: 'refund.requested',
    aggregateType: 'refund',
    aggregateId: 'refund-1',
    refundId: 'refund-1',
    payload: {
      refundId: 'refund-1',
      paymentOrderId: 'payment-1',
    },
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 3,
    availableAtIso: NOW.toISOString(),
    createdAtIso: NOW.toISOString(),
    updatedAtIso: NOW.toISOString(),
    ...overrides,
  };
}

function createPrismaPayment(overrides: Record<string, unknown> = {}) {
  const payment = createPayment();

  return {
    id: payment.id,
    paymentNo: payment.paymentNo,
    orderId: payment.orderId,
    shipperId: payment.shipperId,
    channel: payment.channel,
    amountCents: payment.amountCents,
    status: payment.status,
    idempotencyKey: payment.idempotencyKey,
    requestFingerprint: payment.requestFingerprint,
    clientPayload: null,
    providerTradeNo: payment.providerTradeNo ?? null,
    failureCode: null,
    failureMessage: null,
    expiresAt: new Date(payment.expiresAtIso),
    paidAt: payment.paidAtIso ? new Date(payment.paidAtIso) : null,
    settledAt: null,
    cancelledAt: null,
    createdAt: new Date(payment.createdAtIso),
    updatedAt: new Date(payment.updatedAtIso),
    order: createPrismaSourceOrder(),
    ...overrides,
  };
}

function createPrismaSourceOrder() {
  const order = createSourceOrder();

  return {
    ...order,
    priceCents: order.priceCents ?? null,
    payablePriceCents: order.payablePriceCents ?? null,
  };
}

function createPrismaRefund(overrides: Record<string, unknown> = {}) {
  const refund = createRefund();

  return {
    id: refund.id,
    refundNo: refund.refundNo,
    paymentOrderId: refund.paymentOrderId,
    orderId: refund.orderId,
    shipperId: refund.shipperId,
    channel: refund.channel,
    amountCents: refund.amountCents,
    reason: refund.reason,
    status: refund.status,
    providerRefundNo: null,
    failureCode: null,
    failureMessage: null,
    processingStartedAt: null,
    succeededAt: null,
    failedAt: null,
    financialTransactionId: null,
    createdAt: new Date(refund.createdAtIso),
    updatedAt: new Date(refund.updatedAtIso),
    ...overrides,
  };
}

function createPrismaOutboxEvent(overrides: Record<string, unknown> = {}) {
  const event = createOutboxEvent();

  return {
    id: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    refundId: event.refundId ?? null,
    payload: event.payload,
    status: event.status,
    attemptCount: event.attemptCount,
    maxAttempts: event.maxAttempts,
    availableAt: new Date(event.availableAtIso),
    claimedAt: null,
    leaseExpiresAt: null,
    claimedBy: null,
    processedAt: null,
    lastError: null,
    createdAt: new Date(event.createdAtIso),
    updatedAt: new Date(event.updatedAtIso),
    ...overrides,
  };
}

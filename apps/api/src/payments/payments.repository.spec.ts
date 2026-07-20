import { sumSignedLedgerEntries } from './payment-domain';
import type {
  PaymentOrderRecord,
  PaymentSourceOrderRecord,
  RefundRecord,
} from './dto';
import type { ShipperCouponRecord } from '../profile-coupons/dto';
import {
  InMemoryProfileCouponsStore,
  type PrismaShipperCouponRecord,
} from '../profile-coupons/profile-coupons.repository';
import {
  InMemoryPaymentsRepository,
  PrismaPaymentsRepository,
  type ExecutePaymentCreateInput,
} from './payments.repository';

const NOW = new Date('2026-07-15T08:00:00.000Z');
const PAYMENT_EXPIRES_AT_ISO = '2026-07-15T08:15:00.000Z';

describe('InMemoryPaymentsRepository', () => {
  it('reserves an authoritative payable amount for an eligible order', async () => {
    const repository = createRepository();

    const result = await repository.executeIdempotentPaymentCreate(
      createPaymentInput(),
    );

    expect(result).toEqual({
      kind: 'success',
      replayed: false,
      preparationRequired: true,
      payment: expect.objectContaining({
        id: 'payment-1',
        paymentNo: 'PAY-1',
        orderId: 'order-1',
        orderNo: 'HY202607150001',
        shipperId: 'shipper-1',
        channel: 'sandbox',
        amountCents: 73000,
        status: 'pending',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        expiresAtIso: PAYMENT_EXPIRES_AT_ISO,
      }),
    });
  });

  it('replays the same key and rejects the same key with another body', async () => {
    const repository = createRepository();
    const input = createPaymentInput();
    const first = await repository.executeIdempotentPaymentCreate(input);
    const replay = await repository.executeIdempotentPaymentCreate(input);
    const reused = await repository.executeIdempotentPaymentCreate({
      ...input,
      requestFingerprint: 'different-fingerprint',
      paymentId: 'payment-ignored',
      paymentNo: 'PAY-IGNORED',
    });

    expect(first).toMatchObject({ kind: 'success', replayed: false });
    expect(replay).toMatchObject({
      kind: 'success',
      replayed: true,
      preparationRequired: false,
      payment: { id: 'payment-1' },
    });
    expect(reused).toEqual({ kind: 'key-reused' });
  });

  it.each([
    ['another shipper', { shipperId: 'shipper-2' }, {}, 'order-not-available'],
    ['COD order', {}, { paymentMethod: 'cod' }, 'order-not-available'],
    ['negotiable order', {}, { pricingMode: 'negotiable' }, 'order-not-available'],
    ['cancelled order', {}, { status: 'cancelled' }, 'order-not-available'],
    ['legacy order', {}, { paymentStatus: 'legacy_unverified' }, 'order-not-available'],
    ['escrowed order', {}, { paymentStatus: 'escrowed' }, 'already-escrowed'],
    ['zero amount', {}, { payablePriceCents: 0 }, 'amount-invalid'],
  ] as const)(
    'rejects payment creation for %s',
    async (_label, inputOverrides, orderOverrides, expectedKind) => {
      const repository = createRepository(orderOverrides);

      await expect(
        repository.executeIdempotentPaymentCreate(
          createPaymentInput(inputOverrides),
        ),
      ).resolves.toEqual({ kind: expectedKind });
    },
  );

  it('allows only one active payment across different keys', async () => {
    const repository = createRepository();
    const first = await repository.executeIdempotentPaymentCreate(
      createPaymentInput(),
    );
    const second = await repository.executeIdempotentPaymentCreate(
      createPaymentInput({
        paymentId: 'payment-2',
        paymentNo: 'PAY-2',
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
        requestFingerprint: 'fingerprint-2',
      }),
    );

    expect(first).toMatchObject({ kind: 'success' });
    expect(second).toEqual({
      kind: 'active-payment-exists',
      paymentId: 'payment-1',
    });
  });

  it('snapshots opaque provider payload without interpreting it', async () => {
    const repository = createRepository();
    await repository.executeIdempotentPaymentCreate(createPaymentInput());

    const payment = await repository.completePaymentPreparation({
      paymentId: 'payment-1',
      clientPayload: {
        appId: 'wx-app-id',
        prepayId: 'wx-prepay-id',
        signed: 'opaque-provider-value',
      },
    });

    expect(payment).toMatchObject({
      id: 'payment-1',
      status: 'processing',
      clientPayload: {
        appId: 'wx-app-id',
        prepayId: 'wx-prepay-id',
        signed: 'opaque-provider-value',
      },
    });
    await expect(
      repository.executeIdempotentPaymentCreate(createPaymentInput()),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: true,
      payment: {
        status: 'processing',
        clientPayload: { prepayId: 'wx-prepay-id' },
      },
    });
  });

  it('applies a successful callback once and writes balanced escrow entries', async () => {
    const repository = createRepository();
    await repository.executeIdempotentPaymentCreate(createPaymentInput());
    await repository.completePaymentPreparation({
      paymentId: 'payment-1',
      clientPayload: 'opaque-app-payload',
    });
    const callback = createSuccessfulCallback();

    const first = await repository.applyVerifiedPaymentCallback({
      channel: 'sandbox',
      callback,
    });
    const replay = await repository.applyVerifiedPaymentCallback({
      channel: 'sandbox',
      callback,
    });

    expect(first).toMatchObject({
      kind: 'applied',
      replayed: false,
      orderPaymentStatus: 'escrowed',
      payment: {
        status: 'escrowed',
        providerTradeNo: 'sandbox-trade-1',
        paidAtIso: '2026-07-15T08:01:00.000Z',
      },
      financialTransaction: {
        type: 'online_payment_escrow',
        amountCents: 73000,
        entries: [
          expect.objectContaining({
            accountType: 'gateway_clearing',
            direction: 'debit',
            amountCents: 73000,
          }),
          expect.objectContaining({
            accountType: 'platform_escrow',
            direction: 'credit',
            amountCents: 73000,
          }),
        ],
      },
    });
    if (first.kind !== 'applied') {
      throw new Error(`Unexpected result: ${first.kind}`);
    }
    expect(sumSignedLedgerEntries(first.financialTransaction.entries)).toBe(0);
    expect(replay).toMatchObject({
      kind: 'applied',
      replayed: true,
      financialTransaction: { id: first.financialTransaction.id },
    });
  });

  it('rejects one provider event id reused with another payload hash', async () => {
    const repository = createRepository();
    await repository.executeIdempotentPaymentCreate(createPaymentInput());
    const callback = createSuccessfulCallback();

    await repository.applyVerifiedPaymentCallback({
      channel: 'sandbox',
      callback,
    });
    const conflict = await repository.applyVerifiedPaymentCallback({
      channel: 'sandbox',
      callback: {
        ...callback,
        rawPayloadHash: 'different-payload-hash',
      },
    });

    expect(conflict).toEqual({ kind: 'event-conflict' });
  });

  it.each(['pending', 'processing', 'cancelled'] as const)(
    'escrows and immediately queues a refund for a late %s payment on a cancelled order',
    async paymentStatus => {
      const repository = new InMemoryPaymentsRepository({
        now: () => NOW,
        createId: createSequentialId(),
        orders: [
          createSourceOrder({
            status: 'cancelled',
            paymentStatus: 'cancelled',
          }),
        ],
        paymentOrders: [createPaymentRecord({ status: paymentStatus })],
      });

      const result = await repository.applyVerifiedPaymentCallback({
        channel: 'sandbox',
        callback: createSuccessfulCallback(),
      });

      expect(result).toMatchObject({
        kind: 'applied',
        replayed: false,
        orderPaymentStatus: 'refund_pending',
        payment: { status: 'refund_pending' },
        refund: {
          paymentOrderId: 'payment-1',
          orderId: 'order-1',
          amountCents: 73000,
          status: 'pending',
          reason: 'late_payment_after_order_cancelled',
        },
        outboxEvent: {
          eventType: 'refund.requested',
          aggregateType: 'refund',
          status: 'pending',
          payload: {
            refundId: expect.any(String),
            paymentOrderId: 'payment-1',
          },
        },
      });
      expect(JSON.stringify(result)).not.toContain('rawBody');
    },
  );

  it('applies one successful refund callback with balanced ledger entries', async () => {
    const repository = new InMemoryPaymentsRepository({
      now: () => NOW,
      createId: createSequentialId(),
      orders: [
        createSourceOrder({
          status: 'cancelled',
          paymentStatus: 'refund_pending',
        }),
      ],
      paymentOrders: [
        createPaymentRecord({
          status: 'refund_pending',
          providerTradeNo: 'sandbox-trade-1',
        }),
      ],
      refunds: [createRefundRecord()],
    });
    const callback = createSuccessfulRefundCallback();

    const first = await repository.applyVerifiedRefundCallback({
      channel: 'sandbox',
      callback,
    });
    const replay = await repository.applyVerifiedRefundCallback({
      channel: 'sandbox',
      callback,
    });

    expect(first).toMatchObject({
      kind: 'applied',
      replayed: false,
      orderPaymentStatus: 'refunded',
      refund: {
        id: 'refund-1',
        status: 'succeeded',
        providerRefundNo: 'sandbox-refund-1',
        financialTransactionId: expect.any(String),
      },
      payment: { id: 'payment-1', status: 'refunded' },
      financialTransaction: {
        type: 'online_refund',
        referenceId: 'refund-1',
        amountCents: 73000,
        entries: [
          expect.objectContaining({
            accountType: 'platform_escrow',
            direction: 'debit',
            amountCents: 73000,
          }),
          expect.objectContaining({
            accountType: 'gateway_clearing',
            direction: 'credit',
            amountCents: 73000,
          }),
        ],
      },
    });
    if (first.kind !== 'applied') {
      throw new Error(`Unexpected result: ${first.kind}`);
    }
    expect(sumSignedLedgerEntries(first.financialTransaction.entries)).toBe(0);
    expect(replay).toMatchObject({
      kind: 'applied',
      replayed: true,
      financialTransaction: { id: first.financialTransaction.id },
    });
  });

  it('restores a replacement usable coupon when a refunded order had already redeemed one', async () => {
    const couponStore = new InMemoryProfileCouponsStore({
      coupons: [
        createCouponRecord({
          id: 'coupon-used-1',
          shipperId: 'shipper-1',
          status: 'used',
          title: '满 100 减 30',
          conditionText: '订单满 100 元可用',
          discountCents: 3000,
          minOrderAmountCents: 10000,
          validFromIso: '2026-07-01T08:00:00.000Z',
          validUntilIso: '2026-07-31T08:00:00.000Z',
          sourceText: '活动发放',
          usedOrderNo: 'HY202607150001',
          usedAtIso: '2026-07-15T07:59:00.000Z',
        }),
      ],
    });
    const repository = new InMemoryPaymentsRepository({
      now: () => NOW,
      createId: createSequentialId(),
      couponStore,
      orders: [
        createSourceOrder({
          status: 'cancelled',
          paymentStatus: 'refund_pending',
          couponId: 'coupon-used-1',
        }),
      ],
      paymentOrders: [
        createPaymentRecord({
          status: 'refund_pending',
          providerTradeNo: 'sandbox-trade-1',
        }),
      ],
      refunds: [createRefundRecord()],
    });

    await expect(
      repository.applyVerifiedRefundCallback({
        channel: 'sandbox',
        callback: createSuccessfulRefundCallback(),
      }),
    ).resolves.toMatchObject({
      kind: 'applied',
      refund: { status: 'succeeded' },
      payment: { status: 'refunded' },
    });

    expect(couponStore.clone()).toEqual([
      expect.objectContaining({
        id: 'coupon-used-1',
        status: 'used',
        usedOrderNo: 'HY202607150001',
      }),
      expect.objectContaining({
        shipperId: 'shipper-1',
        title: '满 100 减 30',
        conditionText: '订单满 100 元可用',
        status: 'usable',
        discountCents: 3000,
        minOrderAmountCents: 10000,
        validFromIso: '2026-07-15T08:02:00.000Z',
        validUntilIso: '2026-08-14T08:02:00.000Z',
        sourceText: '退款返券',
        issuedAtIso: '2026-07-15T08:02:00.000Z',
      }),
    ]);
  });

  it('rejects one refund event id reused with another payload hash', async () => {
    const repository = createRefundCallbackRepository();
    const callback = createSuccessfulRefundCallback();
    await repository.applyVerifiedRefundCallback({
      channel: 'sandbox',
      callback,
    });

    await expect(
      repository.applyVerifiedRefundCallback({
        channel: 'sandbox',
        callback: { ...callback, rawPayloadHash: 'another-refund-payload' },
      }),
    ).resolves.toEqual({ kind: 'event-conflict' });
  });

  it.each([
    [
      'amount',
      { amountCents: 72000 },
      {},
      'refund-conflict',
    ],
    [
      'refund number',
      { refundNo: 'RF-UNKNOWN' },
      {},
      'refund-not-found',
    ],
    [
      'provider refund number',
      { providerRefundNo: 'sandbox-refund-other' },
      {},
      'refund-conflict',
    ],
  ] as const)(
    'rejects a refund callback with conflicting %s',
    async (_label, callbackOverrides, repositoryOptions, expectedKind) => {
      const repository = createRefundCallbackRepository(repositoryOptions);

      await expect(
        repository.applyVerifiedRefundCallback({
          channel: 'sandbox',
          callback: {
            ...createSuccessfulRefundCallback(),
            ...callbackOverrides,
          },
        }),
      ).resolves.toEqual({ kind: expectedKind });
    },
  );

  it('rejects a refund whose order differs from its payment order', async () => {
    const repository = createRefundCallbackRepository({
      refundOverrides: { orderId: 'order-2' },
      orders: [
        createSourceOrder({
          status: 'cancelled',
          paymentStatus: 'refund_pending',
        }),
        createSourceOrder({
          id: 'order-2',
          orderNo: 'HY202607150002',
          status: 'cancelled',
          paymentStatus: 'refund_pending',
        }),
      ],
    });

    await expect(
      repository.applyVerifiedRefundCallback({
        channel: 'sandbox',
        callback: createSuccessfulRefundCallback(),
      }),
    ).resolves.toEqual({ kind: 'refund-conflict' });
  });

  it('applies a failed refund callback without creating ledger entries', async () => {
    const repository = createRefundCallbackRepository();
    const callback = {
      ...createSuccessfulRefundCallback(),
      status: 'failed' as const,
    };

    const first = await repository.applyVerifiedRefundCallback({
      channel: 'sandbox',
      callback,
    });
    const replay = await repository.applyVerifiedRefundCallback({
      channel: 'sandbox',
      callback,
    });

    expect(first).toEqual({
      kind: 'failed',
      replayed: false,
      orderPaymentStatus: 'refund_failed',
      refund: expect.objectContaining({
        id: 'refund-1',
        status: 'failed',
        providerRefundNo: 'sandbox-refund-1',
        failureCode: 'provider_refund_failed',
      }),
      payment: expect.objectContaining({
        id: 'payment-1',
        status: 'refund_failed',
      }),
    });
    expect(replay).toMatchObject({ kind: 'failed', replayed: true });
    expect(JSON.stringify(first)).not.toContain('financialTransaction');
  });
});

describe('PrismaPaymentsRepository', () => {
  it('creates the payment reservation inside one transaction', async () => {
    const payment = createPrismaPaymentRecord();
    const transaction = {
      order: {
        findFirst: jest.fn().mockResolvedValue(createPrismaSourceOrder()),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(payment),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never, {
      now: () => NOW,
      createId: createSequentialId(),
    });

    await expect(
      repository.executeIdempotentPaymentCreate(createPaymentInput()),
    ).resolves.toMatchObject({
      kind: 'success',
      replayed: false,
      payment: { id: 'payment-1', amountCents: 73000 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.paymentOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'payment-1',
        paymentNo: 'PAY-1',
        orderId: 'order-1',
        shipperId: 'shipper-1',
        amountCents: 73000,
        status: 'pending',
      }),
      include: expect.any(Object),
    });
  });

  it('converges P2002 only after finding an active payment in this order scope', async () => {
    const active = createPrismaPaymentRecord({
      id: 'payment-winner',
      paymentNo: 'PAY-WINNER',
      idempotencyKey: '00000000-0000-4000-8000-000000000099',
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.executeIdempotentPaymentCreate(createPaymentInput()),
    ).resolves.toEqual({
      kind: 'active-payment-exists',
      paymentId: 'payment-winner',
    });
    expect(prisma.paymentOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderId: 'order-1' }),
      }),
    );
  });

  it('does not swallow an unrelated P2002', async () => {
    const duplicate = { code: 'P2002' };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(duplicate),
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.executeIdempotentPaymentCreate(createPaymentInput()),
    ).rejects.toBe(duplicate);
  });

  it('persists callback, order state, event and balanced ledger in one transaction', async () => {
    const payment = createPrismaPaymentRecord({ status: 'processing' });
    const escrowedPayment = createPrismaPaymentRecord({
      status: 'escrowed',
      providerTradeNo: 'sandbox-trade-1',
      paidAt: new Date('2026-07-15T08:01:00.000Z'),
    });
    const financialTransaction = createPrismaFinancialTransaction();
    const transaction = {
      paymentCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'callback-row-1' }),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(payment),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(escrowedPayment),
      },
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'order-event-1' }),
      },
      financialTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(financialTransaction),
      },
      refund: {
        create: jest.fn(),
      },
      financialOutboxEvent: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never, {
      now: () => NOW,
      createId: createSequentialId(),
    });

    const result = await repository.applyVerifiedPaymentCallback({
      channel: 'sandbox',
      callback: createSuccessfulCallback(),
    });

    expect(result).toMatchObject({
      kind: 'applied',
      replayed: false,
      payment: { status: 'escrowed' },
      financialTransaction: { id: 'transaction-1' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'online_payment_escrow',
        referenceId: 'payment-1',
        amountCents: 73000,
        entries: {
          create: [
            expect.objectContaining({
              sequence: 0,
              direction: 'debit',
              amountCents: 73000,
            }),
            expect.objectContaining({
              sequence: 1,
              direction: 'credit',
              amountCents: 73000,
            }),
          ],
        },
      }),
      include: { entries: { orderBy: { sequence: 'asc' } } },
    });
    expect(transaction.paymentCallbackEvent.create).toHaveBeenCalledTimes(1);
    expect(transaction.order.update).toHaveBeenCalledTimes(1);
    expect(transaction.orderEvent.create).toHaveBeenCalledTimes(1);
  });

  it('persists a successful refund callback and balanced ledger in one transaction', async () => {
    const payment = createPrismaPaymentRecord({
      status: 'refund_pending',
      order: {
        ...createPrismaSourceOrder(),
        status: 'cancelled',
        paymentStatus: 'refund_pending',
      },
    });
    const refundedPayment = createPrismaPaymentRecord({
      status: 'refunded',
      order: {
        ...createPrismaSourceOrder(),
        status: 'cancelled',
        paymentStatus: 'refunded',
      },
    });
    const refund = createPrismaRefundRecord();
    const succeededRefund = createPrismaRefundRecord({
      status: 'succeeded',
      providerRefundNo: 'sandbox-refund-1',
      succeededAt: new Date('2026-07-15T08:02:00.000Z'),
      financialTransactionId: 'refund-transaction-1',
    });
    const financialTransaction = createPrismaRefundFinancialTransaction();
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'refund-1' }]),
      paymentCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'refund-callback-row-1' }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(refund),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(succeededRefund),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue(refundedPayment),
      },
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'order-event-refund-1' }),
      },
      financialTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(financialTransaction),
      },
      financialOutboxEvent: {
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
    const repository = new PrismaPaymentsRepository(prisma as never, {
      now: () => NOW,
      createId: createSequentialId(),
    });

    const result = await repository.applyVerifiedRefundCallback({
      channel: 'sandbox',
      callback: createSuccessfulRefundCallback(),
    });

    expect(result).toMatchObject({
      kind: 'applied',
      replayed: false,
      refund: { status: 'succeeded' },
      payment: { status: 'refunded' },
      financialTransaction: {
        id: 'refund-transaction-1',
        type: 'online_refund',
      },
    });
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'online_refund',
        referenceId: 'refund-1',
        orderId: 'order-1',
        paymentOrderId: 'payment-1',
        amountCents: 73000,
        entries: {
          create: [
            expect.objectContaining({
              sequence: 0,
              accountType: 'platform_escrow',
              direction: 'debit',
              amountCents: 73000,
            }),
            expect.objectContaining({
              sequence: 1,
              accountType: 'gateway_clearing',
              direction: 'credit',
              amountCents: 73000,
            }),
          ],
        },
      }),
      include: { entries: { orderBy: { sequence: 'asc' } } },
    });
    expect(transaction.paymentCallbackEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'refund',
        refundId: 'refund-1',
        processingResult: 'refund_succeeded',
      }),
    });
    expect(transaction.financialOutboxEvent.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      'RF-PAY-1',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('persists a replacement usable coupon when refunding an order that had redeemed one', async () => {
    const payment = createPrismaPaymentRecord({
      status: 'refund_pending',
      order: createPrismaSourceOrder({
        status: 'cancelled',
        paymentStatus: 'refund_pending',
        couponId: 'coupon-used-1',
      }),
    });
    const refundedPayment = createPrismaPaymentRecord({
      status: 'refunded',
      order: createPrismaSourceOrder({
        status: 'cancelled',
        paymentStatus: 'refunded',
        couponId: 'coupon-used-1',
      }),
    });
    const refund = createPrismaRefundRecord();
    const succeededRefund = createPrismaRefundRecord({
      status: 'succeeded',
      providerRefundNo: 'sandbox-refund-1',
      succeededAt: new Date('2026-07-15T08:02:00.000Z'),
      financialTransactionId: 'refund-transaction-1',
    });
    const usedCoupon = createPrismaCouponRecord({
      id: 'coupon-used-1',
      shipperId: 'shipper-1',
      title: '满 100 减 30',
      conditionText: '订单满 100 元可用',
      discountCents: 3000,
      minOrderAmountCents: 10000,
      validFrom: new Date('2026-07-01T08:00:00.000Z'),
      validUntil: new Date('2026-07-31T08:00:00.000Z'),
      sourceText: '活动发放',
      status: 'used',
      usedOrderNo: 'HY202607150001',
      usedAt: new Date('2026-07-15T07:59:00.000Z'),
    });
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'refund-1' }]),
      paymentCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'refund-callback-row-1' }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(refund),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(succeededRefund),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue(refundedPayment),
      },
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'order-event-refund-1' }),
      },
      shipperCoupon: {
        findFirst: jest.fn().mockResolvedValue(usedCoupon),
        create: jest.fn().mockResolvedValue(
          createPrismaCouponRecord({
            id: 'coupon-return-1',
            shipperId: 'shipper-1',
            title: '满 100 减 30',
            conditionText: '订单满 100 元可用',
            discountCents: 3000,
            minOrderAmountCents: 10000,
            validFrom: new Date('2026-07-15T08:02:00.000Z'),
            validUntil: new Date('2026-08-14T08:02:00.000Z'),
            sourceText: '退款返券',
            status: 'usable',
            issuedAt: new Date('2026-07-15T08:02:00.000Z'),
            lockedOrderNo: null,
            lockedAt: null,
            usedOrderNo: null,
            usedAt: null,
          }),
        ),
      },
      financialTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createPrismaRefundFinancialTransaction()),
      },
      financialOutboxEvent: {
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
    const repository = new PrismaPaymentsRepository(prisma as never, {
      now: () => NOW,
      createId: createSequentialId(),
    });

    await expect(
      repository.applyVerifiedRefundCallback({
        channel: 'sandbox',
        callback: createSuccessfulRefundCallback(),
      }),
    ).resolves.toMatchObject({
      kind: 'applied',
      refund: { status: 'succeeded' },
      payment: { status: 'refunded' },
    });

    expect(transaction.shipperCoupon.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'coupon-used-1',
        shipperId: 'shipper-1',
      },
    });
    expect(transaction.shipperCoupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shipperId: 'shipper-1',
        title: '满 100 减 30',
        conditionText: '订单满 100 元可用',
        status: 'usable',
        discountCents: 3000,
        minOrderAmountCents: 10000,
        validFrom: new Date('2026-07-15T08:02:00.000Z'),
        validUntil: new Date('2026-08-14T08:02:00.000Z'),
        sourceText: '退款返券',
        issuedAt: new Date('2026-07-15T08:02:00.000Z'),
      }),
    });
  });

  it('replays a persisted refund callback without creating another ledger transaction', async () => {
    const callback = createSuccessfulRefundCallback();
    const payment = createPrismaPaymentRecord({
      status: 'refunded',
      order: {
        ...createPrismaSourceOrder(),
        status: 'cancelled',
        paymentStatus: 'refunded',
      },
    });
    const refund = createPrismaRefundRecord({
      status: 'succeeded',
      providerRefundNo: callback.providerRefundNo,
      succeededAt: new Date(callback.occurredAtIso),
      financialTransactionId: 'refund-transaction-1',
    });
    const transaction = {
      paymentCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'refund-callback-row-1',
          channel: 'sandbox',
          eventId: callback.eventId,
          eventType: 'refund',
          paymentOrderId: null,
          refundId: 'refund-1',
          rawPayloadHash: callback.rawPayloadHash,
          processingResult: 'refund_succeeded',
        }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(refund),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(payment),
      },
      financialTransaction: {
        findUnique: jest
          .fn()
          .mockResolvedValue(createPrismaRefundFinancialTransaction()),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callbackFn => callbackFn(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.applyVerifiedRefundCallback({ channel: 'sandbox', callback }),
    ).resolves.toMatchObject({
      kind: 'applied',
      replayed: true,
      refund: { id: 'refund-1', status: 'succeeded' },
      payment: { id: 'payment-1', status: 'refunded' },
      financialTransaction: { id: 'refund-transaction-1' },
    });
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('persists a failed refund callback without creating a ledger transaction', async () => {
    const callback = {
      ...createSuccessfulRefundCallback(),
      status: 'failed' as const,
    };
    const payment = createPrismaPaymentRecord({
      status: 'refund_pending',
      order: {
        ...createPrismaSourceOrder(),
        status: 'cancelled',
        paymentStatus: 'refund_pending',
      },
    });
    const failedPayment = createPrismaPaymentRecord({
      status: 'refund_failed',
      failureCode: 'provider_refund_failed',
      order: {
        ...createPrismaSourceOrder(),
        status: 'cancelled',
        paymentStatus: 'refund_failed',
      },
    });
    const failedRefund = createPrismaRefundRecord({
      status: 'failed',
      failureCode: 'provider_refund_failed',
      failureMessage: '退款渠道返回失败',
      failedAt: new Date(callback.occurredAtIso),
    });
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'refund-1' }]),
      paymentCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'refund-callback-row-2' }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(createPrismaRefundRecord()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(failedRefund),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue(failedPayment),
      },
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      orderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'order-event-refund-2' }),
      },
      financialTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      financialOutboxEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callbackFn => callbackFn(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never, {
      now: () => NOW,
      createId: createSequentialId(),
    });

    await expect(
      repository.applyVerifiedRefundCallback({ channel: 'sandbox', callback }),
    ).resolves.toMatchObject({
      kind: 'failed',
      replayed: false,
      refund: { id: 'refund-1', status: 'failed' },
      payment: { id: 'payment-1', status: 'refund_failed' },
      orderPaymentStatus: 'refund_failed',
    });
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
    expect(transaction.paymentCallbackEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'refund',
        refundId: 'refund-1',
        processingResult: 'refund_failed',
      }),
    });
  });

  it('replays a persisted failed refund callback without ledger lookup', async () => {
    const callback = {
      ...createSuccessfulRefundCallback(),
      status: 'failed' as const,
    };
    const payment = createPrismaPaymentRecord({
      status: 'refund_failed',
      failureCode: 'provider_refund_failed',
      order: {
        ...createPrismaSourceOrder(),
        status: 'cancelled',
        paymentStatus: 'refund_failed',
      },
    });
    const refund = createPrismaRefundRecord({
      status: 'failed',
      providerRefundNo: callback.providerRefundNo,
      failureCode: 'provider_refund_failed',
      failedAt: new Date(callback.occurredAtIso),
    });
    const transaction = {
      paymentCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'refund-callback-row-2',
          channel: 'sandbox',
          eventId: callback.eventId,
          eventType: 'refund',
          paymentOrderId: null,
          refundId: 'refund-1',
          rawPayloadHash: callback.rawPayloadHash,
          processingResult: 'refund_failed',
        }),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(refund),
      },
      paymentOrder: {
        findUnique: jest.fn().mockResolvedValue(payment),
      },
      financialTransaction: {
        findUnique: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async callbackFn => callbackFn(transaction)),
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const repository = new PrismaPaymentsRepository(prisma as never);

    await expect(
      repository.applyVerifiedRefundCallback({ channel: 'sandbox', callback }),
    ).resolves.toMatchObject({
      kind: 'failed',
      replayed: true,
      refund: { id: 'refund-1', status: 'failed' },
      payment: { id: 'payment-1', status: 'refund_failed' },
      orderPaymentStatus: 'refund_failed',
    });
    expect(transaction.financialTransaction.findUnique).not.toHaveBeenCalled();
  });
});

function createRepository(
  orderOverrides: Partial<PaymentSourceOrderRecord> = {},
) {
  return new InMemoryPaymentsRepository({
    now: () => NOW,
    createId: createSequentialId(),
    orders: [createSourceOrder(orderOverrides)],
  });
}

function createSequentialId() {
  let sequence = 0;

  return () => `generated-${++sequence}`;
}

function createSourceOrder(
  overrides: Partial<PaymentSourceOrderRecord> = {},
): PaymentSourceOrderRecord {
  return {
    id: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    status: 'waiting',
    pricingMode: 'fixed',
    paymentMethod: 'online',
    paymentStatus: 'pending',
    priceCents: 76000,
    payablePriceCents: 73000,
    ...overrides,
  };
}

function createPaymentInput(
  overrides: Partial<ExecutePaymentCreateInput> = {},
): ExecutePaymentCreateInput {
  return {
    paymentId: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    shipperId: 'shipper-1',
    providerChannel: 'sandbox',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'fingerprint-1',
    expiresAtIso: PAYMENT_EXPIRES_AT_ISO,
    ...overrides,
  };
}

function createPaymentRecord(
  overrides: Partial<PaymentOrderRecord> = {},
): PaymentOrderRecord {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 73000,
    status: 'pending',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'fingerprint-1',
    expiresAtIso: PAYMENT_EXPIRES_AT_ISO,
    createdAtIso: NOW.toISOString(),
    updatedAtIso: NOW.toISOString(),
    ...overrides,
  };
}

function createSuccessfulCallback() {
  return {
    eventId: 'sandbox-event-1',
    paymentNo: 'PAY-1',
    providerTradeNo: 'sandbox-trade-1',
    amountCents: 73000,
    status: 'succeeded' as const,
    occurredAtIso: '2026-07-15T08:01:00.000Z',
    rawPayloadHash: 'payload-hash-1',
  };
}

function createRefundRecord(
  overrides: Partial<RefundRecord> = {},
): RefundRecord {
  return {
    id: 'refund-1',
    refundNo: 'RF-PAY-1',
    paymentOrderId: 'payment-1',
    orderId: 'order-1',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 73000,
    reason: 'order_cancelled',
    status: 'processing',
    providerRefundNo: 'sandbox-refund-1',
    processingStartedAtIso: NOW.toISOString(),
    createdAtIso: NOW.toISOString(),
    updatedAtIso: NOW.toISOString(),
    ...overrides,
  };
}

function createSuccessfulRefundCallback() {
  return {
    eventId: 'sandbox-refund-event-1',
    refundNo: 'RF-PAY-1',
    providerRefundNo: 'sandbox-refund-1',
    amountCents: 73000,
    status: 'succeeded' as const,
    occurredAtIso: '2026-07-15T08:02:00.000Z',
    rawPayloadHash: 'refund-payload-hash-1',
  };
}

function createRefundCallbackRepository(
  options: {
    refundOverrides?: Partial<RefundRecord>;
    orders?: PaymentSourceOrderRecord[];
    couponStore?: InMemoryProfileCouponsStore;
  } = {},
) {
  return new InMemoryPaymentsRepository({
    now: () => NOW,
    createId: createSequentialId(),
    couponStore: options.couponStore,
    orders:
      options.orders ??
      [
        createSourceOrder({
          status: 'cancelled',
          paymentStatus: 'refund_pending',
        }),
      ],
    paymentOrders: [
      createPaymentRecord({
        status: 'refund_pending',
        providerTradeNo: 'sandbox-trade-1',
      }),
    ],
    refunds: [createRefundRecord(options.refundOverrides)],
  });
}

function createPrismaSourceOrder(
  overrides: Partial<PaymentSourceOrderRecord> = {},
) {
  return {
    ...createSourceOrder(overrides),
    priceCents: 76000,
    payablePriceCents: 73000,
  };
}

function createPrismaPaymentRecord(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 73000,
    status: 'pending',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'fingerprint-1',
    clientPayload: null,
    providerTradeNo: null,
    failureCode: null,
    failureMessage: null,
    expiresAt: new Date(PAYMENT_EXPIRES_AT_ISO),
    paidAt: null,
    settledAt: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    order: createPrismaSourceOrder(),
    ...overrides,
  };
}

function createPrismaFinancialTransaction() {
  return {
    id: 'transaction-1',
    transactionNo: 'FT-generated-1',
    type: 'online_payment_escrow',
    referenceId: 'payment-1',
    orderId: 'order-1',
    paymentOrderId: 'payment-1',
    amountCents: 73000,
    occurredAt: new Date('2026-07-15T08:01:00.000Z'),
    createdAt: NOW,
    entries: [
      {
        id: 'entry-1',
        transactionId: 'transaction-1',
        sequence: 0,
        accountType: 'gateway_clearing',
        accountUserId: 'shipper-1',
        direction: 'debit',
        amountCents: 73000,
        createdAt: NOW,
      },
      {
        id: 'entry-2',
        transactionId: 'transaction-1',
        sequence: 1,
        accountType: 'platform_escrow',
        accountUserId: null,
        direction: 'credit',
        amountCents: 73000,
        createdAt: NOW,
      },
    ],
  };
}

function createPrismaRefundRecord(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const refund = createRefundRecord();

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
    providerRefundNo: refund.providerRefundNo ?? null,
    failureCode: null,
    failureMessage: null,
    processingStartedAt: refund.processingStartedAtIso
      ? new Date(refund.processingStartedAtIso)
      : null,
    succeededAt: null,
    failedAt: null,
    financialTransactionId: null,
    createdAt: new Date(refund.createdAtIso),
    updatedAt: new Date(refund.updatedAtIso),
    ...overrides,
  };
}

function createPrismaRefundFinancialTransaction() {
  return {
    id: 'refund-transaction-1',
    transactionNo: 'FT-generated-1',
    type: 'online_refund',
    referenceId: 'refund-1',
    orderId: 'order-1',
    paymentOrderId: 'payment-1',
    amountCents: 73000,
    occurredAt: new Date('2026-07-15T08:02:00.000Z'),
    createdAt: NOW,
    entries: [
      {
        id: 'refund-entry-1',
        transactionId: 'refund-transaction-1',
        sequence: 0,
        accountType: 'platform_escrow',
        accountUserId: null,
        direction: 'debit',
        amountCents: 73000,
        createdAt: NOW,
      },
      {
        id: 'refund-entry-2',
        transactionId: 'refund-transaction-1',
        sequence: 1,
        accountType: 'gateway_clearing',
        accountUserId: 'shipper-1',
        direction: 'credit',
        amountCents: 73000,
        createdAt: NOW,
      },
    ],
  };
}

function createCouponRecord(
  overrides: Partial<ShipperCouponRecord> = {},
): ShipperCouponRecord {
  return {
    id: 'coupon-1',
    shipperId: 'shipper-1',
    title: '满 300 减 30',
    status: 'usable',
    conditionText: '订单满 300 元可用',
    discountCents: 3000,
    minOrderAmountCents: 30000,
    validFromIso: '2026-07-01T00:00:00.000Z',
    validUntilIso: '2026-07-31T00:00:00.000Z',
    sourceText: '活动发放',
    issuedAtIso: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function createPrismaCouponRecord(
  overrides: Partial<PrismaShipperCouponRecord> = {},
): PrismaShipperCouponRecord {
  const coupon = createCouponRecord();

  return {
    id: coupon.id,
    shipperId: coupon.shipperId,
    title: coupon.title,
    status: coupon.status,
    conditionText: coupon.conditionText,
    discountCents: coupon.discountCents,
    minOrderAmountCents: coupon.minOrderAmountCents,
    validFrom: new Date(coupon.validFromIso),
    validUntil: new Date(coupon.validUntilIso),
    sourceText: coupon.sourceText,
    issuedAt: new Date(coupon.issuedAtIso),
    lockedOrderNo: null,
    lockedAt: null,
    usedOrderNo: null,
    usedAt: null,
    ...overrides,
  };
}

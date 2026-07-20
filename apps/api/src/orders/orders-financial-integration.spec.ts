import { ApiErrorCode } from '../common/errors';
import { InMemoryFinancialStore } from '../payments/in-memory-financial.store';
import type { PaymentOrderRecord } from '../payments/dto';
import { sumSignedLedgerEntries } from '../payments/payment-domain';
import type { CreateShipperOrderRequest } from './dto';
import {
  InMemoryOrdersRepository,
  PrismaOrdersRepository,
  type PrismaOrderRecord,
  type PrismaOrdersClient,
} from './orders.repository';
import { OrdersService } from './orders.service';

const NOW = new Date('2026-07-15T08:00:00.000Z');

describe('order financial readiness integration', () => {
  it('initializes COD and online fixed-price orders explicitly', async () => {
    const repository = new InMemoryOrdersRepository(() => NOW);

    const cod = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    const online = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'online' }),
    );

    expect(cod).toMatchObject({
      paymentMethod: 'cod',
      paymentStatus: 'not_required',
    });
    expect(online).toMatchObject({
      paymentMethod: 'online',
      paymentStatus: 'pending',
    });
  });

  it('keeps unpaid online orders out of the driver hall', async () => {
    const repository = new InMemoryOrdersRepository(() => NOW);
    const cod = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    const onlinePending = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'online' }),
    );
    const onlineEscrowed = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({
        paymentMethod: 'online',
        pickupAddress: '龙岗区平湖物流园',
      }),
    );
    onlineEscrowed.paymentStatus = 'escrowed';

    await expect(
      repository.listDriverOrderHall({ page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [cod, onlineEscrowed],
      total: 2,
    });
    expect(onlinePending.paymentStatus).toBe('pending');
  });

  it('writes the assigned driver in the same accept mutation', async () => {
    const repository = new InMemoryOrdersRepository(() => NOW);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );

    const accepted = await repository.acceptDriverOrder(
      order.id,
      'driver-1',
      {},
    );

    expect(accepted).toMatchObject({
      status: 'loading',
      assignedDriverId: 'driver-1',
    });
  });

  it.each([
    ['quote', 'submitDriverQuote'],
    ['accept', 'acceptDriverOrder'],
  ] as const)(
    'rejects direct driver %s for an unpaid online order',
    async (_label, method) => {
      const repository = new InMemoryOrdersRepository(() => NOW);
      const order = await repository.seedOrderForTest(
        'shipper-1',
        createOrderInput({ paymentMethod: 'online' }),
      );

      await expect(
        method === 'submitDriverQuote'
          ? repository.submitDriverQuote(order.id, 'driver-1', {
              quoteCents: 76000,
              arrivalText: '30 分钟后到达',
            })
          : repository.acceptDriverOrder(order.id, 'driver-1', {}),
      ).rejects.toMatchObject({ code: ApiErrorCode.PAYMENT_REQUIRED });
    },
  );

  it('rejects online completion until escrow is confirmed', async () => {
    const repository = new InMemoryOrdersRepository(() => NOW);
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'online' }),
    );
    const confirming = await repository.advanceOrderStatus(
      order.id,
      'shipper-1',
      { nextStatus: 'confirming' },
    );

    await expect(
      service.completeOrder('shipper-1', order.id, 'complete-key', {
        baseUpdatedAtIso: confirming.updatedAtIso,
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.PAYMENT_REQUIRED });
  });

  it('cancels an unpaid active payment without inventing a refund', async () => {
    const financialStore = new InMemoryFinancialStore({
      paymentOrders: [createPaymentRecord({ status: 'processing' })],
    });
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'online' }),
    );

    const cancelled = await service.cancelOrder(
      'shipper-1',
      order.id,
      'cancel-pending-key',
      {
        reasonText: '计划变更',
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'cancelled',
    });
    expect(financialStore.findPaymentOrderById('payment-1')).toMatchObject({
      status: 'cancelled',
      cancelledAtIso: NOW.toISOString(),
    });
    expect(financialStore.findRefundByOrderId(order.id)).toBeUndefined();
    expect(financialStore.listOutboxEvents()).toEqual([]);
  });

  it('queues a full refund when cancelling an escrowed online order', async () => {
    const financialStore = new InMemoryFinancialStore({
      paymentOrders: [
        createPaymentRecord({
          status: 'escrowed',
          providerTradeNo: 'sandbox-trade-1',
          paidAtIso: '2026-07-15T07:59:00.000Z',
        }),
      ],
    });
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'online' }),
    );
    order.paymentStatus = 'escrowed';

    const cancelled = await service.cancelOrder(
      'shipper-1',
      order.id,
      'cancel-escrowed-key',
      {
        reasonText: '计划变更',
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'refund_pending',
    });
    expect(financialStore.findPaymentOrderById('payment-1')).toMatchObject({
      status: 'refund_pending',
    });
    const refund = financialStore.findRefundByOrderId(order.id);
    expect(refund).toMatchObject({
      paymentOrderId: 'payment-1',
      shipperId: 'shipper-1',
      amountCents: 76000,
      reason: 'order_cancelled',
      status: 'pending',
    });
    expect(financialStore.listOutboxEvents()).toEqual([
      expect.objectContaining({
        eventType: 'refund.requested',
        aggregateType: 'refund',
        aggregateId: refund?.id,
        refundId: refund?.id,
        status: 'pending',
        payload: {
          refundId: refund?.id,
          paymentOrderId: 'payment-1',
        },
      }),
    ]);
  });

  it('cancels COD without creating payment, refund or outbox facts', async () => {
    const financialStore = new InMemoryFinancialStore();
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );

    const cancelled = await service.cancelOrder(
      'shipper-1',
      order.id,
      'cancel-cod-key',
      {
        reasonText: '计划变更',
        baseUpdatedAtIso: order.updatedAtIso,
      },
    );

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'cancelled',
    });
    expect(financialStore.listPaymentOrders()).toEqual([]);
    expect(financialStore.listRefunds()).toEqual([]);
    expect(financialStore.listOutboxEvents()).toEqual([]);
  });

  it('settles COD into a balanced ledger and credits the driver wallet', async () => {
    const financialStore = new InMemoryFinancialStore();
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const confirming = await repository.advanceOrderStatus(
      order.id,
      'driver-1',
      { nextStatus: 'confirming' },
    );

    const completed = await service.completeOrder(
      'shipper-1',
      order.id,
      'complete-cod-key',
      { baseUpdatedAtIso: confirming.updatedAtIso },
    );

    expect(completed).toMatchObject({
      status: 'completed',
      paymentStatus: 'settled',
      assignedDriverId: 'driver-1',
      paymentSettledAtIso: NOW.toISOString(),
    });
    expect(financialStore.findSettlementByOrderId(order.id)).toMatchObject({
      driverId: 'driver-1',
      grossAmountCents: 76000,
      platformFeeRateBps: 500,
      platformFeeCents: 3800,
      driverNetAmountCents: 72200,
      settledAtIso: NOW.toISOString(),
    });
    const transaction = financialStore.listFinancialTransactionsForOrder(
      order.id,
    )[0];
    expect(transaction).toMatchObject({
      type: 'offline_order_settlement',
      amountCents: 76000,
      entries: [
        expect.objectContaining({
          accountType: 'offline_clearing',
          direction: 'debit',
          amountCents: 76000,
        }),
        expect.objectContaining({
          accountType: 'driver_payable',
          accountUserId: 'driver-1',
          direction: 'credit',
          amountCents: 72200,
        }),
        expect.objectContaining({
          accountType: 'platform_revenue',
          direction: 'credit',
          amountCents: 3800,
        }),
      ],
    });
    expect(sumSignedLedgerEntries(transaction.entries)).toBe(0);
    expect(financialStore.findDriverWallet('driver-1')).toMatchObject({
      availableCents: 72200,
      reservedCents: 0,
      withdrawnCents: 0,
      version: 1,
    });
  });

  it('snapshots the configured platform fee rate at settlement time', async () => {
    const financialStore = new InMemoryFinancialStore();
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
      650,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const confirming = await repository.advanceOrderStatus(
      order.id,
      'driver-1',
      { nextStatus: 'confirming' },
    );

    await service.completeOrder(
      'shipper-1',
      order.id,
      'configured-fee-key',
      { baseUpdatedAtIso: confirming.updatedAtIso },
    );

    expect(financialStore.findSettlementByOrderId(order.id)).toMatchObject({
      platformFeeRateBps: 650,
      platformFeeCents: 4940,
      driverNetAmountCents: 71060,
    });
  });

  it('settles online escrow using the payment snapshot amount', async () => {
    const financialStore = new InMemoryFinancialStore({
      paymentOrders: [
        createPaymentRecord({
          status: 'escrowed',
          amountCents: 73000,
          providerTradeNo: 'sandbox-trade-1',
          paidAtIso: '2026-07-15T07:59:00.000Z',
        }),
      ],
    });
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({
        paymentMethod: 'online',
        priceCents: 73000,
      }),
    );
    order.paymentStatus = 'escrowed';
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const confirming = await repository.advanceOrderStatus(
      order.id,
      'driver-1',
      { nextStatus: 'confirming' },
    );

    const completed = await service.completeOrder(
      'shipper-1',
      order.id,
      'complete-online-key',
      { baseUpdatedAtIso: confirming.updatedAtIso },
    );

    expect(completed.paymentStatus).toBe('settled');
    expect(financialStore.findPaymentOrderById('payment-1')).toMatchObject({
      status: 'settled',
      settledAtIso: NOW.toISOString(),
    });
    expect(financialStore.findSettlementByOrderId(order.id)).toMatchObject({
      paymentOrderId: 'payment-1',
      grossAmountCents: 73000,
      platformFeeCents: 3650,
      driverNetAmountCents: 69350,
    });
    const transaction = financialStore.listFinancialTransactionsForOrder(
      order.id,
    )[0];
    expect(transaction).toMatchObject({
      type: 'online_order_settlement',
      paymentOrderId: 'payment-1',
      entries: [
        expect.objectContaining({ accountType: 'platform_escrow' }),
        expect.objectContaining({ accountType: 'driver_payable' }),
        expect.objectContaining({ accountType: 'platform_revenue' }),
      ],
    });
    expect(sumSignedLedgerEntries(transaction.entries)).toBe(0);
    expect(financialStore.findDriverWallet('driver-1')).toMatchObject({
      availableCents: 69350,
    });
  });

  it('fails settlement closed when the accepted driver is missing', async () => {
    const repository = new InMemoryOrdersRepository(() => NOW);
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    const confirming = await repository.advanceOrderStatus(
      order.id,
      'shipper-1',
      { nextStatus: 'confirming' },
    );

    await expect(
      service.completeOrder('shipper-1', order.id, 'missing-driver-key', {
        baseUpdatedAtIso: confirming.updatedAtIso,
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.SETTLEMENT_DRIVER_MISSING });
  });

  it('publishes no order or ledger state when settlement persistence fails', async () => {
    const settlementError = new Error('settlement write failed');
    const financialStore = new FailingSettlementFinancialStore(settlementError);
    const repository = new InMemoryOrdersRepository(
      () => NOW,
      undefined,
      financialStore,
    );
    const service = new OrdersService(repository);
    const order = await repository.seedOrderForTest(
      'shipper-1',
      createOrderInput({ paymentMethod: 'cod' }),
    );
    await repository.acceptDriverOrder(order.id, 'driver-1', {});
    const confirming = await repository.advanceOrderStatus(
      order.id,
      'driver-1',
      { nextStatus: 'confirming' },
    );

    await expect(
      service.completeOrder('shipper-1', order.id, 'failed-settlement-key', {
        baseUpdatedAtIso: confirming.updatedAtIso,
      }),
    ).rejects.toBe(settlementError);
    await expect(repository.findOrderById(order.id)).resolves.toMatchObject({
      status: 'confirming',
      paymentStatus: 'not_required',
    });
    expect(financialStore.listFinancialTransactions()).toEqual([]);
    expect(financialStore.findSettlementByOrderId(order.id)).toBeUndefined();
    expect(financialStore.findDriverWallet('driver-1')).toBeUndefined();
  });
});

describe('Prisma order cancellation financial transaction', () => {
  it('moves escrow to refund pending and creates refund outbox atomically', async () => {
    const current = createPrismaOrderRecord({
      paymentMethod: 'online',
      paymentStatus: 'escrowed',
    });
    const updated = createPrismaOrderRecord({
      status: 'cancelled',
      paymentMethod: 'online',
      paymentStatus: 'refund_pending',
      updatedAt: new Date('2026-07-15T08:00:00.001Z'),
    });
    const harness = createPrismaMutationHarness(current, updated);
    harness.transaction.paymentOrder.findFirst.mockResolvedValue(
      createPrismaPaymentRecord({ status: 'escrowed' }),
    );

    const result = await harness.repository.executeIdempotentOrderMutation(
      createCancelMutationInput(current),
    );

    expect(result).toMatchObject({
      kind: 'success',
      order: {
        status: 'cancelled',
        paymentStatus: 'refund_pending',
      },
    });
    expect(harness.transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: 'escrowed' },
      data: {
        status: 'refund_pending',
        updatedAt: new Date('2026-07-15T08:00:00.000Z'),
      },
    });
    expect(harness.transaction.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentOrderId: 'payment-1',
        orderId: 'order-1',
        shipperId: 'shipper-1',
        amountCents: 76000,
        reason: 'order_cancelled',
        status: 'pending',
      }),
    });
    expect(
      harness.transaction.financialOutboxEvent.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'refund.requested',
        aggregateType: 'refund',
        refundId: expect.any(String),
        status: 'pending',
        payload: expect.objectContaining({ paymentOrderId: 'payment-1' }),
      }),
    });
    expect(harness.transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'order-1',
          paymentStatus: 'escrowed',
        }),
        data: expect.objectContaining({
          status: 'cancelled',
          paymentStatus: 'refund_pending',
        }),
      }),
    );
  });

  it('does not finish the idempotency snapshot when refund outbox creation fails', async () => {
    const current = createPrismaOrderRecord({
      paymentMethod: 'online',
      paymentStatus: 'escrowed',
    });
    const updated = createPrismaOrderRecord({
      status: 'cancelled',
      paymentMethod: 'online',
      paymentStatus: 'refund_pending',
      updatedAt: new Date('2026-07-15T08:00:00.001Z'),
    });
    const harness = createPrismaMutationHarness(current, updated);
    const outboxError = new Error('outbox write failed');
    harness.transaction.paymentOrder.findFirst.mockResolvedValue(
      createPrismaPaymentRecord({ status: 'escrowed' }),
    );
    harness.transaction.financialOutboxEvent.create.mockRejectedValueOnce(
      outboxError,
    );

    await expect(
      harness.repository.executeIdempotentOrderMutation(
        createCancelMutationInput(current),
      ),
    ).rejects.toBe(outboxError);
    expect(
      harness.transaction.orderIdempotencyRecord.update,
    ).not.toHaveBeenCalled();
  });
});

describe('Prisma order settlement financial transaction', () => {
  it('creates COD settlement, balanced entries and wallet credit atomically', async () => {
    const current = createPrismaOrderRecord({
      status: 'confirming',
      paymentMethod: 'cod',
      paymentStatus: 'not_required',
      assignedDriverId: 'driver-1',
    });
    const updated = createPrismaOrderRecord({
      status: 'completed',
      paymentMethod: 'cod',
      paymentStatus: 'settled',
      assignedDriverId: 'driver-1',
      paymentSettledAt: NOW,
      updatedAt: new Date('2026-07-15T08:00:00.001Z'),
    });
    const harness = createPrismaMutationHarness(current, updated);

    const result = await harness.repository.executeIdempotentOrderMutation(
      createCompleteMutationInput(current),
    );

    expect(result).toMatchObject({
      kind: 'success',
      order: { status: 'completed', paymentStatus: 'settled' },
    });
    expect(
      harness.transaction.financialTransaction.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'offline_order_settlement',
        referenceId: 'order-1',
        amountCents: 76000,
        entries: {
          create: [
            expect.objectContaining({
              sequence: 0,
              accountType: 'offline_clearing',
              direction: 'debit',
              amountCents: 76000,
            }),
            expect.objectContaining({
              sequence: 1,
              accountType: 'driver_payable',
              accountUserId: 'driver-1',
              direction: 'credit',
              amountCents: 72200,
            }),
            expect.objectContaining({
              sequence: 2,
              accountType: 'platform_revenue',
              direction: 'credit',
              amountCents: 3800,
            }),
          ],
        },
      }),
    });
    expect(harness.transaction.settlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        driverId: 'driver-1',
        grossAmountCents: 76000,
        platformFeeRateBps: 500,
        platformFeeCents: 3800,
        driverNetAmountCents: 72200,
      }),
    });
    expect(harness.transaction.driverWallet.upsert).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
      create: expect.objectContaining({
        driverId: 'driver-1',
        availableCents: 72200,
      }),
      update: {
        availableCents: { increment: 72200 },
        version: { increment: 1 },
        updatedAt: NOW,
      },
    });
    expect(harness.transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          paymentStatus: 'settled',
          paymentSettledAt: NOW,
        }),
      }),
    );
  });

  it('settles the exact escrowed online payment and closes that payment order', async () => {
    const current = createPrismaOrderRecord({
      status: 'confirming',
      paymentMethod: 'online',
      paymentStatus: 'escrowed',
      assignedDriverId: 'driver-1',
      payablePriceCents: 73000,
    });
    const updated = createPrismaOrderRecord({
      status: 'completed',
      paymentMethod: 'online',
      paymentStatus: 'settled',
      assignedDriverId: 'driver-1',
      payablePriceCents: 73000,
      paymentSettledAt: NOW,
      updatedAt: new Date('2026-07-15T08:00:00.001Z'),
    });
    const harness = createPrismaMutationHarness(current, updated);
    harness.transaction.paymentOrder.findFirst.mockResolvedValue(
      createPrismaPaymentRecord({ status: 'escrowed', amountCents: 73000 }),
    );

    await harness.repository.executeIdempotentOrderMutation(
      createCompleteMutationInput(current),
    );

    expect(harness.transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: 'escrowed' },
      data: { status: 'settled', settledAt: NOW, updatedAt: NOW },
    });
    expect(
      harness.transaction.financialTransaction.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'online_order_settlement',
        paymentOrderId: 'payment-1',
        amountCents: 73000,
        entries: {
          create: expect.arrayContaining([
            expect.objectContaining({ accountType: 'platform_escrow' }),
            expect.objectContaining({ accountType: 'driver_payable' }),
            expect.objectContaining({ accountType: 'platform_revenue' }),
          ]),
        },
      }),
    });
    expect(harness.transaction.settlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentOrderId: 'payment-1',
        grossAmountCents: 73000,
        driverNetAmountCents: 69350,
      }),
    });
  });
});

function createOrderInput(
  overrides: Partial<CreateShipperOrderRequest> = {},
): CreateShipperOrderRequest {
  return {
    cargoType: 'build',
    weightText: '2.5 吨',
    quantityText: '12 箱',
    pickupAddress: '宝安区福永物流园',
    pickupContact: '赵经理',
    pickupPhone: '13900139001',
    deliveryAddress: '南山区科技园',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139002',
    vehicleRequirement: 'medium',
    needTailboard: false,
    needTarp: false,
    pickupTimeIso: '2026-07-16T02:00:00.000Z',
    pricingMode: 'fixed',
    priceCents: 76000,
    paymentMethod: 'cod',
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
    orderNo: 'HY202607150000000001',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 76000,
    status: 'pending',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestFingerprint: 'payment-fingerprint-1',
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    createdAtIso: '2026-07-15T07:58:00.000Z',
    updatedAtIso: '2026-07-15T07:58:00.000Z',
    ...overrides,
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
    amountCents: 76000,
    status: 'escrowed',
    ...overrides,
  };
}

function createPrismaOrderRecord(
  overrides: Partial<PrismaOrderRecord> = {},
): PrismaOrderRecord {
  return {
    id: 'order-1',
    orderNo: 'HY202607150000000001',
    shipperId: 'shipper-1',
    status: 'waiting',
    pricingMode: 'fixed',
    priceCents: 76000,
    payablePriceCents: null,
    paymentMethod: 'cod',
    paymentStatus: 'not_required',
    assignedDriverId: null,
    paymentSettledAt: null,
    refundedAt: null,
    couponId: null,
    couponTitle: null,
    couponDiscountCents: null,
    pickupTime: new Date('2026-07-16T02:00:00.000Z'),
    expectedDeliveryText: null,
    createdAt: new Date('2026-07-15T07:00:00.000Z'),
    updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    cargo: {
      cargoType: 'build',
      weightText: '2.5 吨',
      volumeText: null,
      quantityText: '12 箱',
      description: null,
      cargoPhotoCount: 0,
      cargoPhotoFileIds: [],
    },
    locations: [
      {
        type: 'pickup',
        address: '宝安区福永物流园',
        contactName: '赵经理',
        contactPhone: '13900139001',
        noteText: null,
      },
      {
        type: 'delivery',
        address: '南山区科技园',
        contactName: '钱店长',
        contactPhone: '13900139002',
        noteText: null,
      },
    ],
    requirement: {
      vehicleType: 'medium',
      vehicleLengthText: null,
      needTailboard: false,
      needTarp: false,
      valueAddedServicesText: null,
    },
    events: [],
    ...overrides,
  };
}

function createCancelMutationInput(current: PrismaOrderRecord) {
  return {
    actorUserId: 'shipper-1',
    orderId: current.id,
    operation: 'shipper_cancel' as const,
    idempotencyKey: 'cancel-payment-key',
    requestFingerprint: 'cancel-payment-fingerprint',
    baseUpdatedAtIso: current.updatedAt.toISOString(),
    expiresAtIso: '2026-07-16T08:00:00.000Z',
    mutation: {
      type: 'shipper_cancel' as const,
      input: { reasonText: '计划变更' },
    },
  };
}

function createCompleteMutationInput(current: PrismaOrderRecord) {
  return {
    actorUserId: 'shipper-1',
    orderId: current.id,
    operation: 'shipper_complete' as const,
    idempotencyKey: 'complete-payment-key',
    requestFingerprint: 'complete-payment-fingerprint',
    baseUpdatedAtIso: current.updatedAt.toISOString(),
    expiresAtIso: '2026-07-16T08:00:00.000Z',
    mutation: { type: 'shipper_complete' as const },
  };
}

function createPrismaMutationHarness(
  current: PrismaOrderRecord,
  updated: PrismaOrderRecord,
) {
  const transaction = {
    order: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(updated),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
      update: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
    },
    shipperCoupon: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    orderCargo: { upsert: jest.fn() },
    orderLocation: { updateMany: jest.fn() },
    orderRequirement: { upsert: jest.fn() },
    orderEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    orderExceptionCase: { count: jest.fn(), create: jest.fn(), update: jest.fn() },
    orderExceptionCaseAction: { create: jest.fn() },
    paymentOrder: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refund: {
      create: jest.fn().mockImplementation(({ data }) => ({
        ...data,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    },
    financialOutboxEvent: {
      create: jest.fn().mockImplementation(({ data }) => ({
        ...data,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    },
    financialTransaction: {
      create: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
    },
    settlement: {
      create: jest.fn().mockResolvedValue({ id: 'settlement-1' }),
    },
    driverWallet: {
      upsert: jest.fn().mockResolvedValue({ driverId: 'driver-1' }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async callback => callback(transaction)),
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderIdempotencyRecord: { findUnique: jest.fn() },
  } as unknown as PrismaOrdersClient;

  return {
    transaction,
    repository: new PrismaOrdersRepository(prisma, () => NOW),
  };
}

class FailingSettlementFinancialStore extends InMemoryFinancialStore {
  constructor(private readonly settlementError: Error) {
    super();
  }

  override clone() {
    return new FailingSettlementFinancialStore(this.settlementError);
  }

  override createSettlement(
    ..._args: Parameters<InMemoryFinancialStore['createSettlement']>
  ): ReturnType<InMemoryFinancialStore['createSettlement']> {
    throw this.settlementError;
  }
}

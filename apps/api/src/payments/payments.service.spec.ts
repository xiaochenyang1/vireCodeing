import { ApiErrorCode } from '../common/errors';
import type {
  PaymentProvider,
  PaymentProviderChannel,
  ProviderRawCallback,
} from './payment-provider';
import type {
  FinancialOutboxEventRecord,
  PaymentOrderRecord,
  PaymentSourceOrderRecord,
  RefundRecord,
} from './dto';
import { InMemoryPaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const NOW = new Date('2026-07-15T08:00:00.000Z');
const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000';

describe('PaymentsService', () => {
  it('reserves before provider I/O and persists the opaque client payload', async () => {
    const { service, provider, repository } = createService();

    const result = await service.createPayment(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      { channel: 'wechat' },
    );

    expect(provider.createClientPayment).toHaveBeenCalledWith({
      paymentNo: 'PAY-payment-id-1',
      amountCents: 73000,
      description: '货运订单 HY202607150001',
      expiresAtIso: '2026-07-15T08:15:00.000Z',
    });
    expect(result).toEqual({
      replayed: false,
      payment: expect.objectContaining({
        id: 'payment-id-1',
        channel: 'sandbox',
        status: 'processing',
        clientPayload: {
          provider: 'sandbox',
          token: 'opaque-client-token',
        },
      }),
    });
    await expect(
      repository.findPaymentOrderForShipper('shipper-1', 'payment-id-1'),
    ).resolves.toMatchObject({ status: 'processing' });
  });

  it('replays one key without calling the provider twice', async () => {
    const { service, provider } = createService();

    const first = await service.createPayment(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      { channel: 'wechat' },
    );
    const replay = await service.createPayment(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      { channel: 'wechat' },
    );

    expect(first.replayed).toBe(false);
    expect(replay).toEqual({
      replayed: true,
      payment: first.payment,
    });
    expect(provider.createClientPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects one key reused for another channel before provider I/O', async () => {
    const { service, provider } = createService();
    await service.createPayment(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      { channel: 'wechat' },
    );

    await expect(
      service.createPayment(
        'shipper-1',
        'order-1',
        IDEMPOTENCY_KEY,
        { channel: 'alipay' },
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED });
    expect(provider.createClientPayment).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ shipperId: 'shipper-2' }, ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE],
    [{ paymentMethod: 'cod' }, ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE],
    [{ paymentStatus: 'escrowed' }, ApiErrorCode.PAYMENT_ALREADY_ESCROWED],
    [{ payablePriceCents: 0 }, ApiErrorCode.PAYMENT_AMOUNT_INVALID],
  ] as const)(
    'maps repository payment refusal to a stable business error for %p',
    async (orderOverrides, expectedCode) => {
      const { service } = createService(orderOverrides);

      await expect(
        service.createPayment(
          'shipper-1',
          'order-1',
          IDEMPOTENCY_KEY,
          { channel: 'wechat' },
        ),
      ).rejects.toMatchObject({ code: expectedCode });
    },
  );

  it('marks a reservation failed when provider preparation fails', async () => {
    const { service, provider, repository } = createService();
    jest
      .mocked(provider.createClientPayment)
      .mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(
      service.createPayment(
        'shipper-1',
        'order-1',
        IDEMPOTENCY_KEY,
        { channel: 'wechat' },
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE });
    await expect(
      repository.findPaymentOrderForShipper('shipper-1', 'payment-id-1'),
    ).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'provider_prepare_failed',
    });
  });

  it('verifies a raw callback and applies the verified facts', async () => {
    const { service, provider } = createService();
    await service.createPayment(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      { channel: 'wechat' },
    );
    const rawCallback: ProviderRawCallback = {
      headers: { 'x-sandbox-signature': 'signature' },
      rawBody: Buffer.from('{"eventId":"event-1"}'),
    };

    const result = await service.handlePaymentCallback(
      'sandbox',
      rawCallback,
    );

    expect(provider.verifyPaymentCallback).toHaveBeenCalledWith(rawCallback);
    expect(result).toMatchObject({
      kind: 'applied',
      payment: { status: 'escrowed' },
      orderPaymentStatus: 'escrowed',
    });
  });

  it('turns provider event id payload conflicts into PAYMENT_CALLBACK_CONFLICT', async () => {
    const { service } = createService();
    await service.createPayment(
      'shipper-1',
      'order-1',
      IDEMPOTENCY_KEY,
      { channel: 'wechat' },
    );
    const callback = createVerifiedCallback();

    await service.applyVerifiedPaymentCallback('sandbox', callback);
    await expect(
      service.applyVerifiedPaymentCallback('sandbox', {
        ...callback,
        rawPayloadHash: 'another-payload-hash',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.PAYMENT_CALLBACK_CONFLICT });
  });

  it('requests a refund from claimed database facts and completes provider acceptance', async () => {
    const { service, provider, repository } = createRefundService();
    const [claim] = await repository.claimRefundOutboxEvents({
      workerId: 'refund-worker-a',
      limit: 1,
      nowIso: NOW.toISOString(),
      leaseDurationMs: 30_000,
    });

    await expect(service.processRefundOutboxEvent(claim)).resolves.toBeUndefined();
    expect(provider.requestRefund).toHaveBeenCalledWith({
      refundNo: 'RF-PAY-1',
      paymentNo: 'PAY-1',
      providerTradeNo: 'sandbox-trade-1',
      amountCents: 73000,
      totalAmountCents: 73000,
      reason: 'order_cancelled',
    });
    await expect(
      repository.completeRefundOutboxRequest({
        outboxEventId: 'outbox-1',
        workerId: 'refund-worker-a',
        claimAttempt: 1,
        providerRefundNo: 'sandbox-refund-1',
        completedAtIso: '2026-07-15T08:00:01.000Z',
      }),
    ).resolves.toEqual({ kind: 'claim-lost' });
  });

  it('verifies a raw refund callback and applies the verified facts', async () => {
    const { service, provider } = createRefundService();
    const rawCallback: ProviderRawCallback = {
      headers: { 'x-sandbox-signature': 'refund-signature' },
      rawBody: Buffer.from('{"eventId":"refund-event-1"}'),
    };

    const result = await service.handleRefundCallback('sandbox', rawCallback);

    expect(provider.verifyRefundCallback).toHaveBeenCalledWith(rawCallback);
    expect(result).toMatchObject({
      kind: 'applied',
      refund: { status: 'succeeded' },
      payment: { status: 'refunded' },
      orderPaymentStatus: 'refunded',
      financialTransaction: { type: 'online_refund' },
    });
  });

  it('routes synchronous provider success through idempotent refund posting', async () => {
    const { service, provider, repository } = createRefundService();
    jest.mocked(provider.requestRefund).mockResolvedValueOnce({
      providerRefundNo: 'sandbox-refund-1',
      status: 'succeeded',
    });
    const [claim] = await repository.claimRefundOutboxEvents({
      workerId: 'refund-worker-a',
      limit: 1,
      nowIso: NOW.toISOString(),
      leaseDurationMs: 30_000,
    });

    await expect(service.processRefundOutboxEvent(claim)).resolves.toBeUndefined();
    await expect(
      service.applyVerifiedRefundCallback('sandbox', {
        eventId: 'sandbox-refund-event-later',
        refundNo: 'RF-PAY-1',
        providerRefundNo: 'sandbox-refund-1',
        amountCents: 73000,
        status: 'succeeded',
        occurredAtIso: '2026-07-15T08:02:01.000Z',
        rawPayloadHash: 'later-refund-payload-hash',
      }),
    ).resolves.toMatchObject({
      kind: 'applied',
      replayed: true,
      refund: { status: 'succeeded' },
      payment: { status: 'refunded' },
      financialTransaction: { type: 'online_refund' },
    });
    await expect(
      repository.completeRefundOutboxRequest({
        outboxEventId: 'outbox-1',
        workerId: 'refund-worker-a',
        claimAttempt: 1,
        providerRefundNo: 'sandbox-refund-1',
        completedAtIso: '2026-07-15T08:02:02.000Z',
      }),
    ).resolves.toEqual({ kind: 'claim-lost' });
  });

  it('rejects a mismatched refund provider channel before provider I/O', async () => {
    const { provider, repository } = createRefundService();
    const mismatchedProvider: jest.Mocked<PaymentProvider> = {
      ...provider,
      channel: 'wechat',
    };
    const service = new PaymentsService(repository, () => mismatchedProvider, {
      now: () => NOW,
    });
    const [claim] = await repository.claimRefundOutboxEvents({
      workerId: 'refund-worker-a',
      limit: 1,
      nowIso: NOW.toISOString(),
      leaseDurationMs: 30_000,
    });

    await expect(service.processRefundOutboxEvent(claim)).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
    });
    expect(mismatchedProvider.requestRefund).not.toHaveBeenCalled();
  });
});

function createService(
  orderOverrides: Partial<PaymentSourceOrderRecord> = {},
) {
  let repositoryId = 0;
  let serviceId = 0;
  const repository = new InMemoryPaymentsRepository({
    now: () => NOW,
    createId: () => `repository-id-${++repositoryId}`,
    orders: [createSourceOrder(orderOverrides)],
  });
  const provider = createProvider();
  const resolveProvider = jest.fn(
    (_channel: PaymentProviderChannel): PaymentProvider => provider,
  );
  const service = new PaymentsService(repository, resolveProvider, {
    now: () => NOW,
    createId: () => `payment-id-${++serviceId}`,
    paymentExpiresSeconds: 900,
  });

  return { service, provider, repository, resolveProvider };
}

function createProvider(): jest.Mocked<PaymentProvider> {
  return {
    channel: 'sandbox',
    createClientPayment: jest.fn().mockResolvedValue({
      channel: 'sandbox',
      payload: {
        provider: 'sandbox',
        token: 'opaque-client-token',
      },
    }),
    verifyPaymentCallback: jest.fn().mockResolvedValue(createVerifiedCallback()),
    requestRefund: jest.fn().mockResolvedValue({
      providerRefundNo: 'sandbox-refund-1',
      status: 'processing',
    }),
    verifyRefundCallback: jest.fn().mockResolvedValue({
      eventId: 'sandbox-refund-event-1',
      refundNo: 'RF-PAY-payment-id-1',
      providerRefundNo: 'sandbox-refund-1',
      amountCents: 73000,
      status: 'succeeded',
      occurredAtIso: '2026-07-15T08:02:00.000Z',
      rawPayloadHash: 'refund-payload-hash',
    }),
  };
}

function createRefundService() {
  const repository = new InMemoryPaymentsRepository({
    now: () => NOW,
    orders: [
      createSourceOrder({
        status: 'cancelled',
        paymentStatus: 'refund_pending',
      }),
    ],
    paymentOrders: [createRefundPayment()],
    refunds: [createPendingRefund()],
    outboxEvents: [createRefundOutboxEvent()],
  });
  const provider = createProvider();
  jest.mocked(provider.verifyRefundCallback).mockResolvedValue({
    eventId: 'sandbox-refund-event-1',
    refundNo: 'RF-PAY-1',
    providerRefundNo: 'sandbox-refund-1',
    amountCents: 73000,
    status: 'succeeded',
    occurredAtIso: '2026-07-15T08:02:00.000Z',
    rawPayloadHash: 'refund-payload-hash',
  });
  const service = new PaymentsService(repository, () => provider, {
    now: () => new Date('2026-07-15T08:00:01.000Z'),
  });

  return { service, provider, repository };
}

function createRefundPayment(): PaymentOrderRecord {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    channel: 'sandbox',
    amountCents: 73000,
    status: 'refund_pending',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestFingerprint: 'fingerprint-1',
    providerTradeNo: 'sandbox-trade-1',
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    paidAtIso: '2026-07-15T07:59:00.000Z',
    createdAtIso: '2026-07-15T07:45:00.000Z',
    updatedAtIso: NOW.toISOString(),
  };
}

function createPendingRefund(): RefundRecord {
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

function createRefundOutboxEvent(): FinancialOutboxEventRecord {
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
  };
}

function createVerifiedCallback() {
  return {
    eventId: 'sandbox-event-1',
    paymentNo: 'PAY-payment-id-1',
    providerTradeNo: 'sandbox-trade-1',
    amountCents: 73000,
    status: 'succeeded' as const,
    occurredAtIso: '2026-07-15T08:01:00.000Z',
    rawPayloadHash: 'payment-payload-hash',
  };
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

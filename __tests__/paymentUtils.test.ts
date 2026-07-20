import {
  continuePlatformPayment,
  executePlatformPayment,
  pollPlatformPayment,
  type PendingPlatformPayment,
} from '../src/utils/payment';
import type {
  PlatformPaymentRecord,
  PlatformPaymentSdk,
} from '../src/services/platformPaymentApi';

describe('payment utils', () => {
  it('waits for server escrow after SDK success instead of trusting the client', async () => {
    const pending = createPayment({ status: 'pending' });
    const escrowed = createPayment({ status: 'escrowed' });
    const api = {
      createPayment: jest.fn().mockResolvedValue({
        replayed: false,
        payment: pending,
      }),
      getLatestPayment: jest
        .fn()
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(escrowed),
    };
    const sdk: PlatformPaymentSdk = {
      openPayment: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    };
    const persistence = createPendingPersistence();
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      executePlatformPayment({
        api,
        sdk,
        orderId: 'order-1',
        channel: 'wechat',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        persistence,
        sleep,
        pollDelaysMs: [100, 200],
      }),
    ).resolves.toEqual({ status: 'escrowed', payment: escrowed });
    expect(sdk.openPayment).toHaveBeenCalledWith('wechat', {
      prepayId: 'prepay-1',
    });
    expect(api.getLatestPayment).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
    expect(persistence.save.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.remove.mock.invocationCallOrder[0],
    );
  });

  it('keeps a recoverable pending record when the SDK is cancelled', async () => {
    const api = {
      createPayment: jest.fn().mockResolvedValue({
        replayed: false,
        payment: createPayment(),
      }),
      getLatestPayment: jest.fn(),
    };
    const sdk: PlatformPaymentSdk = {
      openPayment: jest.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    const persistence = createPendingPersistence();

    await expect(
      executePlatformPayment({
        api,
        sdk,
        orderId: 'order-1',
        channel: 'wechat',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        persistence,
      }),
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(api.getLatestPayment).not.toHaveBeenCalled();
    expect(persistence.remove).not.toHaveBeenCalled();
  });

  it('returns pending after bounded polling times out', async () => {
    const payment = createPayment();
    const getLatestPayment = jest.fn().mockResolvedValue(payment);

    await expect(
      pollPlatformPayment({
        orderId: 'order-1',
        getLatestPayment,
        sleep: jest.fn().mockResolvedValue(undefined),
        pollDelaysMs: [10, 20],
      }),
    ).resolves.toEqual({ status: 'pending', payment });
    expect(getLatestPayment).toHaveBeenCalledTimes(2);
  });

  it('continues an existing active payment without creating a second payment order', async () => {
    const pending = createPayment({ status: 'processing' });
    const escrowed = createPayment({ status: 'escrowed' });
    const api = {
      getLatestPayment: jest.fn().mockResolvedValue(escrowed),
    };
    const sdk: PlatformPaymentSdk = {
      openPayment: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    };
    const persistence = createPendingPersistence();

    await expect(
      continuePlatformPayment({
        api,
        sdk,
        payment: pending,
        channel: 'alipay',
        persistence,
        sleep: jest.fn().mockResolvedValue(undefined),
        pollDelaysMs: [0],
        now: () => new Date('2026-07-15T08:01:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'escrowed', payment: escrowed });
    expect(sdk.openPayment).toHaveBeenCalledWith('alipay', {
      prepayId: 'prepay-1',
    });
    expect(persistence.save).toHaveBeenCalledWith({
      orderId: 'order-1',
      paymentId: 'payment-1',
      channel: 'alipay',
      createdAtIso: '2026-07-15T08:01:00.000Z',
    });
    expect(persistence.remove).toHaveBeenCalledTimes(1);
  });
});

function createPayment(
  overrides: Partial<PlatformPaymentRecord> = {},
): PlatformPaymentRecord {
  return {
    id: 'payment-1',
    paymentNo: 'PAY-1',
    orderId: 'order-1',
    orderNo: 'HY202607150001',
    shipperId: 'shipper-1',
    channel: 'wechat',
    amountCents: 31000,
    status: 'pending',
    clientPayload: { prepayId: 'prepay-1' },
    expiresAtIso: '2026-07-15T08:15:00.000Z',
    createdAtIso: '2026-07-15T08:00:00.000Z',
    updatedAtIso: '2026-07-15T08:00:00.000Z',
    ...overrides,
  };
}

function createPendingPersistence() {
  let pending: PendingPlatformPayment | undefined;
  return {
    read: jest.fn(async () => pending),
    save: jest.fn(async (value: PendingPlatformPayment) => {
      pending = value;
    }),
    remove: jest.fn(async () => {
      pending = undefined;
    }),
  };
}

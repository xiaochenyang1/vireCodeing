import { createPlatformPaymentApi } from '../src/services/platformPaymentApi';

describe('platform payment api', () => {
  const originalFetch = globalThis.fetch;

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
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
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

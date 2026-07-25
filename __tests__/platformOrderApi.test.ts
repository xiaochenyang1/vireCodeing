import { createPlatformOrderApi } from '../src/services/platformOrderApi';
import { PlatformApiError } from '../src/services/platformApiClient';

describe('platform order api', () => {
  const createIdempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
  it('lists shipper exception cases with a normalized order id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ items: [], total: 0 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listExceptionCases(' order-1 ');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/exception-cases',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('preserves compensation decision fields when listing shipper exception cases', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        total: 1,
        items: [
          {
            id: 'case-1',
            caseNo: 'YC202607180001',
            orderId: 'order-1',
            orderNo: 'HY202607180001',
            sourceEventId: 'event-1',
            reporterUserId: 'driver-1',
            sourceRole: 'driver',
            typeLabel: '货损',
            description: '装货时发现包装破损',
            attachmentFileIds: [],
            status: 'resolved',
            resolutionText: '客服判定线下赔付。',
            compensationStatus: 'offline_completed',
            compensationTargetRole: 'driver',
            compensationAmountCents: 8800,
            compensationUpdatedAtIso: '2026-07-18T02:30:00.000Z',
            createdAtIso: '2026-07-18T02:00:00.000Z',
            updatedAtIso: '2026-07-18T02:30:00.000Z',
            actions: [],
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.listExceptionCases('order-1')).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          caseNo: 'YC202607180001',
          compensationStatus: 'offline_completed',
          compensationTargetRole: 'driver',
          compensationAmountCents: 8800,
          compensationUpdatedAtIso: '2026-07-18T02:30:00.000Z',
        }),
      ],
    });
  });

  it('preserves executed compensation and appeal fields when listing cases', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        total: 1,
        items: [
          {
            id: 'case-1',
            caseNo: 'YC202607200001',
            orderId: 'order-1',
            orderNo: 'HY202607200001',
            sourceEventId: 'event-1',
            reporterUserId: 'shipper-1',
            sourceRole: 'shipper',
            typeLabel: '货损',
            description: '外包装破损，货物受潮',
            attachmentFileIds: [],
            status: 'resolved',
            resolutionText: '平台已完成赔付。',
            compensationStatus: 'executed',
            compensationTargetRole: 'shipper',
            compensationAmountCents: 3600,
            compensationUpdatedAtIso: '2026-07-20T02:30:00.000Z',
            compensationTransactionId: 'ft-1',
            compensationExecutedAtIso: '2026-07-20T02:30:00.000Z',
            appealStatus: 'none',
            createdAtIso: '2026-07-20T02:00:00.000Z',
            updatedAtIso: '2026-07-20T02:30:00.000Z',
            actions: [],
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.listExceptionCases('order-1')).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          compensationStatus: 'executed',
          compensationTransactionId: 'ft-1',
          compensationExecutedAtIso: '2026-07-20T02:30:00.000Z',
          appealStatus: 'none',
        }),
      ],
    });
  });

  it('appeals a resolved exception case with normalized ids and reason', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'case-1', status: 'processing' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.appealExceptionCase(' order-1 ', ' case-1 ', {
      baseUpdatedAtIso: '2026-07-20T02:30:00.000Z',
      reason: '  平台赔付金额与实际货损不符，申请重新核定。  ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/exception-cases/case-1/appeal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-20T02:30:00.000Z',
          reason: '平台赔付金额与实际货损不符，申请重新核定。',
        }),
      }),
    );
  });

  it('rejects an appeal reason that is too short before sending', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.appealExceptionCase('order-1', 'case-1', {
        baseUpdatedAtIso: '2026-07-20T02:30:00.000Z',
        reason: '太短',
      }),
    ).rejects.toBeInstanceOf(PlatformApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a shipper order with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { id: 'order-1', orderNo: 'HY202607010001' },
        requestId: 'req_order',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createOrder(createInput(), createIdempotencyKey),
    ).resolves.toMatchObject({
      id: 'order-1',
      orderNo: 'HY202607010001',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': createIdempotencyKey,
        }),
        body: expect.not.stringContaining('baseUpdatedAtIso'),
      }),
    );
  });

  it('normalizes create order request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { id: 'order-1', orderNo: 'HY202607010001' },
        requestId: 'req_order_trimmed',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const request = {
      ...createInput(),
      cargoType: ' build ',
      weightText: ' 2.5 吨 ',
      volumeText: '   ',
      quantityText: ' 12 箱 ',
      cargoDescription: '  易碎货物  ',
      cargoPhotoCount: 2,
      cargoPhotoFileIds: [' file-cargo-1 ', 'file-cargo-1'],
      pickupAddress: ' 宝安区福永物流园 ',
      pickupNoteText: '   ',
      pickupContact: ' 赵经理 ',
      pickupPhone: ' 13900139001 ',
      deliveryAddress: ' 南山区科技园 ',
      deliveryNoteText: '  走西门卸货  ',
      deliveryContact: ' 钱店长 ',
      deliveryPhone: ' 13900139002 ',
      vehicleRequirement: ' medium ',
      vehicleLengthText: '   ',
      pickupTimeIso: ' 2026-07-02T02:00:00.000Z ',
      expectedDeliveryTimeText: '   ',
      valueAddedServicesText: '   ',
      couponId: '   ',
      couponTitle: '   ',
    };

    await api.createOrder(request, createIdempotencyKey);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cargoType: 'build',
          weightText: '2.5 吨',
          quantityText: '12 箱',
          cargoDescription: '易碎货物',
          cargoPhotoCount: 1,
          cargoPhotoFileIds: ['file-cargo-1'],
          pickupAddress: '宝安区福永物流园',
          pickupNoteText: '',
          pickupContact: '赵经理',
          pickupPhone: '13900139001',
          deliveryAddress: '南山区科技园',
          deliveryNoteText: '走西门卸货',
          deliveryContact: '钱店长',
          deliveryPhone: '13900139002',
          vehicleRequirement: 'medium',
          needTailboard: false,
          needTarp: false,
          pickupTimeIso: '2026-07-02T02:00:00.000Z',
          pricingMode: 'fixed',
          priceCents: 76000,
          paymentMethod: 'cod',
        }),
      }),
    );
  });

  it('rejects invalid create and update order requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();
    const nullRequest =
      null as unknown as Parameters<typeof api.createOrder>[0];
    const stringRequest =
      'bad request' as unknown as Parameters<typeof api.createOrder>[0];
    const blankCargoTypeRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      cargoType: '   ',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const numberWeightRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      weightText: 2.5,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const longCargoDescriptionRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      cargoDescription: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidCargoPhotoCountRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      cargoPhotoCount: 7,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidCargoPhotoFileIdsRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      cargoPhotoFileIds: ['1', '2', '3', '4', '5', '6', '7'],
    } as unknown as Parameters<typeof api.createOrder>[0];
    const sameAddressRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      deliveryAddress: ' 宝安区福永物流园 ',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPhoneRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      pickupPhone: '12345',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const longPickupNoteRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      pickupNoteText: 'x'.repeat(51),
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidBooleanRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      needTailboard: 'false',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPickupTimeRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      pickupTimeIso: 'not-a-date',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPricingModeRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      pricingMode: 'market',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const fixedWithoutPriceRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      priceCents: undefined,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const negotiableWithPriceRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      pricingMode: 'negotiable',
      priceCents: 76000,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const incompleteCouponRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      couponId: 'coupon-1',
      couponTitle: '满减券',
      couponDiscountCents: 1000,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const mismatchedPayablePriceRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      couponId: 'coupon-1',
      couponTitle: '满减券',
      couponDiscountCents: 1000,
      payablePriceCents: 76000,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPaymentMethodRequest = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      paymentMethod: 'cash',
    } as unknown as Parameters<typeof api.createOrder>[0];

    const requests = [
      nullRequest,
      stringRequest,
      blankCargoTypeRequest,
      numberWeightRequest,
      longCargoDescriptionRequest,
      invalidCargoPhotoCountRequest,
      invalidCargoPhotoFileIdsRequest,
      sameAddressRequest,
      invalidPhoneRequest,
      longPickupNoteRequest,
      invalidBooleanRequest,
      invalidPickupTimeRequest,
      invalidPricingModeRequest,
      fixedWithoutPriceRequest,
      negotiableWithPriceRequest,
      incompleteCouponRequest,
      mismatchedPayablePriceRequest,
      invalidPaymentMethodRequest,
    ];
    const runners = [
      (request: Parameters<typeof api.createOrder>[0]) =>
        api.createOrder(request, createIdempotencyKey),
      (request: Parameters<typeof api.createOrder>[0]) =>
        api.updateOrder(
          'order-1',
          request as Parameters<typeof api.updateOrder>[1],
          mutationContext.idempotencyKey,
        ),
    ];

    for (const runner of runners) {
      for (const request of requests) {
        await expect(
          Promise.resolve().then(() => runner(request)),
        ).rejects.toMatchObject({
          code: 'PLATFORM_ORDER_REQUEST_INVALID',
          status: 0,
        } satisfies Partial<PlatformApiError>);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists shipper orders with status and pagination query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 2, pageSize: 10, total: 0 },
        requestId: 'req_order_list',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listOrders({ status: 'transporting', page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?status=transporting&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects invalid list query type before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const nullQuery = null as unknown as Parameters<typeof api.listOrders>[0];
    const stringQuery =
      'status=waiting' as unknown as Parameters<typeof api.listOrders>[0];
    const numberQuery =
      1 as unknown as Parameters<typeof api.listOrders>[0];
    const arrayQuery =
      [] as unknown as Parameters<typeof api.listOrders>[0];

    await expect(api.listOrders(nullQuery)).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(api.listOrders(stringQuery)).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(api.listOrders(numberQuery)).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(api.listOrders(arrayQuery)).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists shipper orders with keyword and created time query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_search',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      keyword: '南山门店',
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-03T00:00:00.000Z',
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&createdFromIso=2026-07-01T00%3A00%3A00.000Z&createdToIso=2026-07-03T00%3A00%3A00.000Z&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('normalizes blank-padded list keyword before sending a request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_trimmed_keyword',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      keyword: '  南山门店  ',
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('omits blank list keyword before sending a request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_blank_keyword',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      keyword: '   ',
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects too long list keyword before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listOrders({
        keyword: 'x'.repeat(101),
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid list keyword type before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const nullKeywordQuery = {
      keyword: null,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const numberKeywordQuery = {
      keyword: 123,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const objectKeywordQuery = {
      keyword: { value: '南山门店' },
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];

    await expect(
      api.listOrders(nullKeywordQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(numberKeywordQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(objectKeywordQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists shipper orders with a status collection query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_statuses',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      statuses: ['loading', 'transporting'],
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?statuses=loading%2Ctransporting&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('normalizes duplicate list statuses before sending a request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_deduped_statuses',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      statuses: ['loading', 'transporting', 'loading'],
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?statuses=loading%2Ctransporting&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects ambiguous list status query before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listOrders({
        status: 'waiting',
        statuses: ['loading', 'transporting'],
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid list status value before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const invalidStatusQuery = {
      status: 'delivered',
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const invalidStatusesQuery = {
      statuses: ['loading', 'delivered'],
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const stringStatusesQuery = {
      statuses: 'loading,transporting',
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const nullStatusesQuery = {
      statuses: null,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const objectStatusesQuery = {
      statuses: { value: 'loading' },
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const blankStatusQuery = {
      status: '',
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const nullStatusQuery = {
      status: null,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];

    await expect(
      api.listOrders(invalidStatusQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(invalidStatusesQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(stringStatusesQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(nullStatusesQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(objectStatusesQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(blankStatusQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(nullStatusQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects reversed or empty created time query before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listOrders({
        createdFromIso: '2026-07-03T00:00:00.000Z',
        createdToIso: '2026-07-03T00:00:00.000Z',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders({
        createdFromIso: '2026-07-04T00:00:00.000Z',
        createdToIso: '2026-07-03T00:00:00.000Z',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes blank-padded created time query before sending a request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_trimmed_created_time',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      createdFromIso: ' 2026-07-01T00:00:00.000Z ',
      createdToIso: ' 2026-07-03T00:00:00.000Z ',
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?createdFromIso=2026-07-01T00%3A00%3A00.000Z&createdToIso=2026-07-03T00%3A00%3A00.000Z&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('omits blank created time query before sending a request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { items: [], page: 1, pageSize: 20, total: 0 },
        requestId: 'req_order_list_blank_created_time',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.listOrders({
      createdFromIso: '   ',
      createdToIso: '   ',
      page: 1,
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders?page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects invalid created time query types before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const nullCreatedFromQuery = {
      createdFromIso: null,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const nullCreatedToQuery = {
      createdToIso: null,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const numberCreatedFromQuery = {
      createdFromIso: 123,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];
    const objectCreatedToQuery = {
      createdToIso: { value: '2026-07-03T00:00:00.000Z' },
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listOrders>[0];

    await expect(
      api.listOrders(nullCreatedFromQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(nullCreatedToQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(numberCreatedFromQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders(objectCreatedToQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid created time query before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listOrders({
        createdFromIso: 'not-a-date',
        createdToIso: '2026-07-03T00:00:00.000Z',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders({
        createdFromIso: '2026-07-01T00:00:00.000Z',
        createdToIso: 'not-a-date',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination query before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listOrders({ page: 0, pageSize: 20 }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders({ page: 1.5, pageSize: 20 }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders({ page: 1, pageSize: 0 }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listOrders({ page: 1, pageSize: 51 }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels a shipper order with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'cancelled',
        },
        requestId: 'req_order_cancel',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(
      api.cancelOrder('order-1', {
        baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
        reasonText: '计划变更',
        description: '客户临时取消出货',
      }, mutationContext.idempotencyKey),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'cancelled',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/cancel',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          reasonText: '计划变更',
          description: '客户临时取消出货',
        }),
      }),
    );
  });

  it('normalizes cancel order request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'cancelled',
        },
        requestId: 'req_order_cancel_trimmed',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await api.cancelOrder('order-1', {
      baseUpdatedAtIso: `  ${mutationContext.baseUpdatedAtIso}  `,
      reasonText: '  计划变更  ',
      description: '   ',
    }, `  ${mutationContext.idempotencyKey}  `);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/cancel',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          reasonText: '计划变更',
        }),
      }),
    );
  });

  it('rejects invalid cancel order request before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();
    const nullRequest =
      null as unknown as Parameters<typeof api.cancelOrder>[1];
    const stringRequest =
      '计划变更' as unknown as Parameters<typeof api.cancelOrder>[1];
    const blankReasonRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      reasonText: '   ',
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const longReasonRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      reasonText: 'x'.repeat(51),
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const numberReasonRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      reasonText: 123,
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const longDescriptionRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      reasonText: '计划变更',
      description: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const objectDescriptionRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      reasonText: '计划变更',
      description: { value: '客户临时取消出货' },
    } as unknown as Parameters<typeof api.cancelOrder>[1];

    const requests = [
      () => api.cancelOrder('order-1', nullRequest, mutationContext.idempotencyKey),
      () => api.cancelOrder('order-1', stringRequest, mutationContext.idempotencyKey),
      () => api.cancelOrder('order-1', blankReasonRequest, mutationContext.idempotencyKey),
      () => api.cancelOrder('order-1', longReasonRequest, mutationContext.idempotencyKey),
      () => api.cancelOrder('order-1', numberReasonRequest, mutationContext.idempotencyKey),
      () => api.cancelOrder('order-1', longDescriptionRequest, mutationContext.idempotencyKey),
      () => api.cancelOrder('order-1', objectDescriptionRequest, mutationContext.idempotencyKey),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists admin orders with normalized filters and pagination query', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [createOrderRecord()],
        page: 2,
        pageSize: 10,
        total: 1,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminOrders({
        status: 'waiting',
        keyword: '  南山门店  ',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders?status=waiting&keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('reads admin order report with normalized filters and top shipper limit', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(createAdminOrderReport()),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.getAdminOrderReport({
        statuses: ['waiting', 'transporting', 'waiting'],
        createdFromIso: ' 2026-07-01T00:00:00.000Z ',
        createdToIso: ' 2026-07-03T00:00:00.000Z ',
        topShippersLimit: 3,
      }),
    ).resolves.toMatchObject({
      summary: {
        totalOrderCount: 5,
      },
      topShippers: [expect.objectContaining({ shipperId: 'shipper-1' })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/report?statuses=waiting%2Ctransporting&createdFromIso=2026-07-01T00%3A00%3A00.000Z&createdToIso=2026-07-03T00%3A00%3A00.000Z&topShippersLimit=3',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('exports admin orders csv with filename and normalized filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createTextResponse(
        '\uFEFForderId,orderNo\r\norder-1,HY202607010001',
        'admin-orders-filtered.csv',
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.exportAdminOrdersCsv({
        keyword: '  南山仓  ',
        statuses: ['waiting', 'transporting'],
      }),
    ).resolves.toEqual({
      filename: 'admin-orders-filtered.csv',
      contentType: 'text/csv; charset=utf-8',
      content: '\uFEFForderId,orderNo\r\norder-1,HY202607010001',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/export?statuses=waiting%2Ctransporting&keyword=%E5%8D%97%E5%B1%B1%E4%BB%93',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets and cancels an admin order with normalized id and payload', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createJsonResponse(createOrderRecord()))
      .mockResolvedValueOnce(
        createJsonResponse(
          createOrderRecord({
            status: 'cancelled',
          }),
        ),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(api.getAdminOrder('  order-1  ')).resolves.toMatchObject({
      id: 'order-1',
      orderNo: 'HY202607010001',
    });
    await expect(
      api.cancelAdminOrder(
        ' order-1 ',
        {
          baseUpdatedAtIso: ` ${mutationContext.baseUpdatedAtIso} `,
          reasonText: '  风险订单  ',
          description: '  人工取消  ',
        },
        mutationContext.idempotencyKey,
      ),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'cancelled',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/orders/order-1',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/orders/order-1/cancel',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          reasonText: '风险订单',
          description: '人工取消',
        }),
      }),
    );
  });

  it('batch cancels admin orders with deduped normalized payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        orderIds: ['order-1', 'order-2'],
        updatedCount: 2,
        items: [
          createOrderRecord({ id: 'order-1', status: 'cancelled' }),
          createOrderRecord({
            id: 'order-2',
            orderNo: 'HY202607010002',
            status: 'cancelled',
          }),
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(
      api.batchCancelAdminOrders(
        {
          items: [
            {
              orderId: ' order-1 ',
              baseUpdatedAtIso: ` ${mutationContext.baseUpdatedAtIso} `,
            },
            {
              orderId: 'order-2',
              baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
            },
          ],
          reasonText: '  批量清理脏单  ',
          description: '  waiting 订单整批回收  ',
        },
        mutationContext.idempotencyKey,
      ),
    ).resolves.toMatchObject({
      updatedCount: 2,
      orderIds: ['order-1', 'order-2'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/batch-cancel',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify({
          items: [
            {
              orderId: 'order-1',
              baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
            },
            {
              orderId: 'order-2',
              baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
            },
          ],
          reasonText: '批量清理脏单',
          description: 'waiting 订单整批回收',
        }),
      }),
    );
  });

  it('rejects invalid admin order management requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(
      api.getAdminOrderReport({ topShippersLimit: 0 }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_LIST_QUERY_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.batchCancelAdminOrders(
        {
          items: [
            {
              orderId: 'order-1',
              baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
            },
            {
              orderId: ' order-1 ',
              baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
            },
          ],
          reasonText: '批量清理脏单',
        },
        mutationContext.idempotencyKey,
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.batchCancelAdminOrders(
        {
          items: [],
          reasonText: '批量清理脏单',
        },
        mutationContext.idempotencyKey,
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists admin order attachment audits with normalized query filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [createAdminOrderAttachmentAuditSummary()],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminOrderAttachmentAudits({
        status: 'waiting',
        keyword: '  南山门店  ',
        shipperId: ' shipper-1 ',
        createdFromIso: ' 2026-07-01T00:00:00.000Z ',
        createdToIso: ' 2026-07-03T00:00:00.000Z ',
        hasMissingFiles: true,
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ orderId: 'order-1' })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/attachments?status=waiting&keyword=%E5%8D%97%E5%B1%B1%E9%97%A8%E5%BA%97&createdFromIso=2026-07-01T00%3A00%3A00.000Z&createdToIso=2026-07-03T00%3A00%3A00.000Z&page=1&pageSize=20&shipperId=shipper-1&hasMissingFiles=true',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets admin order attachment audit detail by normalized order id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(createAdminOrderAttachmentAudit()),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.getAdminOrderAttachmentAudit(' order-1 '),
    ).resolves.toMatchObject({
      orderId: 'order-1',
      cargo: {
        fileIds: ['cargo-file-1'],
      },
      events: [expect.objectContaining({ eventId: 'event-1' })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/order-1/attachments',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('rejects invalid admin order attachment queries before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const invalidHasMissingFilesQuery = {
      hasMissingFiles: 'true',
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listAdminOrderAttachmentAudits>[0];
    const invalidShipperIdQuery = {
      shipperId: 123,
      page: 1,
      pageSize: 20,
    } as unknown as Parameters<typeof api.listAdminOrderAttachmentAudits>[0];

    await expect(
      api.listAdminOrderAttachmentAudits(invalidHasMissingFilesQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_ATTACHMENT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listAdminOrderAttachmentAudits(invalidShipperIdQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_ATTACHMENT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists admin order change requests with default and normalized query', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          items: [createAdminOrderChangeRequestRecord()],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          items: [createAdminOrderChangeRequestRecord({ status: 'approved' })],
          page: 2,
          pageSize: 50,
          total: 1,
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.listAdminOrderChangeRequests()).resolves.toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
    });
    await expect(
      api.listAdminOrderChangeRequests({
        status: 'approved',
        page: 2,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 50,
      total: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/orders/change-requests?status=pending&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/orders/change-requests?status=approved&page=2&pageSize=50',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('reviews admin order change requests with normalized payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(
        createOrderRecord({
          status: 'transporting',
        }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.reviewAdminOrderChangeRequest(' order-1 ', {
        decision: 'approved',
        reviewResultText: '  地址修改可执行  ',
      }),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'transporting',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/order-1/change-request/review',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          decision: 'approved',
          reviewResultText: '地址修改可执行',
        }),
      }),
    );
  });

  it('rejects invalid admin order change request inputs before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const invalidStatusQuery = {
      status: 'processing',
    } as unknown as Parameters<typeof api.listAdminOrderChangeRequests>[0];
    const invalidReviewRequest = {
      decision: 'approve',
    } as unknown as Parameters<typeof api.reviewAdminOrderChangeRequest>[1];

    await expect(
      api.listAdminOrderChangeRequests(invalidStatusQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.reviewAdminOrderChangeRequest('order-1', invalidReviewRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists admin order exception cases with normalized query filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [createAdminOrderExceptionCase()],
        page: 2,
        pageSize: 10,
        total: 1,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminOrderExceptionCases({
        status: 'processing',
        sourceRole: 'driver',
        keyword: '  YC202607250001  ',
        createdFromIso: ' 2026-07-01T00:00:00.000Z ',
        createdToIso: ' 2026-07-03T00:00:00.000Z ',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        total: 1,
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'case-1',
            status: 'pending',
          }),
        ]),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/order-exception-cases?status=processing&sourceRole=driver&keyword=YC202607250001&createdFromIso=2026-07-01T00%3A00%3A00.000Z&createdToIso=2026-07-03T00%3A00%3A00.000Z&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets admin order exception case detail by normalized case id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(createAdminOrderExceptionCase()),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.getAdminOrderExceptionCase(' case-1 '),
    ).resolves.toMatchObject({
      id: 'case-1',
      caseNo: 'YC202607250001',
      actions: [expect.objectContaining({ id: 'action-1' })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/order-exception-cases/case-1',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('processes resolves closes and executes admin order exception cases with normalized payloads', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(
        createJsonResponse(
          createAdminOrderExceptionCase({
            status: 'processing',
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createAdminOrderExceptionCase({
            status: 'resolved',
            resolutionText: '已确认待赔付跟进。',
            compensationStatus: 'pending',
            compensationTargetRole: 'shipper',
            compensationAmountCents: 3600,
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createAdminOrderExceptionCase({
            status: 'closed',
            closedAtIso: '2026-07-25T09:30:00.000Z',
          }),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createAdminOrderExceptionCase({
            status: 'resolved',
            compensationStatus: 'executed',
            compensationTargetRole: 'shipper',
            compensationAmountCents: 3600,
            compensationTransactionId: 'ft-1',
            compensationExecutedAtIso: '2026-07-25T10:00:00.000Z',
          }),
        ),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.processAdminOrderExceptionCase(' case-1 ', {
        baseUpdatedAtIso: '2026-07-25T08:00:00.000Z',
        content: '  已转异常客服受理，先核订单链路。  ',
      }),
    ).resolves.toMatchObject({
      status: 'processing',
    });

    await expect(
      api.resolveAdminOrderExceptionCase(' case-1 ', {
        baseUpdatedAtIso: '2026-07-25T08:30:00.000Z',
        content: '  货损属实，等待赔付跟进。  ',
        compensationStatus: 'pending',
        compensationTargetRole: ' shipper ' as 'shipper',
        compensationAmountCents: 3600,
      }),
    ).resolves.toMatchObject({
      status: 'resolved',
      compensationStatus: 'pending',
    });

    await expect(
      api.closeAdminOrderExceptionCase(' case-1 ', {
        baseUpdatedAtIso: '2026-07-25T09:00:00.000Z',
        content: '  已通知双方，工单关闭归档。  ',
      }),
    ).resolves.toMatchObject({
      status: 'closed',
    });

    await expect(
      api.executeAdminOrderExceptionCaseCompensation(' case-1 ', {
        baseUpdatedAtIso: '2026-07-25T09:30:00.000Z',
        idempotencyKey: '  exception-comp-20260725-0001  ',
        content: '  平台已执行赔付入账。  ',
      }),
    ).resolves.toMatchObject({
      compensationStatus: 'executed',
      compensationTransactionId: 'ft-1',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/order-exception-cases/case-1/process',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-25T08:00:00.000Z',
          content: '已转异常客服受理，先核订单链路。',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/order-exception-cases/case-1/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-25T08:30:00.000Z',
          content: '货损属实，等待赔付跟进。',
          compensationStatus: 'pending',
          compensationTargetRole: 'shipper',
          compensationAmountCents: 3600,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/order-exception-cases/case-1/close',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-25T09:00:00.000Z',
          content: '已通知双方，工单关闭归档。',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/api/admin/order-exception-cases/case-1/compensation/execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-25T09:30:00.000Z',
          idempotencyKey: 'exception-comp-20260725-0001',
          content: '平台已执行赔付入账。',
        }),
      }),
    );
  });

  it('rejects invalid admin order exception inputs before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const invalidQuery = {
      sourceRole: 'admin',
    } as unknown as Parameters<typeof api.listAdminOrderExceptionCases>[0];
    const invalidProcessRequest = {
      baseUpdatedAtIso: 'invalid',
      content: 'short',
    } as unknown as Parameters<typeof api.processAdminOrderExceptionCase>[1];
    const invalidResolveRequest = {
      baseUpdatedAtIso: '2026-07-25T08:30:00.000Z',
      content: '货损属实，等待赔付跟进。',
      compensationStatus: 'pending',
    } as unknown as Parameters<typeof api.resolveAdminOrderExceptionCase>[1];
    const invalidExecutionRequest = {
      baseUpdatedAtIso: '2026-07-25T09:30:00.000Z',
      idempotencyKey: 'short',
      content: '平台已执行赔付入账。',
    } as unknown as Parameters<
      typeof api.executeAdminOrderExceptionCaseCompensation
    >[1];

    await expect(
      api.listAdminOrderExceptionCases(invalidQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_EXCEPTION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.processAdminOrderExceptionCase('case-1', invalidProcessRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_EXCEPTION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.resolveAdminOrderExceptionCase('case-1', invalidResolveRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_EXCEPTION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.executeAdminOrderExceptionCaseCompensation(
        'case-1',
        invalidExecutionRequest,
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_ORDER_EXCEPTION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes blank-padded order id before sending a detail request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { id: 'order-1', orderNo: 'HY202607010001' },
        requestId: 'req_order_detail_trimmed_id',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.getOrder('  order-1  ');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects invalid order id before sending an order request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const blankOrderId = '   ';
    const nullOrderId =
      null as unknown as Parameters<typeof api.getOrder>[0];
    const numberOrderId =
      123 as unknown as Parameters<typeof api.getOrder>[0];
    const mutationContext = createOrderMutationContext();

    const requests = [
      () => api.getOrder(blankOrderId),
      () =>
        api.updateOrder(
          blankOrderId,
          {
            ...createInput(),
            baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          },
          mutationContext.idempotencyKey,
        ),
      () =>
        api.cancelOrder(
          blankOrderId,
          {
            reasonText: '计划变更',
            baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          },
          mutationContext.idempotencyKey,
        ),
      () =>
        api.completeOrder(
          blankOrderId,
          { baseUpdatedAtIso: mutationContext.baseUpdatedAtIso },
          mutationContext.idempotencyKey,
        ),
      () =>
        api.advanceOrderStatus(
          blankOrderId,
          {
            nextStatus: 'transporting',
            baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          },
          mutationContext.idempotencyKey,
        ),
      () => api.reportException(blankOrderId, {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
      }),
      () => api.submitChangeRequest(blankOrderId, {
        description: '请把卸货地址改到南山门店二期',
      }),
      () => api.submitEvaluation(blankOrderId, {
        rating: 5,
        tags: ['准时送达'],
        content: '司机服务细致，整体运输体验很好',
      }),
      () => api.getAdminOrder(blankOrderId),
      () =>
        api.reviewAdminOrderChangeRequest(blankOrderId, {
          decision: 'approved',
        }),
      () =>
        api.cancelAdminOrder(
          blankOrderId,
          {
            reasonText: '计划变更',
            baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          },
          mutationContext.idempotencyKey,
        ),
      () => api.getOrder(nullOrderId),
      () => api.getOrder(numberOrderId),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_ID_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updates a shipper order with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          pickupAddress: '宝安区新装货仓',
          status: 'waiting',
        },
        requestId: 'req_order_update',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();
    const request = {
      ...createInput(),
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      pickupAddress: '宝安区新装货仓',
    };

    await expect(
      api.updateOrder('order-1', request, mutationContext.idempotencyKey),
    ).resolves.toMatchObject({
      id: 'order-1',
      pickupAddress: '宝安区新装货仓',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify(request),
      }),
    );
  });

  it('completes a shipper order with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'completed',
        },
        requestId: 'req_order_complete',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(
      api.completeOrder(
        'order-1',
        { baseUpdatedAtIso: mutationContext.baseUpdatedAtIso },
        mutationContext.idempotencyKey,
      ),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'completed',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/complete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
        }),
      }),
    );
  });

  it('advances a shipper order status with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'transporting',
        },
        requestId: 'req_order_status',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(
      api.advanceOrderStatus(
        'order-1',
        {
          nextStatus: 'transporting',
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
        },
        mutationContext.idempotencyKey,
      ),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'transporting',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/status',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': mutationContext.idempotencyKey,
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          nextStatus: 'transporting',
        }),
      }),
    );
  });

  it('rejects invalid status advance request before sending a request', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();
    const nullRequest =
      null as unknown as Parameters<typeof api.advanceOrderStatus>[1];
    const stringRequest =
      'loading' as unknown as Parameters<typeof api.advanceOrderStatus>[1];
    const invalidNextStatusRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      nextStatus: 'waiting',
    } as unknown as Parameters<typeof api.advanceOrderStatus>[1];
    const nullNextStatusRequest = {
      baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
      nextStatus: null,
    } as unknown as Parameters<typeof api.advanceOrderStatus>[1];

    const requests = [
      () => api.advanceOrderStatus('order-1', nullRequest, mutationContext.idempotencyKey),
      () => api.advanceOrderStatus('order-1', stringRequest, mutationContext.idempotencyKey),
      () => api.advanceOrderStatus('order-1', invalidNextStatusRequest, mutationContext.idempotencyKey),
      () => api.advanceOrderStatus('order-1', nullNextStatusRequest, mutationContext.idempotencyKey),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid order mutation context before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const mutationContext = createOrderMutationContext();

    await expect(
      api.updateOrder(
        'order-1',
        {
          ...createInput(),
          baseUpdatedAtIso: 'not-a-date',
        },
        mutationContext.idempotencyKey,
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.cancelOrder(
        'order-1',
        {
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          reasonText: '计划变更',
        },
        'not-a-uuid',
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.completeOrder(
        'order-1',
        {
          baseUpdatedAtIso: 'not-a-date',
        },
        mutationContext.idempotencyKey,
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_COMPLETE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.advanceOrderStatus(
        'order-1',
        {
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          nextStatus: 'transporting',
        },
        'not-a-uuid',
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a shipper order exception with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'transporting',
        },
        requestId: 'req_order_exception',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.reportException('order-1', {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        photoCount: 2,
      }),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'transporting',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/exception',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          typeLabel: '司机延误',
          description: '司机反馈高速拥堵，预计晚到 40 分钟',
          photoCount: 2,
        }),
      }),
    );
  });

  it('normalizes report exception request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'transporting',
        },
        requestId: 'req_order_exception_trimmed',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.reportException('order-1', {
      typeLabel: '  司机延误  ',
      description: '  司机反馈高速拥堵，预计晚到 40 分钟  ',
      photoFileIds: [' file-exception-1 ', 'file-exception-1'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/exception',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          typeLabel: '司机延误',
          description: '司机反馈高速拥堵，预计晚到 40 分钟',
          photoFileIds: ['file-exception-1'],
        }),
      }),
    );
  });

  it('rejects invalid report exception request before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const nullRequest =
      null as unknown as Parameters<typeof api.reportException>[1];
    const stringRequest =
      '司机延误' as unknown as Parameters<typeof api.reportException>[1];
    const blankTypeLabelRequest = {
      typeLabel: '   ',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    } as unknown as Parameters<typeof api.reportException>[1];
    const longTypeLabelRequest = {
      typeLabel: 'x'.repeat(31),
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    } as unknown as Parameters<typeof api.reportException>[1];
    const numberTypeLabelRequest = {
      typeLabel: 123,
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
    } as unknown as Parameters<typeof api.reportException>[1];
    const shortDescriptionRequest = {
      typeLabel: '司机延误',
      description: '太慢',
    } as unknown as Parameters<typeof api.reportException>[1];
    const longDescriptionRequest = {
      typeLabel: '司机延误',
      description: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.reportException>[1];
    const objectDescriptionRequest = {
      typeLabel: '司机延误',
      description: { value: '司机反馈高速拥堵，预计晚到 40 分钟' },
    } as unknown as Parameters<typeof api.reportException>[1];
    const negativePhotoCountRequest = {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoCount: -1,
    } as unknown as Parameters<typeof api.reportException>[1];
    const tooManyPhotosRequest = {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoCount: 7,
    } as unknown as Parameters<typeof api.reportException>[1];
    const fractionalPhotoCountRequest = {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoCount: 1.5,
    } as unknown as Parameters<typeof api.reportException>[1];
    const stringPhotoCountRequest = {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoCount: '2',
    } as unknown as Parameters<typeof api.reportException>[1];
    const tooManyPhotoFileIdsRequest = {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoFileIds: ['1', '2', '3', '4', '5', '6', '7'],
    } as unknown as Parameters<typeof api.reportException>[1];
    const nonStringPhotoFileIdsRequest = {
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoFileIds: ['file-1', 123],
    } as unknown as Parameters<typeof api.reportException>[1];

    const requests = [
      () => api.reportException('order-1', nullRequest),
      () => api.reportException('order-1', stringRequest),
      () => api.reportException('order-1', blankTypeLabelRequest),
      () => api.reportException('order-1', longTypeLabelRequest),
      () => api.reportException('order-1', numberTypeLabelRequest),
      () => api.reportException('order-1', shortDescriptionRequest),
      () => api.reportException('order-1', longDescriptionRequest),
      () => api.reportException('order-1', objectDescriptionRequest),
      () => api.reportException('order-1', negativePhotoCountRequest),
      () => api.reportException('order-1', tooManyPhotosRequest),
      () => api.reportException('order-1', fractionalPhotoCountRequest),
      () => api.reportException('order-1', stringPhotoCountRequest),
      () => api.reportException('order-1', tooManyPhotoFileIdsRequest),
      () => api.reportException('order-1', nonStringPhotoFileIdsRequest),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits a shipper order evaluation with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'completed',
        },
        requestId: 'req_order_evaluation',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.submitEvaluation('order-1', {
        rating: 5,
        tags: ['准时送达', '服务好'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: true,
        photoCount: 1,
      }),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'completed',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/evaluation',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          rating: 5,
          tags: ['准时送达', '服务好'],
          content: '司机服务细致，整体运输体验很好',
          anonymous: true,
          photoCount: 1,
        }),
      }),
    );
  });

  it('normalizes evaluation request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'completed',
        },
        requestId: 'req_order_evaluation_trimmed',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.submitEvaluation('order-1', {
      rating: 5,
      tags: [' 准时送达 ', '服务好', '准时送达'],
      content: '  司机服务细致，整体运输体验很好  ',
      photoCount: 0,
      photoFileIds: [' file-evaluation-1 ', 'file-evaluation-1'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/evaluation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          rating: 5,
          tags: ['准时送达', '服务好'],
          content: '司机服务细致，整体运输体验很好',
          photoCount: 0,
          photoFileIds: ['file-evaluation-1'],
        }),
      }),
    );
  });

  it('rejects invalid evaluation request before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const nullRequest =
      null as unknown as Parameters<typeof api.submitEvaluation>[1];
    const stringRequest =
      '服务很好' as unknown as Parameters<typeof api.submitEvaluation>[1];
    const lowRatingRequest = {
      rating: 0,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const highRatingRequest = {
      rating: 6,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const fractionalRatingRequest = {
      rating: 4.5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const stringRatingRequest = {
      rating: '5',
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const emptyTagsRequest = {
      rating: 5,
      tags: [],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const tooManyTagsRequest = {
      rating: 5,
      tags: ['1', '2', '3', '4', '5', '6', '7'],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const blankTagRequest = {
      rating: 5,
      tags: ['   '],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const nonStringTagRequest = {
      rating: 5,
      tags: ['准时送达', 123],
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const stringTagsRequest = {
      rating: 5,
      tags: '准时送达',
      content: '司机服务细致，整体运输体验很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const shortContentRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '很好',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const longContentRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const numberContentRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: 123,
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const stringAnonymousRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      anonymous: 'true',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const negativePhotoCountRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      photoCount: -1,
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const tooManyPhotosRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      photoCount: 7,
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const fractionalPhotoCountRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      photoCount: 1.5,
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const stringPhotoCountRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      photoCount: '1',
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const tooManyPhotoFileIdsRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      photoFileIds: ['1', '2', '3', '4', '5', '6', '7'],
    } as unknown as Parameters<typeof api.submitEvaluation>[1];
    const nonStringPhotoFileIdsRequest = {
      rating: 5,
      tags: ['准时送达'],
      content: '司机服务细致，整体运输体验很好',
      photoFileIds: ['file-1', 123],
    } as unknown as Parameters<typeof api.submitEvaluation>[1];

    const requests = [
      () => api.submitEvaluation('order-1', nullRequest),
      () => api.submitEvaluation('order-1', stringRequest),
      () => api.submitEvaluation('order-1', lowRatingRequest),
      () => api.submitEvaluation('order-1', highRatingRequest),
      () => api.submitEvaluation('order-1', fractionalRatingRequest),
      () => api.submitEvaluation('order-1', stringRatingRequest),
      () => api.submitEvaluation('order-1', emptyTagsRequest),
      () => api.submitEvaluation('order-1', tooManyTagsRequest),
      () => api.submitEvaluation('order-1', blankTagRequest),
      () => api.submitEvaluation('order-1', nonStringTagRequest),
      () => api.submitEvaluation('order-1', stringTagsRequest),
      () => api.submitEvaluation('order-1', shortContentRequest),
      () => api.submitEvaluation('order-1', longContentRequest),
      () => api.submitEvaluation('order-1', numberContentRequest),
      () => api.submitEvaluation('order-1', stringAnonymousRequest),
      () => api.submitEvaluation('order-1', negativePhotoCountRequest),
      () => api.submitEvaluation('order-1', tooManyPhotosRequest),
      () => api.submitEvaluation('order-1', fractionalPhotoCountRequest),
      () => api.submitEvaluation('order-1', stringPhotoCountRequest),
      () => api.submitEvaluation('order-1', tooManyPhotoFileIdsRequest),
      () => api.submitEvaluation('order-1', nonStringPhotoFileIdsRequest),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits a shipper order change request with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'transporting',
        },
        requestId: 'req_order_change_request',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.submitChangeRequest('order-1', {
        description: '请把卸货地址改到南山门店二期',
      }),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'transporting',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/change-request',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          description: '请把卸货地址改到南山门店二期',
        }),
      }),
    );
  });

  it('normalizes change request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'order-1',
          orderNo: 'HY202607010001',
          status: 'transporting',
        },
        requestId: 'req_order_change_request_trimmed',
        timestamp: '2026-07-01T08:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.submitChangeRequest('order-1', {
      description: '  请把卸货地址改到南山门店二期  ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/change-request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          description: '请把卸货地址改到南山门店二期',
        }),
      }),
    );
  });

  it('rejects invalid change request before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const nullRequest =
      null as unknown as Parameters<typeof api.submitChangeRequest>[1];
    const stringRequest =
      '请把卸货地址改到南山门店二期' as unknown as Parameters<
        typeof api.submitChangeRequest
      >[1];
    const blankDescriptionRequest = {
      description: '   ',
    } as unknown as Parameters<typeof api.submitChangeRequest>[1];
    const longDescriptionRequest = {
      description: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.submitChangeRequest>[1];
    const numberDescriptionRequest = {
      description: 123,
    } as unknown as Parameters<typeof api.submitChangeRequest>[1];
    const objectDescriptionRequest = {
      description: { value: '请把卸货地址改到南山门店二期' },
    } as unknown as Parameters<typeof api.submitChangeRequest>[1];

    const requests = [
      () => api.submitChangeRequest('order-1', nullRequest),
      () => api.submitChangeRequest('order-1', stringRequest),
      () => api.submitChangeRequest('order-1', blankDescriptionRequest),
      () => api.submitChangeRequest('order-1', longDescriptionRequest),
      () => api.submitChangeRequest('order-1', numberDescriptionRequest),
      () => api.submitChangeRequest('order-1', objectDescriptionRequest),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_CHANGE_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createInput() {
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
    pickupTimeIso: '2026-07-02T02:00:00.000Z',
    pricingMode: 'fixed' as const,
    priceCents: 76000,
    paymentMethod: 'cod' as const,
  };
}

function createOrderMutationContext() {
  return {
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    baseUpdatedAtIso: '2026-07-01T08:00:00.000Z',
  };
}

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => null,
    },
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req_order',
      timestamp: '2026-07-12T08:00:00.000Z',
    }),
  };
}

function createTextResponse(content: string, filename = 'admin-orders.csv') {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => {
        const normalizedName = name.toLowerCase();

        if (normalizedName === 'content-type') {
          return 'text/csv; charset=utf-8';
        }

        if (normalizedName === 'content-disposition') {
          return `attachment; filename="${filename}"`;
        }

        return null;
      },
    },
    text: async () => content,
  };
}

function createOrderRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNo: 'HY202607010001',
    shipperId: 'shipper-1',
    status: 'waiting',
    paymentStatus: 'pending',
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T08:00:00.000Z',
    events: [],
    ...createInput(),
    ...overrides,
  };
}

function createAdminOrderReport(overrides: Record<string, unknown> = {}) {
  return {
    generatedAtIso: '2026-07-25T08:00:00.000Z',
    filters: {
      statuses: ['waiting', 'transporting'],
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-03T00:00:00.000Z',
    },
    summary: {
      totalOrderCount: 5,
      waitingOrderCount: 2,
      activeOrderCount: 2,
      completedOrderCount: 1,
      cancelledOrderCount: 0,
      exceptionOrderCount: 1,
    },
    statusBreakdown: [
      {
        status: 'waiting',
        orderCount: 2,
        payablePriceTotalCents: 152000,
      },
    ],
    paymentStatusBreakdown: [
      {
        paymentStatus: 'pending',
        orderCount: 2,
        payablePriceTotalCents: 152000,
      },
    ],
    pricingModeBreakdown: [
      {
        pricingMode: 'fixed',
        orderCount: 5,
        payablePriceTotalCents: 380000,
      },
    ],
    paymentMethodBreakdown: [
      {
        paymentMethod: 'cod',
        orderCount: 5,
        payablePriceTotalCents: 380000,
      },
    ],
    topShippers: [
      {
        shipperId: 'shipper-1',
        orderCount: 3,
        waitingOrderCount: 1,
        activeOrderCount: 1,
        completedOrderCount: 1,
        cancelledOrderCount: 0,
        payablePriceTotalCents: 228000,
        latestOrderCreatedAtIso: '2026-07-02T08:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function createAdminOrderAttachmentAuditSummary(
  overrides: Record<string, unknown> = {},
) {
  return {
    orderId: 'order-1',
    orderNo: 'HY202607010001',
    shipperId: 'shipper-1',
    status: 'waiting',
    createdAtIso: '2026-07-01T08:00:00.000Z',
    cargoFileCount: 1,
    eventAttachmentFileCount: 2,
    totalFileIdCount: 3,
    resolvedFileCount: 2,
    missingFileIds: ['missing-file-1'],
    hasMissingFiles: true,
    ...overrides,
  };
}

function createAdminOrderAttachmentAudit(
  overrides: Record<string, unknown> = {},
) {
  return {
    orderId: 'order-1',
    orderNo: 'HY202607010001',
    shipperId: 'shipper-1',
    cargo: {
      fileIds: ['cargo-file-1'],
      files: [
        {
          id: 'cargo-file-1',
          ownerUserId: 'shipper-1',
          purpose: 'cargo',
          contentType: 'image/jpeg',
          byteSize: 1024,
          objectKey: 'cargo/1.jpg',
          status: 'uploaded',
          createdAtIso: '2026-07-01T08:00:00.000Z',
          previewUrl: 'https://cdn.example.com/cargo/1.jpg',
          previewExpiresAtIso: '2026-07-02T08:00:00.000Z',
        },
      ],
      missingFileIds: [],
    },
    events: [
      {
        eventId: 'event-1',
        eventType: 'order_exception_reported',
        noteText: '补充异常照片',
        createdAtIso: '2026-07-01T09:00:00.000Z',
        attachmentFileIds: ['event-file-1'],
        files: [
          {
            id: 'event-file-1',
            ownerUserId: 'shipper-1',
            purpose: 'exception',
            contentType: 'image/jpeg',
            byteSize: 2048,
            objectKey: 'exception/1.jpg',
            status: 'uploaded',
            createdAtIso: '2026-07-01T09:00:00.000Z',
          },
        ],
        missingFileIds: ['missing-file-1'],
      },
    ],
    ...overrides,
  };
}

function createAdminOrderChangeRequestRecord(
  overrides: Record<string, unknown> = {},
) {
  return {
    orderId: 'order-1',
    orderNo: 'HY202607010001',
    shipperId: 'shipper-1',
    status: 'pending',
    description: '请把卸货地址改到南山门店二期',
    requestedAtIso: '2026-07-01T08:00:00.000Z',
    orderStatus: 'waiting',
    ...overrides,
  };
}

function createAdminOrderExceptionCase(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'case-1',
    caseNo: 'YC202607250001',
    orderId: 'order-1',
    orderNo: 'HY202607250001',
    sourceEventId: 'event-1',
    reporterUserId: 'driver-1',
    sourceRole: 'driver',
    typeLabel: '货损',
    description: '装货时发现外包装破损，申请客服介入。',
    attachmentFileIds: ['file-1'],
    status: 'pending',
    compensationStatus: 'not_required',
    appealStatus: 'none',
    createdAtIso: '2026-07-25T08:00:00.000Z',
    updatedAtIso: '2026-07-25T08:00:00.000Z',
    actions: [
      {
        id: 'action-1',
        adminUserId: 'admin-1',
        fromStatus: 'pending',
        toStatus: 'pending',
        content: '已创建异常工单。',
        createdAtIso: '2026-07-25T08:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

import { createPlatformOrderApi } from '../src/services/platformOrderApi';
import { PlatformApiError } from '../src/services/platformApiClient';

describe('platform order api', () => {
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

    await expect(api.createOrder(createInput())).resolves.toMatchObject({
      id: 'order-1',
      orderNo: 'HY202607010001',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
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

    await api.createOrder(request);

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
    const nullRequest =
      null as unknown as Parameters<typeof api.createOrder>[0];
    const stringRequest =
      'bad request' as unknown as Parameters<typeof api.createOrder>[0];
    const blankCargoTypeRequest = {
      ...createInput(),
      cargoType: '   ',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const numberWeightRequest = {
      ...createInput(),
      weightText: 2.5,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const longCargoDescriptionRequest = {
      ...createInput(),
      cargoDescription: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidCargoPhotoCountRequest = {
      ...createInput(),
      cargoPhotoCount: 7,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidCargoPhotoFileIdsRequest = {
      ...createInput(),
      cargoPhotoFileIds: ['1', '2', '3', '4', '5', '6', '7'],
    } as unknown as Parameters<typeof api.createOrder>[0];
    const sameAddressRequest = {
      ...createInput(),
      deliveryAddress: ' 宝安区福永物流园 ',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPhoneRequest = {
      ...createInput(),
      pickupPhone: '12345',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const longPickupNoteRequest = {
      ...createInput(),
      pickupNoteText: 'x'.repeat(51),
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidBooleanRequest = {
      ...createInput(),
      needTailboard: 'false',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPickupTimeRequest = {
      ...createInput(),
      pickupTimeIso: 'not-a-date',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPricingModeRequest = {
      ...createInput(),
      pricingMode: 'market',
    } as unknown as Parameters<typeof api.createOrder>[0];
    const fixedWithoutPriceRequest = {
      ...createInput(),
      priceCents: undefined,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const negotiableWithPriceRequest = {
      ...createInput(),
      pricingMode: 'negotiable',
      priceCents: 76000,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const incompleteCouponRequest = {
      ...createInput(),
      couponId: 'coupon-1',
      couponTitle: '满减券',
      couponDiscountCents: 1000,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const mismatchedPayablePriceRequest = {
      ...createInput(),
      couponId: 'coupon-1',
      couponTitle: '满减券',
      couponDiscountCents: 1000,
      payablePriceCents: 76000,
    } as unknown as Parameters<typeof api.createOrder>[0];
    const invalidPaymentMethodRequest = {
      ...createInput(),
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
        api.createOrder(request),
      (request: Parameters<typeof api.createOrder>[0]) =>
        api.updateOrder('order-1', request),
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

    await expect(
      api.cancelOrder('order-1', {
        reasonText: '计划变更',
        description: '客户临时取消出货',
      }),
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
        }),
        body: JSON.stringify({
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

    await api.cancelOrder('order-1', {
      reasonText: '  计划变更  ',
      description: '   ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
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
    const nullRequest =
      null as unknown as Parameters<typeof api.cancelOrder>[1];
    const stringRequest =
      '计划变更' as unknown as Parameters<typeof api.cancelOrder>[1];
    const blankReasonRequest = {
      reasonText: '   ',
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const longReasonRequest = {
      reasonText: 'x'.repeat(51),
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const numberReasonRequest = {
      reasonText: 123,
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const longDescriptionRequest = {
      reasonText: '计划变更',
      description: 'x'.repeat(201),
    } as unknown as Parameters<typeof api.cancelOrder>[1];
    const objectDescriptionRequest = {
      reasonText: '计划变更',
      description: { value: '客户临时取消出货' },
    } as unknown as Parameters<typeof api.cancelOrder>[1];

    const requests = [
      () => api.cancelOrder('order-1', nullRequest),
      () => api.cancelOrder('order-1', stringRequest),
      () => api.cancelOrder('order-1', blankReasonRequest),
      () => api.cancelOrder('order-1', longReasonRequest),
      () => api.cancelOrder('order-1', numberReasonRequest),
      () => api.cancelOrder('order-1', longDescriptionRequest),
      () => api.cancelOrder('order-1', objectDescriptionRequest),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
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

    const requests = [
      () => api.getOrder(blankOrderId),
      () => api.updateOrder(blankOrderId, createInput()),
      () => api.cancelOrder(blankOrderId, { reasonText: '计划变更' }),
      () => api.completeOrder(blankOrderId),
      () => api.advanceOrderStatus(blankOrderId, { nextStatus: 'loading' }),
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
    const request = {
      ...createInput(),
      pickupAddress: '宝安区新装货仓',
    };

    await expect(api.updateOrder('order-1', request)).resolves.toMatchObject({
      id: 'order-1',
      pickupAddress: '宝安区新装货仓',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
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

    await expect(api.completeOrder('order-1')).resolves.toMatchObject({
      id: 'order-1',
      status: 'completed',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/complete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
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
          status: 'loading',
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

    await expect(
      api.advanceOrderStatus('order-1', { nextStatus: 'loading' }),
    ).resolves.toMatchObject({
      id: 'order-1',
      status: 'loading',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/orders/order-1/status',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          nextStatus: 'loading',
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
    const nullRequest =
      null as unknown as Parameters<typeof api.advanceOrderStatus>[1];
    const stringRequest =
      'loading' as unknown as Parameters<typeof api.advanceOrderStatus>[1];
    const invalidNextStatusRequest = {
      nextStatus: 'waiting',
    } as unknown as Parameters<typeof api.advanceOrderStatus>[1];
    const nullNextStatusRequest = {
      nextStatus: null,
    } as unknown as Parameters<typeof api.advanceOrderStatus>[1];

    const requests = [
      () => api.advanceOrderStatus('order-1', nullRequest),
      () => api.advanceOrderStatus('order-1', stringRequest),
      () => api.advanceOrderStatus('order-1', invalidNextStatusRequest),
      () => api.advanceOrderStatus('order-1', nullNextStatusRequest),
    ];

    for (const request of requests) {
      await expect(request()).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }
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

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req_order',
      timestamp: '2026-07-12T08:00:00.000Z',
    }),
  };
}

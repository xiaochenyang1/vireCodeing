import { createPlatformDriverOrderApi } from '../src/services/platformDriverOrderApi';
import { PlatformApiError } from '../src/services/platformApiClient';

describe('platform driver order api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists the driver order hall with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.listOrderHall({ page: 2, pageSize: 10 })).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/order-hall?page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('quotes a driver order with a normalized request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', orderNo: 'HY202607060001' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await api.quoteOrder(' order-1 ', {
      quoteCents: 88000,
      arrivalText: ' 45 分钟到达 ',
      noteText: ' 可带尾板 ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/quote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          quoteCents: 88000,
          arrivalText: '45 分钟到达',
          noteText: '可带尾板',
        }),
      }),
    );
  });

  it('accepts a driver order with an optional note', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', status: 'loading' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.acceptOrder('order-1', { noteText: '  马上联系货主  ' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/accept',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ noteText: '马上联系货主' }),
      }),
    );
  });

  it('lists current driver accepted orders with status filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        items: [{ id: 'order-1', status: 'loading' }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listMyOrders({
        statuses: ['loading', 'transporting'],
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [{ id: 'order-1', status: 'loading' }],
      total: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders?statuses=loading%2Ctransporting&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets driver income overview and driver withdrawals', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          driverId: 'driver-1',
          summary: {
            todayIncomeCents: 36100,
            weekIncomeCents: 36100,
            monthIncomeCents: 36100,
            historyIncomeCents: 36100,
            pendingSettlementCents: 12000,
            availableWithdrawalCents: 24100,
            reviewingWithdrawalCents: 12000,
            completedOrderCount: 1,
          },
          records: [],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          items: [{ id: 'withdrawal-1', status: 'reviewing' }],
          page: 1,
          pageSize: 5,
          total: 1,
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getIncomeOverview()).resolves.toMatchObject({
      driverId: 'driver-1',
      summary: {
        availableWithdrawalCents: 24100,
      },
    });
    await expect(
      api.listWithdrawals({ page: 1, pageSize: 5 }),
    ).resolves.toMatchObject({
      items: [{ id: 'withdrawal-1', status: 'reviewing' }],
      total: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/driver/income',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/driver/withdrawals?page=1&pageSize=5',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('creates a driver withdrawal with a normalized request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'withdrawal-1', status: 'reviewing' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.createWithdrawal({
      amountCents: 12000,
      bankAccountName: '  李师傅  ',
      bankName: '  招商银行深圳宝安支行  ',
      bankAccountNo: '  6225 8888 0000 1234  ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/withdrawals',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          amountCents: 12000,
          bankAccountName: '李师傅',
          bankName: '招商银行深圳宝安支行',
          bankAccountNo: '6225888800001234',
        }),
      }),
    );
  });

  it('gets and saves driver acceptance settings', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          driverId: 'driver-1',
          isOnline: true,
          maxDistanceKm: 50,
          vehicleTypePreferences: ['medium'],
          createdAtIso: '2026-07-09T02:00:00.000Z',
          updatedAtIso: '2026-07-09T02:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          driverId: 'driver-1',
          isOnline: false,
          maxDistanceKm: 30,
          vehicleTypePreferences: ['medium', 'box'],
          createdAtIso: '2026-07-09T02:00:00.000Z',
          updatedAtIso: '2026-07-09T02:05:00.000Z',
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getAcceptanceSettings()).resolves.toMatchObject({
      driverId: 'driver-1',
      isOnline: true,
      maxDistanceKm: 50,
    });
    await expect(
      api.saveAcceptanceSettings({
        isOnline: false,
        maxDistanceKm: 30,
        vehicleTypePreferences: [' medium ', 'box', 'medium'],
      }),
    ).resolves.toMatchObject({
      isOnline: false,
      maxDistanceKm: 30,
      vehicleTypePreferences: ['medium', 'box'],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/driver/settings/acceptance',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/driver/settings/acceptance',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          isOnline: false,
          maxDistanceKm: 30,
          vehicleTypePreferences: ['medium', 'box'],
        }),
      }),
    );
  });

  it('gets current driver order detail', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', status: 'transporting' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getOrder(' order-1 ')).resolves.toMatchObject({
      id: 'order-1',
      status: 'transporting',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('advances current driver order status with a normalized request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', status: 'transporting' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.advanceOrderStatus(' order-1 ', { nextStatus: 'transporting' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ nextStatus: 'transporting' }),
      }),
    );
  });

  it('advances current driver order status with normalized receipt proof file ids', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', status: 'transporting' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.advanceOrderStatus(' order-1 ', {
      nextStatus: 'transporting',
      receiptPhotoFileIds: [' file-receipt-1 ', 'file-receipt-1'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          nextStatus: 'transporting',
          receiptPhotoFileIds: ['file-receipt-1'],
        }),
      }),
    );
  });

  it('reports a driver order exception with normalized proof ids', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        id: 'order-1',
        status: 'transporting',
        events: [{ id: 'event-1', eventType: 'driver_exception_reported' }],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await api.reportException(' order-1 ', {
      typeLabel: ' 货物损坏 ',
      description: ' 装货时发现外包装已经破损。 ',
      photoCount: 2,
      photoFileIds: [' file-1 ', 'file-1', 'file-2'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/exception',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          typeLabel: '货物损坏',
          description: '装货时发现外包装已经破损。',
          photoCount: 2,
          photoFileIds: ['file-1', 'file-2'],
        }),
      }),
    );
  });

  it.each([
    [null, 'non-object request'],
    [
      { typeLabel: '', description: '装货时发现外包装已经破损。' },
      'blank type',
    ],
    [
      { typeLabel: '货物损坏', description: '太短' },
      'short description',
    ],
    [
      {
        typeLabel: '货物损坏',
        description: '装货时发现外包装已经破损。',
        photoFileIds: Array.from(
          { length: 7 },
          (_, index) => `file-${index}`,
        ),
      },
      'too many files',
    ],
  ])(
    'rejects invalid driver exception requests before fetch: %s (%s)',
    async request => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.reportException('order-1', request as never),
      ).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_ORDER_EXCEPTION_INVALID',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('replies to a driver evaluation with normalized content', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', status: 'completed' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await api.replyToEvaluation(' order-1 ', {
      content: '  谢谢认可  ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/evaluation-reply',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: '谢谢认可' }),
      }),
    );
  });

  it('submits a driver evaluation for the shipper with normalized content', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({ id: 'order-1', status: 'completed' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api/',
      getAccessToken: () => 'access-token',
    });

    await api.evaluateShipper(' order-1 ', {
      rating: 5,
      tags: [' 沟通顺畅 ', '装货配合', '沟通顺畅'],
      content: '  货主装货配合好，结算沟通清楚。  ',
      anonymous: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/driver/orders/order-1/shipper-evaluation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          rating: 5,
          tags: ['沟通顺畅', '装货配合'],
          content: '货主装货配合好，结算沟通清楚。',
          anonymous: true,
        }),
      }),
    );
  });

  it.each([
    ['invalid rating', { rating: 0, tags: ['沟通顺畅'], content: '货主装货配合好，结算沟通清楚。' }],
    ['empty tags', { rating: 5, tags: [], content: '货主装货配合好，结算沟通清楚。' }],
    ['short content', { rating: 5, tags: ['沟通顺畅'], content: '太短' }],
    ['non-object request', null],
  ])(
    'rejects invalid driver shipper evaluation requests before sending them: %s',
    async (_caseName, request) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.evaluateShipper(
          'order-1',
          request as {
            rating: number;
            tags: string[];
            content: string;
          },
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_SHIPPER_EVALUATION_INVALID',
        status: 0,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['blank content', { content: '   ' }],
    ['too long content', { content: 'x'.repeat(201) }],
    ['non-object request', null],
  ])(
    'rejects invalid driver evaluation reply requests before sending them: %s',
    async (_caseName, request) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.replyToEvaluation('order-1', request as { content: string }),
      ).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_EVALUATION_REPLY_INVALID',
        status: 0,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid current driver status advance requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.advanceOrderStatus('order-1', {
        nextStatus: 'completed' as 'transporting',
      }),
    ).rejects.toMatchObject(
      new PlatformApiError(
        'Platform driver nextStatus is invalid',
        'PLATFORM_DRIVER_ORDER_STATUS_INVALID',
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid driver acceptance settings requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveAcceptanceSettings({
        isOnline: true,
        maxDistanceKm: 0,
        vehicleTypePreferences: [],
      }),
    ).rejects.toMatchObject(
      new PlatformApiError(
        'Platform driver maxDistanceKm is invalid',
        'PLATFORM_DRIVER_ACCEPTANCE_SETTINGS_INVALID',
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid driver quote requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.quoteOrder('order-1', {
        quoteCents: 0,
        arrivalText: '45 分钟到达',
      }),
    ).rejects.toMatchObject(
      new PlatformApiError(
        'Platform driver quoteCents is invalid',
        'PLATFORM_DRIVER_ORDER_QUOTE_INVALID',
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call protected driver endpoints without an access token', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => undefined,
    });

    await expect(api.listOrderHall()).rejects.toMatchObject({
      code: 'AUTH_ACCESS_TOKEN_MISSING',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid driver withdrawal requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createWithdrawal({
        amountCents: 50,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountNo: '1234',
      }),
    ).rejects.toMatchObject(
      new PlatformApiError(
        'Platform driver amountCents is invalid',
        'PLATFORM_DRIVER_WITHDRAWAL_REQUEST_INVALID',
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['   ', 'blank order id'],
    ['', 'empty order id'],
  ])(
    'rejects a blank driver order id before sending them: %s',
    async orderId => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(api.getOrder(orderId)).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_ORDER_ID_INVALID',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-string driver order id before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.quoteOrder(123 as unknown as string, {
        quoteCents: 88000,
        arrivalText: '45 分钟到达',
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DRIVER_ORDER_ID_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-object driver accept request before sending it', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.acceptOrder('order-1', null as unknown as { noteText?: string }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DRIVER_ORDER_ACCEPT_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a driver accept note longer than 200 characters', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformDriverOrderApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.acceptOrder('order-1', { noteText: '备'.repeat(201) }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DRIVER_ORDER_ACCEPT_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ page: 0 }, 'zero page'],
    [{ page: 1.5 }, 'fractional page'],
    [{ pageSize: 51 }, 'oversized pageSize'],
  ])(
    'rejects invalid driver order hall pagination before sending them: %s',
    async (query, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(api.listOrderHall(query)).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [[], 'empty statuses'],
    [['waiting'], 'non-executing status'],
    [['loading', 'loading'], 'duplicate statuses'],
  ])(
    'rejects invalid driver my-orders statuses before sending them: %s',
    async (statuses, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(
        api.listMyOrders({
          statuses:
            statuses as unknown as import('../src/services/platformDriverOrderApi').PlatformDriverExecutingOrderStatus[],
        }),
      ).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ page: 0 }, 'zero page'],
    [{ pageSize: 51 }, 'oversized pageSize'],
  ])(
    'rejects invalid driver withdrawals pagination before sending them: %s',
    async (query, _label) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const api = createPlatformDriverOrderApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(api.listWithdrawals(query)).rejects.toMatchObject({
        code: 'PLATFORM_DRIVER_WITHDRAWALS_QUERY_INVALID',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req_driver_order',
      timestamp: '2026-07-06T08:00:00.000Z',
    }),
  };
}

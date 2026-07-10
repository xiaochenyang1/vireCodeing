import { PlatformApiError } from '../src/services/platformApiClient';
import { createPlatformFrequentRoutesApi } from '../src/services/platformFrequentRoutesApi';

describe('platform frequent routes api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('gets the shipper frequent routes with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          routes: [
            {
              id: 'route-1',
              name: '宝安仓库 -> 南山门店',
              from: '宝安仓库',
              to: '南山门店',
              lastUsedText: '刚刚添加',
              lastUsedIso: '2026-07-04T08:00:00.000Z',
            },
          ],
          updatedAtIso: '2026-07-04T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-04T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFrequentRoutesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getFrequentRoutes()).resolves.toMatchObject({
      shipperId: 'shipper-1',
      routes: [{ id: 'route-1', name: '宝安仓库 -> 南山门店' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/frequent-routes',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('saves the shipper frequent routes with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          routes: [
            {
              id: 'route-local-3',
              name: '龙华仓 -> 福田展厅',
              from: '龙华仓',
              to: '福田展厅',
              lastUsedText: '刚刚添加',
              lastUsedIso: '2026-07-04T08:00:00.000Z',
            },
          ],
          updatedAtIso: '2026-07-04T08:35:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-04T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFrequentRoutesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveFrequentRoutes({
        routes: [
          {
            id: 'route-local-3',
            name: '龙华仓 -> 福田展厅',
            from: '龙华仓',
            to: '福田展厅',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
        baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      routes: [{ id: 'route-local-3', name: '龙华仓 -> 福田展厅' }],
      updatedAtIso: '2026-07-04T08:35:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/frequent-routes',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          routes: [
            {
              id: 'route-local-3',
              name: '龙华仓 -> 福田展厅',
              from: '龙华仓',
              to: '福田展厅',
              lastUsedText: '刚刚添加',
              lastUsedIso: '2026-07-04T08:00:00.000Z',
            },
          ],
          clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
          baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
        }),
      }),
    );
  });

  it('normalizes the shipper frequent routes before sending them', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          routes: [],
          updatedAtIso: '2026-07-04T08:35:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-04T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFrequentRoutesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.saveFrequentRoutes({
      routes: [
        {
          id: ' route-local-3 ',
          name: ' 龙华仓 -> 福田展厅 ',
          from: ' 龙华仓 ',
          to: ' 福田展厅 ',
          lastUsedText: ' 刚刚添加 ',
          lastUsedIso: ' ',
        },
      ],
      clientUpdatedAtIso: ' 2026-07-04T08:00:00.000Z ',
      baseUpdatedAtIso: ' ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/frequent-routes',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          routes: [
            {
              id: 'route-local-3',
              name: '龙华仓 -> 福田展厅',
              from: '龙华仓',
              to: '福田展厅',
              lastUsedText: '刚刚添加',
            },
          ],
          clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
        }),
      }),
    );
  });

  it('rejects invalid shipper frequent routes requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformFrequentRoutesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const validRequest = {
      routes: [
        {
          id: 'route-local-3',
          name: '龙华仓 -> 福田展厅',
          from: '龙华仓',
          to: '福田展厅',
          lastUsedText: '刚刚添加',
          lastUsedIso: '2026-07-04T08:00:00.000Z',
        },
      ],
      clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
    };

    const invalidRequests = [
      null,
      'bad-request',
      { ...validRequest, routes: 'bad-routes' },
      {
        ...validRequest,
        routes: Array.from({ length: 21 }, (_, index) => ({
          id: `route-${index}`,
          name: '龙华仓 -> 福田展厅',
          from: '龙华仓',
          to: '福田展厅',
          lastUsedText: '刚刚添加',
        })),
      },
      { ...validRequest, routes: [{ ...validRequest.routes[0], id: ' ' }] },
      {
        ...validRequest,
        routes: [{ ...validRequest.routes[0], name: 'x'.repeat(41) }],
      },
      {
        ...validRequest,
        routes: [{ ...validRequest.routes[0], from: 'x'.repeat(81) }],
      },
      {
        ...validRequest,
        routes: [{ ...validRequest.routes[0], to: ' ' }],
      },
      {
        ...validRequest,
        routes: [{ ...validRequest.routes[0], lastUsedText: 'x'.repeat(31) }],
      },
      {
        ...validRequest,
        routes: [{ ...validRequest.routes[0], lastUsedIso: 'not-a-date' }],
      },
      { ...validRequest, clientUpdatedAtIso: 'not-a-date' },
      { ...validRequest, baseUpdatedAtIso: 123 },
    ];

    for (const request of invalidRequests) {
      await expect(
        api.saveFrequentRoutes(
          request as Parameters<typeof api.saveFrequentRoutes>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_FREQUENT_ROUTES_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

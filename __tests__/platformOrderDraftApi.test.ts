import { PlatformApiError } from '../src/services/platformApiClient';
import { createPlatformOrderDraftApi } from '../src/services/platformOrderDraftApi';

describe('platform order draft api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('gets the shipper order draft with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          draftSnapshot: { cargoName: '电子配件' },
          updatedAtIso: '2026-07-04T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-04T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderDraftApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getDraft()).resolves.toMatchObject({
      shipperId: 'shipper-1',
      draftSnapshot: { cargoName: '电子配件' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/order-draft',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('saves the shipper order draft with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          draftSnapshot: { cargoName: '电子配件' },
          updatedAtIso: '2026-07-04T08:35:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-04T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderDraftApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveDraft({
        draftSnapshot: { cargoName: '电子配件' },
        clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
        baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      draftSnapshot: { cargoName: '电子配件' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/order-draft',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          draftSnapshot: { cargoName: '电子配件' },
          clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
          baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
        }),
      }),
    );
  });

  it('normalizes the shipper order draft before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          draftSnapshot: { cargoName: '电子配件' },
          updatedAtIso: '2026-07-04T08:35:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-04T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderDraftApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.saveDraft({
      draftSnapshot: { cargoName: '电子配件' },
      clientUpdatedAtIso: ' 2026-07-04T08:00:00.000Z ',
      baseUpdatedAtIso: ' ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/order-draft',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          draftSnapshot: { cargoName: '电子配件' },
          clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
        }),
      }),
    );
  });

  it('rejects invalid shipper order draft requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformOrderDraftApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const validRequest = {
      draftSnapshot: { cargoName: '电子配件' },
      clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
    };

    const invalidRequests = [
      null,
      'bad-request',
      { ...validRequest, draftSnapshot: null },
      { ...validRequest, draftSnapshot: [] },
      { ...validRequest, draftSnapshot: 'bad-draft' },
      { ...validRequest, clientUpdatedAtIso: 'not-a-date' },
      { ...validRequest, baseUpdatedAtIso: 123 },
    ];

    for (const request of invalidRequests) {
      await expect(
        api.saveDraft(request as Parameters<typeof api.saveDraft>[0]),
      ).rejects.toMatchObject({
        code: 'PLATFORM_ORDER_DRAFT_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

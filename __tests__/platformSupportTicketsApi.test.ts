import { PlatformApiError } from '../src/services/platformApiClient';
import { createPlatformSupportTicketsApi } from '../src/services/platformSupportTicketsApi';

describe('platform support tickets api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('gets the shipper support tickets with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          items: [
            {
              id: 'ticket-1',
              shipperId: 'shipper-1',
              channelName: '投诉建议',
              description: '司机沟通不及时，希望客服协助跟进',
              status: 'processing',
              statusHistory: [
                {
                  actionText: '工单已提交',
                  timestampIso: '2026-07-22T08:30:00.000Z',
                },
              ],
              createdAtIso: '2026-07-22T08:30:00.000Z',
              updatedAtIso: '2026-07-22T08:35:00.000Z',
            },
          ],
        },
        requestId: 'req-test',
        timestamp: '2026-07-22T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getSupportTickets()).resolves.toMatchObject({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'ticket-1',
          channelName: '投诉建议',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/support-tickets',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('creates the shipper support ticket with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'ticket-1',
          shipperId: 'shipper-1',
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
          status: 'pending',
          statusHistory: [
            {
              actionText: '工单已提交',
              timestampIso: '2026-07-22T08:30:00.000Z',
            },
          ],
          createdAtIso: '2026-07-22T08:30:00.000Z',
          updatedAtIso: '2026-07-22T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-22T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createSupportTicket({
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
      }),
    ).resolves.toMatchObject({
      id: 'ticket-1',
      channelName: '投诉建议',
      status: 'pending',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/support-tickets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
        }),
      }),
    );
  });

  it('normalizes the support ticket request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'ticket-1',
          shipperId: 'shipper-1',
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
          status: 'pending',
          statusHistory: [],
          createdAtIso: '2026-07-22T08:30:00.000Z',
          updatedAtIso: '2026-07-22T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-22T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.createSupportTicket({
      channelName: ' 投诉建议 ',
      description: ' 司机沟通不及时，希望客服协助跟进 ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/support-tickets',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
        }),
      }),
    );
  });

  it('rejects invalid support ticket requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    for (const request of [
      null,
      'bad-request',
      { channelName: ' ', description: '司机沟通不及时，希望客服协助跟进' },
      { channelName: '投诉建议', description: ' ' },
      { channelName: '投诉建议', description: '问'.repeat(201) },
    ]) {
      await expect(
        api.createSupportTicket(
          request as Parameters<typeof api.createSupportTicket>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_SUPPORT_TICKET_REQUEST_INVALID',
        status: 0,
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws auth access token missing before sending requests without a token', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => undefined,
    });

    await expect(api.getSupportTickets()).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(
      api.createSupportTicket({
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps network failures to platform api errors', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getSupportTickets()).rejects.toEqual(
      new PlatformApiError('Platform API network request failed', 'NETWORK_ERROR', 0),
    );
  });
});

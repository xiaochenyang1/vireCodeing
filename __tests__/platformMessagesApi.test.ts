import { createPlatformMessagesApi } from '../src/services/platformMessagesApi';
import { PlatformApiError } from '../src/services/platformApiClient';

describe('createPlatformMessagesApi', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists messages with query params and bearer auth', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          items: [
            {
              id: 'msg-1',
              userId: 'shipper-1',
              audience: 'shipper',
              category: 'order',
              title: '订单发布成功',
              content: '订单 HY20260721001 已发布，等待司机接单。',
              orderId: 'order-1',
              orderNo: 'HY20260721001',
              unread: true,
              createdAtIso: '2026-07-21T10:00:00.000Z',
              updatedAtIso: '2026-07-21T10:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          unreadCount: 1,
        },
        requestId: 'req_test',
        timestamp: '2026-07-21T10:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformMessagesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    const result = await api.listMessages({ page: 1, pageSize: 20 });
    expect(result.unreadCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me/messages?page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      }),
    );
  });

  it('marks a message as read', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'msg-1',
          userId: 'shipper-1',
          audience: 'shipper',
          category: 'order',
          title: '订单发布成功',
          content: '订单 HY20260721001 已发布，等待司机接单。',
          unread: false,
          createdAtIso: '2026-07-21T10:00:00.000Z',
          updatedAtIso: '2026-07-21T10:05:00.000Z',
        },
        requestId: 'req_test',
        timestamp: '2026-07-21T10:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformMessagesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    const result = await api.markMessageRead('msg-1');
    expect(result.unread).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me/messages/msg-1/read',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('rejects invalid message ids before calling the network', async () => {
    const api = createPlatformMessagesApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    await expect(api.markMessageRead('')).rejects.toBeInstanceOf(PlatformApiError);
  });
});

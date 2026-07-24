import { createPlatformNotificationsApi } from '../src/services/platformNotificationsApi';
import { PlatformApiError } from '../src/services/platformApiClient';

describe('createPlatformNotificationsApi', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('registers a device token with normalized fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'token-1',
          userId: 'user-1',
          token: 'ExponentPushToken[token-1]',
          platform: 'ios',
          deviceId: 'device-1',
          isActive: true,
          lastUsedAtIso: '2026-07-24T12:00:00.000Z',
          createdAtIso: '2026-07-24T12:00:00.000Z',
          updatedAtIso: '2026-07-24T12:00:00.000Z',
        },
        requestId: 'req_test',
        timestamp: '2026-07-24T12:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformNotificationsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    const result = await api.registerDeviceToken({
      pushToken: '  ExponentPushToken[token-1]  ',
      platform: 'ios',
      deviceId: '  device-1  ',
    });

    expect(result).toMatchObject({
      id: 'token-1',
      token: 'ExponentPushToken[token-1]',
      deviceId: 'device-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me/device-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
        body: JSON.stringify({
          pushToken: 'ExponentPushToken[token-1]',
          platform: 'ios',
          deviceId: 'device-1',
        }),
      }),
    );
  });

  it('lists device tokens with GET', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          items: [
            {
              id: 'token-1',
              userId: 'user-1',
              token: 'ExponentPushToken[token-1]',
              platform: 'ios',
              deviceId: 'device-1',
              isActive: true,
              lastUsedAtIso: '2026-07-24T12:00:00.000Z',
              createdAtIso: '2026-07-24T12:00:00.000Z',
              updatedAtIso: '2026-07-24T12:00:00.000Z',
            },
          ],
        },
        requestId: 'req_test',
        timestamp: '2026-07-24T12:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformNotificationsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    const result = await api.listDeviceTokens();

    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me/device-tokens',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      }),
    );
  });

  it('deactivates a device token with a normalized payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          deactivated: true,
        },
        requestId: 'req_test',
        timestamp: '2026-07-24T12:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformNotificationsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    const result = await api.deactivateDeviceToken(
      '  ExponentPushToken[token-1]  ',
    );

    expect(result.deactivated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me/device-tokens/deactivate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: 'ExponentPushToken[token-1]',
        }),
      }),
    );
  });

  it('rejects empty device token deactivation requests before calling the network', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformNotificationsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'token-1',
    });

    await expect(api.deactivateDeviceToken('   ')).rejects.toEqual(
      new PlatformApiError('Push token is required', 'PUSH_TOKEN_INVALID', 0),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

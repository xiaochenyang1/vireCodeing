import {
  createPlatformAuthApi,
  type PlatformAuthTokens,
} from '../src/services/platformAuthApi';

describe('platform auth api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends a verification code request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { expireSeconds: 300, devCode: '123456' },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.sendCode({ phone: '13800138000', purpose: 'login' }),
    ).resolves.toEqual({ expireSeconds: 300, devCode: '123456' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/send-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '13800138000', purpose: 'login' }),
      }),
    );
  });

  it('maps login token response', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: 'refresh.local-user-13800138000.604800',
      expiresIn: 900,
    };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          user: {
            id: 'local-user-13800138000',
            phone: '13800138000',
            userType: 'shipper',
          },
          tokens,
        },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    }) as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.login({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'test-device',
      }),
    ).resolves.toEqual({
      user: {
        id: 'local-user-13800138000',
        phone: '13800138000',
        userType: 'shipper',
      },
      tokens,
    });
  });
});

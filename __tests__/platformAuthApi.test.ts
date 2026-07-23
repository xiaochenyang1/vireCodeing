import {
  createPlatformAuthApi,
  type PlatformAuthTokens,
} from '../src/services/platformAuthApi';
import { PlatformApiError } from '../src/services/platformApiClient';

describe('platform auth api', () => {
  const originalFetch = globalThis.fetch;
  const issuedRefreshToken = 'refresh.550e8400-e29b-41d4-a716-446655440000';

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

  it('does not send bearer tokens to public auth entrypoints', async () => {
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

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.stale-user.900',
    });

    await api.sendCode({ phone: '13800138000', purpose: 'login' });

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(requestInit.headers).not.toHaveProperty('Authorization');
  });

  it('does not duplicate path separators when base url has a trailing slash', async () => {
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

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api/' });

    await api.sendCode({ phone: '13800138000', purpose: 'login' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/send-code',
      expect.any(Object),
    );
  });

  it('maps login token response', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: issuedRefreshToken,
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

  it('registers through the auth api', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: issuedRefreshToken,
      expiresIn: 900,
    };
    const fetchMock = jest.fn().mockResolvedValue({
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
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.register({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'test-device',
        password: 'abc123',
      }),
    ).resolves.toEqual({
      user: {
        id: 'local-user-13800138000',
        phone: '13800138000',
        userType: 'shipper',
      },
      tokens,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          phone: '13800138000',
          code: '123456',
          userType: 'shipper',
          deviceId: 'test-device',
          password: 'abc123',
        }),
      }),
    );
  });

  it('logs in with a password through the auth api', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: issuedRefreshToken,
      expiresIn: 900,
    };
    const fetchMock = jest.fn().mockResolvedValue({
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
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
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
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/password-login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          phone: '13800138000',
          password: 'abc123',
          userType: 'shipper',
          deviceId: 'test-device',
        }),
      }),
    );
  });

  it('resets a password through the auth api', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { reset: true },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.resetPassword({
        phone: '13800138000',
        code: '123456',
        password: 'newabc123',
      }),
    ).resolves.toEqual({
      reset: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          phone: '13800138000',
          code: '123456',
          password: 'newabc123',
        }),
      }),
    );
  });

  it('changes a password through the auth api with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { changed: true },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.local-user-13800138000.900',
    });

    await expect(
      api.changePassword({
        currentPassword: 'abc123',
        newPassword: 'newabc123',
      }),
    ).resolves.toEqual({
      changed: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.local-user-13800138000.900',
        }),
        body: JSON.stringify({
          currentPassword: 'abc123',
          newPassword: 'newabc123',
        }),
      }),
    );
  });

  it('lists current user auth sessions with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          sessions: [
            {
              id: 'session-current',
              deviceId: 'mobile-device-current',
              createdAtIso: '2026-07-22T08:00:00.000Z',
              expiresAtIso: '2026-07-29T08:00:00.000Z',
            },
          ],
          total: 1,
        },
        requestId: 'req_test',
        timestamp: '2026-07-22T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.local-user-13800138000.900',
    });

    await expect(api.listSessions()).resolves.toEqual({
      sessions: [
        {
          id: 'session-current',
          deviceId: 'mobile-device-current',
          createdAtIso: '2026-07-22T08:00:00.000Z',
          expiresAtIso: '2026-07-29T08:00:00.000Z',
        },
      ],
      total: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/sessions',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.local-user-13800138000.900',
        }),
      }),
    );
  });

  it('revokes other sessions through the auth api', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          currentDeviceId: 'mobile-device-current',
          revokedCount: 2,
        },
        requestId: 'req_test',
        timestamp: '2026-07-22T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.local-user-13800138000.900',
    });

    await expect(
      api.revokeOtherSessions({
        currentDeviceId: ' mobile-device-current ',
      }),
    ).resolves.toEqual({
      currentDeviceId: 'mobile-device-current',
      revokedCount: 2,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/sessions/revoke-other-sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          currentDeviceId: 'mobile-device-current',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer access.local-user-13800138000.900',
        }),
      }),
    );
  });

  it('refreshes auth tokens', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: issuedRefreshToken,
      expiresIn: 900,
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: tokens,
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.refresh({
        refreshToken: issuedRefreshToken,
        deviceId: 'test-device',
      }),
    ).resolves.toEqual(tokens);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: issuedRefreshToken,
          deviceId: 'test-device',
        }),
      }),
    );
  });

  it('normalizes auth token session requests before sending them', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: issuedRefreshToken,
      expiresIn: 900,
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: tokens,
          requestId: 'req_refresh',
          timestamp: '2026-06-26T06:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: { loggedOut: true },
          requestId: 'req_logout',
          timestamp: '2026-06-26T06:00:01.000Z',
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await api.refresh({
      refreshToken: ` ${issuedRefreshToken} `,
      deviceId: ' test-device ',
    });
    await api.logout({
      refreshToken: ` ${issuedRefreshToken} `,
      deviceId: ' test-device ',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/auth/refresh',
      expect.objectContaining({
        body: JSON.stringify({
          refreshToken: issuedRefreshToken,
          deviceId: 'test-device',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/auth/logout',
      expect.objectContaining({
        body: JSON.stringify({
          refreshToken: issuedRefreshToken,
          deviceId: 'test-device',
        }),
      }),
    );
  });

  it('rejects invalid auth token session requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });
    const validRequest = {
      refreshToken: issuedRefreshToken,
      deviceId: 'test-device',
    };
    const invalidRequests = [
      null,
      'bad-request',
      { ...validRequest, refreshToken: '' },
      { ...validRequest, refreshToken: 'refresh.local-user-13800138000.604800' },
      { ...validRequest, refreshToken: 'access.not-refresh-token' },
      { ...validRequest, deviceId: ' ' },
      { ...validRequest, deviceId: 123 },
    ];

    for (const request of invalidRequests) {
      await expect(
        api.refresh(request as Parameters<typeof api.refresh>[0]),
      ).rejects.toMatchObject({
        code: 'PLATFORM_AUTH_TOKEN_SESSION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      await expect(
        api.logout(request as Parameters<typeof api.logout>[0]),
      ).rejects.toMatchObject({
        code: 'PLATFORM_AUTH_TOKEN_SESSION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send stale bearer tokens when refreshing auth tokens', async () => {
    const tokens: PlatformAuthTokens = {
      accessToken: 'access.local-user-13800138000.900',
      refreshToken: issuedRefreshToken,
      expiresIn: 900,
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: tokens,
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.expired-user.900',
    });

    await api.refresh({
      refreshToken: issuedRefreshToken,
      deviceId: 'test-device',
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };

    expect(requestInit.headers).not.toHaveProperty('Authorization');
  });

  it('logs out through the auth api', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { loggedOut: true },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.logout({
        refreshToken: issuedRefreshToken,
        deviceId: 'test-device',
      }),
    ).resolves.toEqual({ loggedOut: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refreshToken: issuedRefreshToken,
          deviceId: 'test-device',
        }),
      }),
    );
  });

  it('gets the current user with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'local-user-13800138000',
          phone: '13800138000',
          userType: 'shipper',
        },
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.local-user-13800138000.900',
    });

    await expect(api.getMe()).resolves.toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.local-user-13800138000.900',
        }),
      }),
    );
  });

  it('does not call protected auth endpoints when access token is missing', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => undefined,
    });

    await expect(api.getMe()).rejects.toMatchObject({
      code: 'AUTH_ACCESS_TOKEN_MISSING',
      status: 0,
    });
    await expect(api.getMe()).rejects.toBeInstanceOf(PlatformApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends request id headers when configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: { expireSeconds: 300, devCode: '123456' },
        requestId: 'req_mobile_001',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getRequestId: () => 'req_mobile_001',
    });

    await api.sendCode({ phone: '13800138000', purpose: 'login' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/send-code',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-request-id': 'req_mobile_001',
        }),
      }),
    );
  });

  it('throws platform api errors with server code and message', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        code: 'AUTH_CODE_INVALID',
        message: '验证码错误',
        requestId: 'req_test',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    }) as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.login({
        phone: '13800138000',
        code: '000000',
        userType: 'shipper',
        deviceId: 'test-device',
      }),
    ).rejects.toMatchObject({
      message: '验证码错误',
      code: 'AUTH_CODE_INVALID',
      status: 401,
      requestId: 'req_test',
    });
  });

  it('preserves auth error codes from business error payloads even when transport succeeds', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'AUTH_CODE_RATE_LIMITED',
        message: '验证码发送过于频繁',
        requestId: 'req_rate_limit',
        timestamp: '2026-06-26T06:00:00.000Z',
      }),
    }) as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.sendCode({ phone: '13800138000', purpose: 'login' }),
    ).rejects.toMatchObject({
      message: '验证码发送过于频繁',
      code: 'AUTH_CODE_RATE_LIMITED',
      status: 200,
      requestId: 'req_rate_limit',
    });
  });

  it('maps network failures to platform api errors', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.sendCode({ phone: '13800138000', purpose: 'login' }),
    ).rejects.toMatchObject({
      message: 'Platform API network request failed',
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('rejects malformed success envelopes as platform api errors', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
      }),
    }) as unknown as typeof fetch;

    const api = createPlatformAuthApi({ baseUrl: 'http://localhost:3000/api' });

    await expect(
      api.sendCode({ phone: '13800138000', purpose: 'login' }),
    ).rejects.toMatchObject({
      message: 'Platform API response is invalid',
      code: 'PLATFORM_RESPONSE_INVALID',
      status: 200,
    });
  });
});

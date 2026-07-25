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

  it('lists admin auth sessions with default and normalized query filters', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          sessions: [createAdminAuthSessionRecord()],
          total: 1,
          page: 1,
          pageSize: 20,
          riskSummary: {
            riskySessionCount: 1,
            highRiskSessionCount: 0,
            sharedDeviceCount: 1,
            highSessionVolumeUserCount: 0,
            adminMultiDeviceUserCount: 0,
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          sessions: [
            createAdminAuthSessionRecord({
              id: '550e8400-e29b-41d4-a716-446655440003',
              userId: 'driver-1',
              userType: 'driver',
              riskLevel: 'high',
              riskTags: ['shared_device'],
            }),
          ],
          total: 1,
          page: 2,
          pageSize: 10,
          riskSummary: {
            riskySessionCount: 1,
            highRiskSessionCount: 1,
            sharedDeviceCount: 1,
            highSessionVolumeUserCount: 0,
            adminMultiDeviceUserCount: 0,
          },
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });

    await expect(api.listAdminAuthSessions()).resolves.toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: '550e8400-e29b-41d4-a716-446655440001',
            userType: 'admin',
          }),
        ]),
      }),
    );
    await expect(
      api.listAdminAuthSessions({
        scope: 'all',
        userType: 'driver',
        keyword: '  13800138000  ',
        riskOnly: true,
        riskTag: 'shared_device',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        riskSummary: expect.objectContaining({
          highRiskSessionCount: 1,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/auth/sessions?scope=current_admin&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.admin-user.900',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/auth/sessions?scope=all&userType=driver&keyword=13800138000&riskOnly=true&riskTag=shared_device&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('lists admin auth session governance audit events with normalized query filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        events: [createAdminAuthSessionGovernanceAuditRecord()],
        total: 1,
        page: 2,
        pageSize: 5,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });

    await expect(
      api.listAdminAuthSessionAuditEvents({
        action: 'revoke_session',
        result: 'revoked',
        keyword: '  13800138000  ',
        page: 2,
        pageSize: 5,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 5,
        events: expect.arrayContaining([
          expect.objectContaining({
            action: 'revoke_session',
            result: 'revoked',
          }),
        ]),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/auth/sessions/audit-events?action=revoke_session&result=revoked&keyword=13800138000&page=2&pageSize=5',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.admin-user.900',
        }),
      }),
    );
  });

  it('revokes admin auth sessions with normalized ids and device payloads', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          sessionId: '550e8400-e29b-41d4-a716-446655440001',
          revoked: true,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          currentDeviceId: 'admin-device-current',
          revokedCount: 3,
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });

    await expect(
      api.revokeAdminAuthSession(' 550e8400-e29b-41d4-a716-446655440001 '),
    ).resolves.toEqual({
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      revoked: true,
    });
    await expect(
      api.revokeOtherAdminAuthSessions({
        currentDeviceId: ' admin-device-current ',
      }),
    ).resolves.toEqual({
      currentDeviceId: 'admin-device-current',
      revokedCount: 3,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/auth/sessions/550e8400-e29b-41d4-a716-446655440001/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.admin-user.900',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/auth/sessions/revoke-other-sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          currentDeviceId: 'admin-device-current',
        }),
      }),
    );
  });

  it('rejects invalid admin auth session inputs before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });
    const invalidSessionQuery = {
      riskOnly: 'true',
    } as unknown as Parameters<typeof api.listAdminAuthSessions>[0];
    const invalidAuditQuery = {
      result: 'failed',
    } as unknown as Parameters<typeof api.listAdminAuthSessionAuditEvents>[0];
    const invalidSessionId =
      'session-1' as unknown as Parameters<typeof api.revokeAdminAuthSession>[0];
    const invalidRevokeOtherRequest = {
      currentDeviceId: ' ',
    } as unknown as Parameters<typeof api.revokeOtherAdminAuthSessions>[0];

    await expect(
      api.listAdminAuthSessions(invalidSessionQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_SESSION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.listAdminAuthSessionAuditEvents(invalidAuditQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_SESSION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.revokeAdminAuthSession(invalidSessionId),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_SESSION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.revokeOtherAdminAuthSessions(invalidRevokeOtherRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_SESSION_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists admin auth accounts and reads account report with normalized filters', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          items: [
            createAdminAuthAccountRecord({
              userId: 'driver-1',
              userType: 'driver',
              riskLevel: 'warning',
            }),
          ],
          total: 1,
          page: 2,
          pageSize: 10,
          summary: createAdminAuthAccountSummary(),
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createAdminAuthAccountReport({
            filters: {
              userType: 'driver',
              status: 'active',
              keyword: '13800138000',
              riskOnly: true,
              riskTag: 'shared_device',
              riskLevel: 'warning',
            },
          }),
        ),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });

    await expect(
      api.listAdminAuthAccounts({
        userType: 'driver',
        status: 'active',
        keyword: ' 13800138000 ',
        riskOnly: true,
        riskTag: 'shared_device',
        riskLevel: 'warning',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        summary: expect.objectContaining({
          totalUserCount: 3,
        }),
      }),
    );
    await expect(
      api.getAdminAuthAccountReport({
        userType: 'driver',
        status: 'active',
        keyword: ' 13800138000 ',
        riskOnly: true,
        riskTag: 'shared_device',
        riskLevel: 'warning',
        topAccountsLimit: 3,
        auditEventLimit: 2,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        topRiskAccounts: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
          }),
        ]),
        governanceAuditSummary: expect.objectContaining({
          totalEventCount: 2,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/auth/accounts?userType=driver&status=active&keyword=13800138000&riskOnly=true&riskTag=shared_device&riskLevel=warning&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.admin-user.900',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/auth/accounts/report?userType=driver&status=active&keyword=13800138000&riskOnly=true&riskTag=shared_device&riskLevel=warning&topAccountsLimit=3&auditEventLimit=2',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('exports admin auth accounts csv and gets account detail', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createTextResponse(
          'userId,userPhone\nuser-1,13800138000\n',
          'admin-auth-accounts.csv',
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(createAdminAuthAccountDetail()),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });

    await expect(
      api.exportAdminAuthAccountsCsv({
        status: 'disabled',
      }),
    ).resolves.toEqual({
      filename: 'admin-auth-accounts.csv',
      contentType: 'text/csv; charset=utf-8',
      content: 'userId,userPhone\nuser-1,13800138000\n',
    });
    await expect(
      api.getAdminAuthAccountDetail(' user-1 '),
    ).resolves.toEqual(
      expect.objectContaining({
        account: expect.objectContaining({
          userId: 'user-1',
        }),
        activeSessions: expect.arrayContaining([
          expect.objectContaining({
            id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ]),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/auth/accounts/export?status=disabled&page=1&pageSize=20',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access.admin-user.900',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/auth/accounts/user-1',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('updates and batch-updates admin auth account governance with normalized payloads', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          userId: 'user-1',
          status: 'disabled',
          revokedSessionCount: 2,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          status: 'active',
          userIds: ['user-1', 'user-2'],
          updatedCount: 2,
          revokedSessionCount: 0,
          items: [
            {
              userId: 'user-1',
              status: 'active',
              revokedSessionCount: 0,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          userId: 'user-1',
          revokedCount: 2,
          keepSessionId: '550e8400-e29b-41d4-a716-446655440001',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          userIds: ['user-1', 'user-2'],
          updatedCount: 2,
          revokedCount: 3,
          items: [
            {
              userId: 'user-1',
              revokedCount: 1,
              keepSessionId: '550e8400-e29b-41d4-a716-446655440001',
            },
          ],
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });

    await expect(
      api.updateAdminAuthAccountStatus(' user-1 ', {
        status: 'disabled',
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      status: 'disabled',
      revokedSessionCount: 2,
    });
    await expect(
      api.batchUpdateAdminAuthAccountStatus({
        items: [{ userId: ' user-1 ' }, { userId: 'user-2' }],
        status: 'active',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        updatedCount: 2,
        userIds: ['user-1', 'user-2'],
      }),
    );
    await expect(
      api.revokeAdminAuthAccountSessions(' user-1 ', {
        keepSessionId: ' 550e8400-e29b-41d4-a716-446655440001 ',
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      revokedCount: 2,
      keepSessionId: '550e8400-e29b-41d4-a716-446655440001',
    });
    await expect(
      api.batchRevokeAdminAuthAccountSessions({
        items: [
          {
            userId: ' user-1 ',
            keepSessionId: ' 550e8400-e29b-41d4-a716-446655440001 ',
          },
          { userId: 'user-2' },
        ],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        updatedCount: 2,
        revokedCount: 3,
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/auth/accounts/user-1/status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'disabled',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/auth/accounts/batch-status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [{ userId: 'user-1' }, { userId: 'user-2' }],
          status: 'active',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/auth/accounts/user-1/revoke-sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          keepSessionId: '550e8400-e29b-41d4-a716-446655440001',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/api/admin/auth/accounts/batch-revoke-sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              userId: 'user-1',
              keepSessionId: '550e8400-e29b-41d4-a716-446655440001',
            },
            { userId: 'user-2' },
          ],
        }),
      }),
    );
  });

  it('rejects invalid admin auth account inputs before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createPlatformAuthApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access.admin-user.900',
    });
    const invalidListQuery = {
      riskLevel: 'critical',
    } as unknown as Parameters<typeof api.listAdminAuthAccounts>[0];
    const invalidReportQuery = {
      topAccountsLimit: 21,
    } as unknown as Parameters<typeof api.getAdminAuthAccountReport>[0];
    const invalidDetailUserId =
      '   ' as unknown as Parameters<typeof api.getAdminAuthAccountDetail>[0];
    const invalidStatusRequest = {
      status: 'paused',
    } as unknown as Parameters<typeof api.updateAdminAuthAccountStatus>[1];
    const invalidBatchStatusRequest = {
      items: [{ userId: 'user-1' }, { userId: ' user-1 ' }],
      status: 'disabled',
    } as unknown as Parameters<typeof api.batchUpdateAdminAuthAccountStatus>[0];
    const invalidRevokeRequest = {
      keepSessionId: 'session-1',
    } as unknown as Parameters<typeof api.revokeAdminAuthAccountSessions>[1];
    const invalidBatchRevokeRequest = {
      items: [{ userId: 'user-1' }, { userId: ' user-1 ' }],
    } as unknown as Parameters<typeof api.batchRevokeAdminAuthAccountSessions>[0];

    await expect(
      api.listAdminAuthAccounts(invalidListQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.getAdminAuthAccountReport(invalidReportQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.getAdminAuthAccountDetail(invalidDetailUserId),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.updateAdminAuthAccountStatus('user-1', invalidStatusRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.batchUpdateAdminAuthAccountStatus(invalidBatchStatusRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.revokeAdminAuthAccountSessions('user-1', invalidRevokeRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    await expect(
      api.batchRevokeAdminAuthAccountSessions(invalidBatchRevokeRequest),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_AUTH_ACCOUNT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    expect(fetchMock).not.toHaveBeenCalled();
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

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req_test',
      timestamp: '2026-07-25T08:00:00.000Z',
    }),
  };
}

function createAdminAuthSessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    userId: 'admin-1',
    userPhone: '13800138000',
    userType: 'admin',
    deviceId: 'admin-device-current',
    createdAtIso: '2026-07-25T08:00:00.000Z',
    expiresAtIso: '2026-08-01T08:00:00.000Z',
    isCurrentUser: true,
    riskLevel: 'warning',
    riskTags: ['shared_device'],
    riskContext: {
      deviceSessionCount: 2,
      deviceUserCount: 2,
      userSessionCount: 2,
    },
    ...overrides,
  };
}

function createAdminAuthSessionGovernanceAuditRecord(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'audit-1',
    actorAdminId: 'admin-1',
    actorAdminPhone: '13800138000',
    action: 'revoke_session',
    result: 'revoked',
    requestedSessionId: '550e8400-e29b-41d4-a716-446655440001',
    currentDeviceId: 'admin-device-current',
    revokedCount: 1,
    subjects: [
      {
        sessionId: '550e8400-e29b-41d4-a716-446655440002',
        userId: 'driver-1',
        userPhone: '13900139000',
        userType: 'driver',
        deviceId: 'driver-device-1',
      },
    ],
    createdAtIso: '2026-07-25T09:00:00.000Z',
    ...overrides,
  };
}

function createTextResponse(
  content: string,
  filename = 'admin-auth-accounts.csv',
) {
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

function createAdminAuthAccountSummary(overrides: Record<string, unknown> = {}) {
  return {
    totalUserCount: 3,
    activeUserCount: 2,
    disabledUserCount: 1,
    riskyUserCount: 1,
    highRiskUserCount: 0,
    activeSessionUserCount: 2,
    ...overrides,
  };
}

function createAdminAuthAccountRecord(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    userPhone: '13800138000',
    userType: 'shipper',
    status: 'active',
    createdAtIso: '2026-07-25T08:00:00.000Z',
    updatedAtIso: '2026-07-25T08:10:00.000Z',
    activeSessionCount: 2,
    activeDeviceCount: 2,
    latestSessionCreatedAtIso: '2026-07-25T08:10:00.000Z',
    riskLevel: 'warning',
    riskTags: ['shared_device'],
    ...overrides,
  };
}

function createAdminAuthAccountDetail(overrides: Record<string, unknown> = {}) {
  return {
    account: createAdminAuthAccountRecord(),
    activeSessions: [createAdminAuthSessionRecord()],
    recentAuditEvents: [createAdminAuthSessionGovernanceAuditRecord()],
    ...overrides,
  };
}

function createAdminAuthAccountReport(overrides: Record<string, unknown> = {}) {
  return {
    generatedAtIso: '2026-07-25T10:00:00.000Z',
    filters: {
      userType: 'shipper',
      status: 'active',
      keyword: '13800138000',
      riskOnly: true,
      riskTag: 'shared_device',
      riskLevel: 'warning',
    },
    summary: createAdminAuthAccountSummary(),
    statusBreakdown: [
      {
        status: 'active',
        userCount: 2,
      },
    ],
    userTypeBreakdown: [
      {
        userType: 'shipper',
        userCount: 2,
        riskyUserCount: 1,
        disabledUserCount: 0,
        activeSessionUserCount: 2,
      },
    ],
    riskTagBreakdown: [
      {
        riskTag: 'shared_device',
        userCount: 1,
      },
    ],
    topRiskAccounts: [createAdminAuthAccountRecord()],
    governanceAuditSummary: {
      totalEventCount: 2,
      totalRevokedSessionCount: 3,
      latestEventCreatedAtIso: '2026-07-25T09:00:00.000Z',
      actionBreakdown: [
        {
          action: 'revoke_session',
          eventCount: 2,
          revokedSessionCount: 3,
        },
      ],
    },
    recentAuditEvents: [createAdminAuthSessionGovernanceAuditRecord()],
    ...overrides,
  };
}

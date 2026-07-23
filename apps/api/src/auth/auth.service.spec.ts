import { ApiErrorCode, BusinessError } from '../common/errors';
import type { AuthRepository } from './auth.repository';
import { InMemoryAuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { hashPassword, verifyPassword } from './password-hasher';
import { TokenService } from './token.service';
import type {
  VerificationCodeMessage,
  VerificationCodeSender,
} from './verification-code.sender';
import {
  InMemoryVerificationCodeStore,
  verificationCodeMatches,
} from './verification-code.store';

class FakeVerificationCodeSender implements VerificationCodeSender {
  readonly messages: VerificationCodeMessage[] = [];

  constructor(private readonly error?: Error) {}

  async sendCode(message: VerificationCodeMessage): Promise<void> {
    if (this.error) {
      throw this.error;
    }

    this.messages.push(message);
  }
}

describe('AuthService', () => {
  const now = new Date('2026-06-26T06:00:00.000Z');
  const maskedAdminPhone = '139****9000';
  const maskedSecondaryAdminPhone = '139****9002';
  const maskedDriverPhone = '138****8001';
  const maskedAdminDevice1 = 'adm********e-1';
  const maskedAdminDevice2 = 'adm********e-2';
  const maskedAdminConsoleDevice = 'adm**************ice';
  const maskedDriverAndroid1 = 'dri**********d-1';
  const maskedDriverAndroid2 = 'dri**********d-2';
  const maskedDriverWeb1 = 'dri******b-1';
  const maskedSharedDevice = 'sha*******ice';

  function createService() {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const authRepository = new InMemoryAuthRepository(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });

    return {
      service: new AuthService(
        codeStore,
        tokenService,
        () => now,
        authRepository,
      ),
      codeStore,
      authRepository,
    };
  }

  function createProductionService() {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });

    return {
      service: new AuthService(
        codeStore,
        tokenService,
        () => now,
        undefined,
        {
          exposeDevCode: false,
          generateCode: () => '654321',
          ttlSeconds: 300,
        },
      ),
      codeStore,
    };
  }

  function createServiceWithClock(initialNow = now) {
    let currentNow = initialNow;
    const codeStore = new InMemoryVerificationCodeStore(() => currentNow);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => currentNow,
    });

    return {
      service: new AuthService(codeStore, tokenService, () => currentNow),
      advanceBySeconds: (seconds: number) => {
        currentNow = new Date(currentNow.getTime() + seconds * 1000);
      },
    };
  }

  function createServiceWithSessionGovernanceRiskData() {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const usersById = new Map([
      [
        'admin-1',
        {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin' as const,
          status: 'active' as const,
        },
      ],
      [
        'driver-1',
        {
          id: 'driver-1',
          phone: '13800138001',
          userType: 'driver' as const,
          status: 'active' as const,
        },
      ],
      [
        'shipper-1',
        {
          id: 'shipper-1',
          phone: '13800138002',
          userType: 'shipper' as const,
          status: 'active' as const,
        },
      ],
      [
        'shipper-2',
        {
          id: 'shipper-2',
          phone: '13800138003',
          userType: 'shipper' as const,
          status: 'active' as const,
        },
      ],
    ]);
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest
        .fn()
        .mockImplementation(async (userId: string) => usersById.get(userId)),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      listAllActiveRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-driver-risk',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
        {
          id: 'session-admin-2',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440102',
          deviceId: 'admin-laptop',
          createdAt: new Date('2026-06-26T06:11:00.000Z'),
          expiresAt: new Date('2026-07-03T06:11:00.000Z'),
        },
        {
          id: 'session-driver-2',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
          deviceId: 'driver-android-2',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
        {
          id: 'session-admin-1',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440104',
          deviceId: 'admin-console-device',
          createdAt: new Date('2026-06-26T06:09:00.000Z'),
          expiresAt: new Date('2026-07-03T06:09:00.000Z'),
        },
        {
          id: 'session-shipper-shared',
          userId: 'shipper-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440105',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:08:00.000Z'),
          expiresAt: new Date('2026-07-03T06:08:00.000Z'),
        },
        {
          id: 'session-driver-3',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440106',
          deviceId: 'driver-web-1',
          createdAt: new Date('2026-06-26T06:07:00.000Z'),
          expiresAt: new Date('2026-07-03T06:07:00.000Z'),
        },
        {
          id: 'session-shipper-safe',
          userId: 'shipper-2',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440107',
          deviceId: 'shipper-ios-2',
          createdAt: new Date('2026-06-26T06:06:00.000Z'),
          expiresAt: new Date('2026-07-03T06:06:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };

    return {
      service: new AuthService(
        codeStore,
        tokenService,
        () => now,
        authRepository,
      ),
      authRepository,
    };
  }

  function createServiceWithAccountManagementData() {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const usersById = new Map([
      [
        'admin-1',
        {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin' as const,
          status: 'active' as const,
          createdAt: new Date('2026-06-01T06:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:59:00.000Z'),
        },
      ],
      [
        'driver-1',
        {
          id: 'driver-1',
          phone: '13800138001',
          userType: 'driver' as const,
          status: 'active' as const,
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:40:00.000Z'),
        },
      ],
      [
        'shipper-1',
        {
          id: 'shipper-1',
          phone: '13800138002',
          userType: 'shipper' as const,
          status: 'disabled' as const,
          createdAt: new Date('2026-06-05T08:00:00.000Z'),
          updatedAt: new Date('2026-06-25T08:00:00.000Z'),
        },
      ],
      [
        'shipper-2',
        {
          id: 'shipper-2',
          phone: '13800138003',
          userType: 'shipper' as const,
          status: 'active' as const,
          createdAt: new Date('2026-06-12T08:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:50:00.000Z'),
        },
      ],
    ]);
    const activeSessions = [
      {
        id: 'session-driver-risk',
        userId: 'driver-1',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
        deviceId: 'shared-device',
        createdAt: new Date('2026-06-26T06:12:00.000Z'),
        expiresAt: new Date('2026-07-03T06:12:00.000Z'),
      },
      {
        id: 'session-admin-2',
        userId: 'admin-1',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440102',
        deviceId: 'admin-laptop',
        createdAt: new Date('2026-06-26T06:11:00.000Z'),
        expiresAt: new Date('2026-07-03T06:11:00.000Z'),
      },
      {
        id: 'session-driver-2',
        userId: 'driver-1',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
        deviceId: 'driver-android-2',
        createdAt: new Date('2026-06-26T06:10:00.000Z'),
        expiresAt: new Date('2026-07-03T06:10:00.000Z'),
      },
      {
        id: 'session-admin-1',
        userId: 'admin-1',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440104',
        deviceId: 'admin-console-device',
        createdAt: new Date('2026-06-26T06:09:00.000Z'),
        expiresAt: new Date('2026-07-03T06:09:00.000Z'),
      },
      {
        id: 'session-shipper-shared',
        userId: 'shipper-1',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440105',
        deviceId: 'shared-device',
        createdAt: new Date('2026-06-26T06:08:00.000Z'),
        expiresAt: new Date('2026-07-03T06:08:00.000Z'),
      },
      {
        id: 'session-driver-3',
        userId: 'driver-1',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440106',
        deviceId: 'driver-web-1',
        createdAt: new Date('2026-06-26T06:07:00.000Z'),
        expiresAt: new Date('2026-07-03T06:07:00.000Z'),
      },
      {
        id: 'session-shipper-safe',
        userId: 'shipper-2',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440107',
        deviceId: 'shipper-ios-2',
        createdAt: new Date('2026-06-26T06:06:00.000Z'),
        expiresAt: new Date('2026-07-03T06:06:00.000Z'),
      },
    ];
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockImplementation(async (userId: string) => {
        const user = usersById.get(userId);
        if (!user) {
          return undefined;
        }

        return {
          id: user.id,
          phone: user.phone,
          userType: user.userType,
          status: user.status,
        };
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest
        .fn()
        .mockImplementation(async (userId: string) =>
          activeSessions.filter(session => session.userId === userId),
        ),
      listAllActiveRefreshSessions: jest.fn().mockResolvedValue(activeSessions),
      listPlatformUsers: jest.fn().mockResolvedValue([...usersById.values()]),
      listAdminAuthSessionGovernanceAuditEvents: jest.fn().mockResolvedValue([
        {
          id: 'audit-driver-revoke',
          actorAdminId: 'admin-1',
          actorAdminPhone: '13900139000',
          action: 'revoke_session',
          result: 'revoked',
          requestedSessionId: 'session-driver-risk',
          revokedCount: 1,
          subjects: [
            {
              sessionId: 'session-driver-risk',
              userId: 'driver-1',
              userPhone: '13800138001',
              userType: 'driver',
              deviceId: 'shared-device',
            },
          ],
          createdAt: new Date('2026-06-26T06:15:00.000Z'),
        },
        {
          id: 'audit-admin-other',
          actorAdminId: 'admin-1',
          actorAdminPhone: '13900139000',
          action: 'revoke_other_sessions',
          result: 'revoked',
          currentDeviceId: 'admin-console-device',
          revokedCount: 1,
          subjects: [
            {
              sessionId: 'session-admin-2',
              userId: 'admin-1',
              userPhone: '13900139000',
              userType: 'admin',
              deviceId: 'admin-laptop',
            },
          ],
          createdAt: new Date('2026-06-26T06:14:00.000Z'),
        },
      ]),
      saveAdminAuthSessionGovernanceAuditEvent: jest.fn(),
      revokeUserRefreshSession: jest.fn().mockResolvedValue(true),
      revokeRefreshSessionById: jest.fn().mockResolvedValue(true),
    };

    return {
      service: new AuthService(
        codeStore,
        tokenService,
        () => now,
        authRepository,
      ),
      authRepository,
    };
  }

  it('sends a local development verification code', async () => {
    const { service, codeStore } = createService();

    const result = await service.sendCode({
      phone: '13800138000',
      purpose: 'login',
    });

    expect(result).toEqual({
      expireSeconds: 300,
      devCode: '123456',
    });
    const activeCode = await codeStore.findActiveCode('13800138000', 'login');
    expect(activeCode).toMatchObject({
      phone: '13800138000',
      purpose: 'login',
    });
    expect(verificationCodeMatches(activeCode!, '123456')).toBe(true);
  });

  it('sends the generated verification code through the configured sender', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const codeSender = new FakeVerificationCodeSender();
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      undefined,
      {
        exposeDevCode: false,
        generateCode: () => '246810',
        ttlSeconds: 300,
      },
      codeSender,
    );

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).resolves.toEqual({
      expireSeconds: 300,
    });

    expect(codeSender.messages).toEqual([
      {
        phone: '13800138000',
        purpose: 'login',
        code: '246810',
        expiresAt: new Date('2026-06-26T06:05:00.000Z'),
      },
    ]);
  });

  it('uses the configured verification code ttl when sending codes', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const codeSender = new FakeVerificationCodeSender();
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const verificationCodeConfig = {
      exposeDevCode: false,
      generateCode: () => '246810',
      ttlSeconds: 120,
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      undefined,
      verificationCodeConfig,
      codeSender,
    );

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).resolves.toEqual({
      expireSeconds: 120,
    });

    expect(codeSender.messages[0]).toMatchObject({
      expiresAt: new Date('2026-06-26T06:02:00.000Z'),
    });
  });

  it('maps verification code delivery failures to a business error', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const codeSender = new FakeVerificationCodeSender(
      new Error('SMS webhook request failed with status 503'),
    );
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      undefined,
      {
        exposeDevCode: false,
        generateCode: () => '246810',
        ttlSeconds: 300,
      },
      codeSender,
    );

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_CODE_DELIVERY_FAILED,
        '验证码发送失败',
      ),
    );
  });

  it('does not leave an active login code after delivery fails', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const codeSender = new FakeVerificationCodeSender(
      new Error('SMS webhook request failed with status 503'),
    );
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      undefined,
      {
        exposeDevCode: false,
        generateCode: () => '246810',
        ttlSeconds: 300,
      },
      codeSender,
    );

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_CODE_DELIVERY_FAILED',
    });

    await expect(
      service.login({
        phone: '13800138000',
        code: '246810',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
    );
    await expect(
      codeStore.findActiveCode('13800138000', 'login'),
    ).resolves.toBeUndefined();
  });

  it('does not expose fixed development verification codes in production mode', async () => {
    const { service, codeStore } = createProductionService();

    const result = await service.sendCode({
      phone: '13800138000',
      purpose: 'login',
    });

    expect(result).toEqual({
      expireSeconds: 300,
    });
    const activeCode = await codeStore.findActiveCode('13800138000', 'login');
    expect(activeCode).toMatchObject({
      phone: '13800138000',
      purpose: 'login',
    });
    expect(verificationCodeMatches(activeCode!, '654321')).toBe(true);

    await expect(
      service.login({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
    );

    await expect(
      service.login({
        phone: '13800138000',
        code: '654321',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).resolves.toMatchObject({
      user: {
        phone: '13800138000',
        userType: 'shipper',
      },
    });
  });

  it('rate limits verification codes within the resend cooldown window', async () => {
    const { service, advanceBySeconds } = createServiceWithClock();

    await service.sendCode({
      phone: '13800138000',
      purpose: 'login',
    });

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_CODE_RATE_LIMITED,
        '验证码发送过于频繁',
      ),
    );

    advanceBySeconds(60);

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).resolves.toMatchObject({
      expireSeconds: 300,
    });
  });

  it('rate limits verification codes after five sends in one hour', async () => {
    const { service, advanceBySeconds } = createServiceWithClock();

    for (let index = 0; index < 5; index += 1) {
      await service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      });
      advanceBySeconds(61);
    }

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_CODE_RATE_LIMITED,
        '验证码发送过于频繁',
      ),
    );

    advanceBySeconds(3600);

    await expect(
      service.sendCode({
        phone: '13800138000',
        purpose: 'login',
      }),
    ).resolves.toMatchObject({
      expireSeconds: 300,
    });
  });

  it('logs in with a valid code and returns token pair', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const result = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    expect(result.user).toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(result.tokens.accessToken.split('.')).toHaveLength(3);
    expect(result.tokens.refreshToken).toMatch(/^refresh\.[A-Za-z0-9_-]+$/);
    expect(result.tokens.refreshToken).not.toContain(
      'local-user-13800138000',
    );
  });

  it('registers with a valid register code and returns token pair', async () => {
    const { service, authRepository } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    const result = await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
      password: 'abc123',
    });

    expect(result.user).toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(result.tokens.accessToken.split('.')).toHaveLength(3);
    expect(result.tokens.refreshToken).toMatch(/^refresh\.[A-Za-z0-9_-]+$/);
    const storedUser = await authRepository.findUserById(result.user.id);
    expect(storedUser?.passwordHash).toEqual(expect.stringMatching(/^scrypt\$/));
    expect(storedUser?.passwordHash).not.toContain('abc123');
    await expect(verifyPassword('abc123', storedUser!.passwordHash!)).resolves.toBe(
      true,
    );
  });

  it('logs in with a valid password and returns token pair', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });

    const result = await service.passwordLogin({
      phone: '13800138000',
      password: 'abc123',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    expect(result.user).toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(result.tokens.accessToken.split('.')).toHaveLength(3);
    expect(result.tokens.refreshToken).toMatch(/^refresh\.[A-Za-z0-9_-]+$/);
  });

  it('logs in an admin with the dedicated admin password route and preserves the admin user type', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockImplementation(async (userId: string) => {
        if (userId === 'driver-1') {
          return {
            id: 'driver-1',
            phone: '13800138001',
            userType: 'driver',
            status: 'active',
          };
        }

        return {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
          status: 'active',
        };
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
        passwordHash: await hashPassword('Admin123'),
      }),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    const result = await service.adminPasswordLogin({
      phone: '13900139000',
      password: 'Admin123',
      deviceId: 'admin-console-device',
    });

    expect(result.user).toEqual({
      id: 'admin-1',
      phone: '13900139000',
      userType: 'admin',
    });
    expect(result.tokens.accessToken.split('.')).toHaveLength(3);
    expect(result.tokens.refreshToken).toMatch(/^refresh\.[A-Za-z0-9_-]+$/);
    expect(authRepository.upsertMobileUser).not.toHaveBeenCalled();
    expect(authRepository.revokeUserDeviceRefreshSessions).toHaveBeenCalledWith(
      'admin-1',
      'admin-console-device',
      now,
    );
  });

  it('rejects mobile password login for an admin user with a forbidden business error', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
        passwordHash: await hashPassword('Admin123'),
      }),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.passwordLogin({
        phone: '13900139000',
        password: 'Admin123',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_FORBIDDEN,
        '后台账号不能使用移动端认证接口',
      ),
    );
    expect(authRepository.upsertMobileUser).not.toHaveBeenCalled();
    expect(authRepository.saveRefreshSession).not.toHaveBeenCalled();
  });

  it('rejects code login for an existing admin phone without mutating the mobile user record', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockImplementation(async (userId: string) => {
        if (userId === 'driver-1') {
          return {
            id: 'driver-1',
            phone: '13800138001',
            userType: 'driver',
            status: 'active',
          };
        }

        return {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
          status: 'active',
        };
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
      }),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await service.sendCode({
      phone: '13900139000',
      purpose: 'login',
    });

    await expect(
      service.login({
        phone: '13900139000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_FORBIDDEN,
        '后台账号不能使用移动端认证接口',
      ),
    );
    expect(authRepository.upsertMobileUser).not.toHaveBeenCalled();
    expect(authRepository.saveRefreshSession).not.toHaveBeenCalled();
  });

  it('rejects password login with an invalid password', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });

    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'wrong123',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_PASSWORD_INVALID, '手机号或密码错误'),
    );
  });

  it('rejects password login when the user has no password hash', async () => {
    const { service, authRepository } = createService();

    await authRepository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });

    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_PASSWORD_INVALID, '手机号或密码错误'),
    );
  });

  it('rejects password login for a disabled user', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
      }),
      findUserByPhone: jest.fn().mockResolvedValue({
        id: 'db-user-disabled',
        phone: '13800138000',
        userType: 'shipper',
        status: 'disabled',
        passwordHash: await hashPassword('abc123'),
      }),
      findPlatformUserByPhone: jest.fn().mockResolvedValue({
        id: 'db-user-disabled',
        phone: '13800138000',
        userType: 'shipper',
        status: 'disabled',
        passwordHash: await hashPassword('abc123'),
      }),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_USER_DISABLED',
      message: '账号已禁用',
    });
    expect(authRepository.revokeUserDeviceRefreshSessions).not.toHaveBeenCalled();
    expect(authRepository.saveRefreshSession).not.toHaveBeenCalled();
  });

  it('resets a password with a valid reset code', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });
    await service.sendCode({ phone: '13800138000', purpose: 'reset' });

    await expect(
      service.resetPassword({
        phone: '13800138000',
        code: '123456',
        password: 'newabc123',
      }),
    ).resolves.toEqual({
      reset: true,
    });

    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-old-password',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_INVALID',
    });
    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'newabc123',
        userType: 'shipper',
        deviceId: 'device-new-password',
      }),
    ).resolves.toMatchObject({
      user: {
        phone: '13800138000',
      },
      tokens: {
        accessToken: expect.any(String),
      },
    });
  });

  it('revokes existing refresh sessions after resetting a password', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    const registerResult = await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });
    const passwordLoginResult = await service.passwordLogin({
      phone: '13800138000',
      password: 'abc123',
      userType: 'shipper',
      deviceId: 'device-password',
    });
    await service.sendCode({ phone: '13800138000', purpose: 'reset' });

    await service.resetPassword({
      phone: '13800138000',
      code: '123456',
      password: 'newabc123',
    });

    for (const [refreshToken, deviceId] of [
      [registerResult.tokens.refreshToken, 'device-register'],
      [passwordLoginResult.tokens.refreshToken, 'device-password'],
    ] as const) {
      await expect(
        service.refresh({
          refreshToken,
          deviceId,
        }),
      ).rejects.toEqual(
        new BusinessError(
          ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
          '刷新令牌无效',
        ),
      );
    }
  });

  it('changes a password for the current authenticated user', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    const registerResult = await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });

    await expect(
      service.changePassword(registerResult.user.id, {
        currentPassword: 'abc123',
        newPassword: 'newabc123',
      }),
    ).resolves.toEqual({
      changed: true,
    });
    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-old-password',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_INVALID',
    });
    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'newabc123',
        userType: 'shipper',
        deviceId: 'device-new-password',
      }),
    ).resolves.toMatchObject({
      user: {
        phone: '13800138000',
      },
    });
  });

  it('revokes existing refresh sessions after changing a password', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    const registerResult = await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });
    const passwordLoginResult = await service.passwordLogin({
      phone: '13800138000',
      password: 'abc123',
      userType: 'shipper',
      deviceId: 'device-password',
    });

    await service.changePassword(registerResult.user.id, {
      currentPassword: 'abc123',
      newPassword: 'newabc123',
    });

    for (const [refreshToken, deviceId] of [
      [registerResult.tokens.refreshToken, 'device-register'],
      [passwordLoginResult.tokens.refreshToken, 'device-password'],
    ] as const) {
      await expect(
        service.refresh({
          refreshToken,
          deviceId,
        }),
      ).rejects.toEqual(
        new BusinessError(
          ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
          '刷新令牌无效',
        ),
      );
    }
  });

  it('rejects change password with an invalid current password', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    const registerResult = await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });

    await expect(
      service.changePassword(registerResult.user.id, {
        currentPassword: 'wrong123',
        newPassword: 'newabc123',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_PASSWORD_INVALID, '当前密码错误'),
    );
    await expect(
      service.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-old-password',
      }),
    ).resolves.toMatchObject({
      user: {
        phone: '13800138000',
      },
    });
  });

  it('rejects reset password when only a login code exists', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'register' });
    await service.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });
    await service.sendCode({ phone: '13800138000', purpose: 'login' });

    await expect(
      service.resetPassword({
        phone: '13800138000',
        code: '123456',
        password: 'newabc123',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
    );
  });

  it('rejects reset password for a missing user without changing auth state', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'reset' });

    await expect(
      service.resetPassword({
        phone: '13800138000',
        code: '123456',
        password: 'newabc123',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_PASSWORD_RESET_INVALID,
        '手机号或验证码错误',
      ),
    );
  });

  it('rejects register when only a login code exists', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });

    await expect(
      service.register({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
        password: 'abc123',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
    );
  });

  it('revokes previous refresh sessions when logging in again on the same device', async () => {
    const { service, advanceBySeconds } = createServiceWithClock();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const firstLogin = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    advanceBySeconds(60);
    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const secondLogin = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    expect(secondLogin.tokens.refreshToken).not.toBe(
      firstLogin.tokens.refreshToken,
    );
    await expect(
      service.refresh({
        refreshToken: firstLogin.tokens.refreshToken,
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        '刷新令牌无效',
      ),
    );
    await expect(
      service.refresh({
        refreshToken: secondLogin.tokens.refreshToken,
        deviceId: 'device-1',
      }),
    ).resolves.toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it('lists active user sessions for current-admin session governance', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-2',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440001',
          deviceId: 'admin-device-2',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
        {
          id: 'session-1',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
          deviceId: 'admin-device-1',
          createdAt: new Date('2026-06-26T06:00:00.000Z'),
          expiresAt: new Date('2026-07-03T06:00:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(service.listUserSessions('admin-1')).resolves.toEqual({
      riskSummary: {
        riskySessionCount: 2,
        highRiskSessionCount: 0,
        sharedDeviceCount: 0,
        highSessionVolumeUserCount: 0,
        adminMultiDeviceUserCount: 1,
      },
      sessions: [
        {
          id: 'session-2',
          userId: 'admin-1',
          userPhone: maskedAdminPhone,
          userType: 'admin',
          deviceId: maskedAdminDevice2,
          createdAtIso: '2026-06-26T06:10:00.000Z',
          expiresAtIso: '2026-07-03T06:10:00.000Z',
          isCurrentUser: true,
          riskLevel: 'warning',
          riskTags: ['admin_multi_device'],
          riskContext: {
            deviceSessionCount: 1,
            deviceUserCount: 1,
            userSessionCount: 2,
          },
        },
        {
          id: 'session-1',
          userId: 'admin-1',
          userPhone: maskedAdminPhone,
          userType: 'admin',
          deviceId: maskedAdminDevice1,
          createdAtIso: '2026-06-26T06:00:00.000Z',
          expiresAtIso: '2026-07-03T06:00:00.000Z',
          isCurrentUser: true,
          riskLevel: 'warning',
          riskTags: ['admin_multi_device'],
          riskContext: {
            deviceSessionCount: 1,
            deviceUserCount: 1,
            userSessionCount: 2,
          },
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expect(authRepository.listActiveUserRefreshSessions).toHaveBeenCalledWith(
      'admin-1',
    );
    expect(authRepository.findUserById).toHaveBeenCalledWith('admin-1');
  });

  it('lists platform sessions for admin governance with role and keyword filters', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest
        .fn()
        .mockImplementation(async (userId: string) => {
          if (userId === 'driver-1') {
            return {
              id: 'driver-1',
              phone: '13800138001',
              userType: 'driver',
              status: 'active',
            };
          }
          if (userId === 'shipper-1') {
            return {
              id: 'shipper-1',
              phone: '13800138002',
              userType: 'shipper',
              status: 'active',
            };
          }
          return {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
            status: 'active',
          };
        }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      listAllActiveRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-driver-1',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440001',
          deviceId: 'driver-android-1',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
        {
          id: 'session-shipper-1',
          userId: 'shipper-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440002',
          deviceId: 'shipper-ios-1',
          createdAt: new Date('2026-06-26T06:08:00.000Z'),
          expiresAt: new Date('2026-07-03T06:08:00.000Z'),
        },
        {
          id: 'session-admin-1',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440003',
          deviceId: 'admin-console-device',
          createdAt: new Date('2026-06-26T06:06:00.000Z'),
          expiresAt: new Date('2026-07-03T06:06:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.listUserSessions('admin-1', {
        scope: 'all',
        userType: 'driver',
        keyword: 'android',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      riskSummary: {
        riskySessionCount: 0,
        highRiskSessionCount: 0,
        sharedDeviceCount: 0,
        highSessionVolumeUserCount: 0,
        adminMultiDeviceUserCount: 0,
      },
      sessions: [
        {
          id: 'session-driver-1',
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          userType: 'driver',
          deviceId: maskedDriverAndroid1,
          createdAtIso: '2026-06-26T06:10:00.000Z',
          expiresAtIso: '2026-07-03T06:10:00.000Z',
          isCurrentUser: false,
          riskLevel: 'none',
          riskTags: [],
          riskContext: {
            deviceSessionCount: 1,
            deviceUserCount: 1,
            userSessionCount: 1,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(authRepository.listAllActiveRefreshSessions).toHaveBeenCalledTimes(1);
  });

  it('adds device risk tags and summary to platform session governance results', async () => {
    const { service, authRepository } =
      createServiceWithSessionGovernanceRiskData();

    const result = await service.listUserSessions('admin-1', {
      scope: 'all',
      page: 1,
      pageSize: 20,
    });

    expect(result).toMatchObject({
      total: 7,
      page: 1,
      pageSize: 20,
      riskSummary: {
        riskySessionCount: 6,
        highRiskSessionCount: 1,
        sharedDeviceCount: 1,
        highSessionVolumeUserCount: 1,
        adminMultiDeviceUserCount: 1,
      },
    });
    expect(
      result.sessions.find(session => session.id === 'session-driver-risk'),
    ).toEqual(
      expect.objectContaining({
        riskLevel: 'high',
        riskTags: ['shared_device', 'high_session_volume'],
        riskContext: {
          deviceSessionCount: 2,
          deviceUserCount: 2,
          userSessionCount: 3,
        },
      }),
    );
    expect(
      result.sessions.find(session => session.id === 'session-admin-1'),
    ).toEqual(
      expect.objectContaining({
        riskLevel: 'warning',
        riskTags: ['admin_multi_device'],
        riskContext: {
          deviceSessionCount: 1,
          deviceUserCount: 1,
          userSessionCount: 2,
        },
      }),
    );
    expect(
      result.sessions.find(session => session.id === 'session-shipper-safe'),
    ).toEqual(
      expect.objectContaining({
        riskLevel: 'none',
        riskTags: [],
        riskContext: {
          deviceSessionCount: 1,
          deviceUserCount: 1,
          userSessionCount: 1,
        },
      }),
    );
    expect(authRepository.listAllActiveRefreshSessions).toHaveBeenCalledTimes(1);
  });

  it('filters platform sessions by risk-only and risk-tag query', async () => {
    const { service, authRepository } =
      createServiceWithSessionGovernanceRiskData();

    const result = await service.listUserSessions('admin-1', {
      scope: 'all',
      userType: 'driver',
      keyword: 'shared',
      riskOnly: true,
      riskTag: 'shared_device',
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.sessions).toMatchObject([
      {
        id: 'session-driver-risk',
        userType: 'driver',
        deviceId: maskedSharedDevice,
        riskLevel: 'high',
        riskTags: ['shared_device', 'high_session_volume'],
      },
    ]);
    expect(authRepository.listAllActiveRefreshSessions).toHaveBeenCalledTimes(1);
  });

  it('lists session governance audit events with action, result and keyword filters', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockImplementation(async (userId: string) => {
        if (userId === 'driver-1') {
          return {
            id: 'driver-1',
            phone: '13800138001',
            userType: 'driver',
            status: 'active',
          };
        }

        return {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
          status: 'active',
        };
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
      listAdminAuthSessionGovernanceAuditEvents: jest.fn().mockResolvedValue([
        {
          id: 'audit-2',
          actorAdminId: 'admin-2',
          actorAdminPhone: '13900139002',
          action: 'revoke_other_sessions',
          result: 'revoked',
          currentDeviceId: 'admin-console-device',
          revokedCount: 2,
          subjects: [
            {
              sessionId: 'session-driver-1',
              userId: 'driver-1',
              userPhone: '13800138001',
              userType: 'driver',
              deviceId: 'driver-android-1',
            },
          ],
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
        },
        {
          id: 'audit-1',
          actorAdminId: 'admin-1',
          actorAdminPhone: '13900139000',
          action: 'revoke_session',
          result: 'noop',
          requestedSessionId: '550e8400-e29b-41d4-a716-446655440111',
          revokedCount: 0,
          subjects: [],
          createdAt: new Date('2026-06-26T06:05:00.000Z'),
        },
      ]),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.listSessionGovernanceAuditEvents({
        action: 'revoke_other_sessions',
        result: 'revoked',
        keyword: 'android',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      events: [
        {
          id: 'audit-2',
          actorAdminId: 'admin-2',
          actorAdminPhone: maskedSecondaryAdminPhone,
          action: 'revoke_other_sessions',
          result: 'revoked',
          currentDeviceId: maskedAdminConsoleDevice,
          revokedCount: 2,
          subjects: [
            {
              sessionId: 'session-driver-1',
              userId: 'driver-1',
              userPhone: maskedDriverPhone,
              userType: 'driver',
              deviceId: maskedDriverAndroid1,
            },
          ],
          createdAtIso: '2026-06-26T06:10:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(
      authRepository.listAdminAuthSessionGovernanceAuditEvents,
    ).toHaveBeenCalledTimes(1);
  });

  it('revokes a selected user session for admin session governance', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn().mockResolvedValue(true),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.revokeUserSession(
        'admin-1',
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).resolves.toEqual({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      revoked: true,
    });
    expect(authRepository.revokeUserRefreshSession).toHaveBeenCalledWith(
      'admin-1',
      '550e8400-e29b-41d4-a716-446655440000',
      now,
    );
  });

  it('revokes a selected platform session across accounts for admin session governance', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockImplementation(async (userId: string) => {
        if (userId === 'driver-1') {
          return {
            id: 'driver-1',
            phone: '13800138001',
            userType: 'driver',
            status: 'active',
          };
        }

        return {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
          status: 'active',
        };
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      listAllActiveRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440111',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440111',
          deviceId: 'driver-android-1',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
      ]),
      saveAdminAuthSessionGovernanceAuditEvent: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn().mockResolvedValue(true),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.revokeUserSession('admin-1', '550e8400-e29b-41d4-a716-446655440111'),
    ).resolves.toEqual({
      sessionId: '550e8400-e29b-41d4-a716-446655440111',
      revoked: true,
    });
    expect(authRepository.revokeRefreshSessionById).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440111',
      now,
    );
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenCalledWith({
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_session',
      result: 'revoked',
      requestedSessionId: '550e8400-e29b-41d4-a716-446655440111',
      revokedCount: 1,
      subjects: [
        {
          sessionId: '550e8400-e29b-41d4-a716-446655440111',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-android-1',
        },
      ],
    });
  });

  it('revokes other user sessions except the current device', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'admin-1',
        phone: '13900139000',
        userType: 'admin',
        status: 'active',
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-current',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
          deviceId: 'admin-console-device',
          createdAt: new Date('2026-06-26T06:00:00.000Z'),
          expiresAt: new Date('2026-07-03T06:00:00.000Z'),
        },
        {
          id: 'session-2',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440001',
          deviceId: 'admin-laptop',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
        {
          id: 'session-3',
          userId: 'admin-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440002',
          deviceId: 'admin-tablet',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
      ]),
      saveAdminAuthSessionGovernanceAuditEvent: jest.fn(),
      revokeUserRefreshSession: jest.fn().mockResolvedValue(true),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.revokeOtherUserSessions('admin-1', 'admin-console-device'),
    ).resolves.toEqual({
      currentDeviceId: maskedAdminConsoleDevice,
      revokedCount: 2,
    });
    expect(authRepository.listActiveUserRefreshSessions).toHaveBeenCalledWith(
      'admin-1',
    );
    expect(authRepository.revokeUserRefreshSession).toHaveBeenNthCalledWith(
      1,
      'admin-1',
      'session-2',
      now,
    );
    expect(authRepository.revokeUserRefreshSession).toHaveBeenNthCalledWith(
      2,
      'admin-1',
      'session-3',
      now,
    );
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenCalledWith({
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_other_sessions',
      result: 'revoked',
      currentDeviceId: 'admin-console-device',
      revokedCount: 2,
      subjects: [
        {
          sessionId: 'session-2',
          userId: 'admin-1',
          userPhone: '13900139000',
          userType: 'admin',
          deviceId: 'admin-laptop',
        },
        {
          sessionId: 'session-3',
          userId: 'admin-1',
          userPhone: '13900139000',
          userType: 'admin',
          deviceId: 'admin-tablet',
        },
      ],
    });
  });

  it('lists current user auth sessions without admin masking', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn(),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-current',
          userId: 'shipper-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440210',
          deviceId: 'mobile-device-current',
          createdAt: new Date('2026-07-22T08:00:00.000Z'),
          expiresAt: new Date('2026-07-29T08:00:00.000Z'),
        },
        {
          id: 'session-laptop',
          userId: 'shipper-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440211',
          deviceId: 'mobile-device-laptop',
          createdAt: new Date('2026-07-21T08:00:00.000Z'),
          expiresAt: new Date('2026-07-28T08:00:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(service.listSelfAuthSessions('shipper-1')).resolves.toEqual({
      sessions: [
        {
          id: 'session-current',
          deviceId: 'mobile-device-current',
          createdAtIso: '2026-07-22T08:00:00.000Z',
          expiresAtIso: '2026-07-29T08:00:00.000Z',
        },
        {
          id: 'session-laptop',
          deviceId: 'mobile-device-laptop',
          createdAtIso: '2026-07-21T08:00:00.000Z',
          expiresAtIso: '2026-07-28T08:00:00.000Z',
        },
      ],
      total: 2,
    });
    expect(authRepository.listActiveUserRefreshSessions).toHaveBeenCalledWith(
      'shipper-1',
    );
  });

  it('lists admin auth accounts with risk filters and summary', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();

    await expect(
      (service as unknown as {
        listAdminAuthAccounts: (query: {
          userType: 'driver';
          riskOnly: true;
          riskLevel: 'high';
          page: number;
          pageSize: number;
        }) => Promise<unknown>;
      }).listAdminAuthAccounts({
        userType: 'driver',
        riskOnly: true,
        riskLevel: 'high',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [
        {
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          userType: 'driver',
          status: 'active',
          createdAtIso: '2026-06-10T08:00:00.000Z',
          updatedAtIso: '2026-06-26T05:40:00.000Z',
          activeSessionCount: 3,
          activeDeviceCount: 3,
          latestSessionCreatedAtIso: '2026-06-26T06:12:00.000Z',
          riskLevel: 'high',
          riskTags: ['shared_device', 'high_session_volume'],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      summary: {
        totalUserCount: 1,
        activeUserCount: 1,
        disabledUserCount: 0,
        riskyUserCount: 1,
        highRiskUserCount: 1,
        activeSessionUserCount: 1,
      },
    });
    expect(authRepository.listPlatformUsers).toHaveBeenCalledTimes(1);
    expect(authRepository.listAllActiveRefreshSessions).toHaveBeenCalledTimes(1);
  });

  it('builds an admin auth account report with filtered governance summary', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();

    await expect(
      (service as unknown as {
        getAdminAuthAccountReport: (query: {
          userType: 'driver';
          riskOnly: true;
          topAccountsLimit: number;
          auditEventLimit: number;
        }) => Promise<unknown>;
      }).getAdminAuthAccountReport({
        userType: 'driver',
        riskOnly: true,
        topAccountsLimit: 3,
        auditEventLimit: 5,
      }),
    ).resolves.toEqual({
      generatedAtIso: now.toISOString(),
      filters: {
        userType: 'driver',
        riskOnly: true,
      },
      summary: {
        totalUserCount: 1,
        activeUserCount: 1,
        disabledUserCount: 0,
        riskyUserCount: 1,
        highRiskUserCount: 1,
        activeSessionUserCount: 1,
      },
      statusBreakdown: [
        {
          status: 'active',
          userCount: 1,
        },
        {
          status: 'disabled',
          userCount: 0,
        },
      ],
      userTypeBreakdown: [
        {
          userType: 'shipper',
          userCount: 0,
          riskyUserCount: 0,
          disabledUserCount: 0,
          activeSessionUserCount: 0,
        },
        {
          userType: 'driver',
          userCount: 1,
          riskyUserCount: 1,
          disabledUserCount: 0,
          activeSessionUserCount: 1,
        },
        {
          userType: 'admin',
          userCount: 0,
          riskyUserCount: 0,
          disabledUserCount: 0,
          activeSessionUserCount: 0,
        },
      ],
      riskTagBreakdown: [
        {
          riskTag: 'shared_device',
          userCount: 1,
        },
        {
          riskTag: 'high_session_volume',
          userCount: 1,
        },
        {
          riskTag: 'admin_multi_device',
          userCount: 0,
        },
      ],
      topRiskAccounts: [
        {
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          userType: 'driver',
          status: 'active',
          createdAtIso: '2026-06-10T08:00:00.000Z',
          updatedAtIso: '2026-06-26T05:40:00.000Z',
          activeSessionCount: 3,
          activeDeviceCount: 3,
          latestSessionCreatedAtIso: '2026-06-26T06:12:00.000Z',
          riskLevel: 'high',
          riskTags: ['shared_device', 'high_session_volume'],
        },
      ],
      governanceAuditSummary: {
        totalEventCount: 1,
        totalRevokedSessionCount: 1,
        latestEventCreatedAtIso: '2026-06-26T06:15:00.000Z',
        actionBreakdown: [
          {
            action: 'revoke_session',
            eventCount: 1,
            revokedSessionCount: 1,
          },
          {
            action: 'revoke_other_sessions',
            eventCount: 0,
            revokedSessionCount: 0,
          },
          {
            action: 'revoke_account_sessions',
            eventCount: 0,
            revokedSessionCount: 0,
          },
        ],
      },
      recentAuditEvents: [
        {
          id: 'audit-driver-revoke',
          actorAdminId: 'admin-1',
          actorAdminPhone: maskedAdminPhone,
          action: 'revoke_session',
          result: 'revoked',
          requestedSessionId: 'session-driver-risk',
          revokedCount: 1,
          subjects: [
            {
              sessionId: 'session-driver-risk',
              userId: 'driver-1',
              userPhone: maskedDriverPhone,
              userType: 'driver',
              deviceId: maskedSharedDevice,
            },
          ],
          createdAtIso: '2026-06-26T06:15:00.000Z',
        },
      ],
    });
    expect(authRepository.listPlatformUsers).toHaveBeenCalledTimes(1);
    expect(authRepository.listAllActiveRefreshSessions).toHaveBeenCalledTimes(1);
    expect(
      authRepository.listAdminAuthSessionGovernanceAuditEvents,
    ).toHaveBeenCalledTimes(1);
  });

  it('exports filtered admin auth accounts as csv', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();

    await expect(
      (service as unknown as {
        exportAdminAuthAccountsCsv: (query: {
          userType: 'driver';
          riskOnly: true;
        }) => Promise<string>;
      }).exportAdminAuthAccountsCsv({
        userType: 'driver',
        riskOnly: true,
      }),
    ).resolves.toBe(
      '\uFEFFuserId,userPhone,userType,status,riskLevel,riskTags,activeSessionCount,activeDeviceCount,activeDeviceIds,latestSessionCreatedAtIso,createdAtIso,updatedAtIso\r\n' +
        'driver-1,138****8001,driver,active,high,shared_device|high_session_volume,3,3,sha*******ice|dri**********d-2|dri******b-1,2026-06-26T06:12:00.000Z,2026-06-10T08:00:00.000Z,2026-06-26T05:40:00.000Z',
    );
    expect(authRepository.listPlatformUsers).toHaveBeenCalledTimes(1);
    expect(authRepository.listAllActiveRefreshSessions).toHaveBeenCalledTimes(1);
  });

  it('returns admin auth account detail with active sessions and related audit events', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();

    await expect(
      (service as unknown as {
        getAdminAuthAccountDetail: (
          actorAdminId: string,
          userId: string,
        ) => Promise<unknown>;
      }).getAdminAuthAccountDetail('admin-1', 'driver-1'),
    ).resolves.toEqual({
      account: {
        userId: 'driver-1',
        userPhone: maskedDriverPhone,
        userType: 'driver',
        status: 'active',
        createdAtIso: '2026-06-10T08:00:00.000Z',
        updatedAtIso: '2026-06-26T05:40:00.000Z',
        activeSessionCount: 3,
        activeDeviceCount: 3,
        latestSessionCreatedAtIso: '2026-06-26T06:12:00.000Z',
        riskLevel: 'high',
        riskTags: ['shared_device', 'high_session_volume'],
      },
      activeSessions: [
        {
          id: 'session-driver-risk',
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          userType: 'driver',
          deviceId: maskedSharedDevice,
          createdAtIso: '2026-06-26T06:12:00.000Z',
          expiresAtIso: '2026-07-03T06:12:00.000Z',
          isCurrentUser: false,
          riskLevel: 'high',
          riskTags: ['shared_device', 'high_session_volume'],
          riskContext: {
            deviceSessionCount: 2,
            deviceUserCount: 2,
            userSessionCount: 3,
          },
        },
        {
          id: 'session-driver-2',
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          userType: 'driver',
          deviceId: maskedDriverAndroid2,
          createdAtIso: '2026-06-26T06:10:00.000Z',
          expiresAtIso: '2026-07-03T06:10:00.000Z',
          isCurrentUser: false,
          riskLevel: 'warning',
          riskTags: ['high_session_volume'],
          riskContext: {
            deviceSessionCount: 1,
            deviceUserCount: 1,
            userSessionCount: 3,
          },
        },
        {
          id: 'session-driver-3',
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          userType: 'driver',
          deviceId: maskedDriverWeb1,
          createdAtIso: '2026-06-26T06:07:00.000Z',
          expiresAtIso: '2026-07-03T06:07:00.000Z',
          isCurrentUser: false,
          riskLevel: 'warning',
          riskTags: ['high_session_volume'],
          riskContext: {
            deviceSessionCount: 1,
            deviceUserCount: 1,
            userSessionCount: 3,
          },
        },
      ],
      recentAuditEvents: [
        {
          id: 'audit-driver-revoke',
          actorAdminId: 'admin-1',
          actorAdminPhone: maskedAdminPhone,
          action: 'revoke_session',
          result: 'revoked',
          requestedSessionId: 'session-driver-risk',
          revokedCount: 1,
          subjects: [
            {
              sessionId: 'session-driver-risk',
              userId: 'driver-1',
              userPhone: maskedDriverPhone,
              userType: 'driver',
              deviceId: maskedSharedDevice,
            },
          ],
          createdAtIso: '2026-06-26T06:15:00.000Z',
        },
      ],
    });
    expect(authRepository.listPlatformUsers).toHaveBeenCalledTimes(1);
    expect(
      authRepository.listAdminAuthSessionGovernanceAuditEvents,
    ).toHaveBeenCalledTimes(1);
  });

  it('disables a platform account, revokes all active sessions and records audit', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();
    (authRepository as AuthRepository & {
      updateUserStatus: jest.Mock;
    }).updateUserStatus = jest.fn().mockResolvedValue({
      id: 'driver-1',
      phone: '13800138001',
      userType: 'driver',
      status: 'disabled',
    });

    await expect(
      (service as unknown as {
        updateAdminAuthAccountStatus: (
          actorAdminId: string,
          targetUserId: string,
          status: 'active' | 'disabled',
        ) => Promise<unknown>;
      }).updateAdminAuthAccountStatus('admin-1', 'driver-1', 'disabled'),
    ).resolves.toEqual({
      userId: 'driver-1',
      status: 'disabled',
      revokedSessionCount: 3,
    });
    expect(
      (authRepository as AuthRepository & { updateUserStatus: jest.Mock })
        .updateUserStatus,
    ).toHaveBeenCalledWith('driver-1', 'disabled');
    expect(authRepository.revokeUserRefreshSessions).toHaveBeenCalledWith(
      'driver-1',
      now,
    );
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenCalledWith({
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_account_sessions',
      result: 'revoked',
      revokedCount: 3,
      subjects: [
        {
          sessionId: 'session-driver-risk',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'shared-device',
        },
        {
          sessionId: 'session-driver-2',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-android-2',
        },
        {
          sessionId: 'session-driver-3',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-web-1',
        },
      ],
    });
  });

  it('rejects disabling the current admin account', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();
    (authRepository as AuthRepository & {
      updateUserStatus: jest.Mock;
    }).updateUserStatus = jest.fn();

    await expect(
      (service as unknown as {
        updateAdminAuthAccountStatus: (
          actorAdminId: string,
          targetUserId: string,
          status: 'active' | 'disabled',
        ) => Promise<unknown>;
      }).updateAdminAuthAccountStatus('admin-1', 'admin-1', 'disabled'),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '不能禁用当前管理员账号'),
    );
    expect(
      (authRepository as AuthRepository & { updateUserStatus: jest.Mock })
        .updateUserStatus,
    ).not.toHaveBeenCalled();
  });

  it('batch disables platform accounts and records audit per account', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();
    const batchUpdateUserStatuses = jest.fn().mockResolvedValue({
      items: [
        {
          user: {
            id: 'driver-1',
            phone: '13800138001',
            userType: 'driver',
            status: 'disabled',
          },
          revokedSessions: [
            {
              id: 'session-driver-risk',
              userId: 'driver-1',
              refreshToken: '',
              deviceId: 'shared-device',
              createdAt: new Date('2026-06-26T06:12:00.000Z'),
              expiresAt: new Date('2026-07-03T06:12:00.000Z'),
            },
            {
              id: 'session-driver-2',
              userId: 'driver-1',
              refreshToken: '',
              deviceId: 'driver-android-2',
              createdAt: new Date('2026-06-26T06:10:00.000Z'),
              expiresAt: new Date('2026-07-03T06:10:00.000Z'),
            },
            {
              id: 'session-driver-3',
              userId: 'driver-1',
              refreshToken: '',
              deviceId: 'driver-web-1',
              createdAt: new Date('2026-06-26T06:07:00.000Z'),
              expiresAt: new Date('2026-07-03T06:07:00.000Z'),
            },
          ],
        },
        {
          user: {
            id: 'shipper-2',
            phone: '13800138003',
            userType: 'shipper',
            status: 'disabled',
          },
          revokedSessions: [
            {
              id: 'session-shipper-safe',
              userId: 'shipper-2',
              refreshToken: '',
              deviceId: 'shipper-ios-2',
              createdAt: new Date('2026-06-26T06:06:00.000Z'),
              expiresAt: new Date('2026-07-03T06:06:00.000Z'),
            },
          ],
        },
      ],
    });
    (authRepository as AuthRepository & {
      batchUpdateUserStatuses: jest.Mock;
    }).batchUpdateUserStatuses = batchUpdateUserStatuses;

    await expect(
      (service as unknown as {
        batchUpdateAdminAuthAccountStatus: (
          actorAdminId: string,
          input: {
            items: { userId: string }[];
            status: 'active' | 'disabled';
          },
        ) => Promise<unknown>;
      }).batchUpdateAdminAuthAccountStatus('admin-1', {
        items: [{ userId: 'driver-1' }, { userId: 'shipper-2' }],
        status: 'disabled',
      }),
    ).resolves.toEqual({
      status: 'disabled',
      userIds: ['driver-1', 'shipper-2'],
      updatedCount: 2,
      revokedSessionCount: 4,
      items: [
        {
          userId: 'driver-1',
          status: 'disabled',
          revokedSessionCount: 3,
        },
        {
          userId: 'shipper-2',
          status: 'disabled',
          revokedSessionCount: 1,
        },
      ],
    });
    expect(batchUpdateUserStatuses).toHaveBeenCalledWith(
      {
        items: [{ userId: 'driver-1' }, { userId: 'shipper-2' }],
        status: 'disabled',
      },
      now,
    );
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenNthCalledWith(1, {
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_account_sessions',
      result: 'revoked',
      revokedCount: 3,
      subjects: [
        {
          sessionId: 'session-driver-risk',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'shared-device',
        },
        {
          sessionId: 'session-driver-2',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-android-2',
        },
        {
          sessionId: 'session-driver-3',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-web-1',
        },
      ],
    });
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenNthCalledWith(2, {
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_account_sessions',
      result: 'revoked',
      revokedCount: 1,
      subjects: [
        {
          sessionId: 'session-shipper-safe',
          userId: 'shipper-2',
          userPhone: '13800138003',
          userType: 'shipper',
          deviceId: 'shipper-ios-2',
        },
      ],
    });
  });

  it('rejects batch disabling the current admin account before repository writes', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();
    const batchUpdateUserStatuses = jest.fn();
    (authRepository as AuthRepository & {
      batchUpdateUserStatuses: jest.Mock;
    }).batchUpdateUserStatuses = batchUpdateUserStatuses;

    await expect(
      (service as unknown as {
        batchUpdateAdminAuthAccountStatus: (
          actorAdminId: string,
          input: {
            items: { userId: string }[];
            status: 'active' | 'disabled';
          },
        ) => Promise<unknown>;
      }).batchUpdateAdminAuthAccountStatus('admin-1', {
        items: [{ userId: 'driver-1' }, { userId: 'admin-1' }],
        status: 'disabled',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '不能禁用当前管理员账号'),
    );
    expect(batchUpdateUserStatuses).not.toHaveBeenCalled();
  });

  it('revokes admin-managed account sessions while keeping one session', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();

    await expect(
      (service as unknown as {
        revokeAdminAuthAccountSessions: (
          actorAdminId: string,
          targetUserId: string,
          keepSessionId?: string,
        ) => Promise<unknown>;
      }).revokeAdminAuthAccountSessions(
        'admin-1',
        'driver-1',
        'session-driver-2',
      ),
    ).resolves.toEqual({
      userId: 'driver-1',
      revokedCount: 2,
      keepSessionId: 'session-driver-2',
    });
    expect(authRepository.revokeUserRefreshSession).toHaveBeenNthCalledWith(
      1,
      'driver-1',
      'session-driver-risk',
      now,
    );
    expect(authRepository.revokeUserRefreshSession).toHaveBeenNthCalledWith(
      2,
      'driver-1',
      'session-driver-3',
      now,
    );
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenCalledWith({
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_account_sessions',
      result: 'revoked',
      revokedCount: 2,
      subjects: [
        {
          sessionId: 'session-driver-risk',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'shared-device',
        },
        {
          sessionId: 'session-driver-3',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-web-1',
        },
      ],
    });
  });

  it('batch revokes admin-managed account sessions and records audit per account', async () => {
    const { service, authRepository } = createServiceWithAccountManagementData();
    const batchRevokeUserRefreshSessions = jest.fn().mockResolvedValue({
      items: [
        {
          user: {
            id: 'driver-1',
            phone: '13800138001',
            userType: 'driver',
            status: 'active',
          },
          revokedSessions: [
            {
              id: 'session-driver-risk',
              userId: 'driver-1',
              refreshToken: '',
              deviceId: 'shared-device',
              createdAt: new Date('2026-06-26T06:12:00.000Z'),
              expiresAt: new Date('2026-07-03T06:12:00.000Z'),
            },
            {
              id: 'session-driver-3',
              userId: 'driver-1',
              refreshToken: '',
              deviceId: 'driver-web-1',
              createdAt: new Date('2026-06-26T06:07:00.000Z'),
              expiresAt: new Date('2026-07-03T06:07:00.000Z'),
            },
          ],
          keepSessionId: 'session-driver-2',
        },
        {
          user: {
            id: 'shipper-1',
            phone: '13800138002',
            userType: 'shipper',
            status: 'disabled',
          },
          revokedSessions: [
            {
              id: 'session-shipper-shared',
              userId: 'shipper-1',
              refreshToken: '',
              deviceId: 'shared-device',
              createdAt: new Date('2026-06-26T06:08:00.000Z'),
              expiresAt: new Date('2026-07-03T06:08:00.000Z'),
            },
          ],
        },
      ],
    });
    (authRepository as AuthRepository & {
      batchRevokeUserRefreshSessions: jest.Mock;
    }).batchRevokeUserRefreshSessions = batchRevokeUserRefreshSessions;

    await expect(
      (service as unknown as {
        batchRevokeAdminAuthAccountSessions: (
          actorAdminId: string,
          input: {
            items: { userId: string; keepSessionId?: string }[];
          },
        ) => Promise<unknown>;
      }).batchRevokeAdminAuthAccountSessions('admin-1', {
        items: [
          { userId: 'driver-1', keepSessionId: 'session-driver-2' },
          { userId: 'shipper-1' },
        ],
      }),
    ).resolves.toEqual({
      userIds: ['driver-1', 'shipper-1'],
      updatedCount: 2,
      revokedCount: 3,
      items: [
        {
          userId: 'driver-1',
          revokedCount: 2,
          keepSessionId: 'session-driver-2',
        },
        {
          userId: 'shipper-1',
          revokedCount: 1,
        },
      ],
    });
    expect(batchRevokeUserRefreshSessions).toHaveBeenCalledWith(
      {
        items: [
          { userId: 'driver-1', keepSessionId: 'session-driver-2' },
          { userId: 'shipper-1' },
        ],
      },
      now,
    );
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenNthCalledWith(1, {
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_account_sessions',
      result: 'revoked',
      revokedCount: 2,
      subjects: [
        {
          sessionId: 'session-driver-risk',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'shared-device',
        },
        {
          sessionId: 'session-driver-3',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-web-1',
        },
      ],
    });
    expect(
      authRepository.saveAdminAuthSessionGovernanceAuditEvent,
    ).toHaveBeenNthCalledWith(2, {
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_account_sessions',
      result: 'revoked',
      revokedCount: 1,
      subjects: [
        {
          sessionId: 'session-shipper-shared',
          userId: 'shipper-1',
          userPhone: '13800138002',
          userType: 'shipper',
          deviceId: 'shared-device',
        },
      ],
    });
  });

  it('rejects an invalid code', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });

    await expect(
      service.login({
        phone: '13800138000',
        code: '000000',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误'),
    );
  });

  it('rejects login for a disabled user', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn().mockResolvedValue({
        id: 'db-user-disabled',
        phone: '13800138000',
        userType: 'shipper',
        status: 'disabled',
      }),
      findUserById: jest.fn(),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await service.sendCode({ phone: '13800138000', purpose: 'login' });

    await expect(
      service.login({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_USER_DISABLED',
      message: '账号已禁用',
    });
    expect(authRepository.revokeUserDeviceRefreshSessions).not.toHaveBeenCalled();
    expect(authRepository.saveRefreshSession).not.toHaveBeenCalled();
  });

  it('rejects an expired verification code with an expired-code business error', async () => {
    const { service, advanceBySeconds } = createServiceWithClock();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    advanceBySeconds(301);

    await expect(
      service.login({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_CODE_EXPIRED, '验证码已过期'),
    );
  });

  it('rotates the refresh token and revokes the previous token', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const loginResult = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    const result = await service.refresh({
      refreshToken: loginResult.tokens.refreshToken,
      deviceId: 'device-1',
    });

    await expect(service.getCurrentUser(result.accessToken)).resolves.toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(result.refreshToken).toMatch(/^refresh\.[A-Za-z0-9_-]+$/);
    expect(result.refreshToken).not.toContain('local-user-13800138000');
    expect(result.refreshToken).not.toBe(loginResult.tokens.refreshToken);

    await expect(
      service.refresh({
        refreshToken: loginResult.tokens.refreshToken,
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        '刷新令牌无效',
      ),
    );

    const rotatedAgain = await service.refresh({
      refreshToken: result.refreshToken,
      deviceId: 'device-1',
    });
    await expect(
      service.getCurrentUser(rotatedAgain.accessToken),
    ).resolves.toMatchObject({
      id: 'local-user-13800138000',
    });
  });

  it('rejects an invalid refresh token as a business error', async () => {
    const { service } = createService();

    await expect(
      service.refresh({
        refreshToken: 'bad-token',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        '刷新令牌无效',
      ),
    );
  });

  it('rejects refresh when the active session user no longer exists', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const refreshToken = tokenService.issueTokenPair(
      'db-user-missing',
    ).refreshToken;
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue(undefined),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn().mockResolvedValue({
        userId: 'db-user-missing',
        refreshToken,
        deviceId: 'device-1',
        expiresAt: new Date('2026-07-03T06:00:00.000Z'),
      }),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.refresh({
        refreshToken,
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        '刷新令牌无效',
      ),
    );
    expect(authRepository.revokeRefreshSession).toHaveBeenCalledWith(
      refreshToken,
      'device-1',
      now,
    );
    expect(authRepository.saveRefreshSession).not.toHaveBeenCalled();
  });

  it('rejects refresh for a disabled user and revokes the active session', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const refreshToken = tokenService.issueTokenPair(
      'db-user-disabled',
    ).refreshToken;
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'db-user-disabled',
        phone: '13800138000',
        userType: 'shipper',
        status: 'disabled',
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn().mockResolvedValue({
        userId: 'db-user-disabled',
        refreshToken,
        deviceId: 'device-1',
        expiresAt: new Date('2026-07-03T06:00:00.000Z'),
      }),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(
      service.refresh({
        refreshToken,
        deviceId: 'device-1',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_USER_DISABLED',
      message: '账号已禁用',
    });
    expect(authRepository.revokeRefreshSession).toHaveBeenCalledWith(
      refreshToken,
      'device-1',
      now,
    );
    expect(authRepository.saveRefreshSession).not.toHaveBeenCalled();
  });

  it('returns the current local user from an access token', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const loginResult = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    await expect(
      service.getCurrentUser(loginResult.tokens.accessToken),
    ).resolves.toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
    });
  });

  it('rejects an invalid access token as a business error', async () => {
    const { service } = createService();

    await expect(service.getCurrentUser('bad-token')).rejects.toMatchObject({
      code: 'AUTH_ACCESS_TOKEN_INVALID',
      message: '访问令牌无效',
    });
  });

  it('rejects an access token for a missing user', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const service = new AuthService(codeStore, tokenService, () => now);
    const token = tokenService.issueTokenPair(
      'local-user-13900139000',
    ).accessToken;

    await expect(service.getCurrentUser(token)).rejects.toMatchObject({
      code: 'AUTH_ACCESS_TOKEN_INVALID',
      message: '访问令牌无效',
    });
  });

  it('rejects an access token for a disabled user', async () => {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => now,
    });
    const token = tokenService.issueTokenPair(
      'db-user-disabled',
    ).accessToken;
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn().mockResolvedValue({
        id: 'db-user-disabled',
        phone: '13800138000',
        userType: 'shipper',
        status: 'disabled',
      }),
      findUserByPhone: jest.fn(),
      findPlatformUserByPhone: jest.fn(),
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
    };
    const service = new AuthService(
      codeStore,
      tokenService,
      () => now,
      authRepository,
    );

    await expect(service.getCurrentUser(token)).rejects.toMatchObject({
      code: 'AUTH_USER_DISABLED',
      message: '账号已禁用',
    });
  });

  it('rejects a tampered access token as a business error', async () => {
    const { service } = createService();

    await expect(
      service.getCurrentUser(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsb2NhbC11c2VyLTEzODAwMTM4MDAwIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc4MjQ1MzYwMCwiZXhwIjoxNzgyNDU0NTAwfQ.bad-signature',
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_ACCESS_TOKEN_INVALID',
      message: '访问令牌无效',
    });
  });

  it('logs out a local refresh token boundary', async () => {
    const { service } = createService();

    await service.sendCode({ phone: '13800138000', purpose: 'login' });
    const loginResult = await service.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    await expect(
      service.logout({
        refreshToken: loginResult.tokens.refreshToken,
        deviceId: 'device-1',
      }),
    ).resolves.toEqual({
      loggedOut: true,
    });

    await expect(
      service.refresh({
        refreshToken: loginResult.tokens.refreshToken,
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        '刷新令牌无效',
      ),
    );
  });
});

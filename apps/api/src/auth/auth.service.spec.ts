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
      findUserById: jest.fn(),
      findUserByPhone: jest.fn().mockResolvedValue({
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
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
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
      saveRefreshSession: jest.fn(),
      findActiveRefreshSession: jest.fn(),
      revokeRefreshSession: jest.fn(),
      revokeUserDeviceRefreshSessions: jest.fn(),
      revokeUserRefreshSessions: jest.fn(),
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

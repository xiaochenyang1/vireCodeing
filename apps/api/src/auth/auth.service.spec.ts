import { ApiErrorCode, BusinessError } from '../common/errors';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';

describe('AuthService', () => {
  const now = new Date('2026-06-26T06:00:00.000Z');

  function createService() {
    const codeStore = new InMemoryVerificationCodeStore(() => now);
    const tokenService = new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
    });

    return {
      service: new AuthService(codeStore, tokenService, () => now),
      codeStore,
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
    expect(codeStore.findActiveCode('13800138000', 'login')).toMatchObject({
      code: '123456',
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
    expect(result.tokens.accessToken).toContain('access.local-user-13800138000');
    expect(result.tokens.refreshToken).toContain(
      'refresh.local-user-13800138000',
    );
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

  it('refreshes a local token pair', async () => {
    const { service } = createService();

    const result = await service.refresh({
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'device-1',
    });

    expect(result.accessToken).toBe('access.local-user-13800138000.900');
    expect(result.refreshToken).toBe('refresh.local-user-13800138000.604800');
  });
});

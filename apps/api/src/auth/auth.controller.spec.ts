import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

describe('AuthController', () => {
  function createController() {
    const now = new Date('2026-06-26T06:00:00.000Z');
    const service = new AuthService(
      new InMemoryVerificationCodeStore(() => now),
      new TokenService({
        accessTtlSeconds: 900,
        refreshTtlSeconds: 604800,
        accessTokenSecret: 'test-access-secret',
        now: () => now,
      }),
      () => now,
    );

    return new AuthController(service);
  }

  it('returns the guard-injected current user', async () => {
    const controller = createController();

    await controller.sendCode({
      phone: '13800138000',
      purpose: 'login',
    });
    const loginResponse = await controller.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });
    const request: AuthenticatedRequest = {
      currentUser: loginResponse.data.user,
    };

    await expect(controller.getMe(request)).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'local-user-13800138000',
        phone: '13800138000',
        userType: 'shipper',
      },
    });
  });

  it('propagates request id headers in successful auth responses', async () => {
    const controller = createController();

    await expect(
      controller.sendCode(
        {
          phone: '13800138000',
          purpose: 'login',
        },
        {
          headers: {
            'x-request-id': 'req_success',
          },
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_success',
    });
  });

  it('protects the current user route with a guard', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.getMe) ??
      [];

    expect(guards).toEqual([AccessTokenGuard]);
  });

  it('protects the change password route with a guard', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype.changePassword,
      ) ?? [];

    expect(guards).toEqual([AccessTokenGuard]);
  });

  it('validates auth request bodies through zod pipes at the Nest boundary', () => {
    expect(hasZodBodyPipe('sendCode')).toBe(true);
    expect(hasZodBodyPipe('login')).toBe(true);
    expect(hasZodBodyPipe('passwordLogin' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('register' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('resetPassword' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('changePassword' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('refresh')).toBe(true);
    expect(hasZodBodyPipe('logout')).toBe(true);
  });

  it('registers through the auth controller', async () => {
    const controller = createController();

    await controller.sendCode({
      phone: '13800138000',
      purpose: 'register',
    });

    await expect(
      controller.register({
        phone: '13800138000',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
        password: 'abc123',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        user: {
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      },
    });
  });

  it('logs in with a password through the auth controller', async () => {
    const controller = createController();

    await controller.sendCode({
      phone: '13800138000',
      purpose: 'register',
    });
    await controller.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });

    await expect(
      controller.passwordLogin({
        phone: '13800138000',
        password: 'abc123',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        user: {
          phone: '13800138000',
          userType: 'shipper',
        },
        tokens: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      },
    });
  });

  it('resets a password through the auth controller', async () => {
    const controller = createController();

    await controller.sendCode({
      phone: '13800138000',
      purpose: 'register',
    });
    await controller.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });
    await controller.sendCode({
      phone: '13800138000',
      purpose: 'reset',
    });

    await expect(
      controller.resetPassword({
        phone: '13800138000',
        code: '123456',
        password: 'newabc123',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        reset: true,
      },
    });
    await expect(
      controller.passwordLogin({
        phone: '13800138000',
        password: 'newabc123',
        userType: 'shipper',
        deviceId: 'device-password',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        user: {
          phone: '13800138000',
        },
      },
    });
  });

  it('changes a password through the auth controller for the guard-injected user', async () => {
    const controller = createController();

    await controller.sendCode({
      phone: '13800138000',
      purpose: 'register',
    });
    const registerResponse = await controller.register({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-register',
      password: 'abc123',
    });

    await expect(
      controller.changePassword(
        {
          currentPassword: 'abc123',
          newPassword: 'newabc123',
        },
        {
          currentUser: registerResponse.data.user,
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        changed: true,
      },
    });
    await expect(
      controller.passwordLogin({
        phone: '13800138000',
        password: 'newabc123',
        userType: 'shipper',
        deviceId: 'device-password',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        user: {
          phone: '13800138000',
        },
      },
    });
  });

  it('logs out through the auth controller', async () => {
    const controller = createController();

    await expect(
      controller.logout({
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
        deviceId: 'device-1',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        loggedOut: true,
      },
    });
  });

  it('rejects invalid login request bodies before service execution', async () => {
    const controller = createController();

    await expect(
      controller.login({
        phone: 'bad-phone',
        code: '123456',
        userType: 'shipper',
        deviceId: 'device-1',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.VALIDATION_ERROR, '手机号格式不正确'),
    );
  });
});

function hasZodBodyPipe(methodName: keyof AuthController) {
  const routeArgs =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, AuthController, methodName) ?? {};

  return Object.values(routeArgs).some(metadata => {
    const pipes = (metadata as { pipes?: unknown[] }).pipes ?? [];

    return pipes.some(pipe => pipe instanceof ZodValidationPipe);
  });
}

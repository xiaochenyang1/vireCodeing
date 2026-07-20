import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';
import { AdminOnlyGuard } from './role.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AuthRepository } from './auth.repository';
import { hashPassword } from './password-hasher';

describe('AuthController', () => {
  const maskedAdminPhone = '139****9000';
  const maskedDriverPhone = '138****8001';
  const maskedAdminConsoleDevice = 'adm**************ice';
  const maskedAdminDevice2 = 'adm********e-2';
  const maskedDriverAndroid1 = 'dri**********d-1';
  const maskedSharedDevice = 'sha*******ice';

  function createController(authRepository?: AuthRepository) {
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
      authRepository,
    );

    return new AuthController(service);
  }

  function createAccountManagementAuthRepository(): AuthRepository {
    return {
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
          id: 'session-driver-risk',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
        {
          id: 'session-driver-2',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440102',
          deviceId: 'driver-android-2',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
        {
          id: 'session-shipper-shared',
          userId: 'shipper-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:09:00.000Z'),
          expiresAt: new Date('2026-07-03T06:09:00.000Z'),
        },
        {
          id: 'session-driver-3',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440104',
          deviceId: 'driver-web-1',
          createdAt: new Date('2026-06-26T06:07:00.000Z'),
          expiresAt: new Date('2026-07-03T06:07:00.000Z'),
        },
      ]),
      listPlatformUsers: jest.fn().mockResolvedValue([
        {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
          status: 'active',
          createdAt: new Date('2026-06-01T06:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:59:00.000Z'),
        },
        {
          id: 'driver-1',
          phone: '13800138001',
          userType: 'driver',
          status: 'active',
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:40:00.000Z'),
        },
        {
          id: 'shipper-1',
          phone: '13800138002',
          userType: 'shipper',
          status: 'active',
          createdAt: new Date('2026-06-05T08:00:00.000Z'),
          updatedAt: new Date('2026-06-25T08:00:00.000Z'),
        },
      ]),
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
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };
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

  it('protects admin session governance routes with access-token and admin guards', () => {
    const listGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype.getAdminAuthSessions,
      ) ?? [];
    const auditGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype.getAdminAuthSessionGovernanceAuditEvents,
      ) ?? [];
    const revokeGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype.revokeAdminAuthSession,
      ) ?? [];
    const revokeOtherGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        AuthController.prototype.revokeOtherAdminAuthSessions,
      ) ?? [];

    expect(listGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(auditGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(revokeGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(revokeOtherGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
  });

  it('protects admin auth account management routes with access-token and admin guards', () => {
    const prototype = AuthController.prototype as unknown as Record<
      string,
      object
    >;
    const listGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        prototype.getAdminAuthAccounts,
      ) ?? [];
    const detailGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        prototype.getAdminAuthAccountDetail,
      ) ?? [];
    const statusGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        prototype.updateAdminAuthAccountStatus,
      ) ?? [];
    const reportGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        prototype.getAdminAuthAccountReport,
      ) ?? [];
    const exportGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        prototype.exportAdminAuthAccounts,
      ) ?? [];
    const revokeGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        prototype.revokeAdminAuthAccountSessions,
      ) ?? [];

    expect(listGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(detailGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(statusGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(reportGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(exportGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
    expect(revokeGuards).toEqual([AccessTokenGuard, AdminOnlyGuard]);
  });

  it('validates auth request bodies through zod pipes at the Nest boundary', () => {
    expect(hasZodBodyPipe('sendCode')).toBe(true);
    expect(hasZodBodyPipe('login')).toBe(true);
    expect(hasZodBodyPipe('passwordLogin' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('adminPasswordLogin' as keyof AuthController)).toBe(
      true,
    );
    expect(hasZodBodyPipe('register' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('resetPassword' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('changePassword' as keyof AuthController)).toBe(true);
    expect(hasZodBodyPipe('refresh')).toBe(true);
    expect(hasZodBodyPipe('logout')).toBe(true);
    expect(
      hasZodBodyPipe('revokeOtherAdminAuthSessions' as keyof AuthController),
    ).toBe(true);
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

  it('logs in an admin with the dedicated admin password route through the auth controller', async () => {
    const now = new Date('2026-06-26T06:00:00.000Z');
    const authRepository: AuthRepository = {
      upsertMobileUser: jest.fn(),
      findUserById: jest.fn(),
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
    const controller = createController(authRepository);

    await expect(
      controller.adminPasswordLogin({
        phone: '13900139000',
        password: 'Admin123',
        deviceId: 'admin-console-device',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        user: {
          phone: '13900139000',
          userType: 'admin',
        },
        tokens: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      },
    });
    expect(authRepository.upsertMobileUser).not.toHaveBeenCalled();
    expect(authRepository.revokeUserDeviceRefreshSessions).toHaveBeenCalledWith(
      'admin-1',
      'admin-console-device',
      now,
    );
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

  it('lists active admin sessions through the auth controller', async () => {
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
      ]),
      revokeUserRefreshSession: jest.fn(),
    };
    const controller = createController(authRepository);

    await expect(
      controller.getAdminAuthSessions({
        headers: {
          'x-request-id': 'req_admin_sessions',
        },
        currentUser: {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
        },
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_sessions',
      data: {
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
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });
  });

  it('lists filtered platform sessions through the auth controller', async () => {
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
          id: 'session-driver-1',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440001',
          deviceId: 'driver-android-1',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };
    const controller = createController(authRepository);

    await expect(
      controller.getAdminAuthSessions(
        {
          headers: {
            'x-request-id': 'req_admin_sessions_all',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        },
        {
          scope: 'all',
          userType: 'driver',
          keyword: 'android',
          page: 1,
          pageSize: 20,
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_sessions_all',
      data: {
        sessions: [
          {
            id: 'session-driver-1',
            userId: 'driver-1',
            userPhone: maskedDriverPhone,
            userType: 'driver',
            deviceId: maskedDriverAndroid1,
            isCurrentUser: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });
  });

  it('lists risky platform sessions with risk filters through the auth controller', async () => {
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
          id: 'session-driver-risk',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
        {
          id: 'session-driver-2',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440102',
          deviceId: 'driver-android-2',
          createdAt: new Date('2026-06-26T06:11:00.000Z'),
          expiresAt: new Date('2026-07-03T06:11:00.000Z'),
        },
        {
          id: 'session-driver-3',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
          deviceId: 'driver-web-1',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
        {
          id: 'session-shipper-shared',
          userId: 'shipper-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440104',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:09:00.000Z'),
          expiresAt: new Date('2026-07-03T06:09:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };
    const controller = createController(authRepository);

    await expect(
      controller.getAdminAuthSessions(
        {
          headers: {
            'x-request-id': 'req_admin_sessions_risk',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        },
        {
          scope: 'all',
          userType: 'driver',
          keyword: 'shared',
          riskOnly: true,
          riskTag: 'shared_device',
          page: 1,
          pageSize: 20,
        } as never,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_sessions_risk',
      data: {
        sessions: [
          {
            id: 'session-driver-risk',
            userId: 'driver-1',
            userPhone: maskedDriverPhone,
            userType: 'driver',
            deviceId: maskedSharedDevice,
            isCurrentUser: false,
            riskLevel: 'high',
            riskTags: ['shared_device', 'high_session_volume'],
            riskContext: {
              deviceSessionCount: 2,
              deviceUserCount: 2,
              userSessionCount: 3,
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        riskSummary: {
          riskySessionCount: expect.any(Number),
          sharedDeviceCount: expect.any(Number),
        },
      },
    });
  });

  it('lists session governance audit events through the auth controller', async () => {
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
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
      listAdminAuthSessionGovernanceAuditEvents: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
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
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
        },
      ]),
    };
    const controller = createController(authRepository);

    await expect(
      controller.getAdminAuthSessionGovernanceAuditEvents(
        {
          headers: {
            'x-request-id': 'req_admin_session_audit',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        },
        {
          action: 'revoke_session',
          result: 'revoked',
          keyword: 'android',
          page: 1,
          pageSize: 20,
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_session_audit',
      data: {
        events: [
          {
            id: 'audit-1',
            actorAdminId: 'admin-1',
            actorAdminPhone: maskedAdminPhone,
            action: 'revoke_session',
            result: 'revoked',
            requestedSessionId: '550e8400-e29b-41d4-a716-446655440111',
            revokedCount: 1,
            subjects: [
              {
                sessionId: '550e8400-e29b-41d4-a716-446655440111',
                userId: 'driver-1',
                userPhone: maskedDriverPhone,
                userType: 'driver',
                deviceId: maskedDriverAndroid1,
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });
  });

  it('lists admin auth accounts through the auth controller', async () => {
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
      listAllActiveRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-driver-risk',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
      ]),
      listPlatformUsers: jest.fn().mockResolvedValue([
        {
          id: 'driver-1',
          phone: '13800138001',
          userType: 'driver',
          status: 'active',
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:40:00.000Z'),
        },
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };
    const controller = createController(authRepository);

    await expect(
      (controller as unknown as {
        getAdminAuthAccounts: (
          request: AuthenticatedRequest,
          query: unknown,
        ) => Promise<unknown>;
      }).getAdminAuthAccounts(
        {
          headers: {
            'x-request-id': 'req_admin_accounts',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
        {
          userType: 'driver',
          page: 1,
          pageSize: 20,
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_accounts',
      data: {
        items: [
          {
            userId: 'driver-1',
            userPhone: maskedDriverPhone,
            userType: 'driver',
            status: 'active',
            activeSessionCount: 1,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        summary: {
          totalUserCount: 1,
          activeUserCount: 1,
          activeSessionUserCount: 1,
        },
      },
    });
  });

  it('gets admin auth account report through the auth controller', async () => {
    const controller = createController(createAccountManagementAuthRepository());

    await expect(
      (controller as unknown as {
        getAdminAuthAccountReport: (
          request: AuthenticatedRequest,
          query: unknown,
        ) => Promise<unknown>;
      }).getAdminAuthAccountReport(
        {
          headers: {
            'x-request-id': 'req_admin_account_report',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
        {
          userType: 'driver',
          riskOnly: true,
          topAccountsLimit: 3,
          auditEventLimit: 5,
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_account_report',
      data: {
        filters: {
          userType: 'driver',
          riskOnly: true,
        },
        summary: {
          totalUserCount: 1,
          highRiskUserCount: 1,
        },
        topRiskAccounts: [
          {
            userId: 'driver-1',
            userPhone: maskedDriverPhone,
            activeSessionCount: 3,
          },
        ],
        governanceAuditSummary: {
          totalEventCount: 1,
          totalRevokedSessionCount: 1,
        },
        recentAuditEvents: [
          {
            id: 'audit-driver-revoke',
            actorAdminPhone: maskedAdminPhone,
            action: 'revoke_session',
          },
        ],
      },
    });
  });

  it('exports admin auth accounts csv through the auth controller', async () => {
    const controller = createController(createAccountManagementAuthRepository());

    await expect(
      (controller as unknown as {
        exportAdminAuthAccounts: (
          request: AuthenticatedRequest,
          query: unknown,
        ) => Promise<string>;
      }).exportAdminAuthAccounts(
        {
          headers: {
            'x-request-id': 'req_admin_account_export',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
        {
          userType: 'driver',
          page: 1,
          pageSize: 20,
        },
      ),
    ).resolves.toBe(
      '\uFEFFuserId,userPhone,userType,status,riskLevel,riskTags,activeSessionCount,activeDeviceCount,activeDeviceIds,latestSessionCreatedAtIso,createdAtIso,updatedAtIso\r\n' +
        'driver-1,138****8001,driver,active,high,shared_device|high_session_volume,3,3,sha*******ice|dri**********d-2|dri******b-1,2026-06-26T06:12:00.000Z,2026-06-10T08:00:00.000Z,2026-06-26T05:40:00.000Z',
    );

    const headers =
      Reflect.getMetadata(
        HEADERS_METADATA,
        AuthController.prototype.exportAdminAuthAccounts,
      ) ?? [];

    expect(headers).toEqual(
      expect.arrayContaining([
        {
          name: 'content-type',
          value: 'text/csv; charset=utf-8',
        },
        {
          name: 'content-disposition',
          value: 'attachment; filename="admin-auth-accounts.csv"',
        },
      ]),
    );
  });

  it('gets admin auth account detail through the auth controller', async () => {
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
      listActiveUserRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-driver-risk',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
      ]),
      listAllActiveRefreshSessions: jest.fn(),
      listPlatformUsers: jest.fn().mockResolvedValue([
        {
          id: 'driver-1',
          phone: '13800138001',
          userType: 'driver',
          status: 'active',
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          updatedAt: new Date('2026-06-26T05:40:00.000Z'),
        },
      ]),
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
      ]),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    };
    const controller = createController(authRepository);

    await expect(
      (controller as unknown as {
        getAdminAuthAccountDetail: (
          userId: string,
          request: AuthenticatedRequest,
        ) => Promise<unknown>;
      }).getAdminAuthAccountDetail('driver-1', {
        headers: {
          'x-request-id': 'req_admin_account_detail',
        },
        currentUser: {
          id: 'admin-1',
          phone: '13900139000',
          userType: 'admin',
        },
      } as AuthenticatedRequest),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_account_detail',
      data: {
        account: {
          userId: 'driver-1',
          userPhone: maskedDriverPhone,
          activeSessionCount: 1,
        },
        activeSessions: [
          {
            id: 'session-driver-risk',
            userId: 'driver-1',
            userPhone: maskedDriverPhone,
            deviceId: maskedSharedDevice,
          },
        ],
        recentAuditEvents: [
          {
            id: 'audit-driver-revoke',
            actorAdminPhone: maskedAdminPhone,
            action: 'revoke_session',
          },
        ],
      },
    });
  });

  it('updates admin auth account status through the auth controller', async () => {
    const now = new Date('2026-06-26T06:00:00.000Z');
    const authRepository = {
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
      listActiveUserRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: 'session-driver-risk',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
      ]),
      listAllActiveRefreshSessions: jest.fn(),
      listPlatformUsers: jest.fn().mockResolvedValue([]),
      updateUserStatus: jest.fn().mockResolvedValue({
        id: 'driver-1',
        phone: '13800138001',
        userType: 'driver',
        status: 'disabled',
      }),
      saveAdminAuthSessionGovernanceAuditEvent: jest.fn(),
      revokeUserRefreshSession: jest.fn(),
      revokeRefreshSessionById: jest.fn(),
    } satisfies AuthRepository & {
      updateUserStatus: jest.Mock;
    };
    const controller = createController(authRepository);

    await expect(
      (controller as unknown as {
        updateAdminAuthAccountStatus: (
          userId: string,
          body: { status: 'active' | 'disabled' },
          request: AuthenticatedRequest,
        ) => Promise<unknown>;
      }).updateAdminAuthAccountStatus(
        'driver-1',
        {
          status: 'disabled',
        },
        {
          headers: {
            'x-request-id': 'req_admin_account_status',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_account_status',
      data: {
        userId: 'driver-1',
        status: 'disabled',
        revokedSessionCount: 1,
      },
    });
    expect(authRepository.updateUserStatus).toHaveBeenCalledWith(
      'driver-1',
      'disabled',
    );
    expect(authRepository.revokeUserRefreshSessions).toHaveBeenCalledWith(
      'driver-1',
      now,
    );
  });

  it('revokes admin auth account sessions through the auth controller', async () => {
    const now = new Date('2026-06-26T06:00:00.000Z');
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
      listActiveUserRefreshSessions: jest.fn().mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440111',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440101',
          deviceId: 'shared-device',
          createdAt: new Date('2026-06-26T06:12:00.000Z'),
          expiresAt: new Date('2026-07-03T06:12:00.000Z'),
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440112',
          userId: 'driver-1',
          refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440103',
          deviceId: 'driver-android-2',
          createdAt: new Date('2026-06-26T06:10:00.000Z'),
          expiresAt: new Date('2026-07-03T06:10:00.000Z'),
        },
      ]),
      listAllActiveRefreshSessions: jest.fn(),
      listPlatformUsers: jest.fn().mockResolvedValue([]),
      saveAdminAuthSessionGovernanceAuditEvent: jest.fn(),
      revokeUserRefreshSession: jest.fn().mockResolvedValue(true),
      revokeRefreshSessionById: jest.fn(),
    };
    const controller = createController(authRepository);

    await expect(
      (controller as unknown as {
        revokeAdminAuthAccountSessions: (
          userId: string,
          body: { keepSessionId?: string },
          request: AuthenticatedRequest,
        ) => Promise<unknown>;
      }).revokeAdminAuthAccountSessions(
        'driver-1',
        {
          keepSessionId: '550e8400-e29b-41d4-a716-446655440112',
        },
        {
          headers: {
            'x-request-id': 'req_admin_account_revoke',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        } as AuthenticatedRequest,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_account_revoke',
      data: {
        userId: 'driver-1',
        revokedCount: 1,
        keepSessionId: '550e8400-e29b-41d4-a716-446655440112',
      },
    });
    expect(authRepository.revokeUserRefreshSession).toHaveBeenCalledWith(
      'driver-1',
      '550e8400-e29b-41d4-a716-446655440111',
      now,
    );
  });

  it('revokes a selected admin session through the auth controller', async () => {
    const now = new Date('2026-06-26T06:00:00.000Z');
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
      listActiveUserRefreshSessions: jest.fn(),
      revokeUserRefreshSession: jest.fn().mockResolvedValue(true),
      revokeRefreshSessionById: jest.fn().mockResolvedValue(true),
    };
    const controller = createController(authRepository);

    await expect(
      controller.revokeAdminAuthSession(
        '550e8400-e29b-41d4-a716-446655440000',
        {
          headers: {
            'x-request-id': 'req_admin_revoke',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_revoke',
      data: {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        revoked: true,
      },
    });
    expect(authRepository.revokeRefreshSessionById).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      now,
    );
  });

  it('revokes other admin sessions through the auth controller', async () => {
    const now = new Date('2026-06-26T06:00:00.000Z');
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
      ]),
      revokeUserRefreshSession: jest.fn().mockResolvedValue(true),
    };
    const controller = createController(authRepository);

    await expect(
      controller.revokeOtherAdminAuthSessions(
        {
          currentDeviceId: 'admin-console-device',
        },
        {
          headers: {
            'x-request-id': 'req_admin_revoke_others',
          },
          currentUser: {
            id: 'admin-1',
            phone: '13900139000',
            userType: 'admin',
          },
        },
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      requestId: 'req_admin_revoke_others',
      data: {
        currentDeviceId: maskedAdminConsoleDevice,
        revokedCount: 1,
      },
    });
    expect(authRepository.revokeUserRefreshSession).toHaveBeenCalledWith(
      'admin-1',
      'session-2',
      now,
    );
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

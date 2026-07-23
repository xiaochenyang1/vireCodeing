import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemoryAuthRepository } from './auth.repository';

describe('InMemoryAuthRepository', () => {
  it('creates and reuses local users by phone', async () => {
    const repository = new InMemoryAuthRepository();

    const firstUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const secondUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });

    expect(firstUser).toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
      status: 'active',
    });
    expect(secondUser).toEqual(firstUser);
    await expect(repository.findUserById(firstUser.id)).resolves.toEqual(
      firstUser,
    );
    await expect(repository.findUserByPhone('13800138000')).resolves.toEqual(
      firstUser,
    );
    await expect(
      repository.findPlatformUserByPhone('13800138000'),
    ).resolves.toEqual(firstUser);
  });

  it('updates the existing local user type when the same phone logs in as another mobile role', async () => {
    const repository = new InMemoryAuthRepository();

    const shipperUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const driverUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'driver',
    });
    const shipperAgainUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });

    expect(driverUser).toEqual({
      ...shipperUser,
      userType: 'driver',
    });
    expect(shipperAgainUser).toEqual(shipperUser);
    await expect(repository.findUserById(shipperUser.id)).resolves.toEqual(
      shipperAgainUser,
    );
  });

  it('stores and preserves password hashes for local mobile users', async () => {
    const repository = new InMemoryAuthRepository();

    const registeredUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
      passwordHash: 'scrypt$hash-one',
    });
    const loginUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const changedPasswordUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
      passwordHash: 'scrypt$hash-two',
    });

    expect(registeredUser.passwordHash).toBe('scrypt$hash-one');
    expect(loginUser.passwordHash).toBe('scrypt$hash-one');
    expect(changedPasswordUser.passwordHash).toBe('scrypt$hash-two');
  });

  it('stores and revokes refresh sessions by token and device', async () => {
    const repository = new InMemoryAuthRepository(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await expect(
      repository.findActiveRefreshSession(
        'refresh.local-user-13800138000.604800',
        'device-1',
      ),
    ).resolves.toMatchObject({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'device-1',
    });

    await repository.revokeRefreshSession(
      'refresh.local-user-13800138000.604800',
      'device-1',
      new Date('2026-06-26T06:00:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession(
        'refresh.local-user-13800138000.604800',
        'device-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('revokes active refresh sessions by user and device', async () => {
    const repository = new InMemoryAuthRepository(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.same-device-old',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.other-device',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await repository.revokeUserDeviceRefreshSessions(
      'local-user-13800138000',
      'device-1',
      new Date('2026-06-26T06:10:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession(
        'refresh.same-device-old',
        'device-1',
      ),
    ).resolves.toBeUndefined();
    await expect(
      repository.findActiveRefreshSession('refresh.other-device', 'device-2'),
    ).resolves.toMatchObject({
      refreshToken: 'refresh.other-device',
      deviceId: 'device-2',
    });
  });

  it('revokes active refresh sessions across all user devices', async () => {
    const repository = new InMemoryAuthRepository(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'local-user-13900139000',
      refreshToken: 'refresh.other-user',
      deviceId: 'device-3',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await repository.revokeUserRefreshSessions(
      'local-user-13800138000',
      new Date('2026-06-26T06:10:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession('refresh.device-one', 'device-1'),
    ).resolves.toBeUndefined();
    await expect(
      repository.findActiveRefreshSession('refresh.device-two', 'device-2'),
    ).resolves.toBeUndefined();
    await expect(
      repository.findActiveRefreshSession('refresh.other-user', 'device-3'),
    ).resolves.toMatchObject({
      refreshToken: 'refresh.other-user',
      deviceId: 'device-3',
    });
  });

  it('lists active refresh sessions newest first and skips expired records', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });

    currentNow = new Date('2026-06-26T06:10:00.000Z');
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.expired-device',
      deviceId: 'device-expired',
      expiresAt: new Date('2026-06-26T06:09:00.000Z'),
    });

    await expect(
      repository.listActiveUserRefreshSessions('local-user-13800138000'),
    ).resolves.toMatchObject([
      {
        id: 'session-2',
        deviceId: 'device-2',
        createdAt: new Date('2026-06-26T06:05:00.000Z'),
      },
      {
        id: 'session-1',
        deviceId: 'device-1',
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
      },
    ]);
  });

  it('lists all active refresh sessions newest first across users', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: 'local-user-13900139000',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });

    currentNow = new Date('2026-06-26T06:10:00.000Z');
    await repository.saveRefreshSession({
      userId: 'local-user-13800138001',
      refreshToken: 'refresh.expired-device',
      deviceId: 'device-expired',
      expiresAt: new Date('2026-06-26T06:09:00.000Z'),
    });

    await expect(repository.listAllActiveRefreshSessions()).resolves.toMatchObject(
      [
        {
          id: 'session-2',
          userId: 'local-user-13900139000',
          deviceId: 'device-2',
          createdAt: new Date('2026-06-26T06:05:00.000Z'),
        },
        {
          id: 'session-1',
          userId: 'local-user-13800138000',
          deviceId: 'device-1',
          createdAt: new Date('2026-06-26T06:00:00.000Z'),
        },
      ],
    );
  });

  it('revokes an active refresh session by session id', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });

    const sessions = await repository.listActiveUserRefreshSessions(
      'local-user-13800138000',
    );

    await expect(
      repository.revokeUserRefreshSession(
        'local-user-13800138000',
        sessions[0]!.id,
        new Date('2026-06-26T06:10:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      repository.listActiveUserRefreshSessions('local-user-13800138000'),
    ).resolves.toMatchObject([
      {
        id: 'session-1',
        deviceId: 'device-1',
      },
    ]);
    await expect(
      repository.revokeUserRefreshSession(
        'local-user-13900139000',
        sessions[0]!.id,
      ),
    ).resolves.toBe(false);
  });

  it('revokes an active refresh session by session id without restricting user', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: 'local-user-13900139000',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });

    await expect(
      repository.revokeRefreshSessionById(
        'session-2',
        new Date('2026-06-26T06:10:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(repository.listAllActiveRefreshSessions()).resolves.toMatchObject([
      {
        id: 'session-1',
        userId: 'local-user-13800138000',
        deviceId: 'device-1',
      },
    ]);
    await expect(
      repository.revokeRefreshSessionById('session-missing'),
    ).resolves.toBe(false);
  });

  it('stores session governance audit events newest first', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);

    await repository.saveAdminAuthSessionGovernanceAuditEvent?.({
      actorAdminId: 'admin-1',
      actorAdminPhone: '13900139000',
      action: 'revoke_session',
      result: 'revoked',
      requestedSessionId: 'session-1',
      revokedCount: 1,
      subjects: [
        {
          sessionId: 'session-1',
          userId: 'driver-1',
          userPhone: '13800138001',
          userType: 'driver',
          deviceId: 'driver-android-1',
        },
      ],
    });

    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveAdminAuthSessionGovernanceAuditEvent?.({
      actorAdminId: 'admin-2',
      actorAdminPhone: '13900139002',
      action: 'revoke_other_sessions',
      result: 'noop',
      currentDeviceId: 'admin-console-device',
      revokedCount: 0,
      subjects: [],
    });

    await expect(
      repository.listAdminAuthSessionGovernanceAuditEvents?.(),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'admin-session-governance-audit-2',
        actorAdminId: 'admin-2',
        actorAdminPhone: '13900139002',
        action: 'revoke_other_sessions',
        result: 'noop',
        currentDeviceId: 'admin-console-device',
        revokedCount: 0,
        subjects: [],
        createdAt: new Date('2026-06-26T06:05:00.000Z'),
      }),
      expect.objectContaining({
        id: 'admin-session-governance-audit-1',
        actorAdminId: 'admin-1',
        actorAdminPhone: '13900139000',
        action: 'revoke_session',
        result: 'revoked',
        requestedSessionId: 'session-1',
        revokedCount: 1,
        subjects: [
          {
            sessionId: 'session-1',
            userId: 'driver-1',
            userPhone: '13800138001',
            userType: 'driver',
            deviceId: 'driver-android-1',
          },
        ],
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
      }),
    ]);
  });

  it('updates platform user status and refreshes updatedAt for local users', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);

    await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    currentNow = new Date('2026-06-26T06:10:00.000Z');

    await expect(
      (repository as unknown as {
        updateUserStatus: (
          userId: string,
          status: 'active' | 'disabled',
        ) => Promise<{
          id: string;
          phone: string;
          userType: 'shipper' | 'driver' | 'admin';
          status: 'active' | 'disabled';
        } | undefined>;
      }).updateUserStatus('local-user-13800138000', 'disabled'),
    ).resolves.toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
      status: 'disabled',
    });
    await expect(
      repository.findUserById('local-user-13800138000'),
    ).resolves.toMatchObject({
      status: 'disabled',
    });
    await expect(repository.listPlatformUsers?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'local-user-13800138000',
        status: 'disabled',
        updatedAt: new Date('2026-06-26T06:10:00.000Z'),
      }),
    ]);
  });

  it('batch updates platform user statuses and revokes staged sessions atomically', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);
    const firstUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const secondUser = await repository.upsertMobileUser({
      phone: '13800138001',
      userType: 'driver',
    });

    await repository.saveRefreshSession({
      userId: firstUser.id,
      refreshToken: 'refresh.first-device-1',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: secondUser.id,
      refreshToken: 'refresh.second-device-1',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:10:00.000Z');

    await expect(
      (repository as unknown as {
        batchUpdateUserStatuses: (input: {
          items: { userId: string }[];
          status: 'active' | 'disabled';
        }) => Promise<unknown>;
      }).batchUpdateUserStatuses({
        items: [{ userId: firstUser.id }, { userId: secondUser.id }],
        status: 'disabled',
      }),
    ).resolves.toEqual({
      items: [
        {
          user: {
            id: firstUser.id,
            phone: '13800138000',
            userType: 'shipper',
            status: 'disabled',
          },
          revokedSessions: [
            expect.objectContaining({
              id: 'session-1',
              userId: firstUser.id,
              deviceId: 'device-1',
            }),
          ],
        },
        {
          user: {
            id: secondUser.id,
            phone: '13800138001',
            userType: 'driver',
            status: 'disabled',
          },
          revokedSessions: [
            expect.objectContaining({
              id: 'session-2',
              userId: secondUser.id,
              deviceId: 'device-2',
            }),
          ],
        },
      ],
    });
    await expect(repository.findUserById(firstUser.id)).resolves.toMatchObject({
      status: 'disabled',
    });
    await expect(repository.findUserById(secondUser.id)).resolves.toMatchObject({
      status: 'disabled',
    });
    await expect(
      repository.listActiveUserRefreshSessions(firstUser.id),
    ).resolves.toEqual([]);
    await expect(
      repository.listActiveUserRefreshSessions(secondUser.id),
    ).resolves.toEqual([]);
  });

  it('keeps batch account status updates atomic when any target user is missing', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);
    const firstUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const secondUser = await repository.upsertMobileUser({
      phone: '13800138001',
      userType: 'driver',
    });

    await repository.saveRefreshSession({
      userId: firstUser.id,
      refreshToken: 'refresh.first-device-1',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: secondUser.id,
      refreshToken: 'refresh.second-device-1',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:10:00.000Z');

    await expect(
      (repository as unknown as {
        batchUpdateUserStatuses: (input: {
          items: { userId: string }[];
          status: 'active' | 'disabled';
        }) => Promise<unknown>;
      }).batchUpdateUserStatuses({
        items: [{ userId: firstUser.id }, { userId: 'missing-user' }],
        status: 'disabled',
      }),
    ).rejects.toEqual(
      new BusinessError(ApiErrorCode.AUTH_ACCOUNT_NOT_FOUND, '账号不存在'),
    );
    await expect(repository.findUserById(firstUser.id)).resolves.toMatchObject({
      status: 'active',
    });
    await expect(repository.findUserById(secondUser.id)).resolves.toMatchObject({
      status: 'active',
    });
    await expect(
      repository.listActiveUserRefreshSessions(firstUser.id),
    ).resolves.toHaveLength(1);
    await expect(
      repository.listActiveUserRefreshSessions(secondUser.id),
    ).resolves.toHaveLength(1);
  });

  it('keeps batch account session revocation atomic when a keep session is invalid', async () => {
    let currentNow = new Date('2026-06-26T06:00:00.000Z');
    const repository = new InMemoryAuthRepository(() => currentNow);
    const firstUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const secondUser = await repository.upsertMobileUser({
      phone: '13800138001',
      userType: 'driver',
    });

    await repository.saveRefreshSession({
      userId: firstUser.id,
      refreshToken: 'refresh.first-device-1',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: firstUser.id,
      refreshToken: 'refresh.first-device-2',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:10:00.000Z');
    await repository.saveRefreshSession({
      userId: secondUser.id,
      refreshToken: 'refresh.second-device-1',
      deviceId: 'device-3',
      expiresAt: new Date('2026-07-03T06:10:00.000Z'),
    });
    currentNow = new Date('2026-06-26T06:15:00.000Z');

    await expect(
      (repository as unknown as {
        batchRevokeUserRefreshSessions: (input: {
          items: { userId: string; keepSessionId?: string }[];
        }) => Promise<unknown>;
      }).batchRevokeUserRefreshSessions({
        items: [
          { userId: firstUser.id, keepSessionId: 'session-3' },
          { userId: secondUser.id },
        ],
      }),
    ).rejects.toEqual(
      new BusinessError(
        ApiErrorCode.VALIDATION_ERROR,
        '保留会话不存在或不属于目标账号',
      ),
    );
    await expect(
      repository.listActiveUserRefreshSessions(firstUser.id),
    ).resolves.toHaveLength(2);
    await expect(
      repository.listActiveUserRefreshSessions(secondUser.id),
    ).resolves.toHaveLength(1);
  });
});

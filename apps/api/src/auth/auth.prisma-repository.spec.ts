import { PrismaAuthRepository } from './auth.repository';

type FakeUserRecord = {
  id: string;
  phone: string;
  userType: 'shipper' | 'driver' | 'admin';
  status: 'active' | 'disabled';
  passwordHash?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type FakeAuthSessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
};

type FakeAdminAuthSessionGovernanceAuditEventRecord = {
  id: string;
  actorAdminId: string;
  actorAdminPhone: string;
  action:
    | 'revoke_session'
    | 'revoke_other_sessions'
    | 'revoke_account_sessions';
  result: 'revoked' | 'noop';
  requestedSessionId?: string | null;
  currentDeviceId?: string | null;
  revokedCount: number;
  subjects: unknown;
  createdAt: Date;
};

class FakePrismaAuthClient {
  readonly users: FakeUserRecord[] = [];
  readonly sessions: FakeAuthSessionRecord[] = [];
  readonly adminAuthSessionGovernanceAuditEvents: FakeAdminAuthSessionGovernanceAuditEventRecord[] = [];

  readonly user = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { phone: string };
      create: {
        phone: string;
        userType: 'shipper' | 'driver';
        passwordHash?: string;
      };
      update: {
        userType: 'shipper' | 'driver';
        passwordHash?: string;
      };
    }) => {
      const existingUser = this.users.find(user => user.phone === where.phone);

      if (existingUser) {
        existingUser.userType = update.userType;
        if (update.passwordHash) {
          existingUser.passwordHash = update.passwordHash;
        }
        existingUser.updatedAt = new Date('2026-06-26T06:00:00.000Z');
        return existingUser;
      }

      const user = {
        id: `db-user-${this.users.length + 1}`,
        phone: create.phone,
        userType: create.userType,
        status: 'active' as const,
        passwordHash: create.passwordHash,
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
        updatedAt: new Date('2026-06-26T06:00:00.000Z'),
      };
      this.users.push(user);
      return user;
    },
    findUnique: async ({ where }: { where: { id?: string; phone?: string } }) =>
      this.users.find(
        user =>
          (where.id && user.id === where.id) ||
          (where.phone && user.phone === where.phone),
      ) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status: 'active' | 'disabled' };
    }) => {
      const user = this.users.find(item => item.id === where.id);

      if (!user) {
        throw new Error('User not found');
      }

      user.status = data.status;
      user.updatedAt = new Date('2026-06-26T06:10:00.000Z');

      return {
        ...user,
        createdAt: user.createdAt ?? new Date('2026-06-26T06:00:00.000Z'),
        updatedAt: user.updatedAt ?? new Date('2026-06-26T06:10:00.000Z'),
      };
    },
    findMany: async ({
      orderBy,
    }: {
      orderBy: { updatedAt: 'desc' };
    }) =>
      this.users
        .map((user, index) => {
          const fallbackTimestamp = new Date(
            Date.parse('2026-06-26T06:00:00.000Z') + index * 60_000,
          );

          return {
            ...user,
            createdAt: user.createdAt ?? fallbackTimestamp,
            updatedAt: user.updatedAt ?? user.createdAt ?? fallbackTimestamp,
          };
        })
        .sort((left, right) =>
          orderBy.updatedAt === 'desc'
            ? right.updatedAt.getTime() - left.updatedAt.getTime()
            : left.updatedAt.getTime() - right.updatedAt.getTime(),
        ),
  };

  readonly authSession = {
    create: async ({
      data,
    }: {
      data: {
        userId: string;
        refreshTokenHash: string;
        deviceId: string;
        expiresAt: Date;
      };
    }) => {
      const session = {
        id: `session-${this.sessions.length + 1}`,
        ...data,
        revokedAt: null,
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
      };
      this.sessions.push(session);

      return session;
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: {
        refreshTokenHash: string;
        deviceId: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
    }) =>
      [...this.sessions]
        .sort((left, right) =>
          orderBy.createdAt === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .find(
          session =>
            session.refreshTokenHash === where.refreshTokenHash &&
            session.deviceId === where.deviceId &&
            !session.revokedAt &&
            session.expiresAt.getTime() > where.expiresAt.gt.getTime(),
        ) ?? null,
    findMany: async ({
      where,
      orderBy,
    }: {
      where: {
        userId?: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
    }) =>
      this.sessions
        .filter(
          session =>
            (!where.userId || session.userId === where.userId) &&
            !session.revokedAt &&
            session.expiresAt.getTime() > where.expiresAt.gt.getTime(),
        )
        .sort((left, right) =>
          orderBy.createdAt === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime(),
        ),
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id?: string;
        refreshTokenHash?: string;
        userId?: string;
        deviceId?: string;
        revokedAt: null;
      };
      data: { revokedAt: Date };
    }) => {
      const sessions = this.sessions
        .filter(
          session =>
            (!where.id || session.id === where.id) &&
            (!where.refreshTokenHash ||
              session.refreshTokenHash === where.refreshTokenHash) &&
            (!where.userId || session.userId === where.userId) &&
            (!where.deviceId || session.deviceId === where.deviceId) &&
            !session.revokedAt,
        );

      sessions.forEach(session => {
        session.revokedAt = data.revokedAt;
      });

      return {
        count: sessions.length,
      };
    },
  };

  readonly adminAuthSessionGovernanceAuditEvent = {
    create: async ({
      data,
    }: {
      data: {
        actorAdminId: string;
        actorAdminPhone: string;
        action:
          | 'revoke_session'
          | 'revoke_other_sessions'
          | 'revoke_account_sessions';
        result: 'revoked' | 'noop';
        requestedSessionId?: string;
        currentDeviceId?: string;
        revokedCount: number;
        subjects: unknown;
      };
    }) => {
      const event = {
        id: `audit-${this.adminAuthSessionGovernanceAuditEvents.length + 1}`,
        actorAdminId: data.actorAdminId,
        actorAdminPhone: data.actorAdminPhone,
        action: data.action,
        result: data.result,
        requestedSessionId: data.requestedSessionId ?? null,
        currentDeviceId: data.currentDeviceId ?? null,
        revokedCount: data.revokedCount,
        subjects: data.subjects,
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
      };
      this.adminAuthSessionGovernanceAuditEvents.push(event);

      return event;
    },
    findMany: async ({
      orderBy,
    }: {
      orderBy: { createdAt: 'desc' };
    }) =>
      [...this.adminAuthSessionGovernanceAuditEvents].sort((left, right) =>
        orderBy.createdAt === 'desc'
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : left.createdAt.getTime() - right.createdAt.getTime(),
      ),
  };
}

describe('PrismaAuthRepository', () => {
  it('upserts and reads mobile users through the Prisma client boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(prisma);

    const user = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });

    expect(user).toMatchObject({
      id: 'db-user-1',
      phone: '13800138000',
      userType: 'shipper',
      status: 'active',
    });
    await expect(repository.findUserById('db-user-1')).resolves.toEqual(user);
    await expect(repository.findUserByPhone('13800138000')).resolves.toEqual(
      user,
    );
  });

  it('maps disabled mobile users from the Prisma client boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    prisma.users.push({
      id: 'db-user-disabled',
      phone: '13800138001',
      userType: 'shipper',
      status: 'disabled',
    });
    const repository = new PrismaAuthRepository(prisma);

    await expect(
      repository.findUserById('db-user-disabled'),
    ).resolves.toMatchObject({
      id: 'db-user-disabled',
      phone: '13800138001',
      userType: 'shipper',
      status: 'disabled',
    });
  });

  it('allows dedicated platform lookups to read admin users by phone', async () => {
    const prisma = new FakePrismaAuthClient();
    prisma.users.push({
      id: 'db-user-admin',
      phone: '13900139000',
      userType: 'admin',
      status: 'active',
      passwordHash: 'scrypt$admin-hash',
    });
    const repository = new PrismaAuthRepository(prisma);

    await expect(
      repository.findPlatformUserByPhone('13900139000'),
    ).resolves.toMatchObject({
      id: 'db-user-admin',
      phone: '13900139000',
      userType: 'admin',
      status: 'active',
      passwordHash: 'scrypt$admin-hash',
    });
    await expect(repository.findUserByPhone('13900139000')).rejects.toThrow(
      'Admin users cannot use mobile auth session',
    );
  });

  it('stores password hashes through the Prisma upsert boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(prisma);

    const user = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
      passwordHash: 'scrypt$stored-hash',
    });

    expect(user.passwordHash).toBe('scrypt$stored-hash');
    expect(prisma.users[0].passwordHash).toBe('scrypt$stored-hash');
  });

  it('stores refresh sessions as hashes and revokes them by token and device', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:00:00.000Z'),
    );
    const refreshToken = 'refresh.db-user-1.604800';

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken,
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    expect(prisma.sessions[0].refreshTokenHash).not.toBe(refreshToken);
    expect(prisma.sessions[0].refreshTokenHash).toHaveLength(64);
    await expect(
      repository.findActiveRefreshSession(refreshToken, 'device-1'),
    ).resolves.toMatchObject({
      userId: 'db-user-1',
      refreshToken,
      deviceId: 'device-1',
    });

    await repository.revokeRefreshSession(
      refreshToken,
      'device-1',
      new Date('2026-06-26T06:10:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession(refreshToken, 'device-1'),
    ).resolves.toBeUndefined();
  });

  it('revokes active refresh sessions by user and device', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.same-device-old',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.other-device',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await repository.revokeUserDeviceRefreshSessions(
      'db-user-1',
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

  it('revokes active refresh sessions across all user devices through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'db-user-2',
      refreshToken: 'refresh.other-user',
      deviceId: 'device-3',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await repository.revokeUserRefreshSessions(
      'db-user-1',
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

  it('lists active refresh sessions newest first through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:10:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    prisma.sessions[0]!.createdAt = new Date('2026-06-26T06:00:00.000Z');
    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });
    prisma.sessions[1]!.createdAt = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.expired-device',
      deviceId: 'device-expired',
      expiresAt: new Date('2026-06-26T06:09:00.000Z'),
    });
    prisma.sessions[2]!.createdAt = new Date('2026-06-26T06:06:00.000Z');

    await expect(
      repository.listActiveUserRefreshSessions('db-user-1'),
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

  it('lists all active refresh sessions newest first through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:10:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    prisma.sessions[0]!.createdAt = new Date('2026-06-26T06:00:00.000Z');
    await repository.saveRefreshSession({
      userId: 'db-user-2',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });
    prisma.sessions[1]!.createdAt = new Date('2026-06-26T06:05:00.000Z');
    await repository.saveRefreshSession({
      userId: 'db-user-3',
      refreshToken: 'refresh.expired-device',
      deviceId: 'device-expired',
      expiresAt: new Date('2026-06-26T06:09:00.000Z'),
    });
    prisma.sessions[2]!.createdAt = new Date('2026-06-26T06:06:00.000Z');

    await expect(repository.listAllActiveRefreshSessions()).resolves.toMatchObject(
      [
        {
          id: 'session-2',
          userId: 'db-user-2',
          deviceId: 'device-2',
          createdAt: new Date('2026-06-26T06:05:00.000Z'),
        },
        {
          id: 'session-1',
          userId: 'db-user-1',
          deviceId: 'device-1',
          createdAt: new Date('2026-06-26T06:00:00.000Z'),
        },
      ],
    );
  });

  it('revokes an active refresh session by session id through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });

    await expect(
      repository.revokeUserRefreshSession(
        'db-user-1',
        prisma.sessions[1]!.id,
        new Date('2026-06-26T06:10:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      repository.listActiveUserRefreshSessions('db-user-1'),
    ).resolves.toMatchObject([
      {
        id: 'session-1',
        deviceId: 'device-1',
      },
    ]);
    await expect(
      repository.revokeUserRefreshSession('db-user-2', prisma.sessions[1]!.id),
    ).resolves.toBe(false);
  });

  it('revokes an active refresh session by session id without restricting user through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'db-user-1',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'db-user-2',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:05:00.000Z'),
    });

    await expect(
      repository.revokeRefreshSessionById(
        prisma.sessions[1]!.id,
        new Date('2026-06-26T06:10:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(repository.listAllActiveRefreshSessions()).resolves.toMatchObject([
      {
        id: 'session-1',
        userId: 'db-user-1',
        deviceId: 'device-1',
      },
    ]);
    await expect(
      repository.revokeRefreshSessionById('session-missing'),
    ).resolves.toBe(false);
  });

  it('stores and lists session governance audit events through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

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
    prisma.adminAuthSessionGovernanceAuditEvents[0]!.createdAt = new Date(
      '2026-06-26T06:00:00.000Z',
    );
    await repository.saveAdminAuthSessionGovernanceAuditEvent?.({
      actorAdminId: 'admin-2',
      actorAdminPhone: '13900139002',
      action: 'revoke_other_sessions',
      result: 'noop',
      currentDeviceId: 'admin-console-device',
      revokedCount: 0,
      subjects: [],
    });
    prisma.adminAuthSessionGovernanceAuditEvents[1]!.createdAt = new Date(
      '2026-06-26T06:05:00.000Z',
    );

    await expect(
      repository.listAdminAuthSessionGovernanceAuditEvents?.(),
    ).resolves.toEqual([
      {
        id: 'audit-2',
        actorAdminId: 'admin-2',
        actorAdminPhone: '13900139002',
        action: 'revoke_other_sessions',
        result: 'noop',
        currentDeviceId: 'admin-console-device',
        revokedCount: 0,
        subjects: [],
        createdAt: new Date('2026-06-26T06:05:00.000Z'),
      },
      {
        id: 'audit-1',
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
      },
    ]);
  });

  it('updates platform user status through the Prisma boundary', async () => {
    const prisma = new FakePrismaAuthClient();
    prisma.users.push({
      id: 'db-user-1',
      phone: '13800138000',
      userType: 'shipper',
      status: 'active',
      createdAt: new Date('2026-06-20T06:00:00.000Z'),
      updatedAt: new Date('2026-06-20T06:00:00.000Z'),
    });
    const repository = new PrismaAuthRepository(
      prisma,
      () => new Date('2026-06-26T06:10:00.000Z'),
    );

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
      }).updateUserStatus('db-user-1', 'disabled'),
    ).resolves.toEqual({
      id: 'db-user-1',
      phone: '13800138000',
      userType: 'shipper',
      status: 'disabled',
    });
    expect(prisma.users[0]).toMatchObject({
      status: 'disabled',
      updatedAt: new Date('2026-06-26T06:10:00.000Z'),
    });
  });
});

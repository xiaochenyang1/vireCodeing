import { PrismaAuthRepository } from './auth.repository';

type FakeUserRecord = {
  id: string;
  phone: string;
  userType: 'shipper' | 'driver';
  status: 'active' | 'disabled';
  passwordHash?: string | null;
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

class FakePrismaAuthClient {
  readonly users: FakeUserRecord[] = [];
  readonly sessions: FakeAuthSessionRecord[] = [];

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
        return existingUser;
      }

      const user = {
        id: `db-user-${this.users.length + 1}`,
        phone: create.phone,
        userType: create.userType,
        status: 'active' as const,
        passwordHash: create.passwordHash,
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
      this.sessions.push({
        id: `session-${this.sessions.length + 1}`,
        ...data,
        revokedAt: null,
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
      });
    },
    findFirst: async ({
      where,
    }: {
      where: {
        refreshTokenHash: string;
        deviceId: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
    }) =>
      [...this.sessions]
        .reverse()
        .find(
          session =>
            session.refreshTokenHash === where.refreshTokenHash &&
            session.deviceId === where.deviceId &&
            !session.revokedAt &&
            session.expiresAt.getTime() > where.expiresAt.gt.getTime(),
        ) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        refreshTokenHash?: string;
        userId?: string;
        deviceId?: string;
        revokedAt: null;
      };
      data: { revokedAt: Date };
    }) => {
      this.sessions
        .filter(
          session =>
            (!where.refreshTokenHash ||
              session.refreshTokenHash === where.refreshTokenHash) &&
            (!where.userId || session.userId === where.userId) &&
            (!where.deviceId || session.deviceId === where.deviceId) &&
            !session.revokedAt,
        )
        .forEach(session => {
          session.revokedAt = data.revokedAt;
        });
    },
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
});

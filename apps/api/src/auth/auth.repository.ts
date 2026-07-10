import { createHash } from 'crypto';
import type {
  AuthenticatedUserRecord,
  MobileUserStatus,
  MobileUserType,
  PlatformUserType,
} from './dto';

export type UpsertMobileUserInput = {
  phone: string;
  userType: MobileUserType;
  passwordHash?: string;
};

export type RefreshSessionRecord = {
  userId: string;
  refreshToken: string;
  deviceId: string;
  expiresAt: Date;
  revokedAt?: Date;
};

export interface AuthRepository {
  upsertMobileUser(
    input: UpsertMobileUserInput,
  ): Promise<AuthenticatedUserRecord>;
  findUserById(userId: string): Promise<AuthenticatedUserRecord | undefined>;
  findUserByPhone(phone: string): Promise<AuthenticatedUserRecord | undefined>;
  saveRefreshSession(record: RefreshSessionRecord): Promise<void>;
  findActiveRefreshSession(
    refreshToken: string,
    deviceId: string,
  ): Promise<RefreshSessionRecord | undefined>;
  revokeRefreshSession(
    refreshToken: string,
    deviceId: string,
    revokedAt?: Date,
  ): Promise<void>;
  revokeUserDeviceRefreshSessions(
    userId: string,
    deviceId: string,
    revokedAt?: Date,
  ): Promise<void>;
  revokeUserRefreshSessions(userId: string, revokedAt?: Date): Promise<void>;
}

type PrismaAuthUser = {
  id: string;
  phone: string;
  userType: PlatformUserType;
  status: MobileUserStatus;
  passwordHash?: string | null;
};

type PrismaAuthSession = {
  userId: string;
  refreshTokenHash: string;
  deviceId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
};

export type PrismaAuthClient = {
  user: {
    upsert(args: {
      where: { phone: string };
      create: {
        phone: string;
        userType: MobileUserType;
        passwordHash?: string;
      };
      update: { userType: MobileUserType; passwordHash?: string };
    }): Promise<PrismaAuthUser>;
    findUnique(args: {
      where: { id?: string; phone?: string };
    }): Promise<PrismaAuthUser | null>;
  };
  authSession: {
    create(args: {
      data: {
        userId: string;
        refreshTokenHash: string;
        deviceId: string;
        expiresAt: Date;
      };
    }): Promise<unknown>;
    findFirst(args: {
      where: {
        refreshTokenHash: string;
        deviceId: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaAuthSession | null>;
    updateMany(args: {
      where: {
        refreshTokenHash?: string;
        userId?: string;
        deviceId?: string;
        revokedAt: null;
      };
      data: { revokedAt: Date };
    }): Promise<unknown>;
  };
};

export class InMemoryAuthRepository implements AuthRepository {
  private readonly usersById = new Map<string, AuthenticatedUserRecord>();
  private readonly usersByPhone = new Map<string, AuthenticatedUserRecord>();
  private readonly refreshSessions: RefreshSessionRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async upsertMobileUser(
    input: UpsertMobileUserInput,
  ): Promise<AuthenticatedUserRecord> {
    const existingUser = this.usersByPhone.get(input.phone);

    if (existingUser) {
      const updatedUser: AuthenticatedUserRecord = {
        ...existingUser,
        userType: input.userType,
        passwordHash: input.passwordHash ?? existingUser.passwordHash,
      };

      this.usersByPhone.set(input.phone, updatedUser);
      this.usersById.set(updatedUser.id, updatedUser);

      return updatedUser;
    }

    const user: AuthenticatedUserRecord = {
      id: `local-user-${input.phone}`,
      phone: input.phone,
      userType: input.userType,
      status: 'active',
      passwordHash: input.passwordHash,
    };

    this.usersByPhone.set(input.phone, user);
    this.usersById.set(user.id, user);

    return user;
  }

  async findUserById(
    userId: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    return this.usersById.get(userId);
  }

  async findUserByPhone(
    phone: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    return this.usersByPhone.get(phone);
  }

  async saveRefreshSession(record: RefreshSessionRecord): Promise<void> {
    this.refreshSessions.push(record);
  }

  async findActiveRefreshSession(
    refreshToken: string,
    deviceId: string,
  ): Promise<RefreshSessionRecord | undefined> {
    const now = this.now().getTime();

    return [...this.refreshSessions].reverse().find(
      session =>
        session.refreshToken === refreshToken &&
        session.deviceId === deviceId &&
        !session.revokedAt &&
        session.expiresAt.getTime() > now,
    );
  }

  async revokeRefreshSession(
    refreshToken: string,
    deviceId: string,
    revokedAt = this.now(),
  ): Promise<void> {
    this.refreshSessions
      .filter(
        session =>
          session.refreshToken === refreshToken &&
          session.deviceId === deviceId &&
          !session.revokedAt,
      )
      .forEach(session => {
        session.revokedAt = revokedAt;
      });
  }

  async revokeUserDeviceRefreshSessions(
    userId: string,
    deviceId: string,
    revokedAt = this.now(),
  ): Promise<void> {
    this.refreshSessions
      .filter(
        session =>
          session.userId === userId &&
          session.deviceId === deviceId &&
          !session.revokedAt,
      )
      .forEach(session => {
        session.revokedAt = revokedAt;
      });
  }

  async revokeUserRefreshSessions(
    userId: string,
    revokedAt = this.now(),
  ): Promise<void> {
    this.refreshSessions
      .filter(session => session.userId === userId && !session.revokedAt)
      .forEach(session => {
        session.revokedAt = revokedAt;
      });
  }
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(
    private readonly prisma: PrismaAuthClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsertMobileUser(
    input: UpsertMobileUserInput,
  ): Promise<AuthenticatedUserRecord> {
    const passwordHashUpdate = input.passwordHash
      ? { passwordHash: input.passwordHash }
      : {};
    const user = await this.prisma.user.upsert({
      where: {
        phone: input.phone,
      },
      create: {
        phone: input.phone,
        userType: input.userType,
        ...passwordHashUpdate,
      },
      update: {
        userType: input.userType,
        ...passwordHashUpdate,
      },
    });

    return mapPrismaUser(user);
  }

  async findUserById(
    userId: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    return user ? mapPrismaUser(user, { allowAdmin: true }) : undefined;
  }

  async findUserByPhone(
    phone: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = await this.prisma.user.findUnique({
      where: {
        phone,
      },
    });

    return user ? mapPrismaUser(user, { allowAdmin: false }) : undefined;
  }

  async saveRefreshSession(record: RefreshSessionRecord): Promise<void> {
    await this.prisma.authSession.create({
      data: {
        userId: record.userId,
        refreshTokenHash: hashRefreshToken(record.refreshToken),
        deviceId: record.deviceId,
        expiresAt: record.expiresAt,
      },
    });
  }

  async findActiveRefreshSession(
    refreshToken: string,
    deviceId: string,
  ): Promise<RefreshSessionRecord | undefined> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        deviceId,
        revokedAt: null,
        expiresAt: {
          gt: this.now(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      return undefined;
    }

    return {
      userId: session.userId,
      refreshToken,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt ?? undefined,
    };
  }

  async revokeRefreshSession(
    refreshToken: string,
    deviceId: string,
    revokedAt = this.now(),
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        deviceId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  }

  async revokeUserDeviceRefreshSessions(
    userId: string,
    deviceId: string,
    revokedAt = this.now(),
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        userId,
        deviceId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  }

  async revokeUserRefreshSessions(
    userId: string,
    revokedAt = this.now(),
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  }
}

function mapPrismaUser(
  user: PrismaAuthUser,
  { allowAdmin }: { allowAdmin: boolean } = { allowAdmin: false },
): AuthenticatedUserRecord {
  if (user.userType === 'admin' && !allowAdmin) {
    throw new Error('Admin users cannot use mobile auth session');
  }

  return {
    id: user.id,
    phone: user.phone,
    userType: user.userType,
    status: user.status,
    passwordHash: user.passwordHash ?? undefined,
  };
}

function hashRefreshToken(refreshToken: string) {
  return createHash('sha256').update(refreshToken).digest('hex');
}

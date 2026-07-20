import { createHash } from 'crypto';
import type {
  AdminAuthSessionGovernanceAuditAction,
  AdminAuthSessionGovernanceAuditResult,
  AdminAuthSessionGovernanceAuditSubject,
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

export type SaveRefreshSessionInput = {
  userId: string;
  refreshToken: string;
  deviceId: string;
  expiresAt: Date;
};

export type RefreshSessionRecord = SaveRefreshSessionInput & {
  id: string;
  createdAt: Date;
  revokedAt?: Date;
};

export type SaveAdminAuthSessionGovernanceAuditEventInput = {
  actorAdminId: string;
  actorAdminPhone: string;
  action: AdminAuthSessionGovernanceAuditAction;
  result: AdminAuthSessionGovernanceAuditResult;
  requestedSessionId?: string;
  currentDeviceId?: string;
  revokedCount: number;
  subjects: AdminAuthSessionGovernanceAuditSubject[];
};

export type AdminAuthSessionGovernanceAuditEventRecord =
  SaveAdminAuthSessionGovernanceAuditEventInput & {
    id: string;
    createdAt: Date;
  };

export type PlatformUserDirectoryRecord = AuthenticatedUserRecord & {
  createdAt: Date;
  updatedAt: Date;
};

export interface AuthRepository {
  upsertMobileUser(
    input: UpsertMobileUserInput,
  ): Promise<AuthenticatedUserRecord>;
  findUserById(userId: string): Promise<AuthenticatedUserRecord | undefined>;
  findUserByPhone(phone: string): Promise<AuthenticatedUserRecord | undefined>;
  findPlatformUserByPhone(
    phone: string,
  ): Promise<AuthenticatedUserRecord | undefined>;
  updateUserStatus?(
    userId: string,
    status: MobileUserStatus,
  ): Promise<AuthenticatedUserRecord | undefined>;
  saveRefreshSession(record: SaveRefreshSessionInput): Promise<void>;
  findActiveRefreshSession(
    refreshToken: string,
    deviceId: string,
  ): Promise<RefreshSessionRecord | undefined>;
  listActiveUserRefreshSessions(userId: string): Promise<RefreshSessionRecord[]>;
  listAllActiveRefreshSessions?(): Promise<RefreshSessionRecord[]>;
  revokeRefreshSession(
    refreshToken: string,
    deviceId: string,
    revokedAt?: Date,
  ): Promise<void>;
  revokeRefreshSessionById?(
    sessionId: string,
    revokedAt?: Date,
  ): Promise<boolean>;
  revokeUserRefreshSession(
    userId: string,
    sessionId: string,
    revokedAt?: Date,
  ): Promise<boolean>;
  revokeUserDeviceRefreshSessions(
    userId: string,
    deviceId: string,
    revokedAt?: Date,
  ): Promise<void>;
  revokeUserRefreshSessions(userId: string, revokedAt?: Date): Promise<void>;
  listPlatformUsers?(): Promise<PlatformUserDirectoryRecord[]>;
  listAdminAuthSessionGovernanceAuditEvents?(): Promise<
    AdminAuthSessionGovernanceAuditEventRecord[]
  >;
  saveAdminAuthSessionGovernanceAuditEvent?(
    input: SaveAdminAuthSessionGovernanceAuditEventInput,
  ): Promise<AdminAuthSessionGovernanceAuditEventRecord>;
}

type PrismaAuthUser = {
  id: string;
  phone: string;
  userType: PlatformUserType;
  status: MobileUserStatus;
  passwordHash?: string | null;
};

type PrismaAuthUserDirectory = PrismaAuthUser & {
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAuthSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date | null;
};

type PrismaAdminAuthSessionGovernanceAuditEvent = {
  id: string;
  actorAdminId: string;
  actorAdminPhone: string;
  action: AdminAuthSessionGovernanceAuditAction;
  result: AdminAuthSessionGovernanceAuditResult;
  requestedSessionId?: string | null;
  currentDeviceId?: string | null;
  revokedCount: number;
  subjects: unknown;
  createdAt: Date;
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
    update(args: {
      where: { id: string };
      data: { status: MobileUserStatus };
    }): Promise<PrismaAuthUserDirectory>;
    findMany(args: {
      orderBy: { updatedAt: 'desc' };
    }): Promise<PrismaAuthUserDirectory[]>;
  };
  authSession: {
    create(args: {
      data: {
        userId: string;
        refreshTokenHash: string;
        deviceId: string;
        expiresAt: Date;
      };
    }): Promise<PrismaAuthSession>;
    findFirst(args: {
      where: {
        refreshTokenHash: string;
        deviceId: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaAuthSession | null>;
    findMany(args: {
      where: {
        userId?: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaAuthSession[]>;
    updateMany(args: {
      where: {
        id?: string;
        refreshTokenHash?: string;
        userId?: string;
        deviceId?: string;
        revokedAt: null;
      };
      data: { revokedAt: Date };
    }): Promise<{ count: number }>;
  };
  adminAuthSessionGovernanceAuditEvent: {
    create(args: {
      data: {
        actorAdminId: string;
        actorAdminPhone: string;
        action: AdminAuthSessionGovernanceAuditAction;
        result: AdminAuthSessionGovernanceAuditResult;
        requestedSessionId?: string;
        currentDeviceId?: string;
        revokedCount: number;
        subjects: AdminAuthSessionGovernanceAuditSubject[];
      };
    }): Promise<PrismaAdminAuthSessionGovernanceAuditEvent>;
    findMany(args: {
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaAdminAuthSessionGovernanceAuditEvent[]>;
  };
};

export class InMemoryAuthRepository implements AuthRepository {
  private readonly usersById = new Map<string, PlatformUserDirectoryRecord>();
  private readonly usersByPhone = new Map<string, PlatformUserDirectoryRecord>();
  private readonly refreshSessions: RefreshSessionRecord[] = [];
  private readonly sessionGovernanceAuditEvents: AdminAuthSessionGovernanceAuditEventRecord[] =
    [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async upsertMobileUser(
    input: UpsertMobileUserInput,
  ): Promise<AuthenticatedUserRecord> {
    const existingUser = this.usersByPhone.get(input.phone);

    if (existingUser) {
      const updatedUser: PlatformUserDirectoryRecord = {
        ...existingUser,
        userType: input.userType,
        passwordHash: input.passwordHash ?? existingUser.passwordHash,
        updatedAt: this.now(),
      };

      this.usersByPhone.set(input.phone, updatedUser);
      this.usersById.set(updatedUser.id, updatedUser);

      return stripPlatformUserDirectoryRecord(updatedUser);
    }

    const now = this.now();
    const user: PlatformUserDirectoryRecord = {
      id: `local-user-${input.phone}`,
      phone: input.phone,
      userType: input.userType,
      status: 'active',
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    this.usersByPhone.set(input.phone, user);
    this.usersById.set(user.id, user);

    return stripPlatformUserDirectoryRecord(user);
  }

  async findUserById(
    userId: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = this.usersById.get(userId);

    return user ? stripPlatformUserDirectoryRecord(user) : undefined;
  }

  async findUserByPhone(
    phone: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = this.usersByPhone.get(phone);

    return user ? stripPlatformUserDirectoryRecord(user) : undefined;
  }

  async findPlatformUserByPhone(
    phone: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = this.usersByPhone.get(phone);

    return user ? stripPlatformUserDirectoryRecord(user) : undefined;
  }

  async updateUserStatus(
    userId: string,
    status: MobileUserStatus,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = this.usersById.get(userId);

    if (!user) {
      return undefined;
    }

    const updatedUser: PlatformUserDirectoryRecord = {
      ...user,
      status,
      updatedAt: this.now(),
    };

    this.usersById.set(updatedUser.id, updatedUser);
    this.usersByPhone.set(updatedUser.phone, updatedUser);

    return stripPlatformUserDirectoryRecord(updatedUser);
  }

  async saveRefreshSession(record: SaveRefreshSessionInput): Promise<void> {
    this.refreshSessions.push({
      ...record,
      id: `session-${this.refreshSessions.length + 1}`,
      createdAt: this.now(),
    });
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

  async listActiveUserRefreshSessions(
    userId: string,
  ): Promise<RefreshSessionRecord[]> {
    return this.listActiveSessions(session => session.userId === userId);
  }

  async listAllActiveRefreshSessions(): Promise<RefreshSessionRecord[]> {
    return this.listActiveSessions();
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

  async revokeRefreshSessionById(
    sessionId: string,
    revokedAt = this.now(),
  ): Promise<boolean> {
    const sessions = this.refreshSessions.filter(
      session => session.id === sessionId && !session.revokedAt,
    );

    sessions.forEach(session => {
      session.revokedAt = revokedAt;
    });

    return sessions.length > 0;
  }

  async revokeUserRefreshSession(
    userId: string,
    sessionId: string,
    revokedAt = this.now(),
  ): Promise<boolean> {
    const sessions = this.refreshSessions.filter(
      session =>
        session.userId === userId &&
        session.id === sessionId &&
        !session.revokedAt,
    );

    sessions.forEach(session => {
      session.revokedAt = revokedAt;
    });

    return sessions.length > 0;
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

  async listPlatformUsers(): Promise<PlatformUserDirectoryRecord[]> {
    return [...this.usersById.values()]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map(clonePlatformUserDirectoryRecord);
  }

  async listAdminAuthSessionGovernanceAuditEvents(): Promise<
    AdminAuthSessionGovernanceAuditEventRecord[]
  > {
    return this.sessionGovernanceAuditEvents
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(cloneAdminAuthSessionGovernanceAuditEvent);
  }

  async saveAdminAuthSessionGovernanceAuditEvent(
    input: SaveAdminAuthSessionGovernanceAuditEventInput,
  ): Promise<AdminAuthSessionGovernanceAuditEventRecord> {
    const record = cloneAdminAuthSessionGovernanceAuditEvent({
      id: `admin-session-governance-audit-${this.sessionGovernanceAuditEvents.length + 1}`,
      actorAdminId: input.actorAdminId,
      actorAdminPhone: input.actorAdminPhone,
      action: input.action,
      result: input.result,
      ...(input.requestedSessionId
        ? { requestedSessionId: input.requestedSessionId }
        : {}),
      ...(input.currentDeviceId ? { currentDeviceId: input.currentDeviceId } : {}),
      revokedCount: input.revokedCount,
      subjects: input.subjects,
      createdAt: this.now(),
    });

    this.sessionGovernanceAuditEvents.push(record);

    return cloneAdminAuthSessionGovernanceAuditEvent(record);
  }

  private listActiveSessions(
    predicate?: (session: RefreshSessionRecord) => boolean,
  ): RefreshSessionRecord[] {
    const now = this.now().getTime();

    return this.refreshSessions
      .filter(
        session =>
          !session.revokedAt &&
          session.expiresAt.getTime() > now &&
          (!predicate || predicate(session)),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
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

  async findPlatformUserByPhone(
    phone: string,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const user = await this.prisma.user.findUnique({
      where: {
        phone,
      },
    });

    return user ? mapPrismaUser(user, { allowAdmin: true }) : undefined;
  }

  async listPlatformUsers(): Promise<PlatformUserDirectoryRecord[]> {
    const users = await this.prisma.user.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return users.map(user =>
      mapPrismaUserDirectory(user, { allowAdmin: true }),
    );
  }

  async updateUserStatus(
    userId: string,
    status: MobileUserStatus,
  ): Promise<AuthenticatedUserRecord | undefined> {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      return undefined;
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        status,
      },
    });

    return mapPrismaUser(user, { allowAdmin: true });
  }

  async saveRefreshSession(record: SaveRefreshSessionInput): Promise<void> {
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
      id: session.id,
      userId: session.userId,
      refreshToken,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      revokedAt: session.revokedAt ?? undefined,
    };
  }

  async listActiveUserRefreshSessions(
    userId: string,
  ): Promise<RefreshSessionRecord[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: this.now(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      refreshToken: '',
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      revokedAt: session.revokedAt ?? undefined,
    }));
  }

  async listAllActiveRefreshSessions(): Promise<RefreshSessionRecord[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: this.now(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      refreshToken: '',
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      revokedAt: session.revokedAt ?? undefined,
    }));
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

  async revokeRefreshSessionById(
    sessionId: string,
    revokedAt = this.now(),
  ): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    return result.count > 0;
  }

  async revokeUserRefreshSession(
    userId: string,
    sessionId: string,
    revokedAt = this.now(),
  ): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    return result.count > 0;
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

  async listAdminAuthSessionGovernanceAuditEvents(): Promise<
    AdminAuthSessionGovernanceAuditEventRecord[]
  > {
    const events = await this.prisma.adminAuthSessionGovernanceAuditEvent.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return events.map(mapPrismaAdminAuthSessionGovernanceAuditEvent);
  }

  async saveAdminAuthSessionGovernanceAuditEvent(
    input: SaveAdminAuthSessionGovernanceAuditEventInput,
  ): Promise<AdminAuthSessionGovernanceAuditEventRecord> {
    const event = await this.prisma.adminAuthSessionGovernanceAuditEvent.create({
      data: {
        actorAdminId: input.actorAdminId,
        actorAdminPhone: input.actorAdminPhone,
        action: input.action,
        result: input.result,
        ...(input.requestedSessionId
          ? { requestedSessionId: input.requestedSessionId }
          : {}),
        ...(input.currentDeviceId
          ? { currentDeviceId: input.currentDeviceId }
          : {}),
        revokedCount: input.revokedCount,
        subjects: input.subjects,
      },
    });

    return mapPrismaAdminAuthSessionGovernanceAuditEvent(event);
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

function mapPrismaUserDirectory(
  user: PrismaAuthUserDirectory,
  { allowAdmin }: { allowAdmin: boolean } = { allowAdmin: false },
): PlatformUserDirectoryRecord {
  const mapped = mapPrismaUser(user, { allowAdmin });

  return {
    ...mapped,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function mapPrismaAdminAuthSessionGovernanceAuditEvent(
  event: PrismaAdminAuthSessionGovernanceAuditEvent,
): AdminAuthSessionGovernanceAuditEventRecord {
  return cloneAdminAuthSessionGovernanceAuditEvent({
    id: event.id,
    actorAdminId: event.actorAdminId,
    actorAdminPhone: event.actorAdminPhone,
    action: event.action,
    result: event.result,
    ...(event.requestedSessionId
      ? { requestedSessionId: event.requestedSessionId }
      : {}),
    ...(event.currentDeviceId ? { currentDeviceId: event.currentDeviceId } : {}),
    revokedCount: event.revokedCount,
    subjects: parseAdminAuthSessionGovernanceAuditSubjects(event.subjects),
    createdAt: event.createdAt,
  });
}

function parseAdminAuthSessionGovernanceAuditSubjects(
  subjects: unknown,
): AdminAuthSessionGovernanceAuditSubject[] {
  if (!Array.isArray(subjects)) {
    return [];
  }

  return subjects
    .filter(isAdminAuthSessionGovernanceAuditSubject)
    .map(subject => ({
      sessionId: subject.sessionId,
      userId: subject.userId,
      userPhone: subject.userPhone,
      userType: subject.userType,
      deviceId: subject.deviceId,
    }));
}

function isAdminAuthSessionGovernanceAuditSubject(
  value: unknown,
): value is AdminAuthSessionGovernanceAuditSubject {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.sessionId === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.userPhone === 'string' &&
    typeof value.deviceId === 'string' &&
    (value.userType === 'shipper' ||
      value.userType === 'driver' ||
      value.userType === 'admin')
  );
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneAdminAuthSessionGovernanceAuditEvent(
  event: AdminAuthSessionGovernanceAuditEventRecord,
): AdminAuthSessionGovernanceAuditEventRecord {
  return {
    id: event.id,
    actorAdminId: event.actorAdminId,
    actorAdminPhone: event.actorAdminPhone,
    action: event.action,
    result: event.result,
    ...(event.requestedSessionId
      ? { requestedSessionId: event.requestedSessionId }
      : {}),
    ...(event.currentDeviceId ? { currentDeviceId: event.currentDeviceId } : {}),
    revokedCount: event.revokedCount,
    subjects: event.subjects.map(subject => ({
      sessionId: subject.sessionId,
      userId: subject.userId,
      userPhone: subject.userPhone,
      userType: subject.userType,
      deviceId: subject.deviceId,
    })),
    createdAt: new Date(event.createdAt),
  };
}

function stripPlatformUserDirectoryRecord(
  user: PlatformUserDirectoryRecord,
): AuthenticatedUserRecord {
  return {
    id: user.id,
    phone: user.phone,
    userType: user.userType,
    status: user.status,
    passwordHash: user.passwordHash,
  };
}

function clonePlatformUserDirectoryRecord(
  user: PlatformUserDirectoryRecord,
): PlatformUserDirectoryRecord {
  return {
    id: user.id,
    phone: user.phone,
    userType: user.userType,
    status: user.status,
    passwordHash: user.passwordHash,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function hashRefreshToken(refreshToken: string) {
  return createHash('sha256').update(refreshToken).digest('hex');
}

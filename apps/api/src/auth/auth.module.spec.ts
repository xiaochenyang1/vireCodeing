import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import {
  AuthModule,
  createTokenServiceConfigFromEnv,
  createVerificationCodeConfigFromEnv,
} from './auth.module';
import { PrismaService } from '../prisma/prisma.service';

type FakeUserRecord = {
  id: string;
  phone: string;
  userType: 'shipper' | 'driver' | 'admin';
  status: 'active' | 'disabled';
  passwordHash?: string;
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

type FakeVerificationCodeRecord = {
  id: string;
  phone: string;
  purpose: 'login' | 'register' | 'reset';
  codeHash: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
};

class FakePrismaService {
  readonly users: FakeUserRecord[] = [];
  readonly sessions: FakeAuthSessionRecord[] = [];
  readonly verificationCodes: FakeVerificationCodeRecord[] = [];

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
      user.updatedAt = new Date('2026-06-26T06:00:00.000Z');

      return {
        ...user,
        createdAt: user.createdAt ?? new Date('2026-06-26T06:00:00.000Z'),
        updatedAt: user.updatedAt ?? new Date('2026-06-26T06:00:00.000Z'),
      };
    },
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

  readonly verificationCode = {
    create: async ({
      data,
    }: {
      data: {
        phone: string;
        purpose: 'login' | 'register' | 'reset';
        codeHash: string;
        expiresAt: Date;
      };
    }) => {
      this.verificationCodes.push({
        id: `code-${this.verificationCodes.length + 1}`,
        ...data,
        consumedAt: null,
        createdAt: new Date('2026-06-26T06:00:00.000Z'),
      });
    },
    findFirst: async ({
      where,
    }: {
      where: {
        phone: string;
        purpose: 'login' | 'register' | 'reset';
        consumedAt: null;
        expiresAt?: { gt: Date };
      };
    }) =>
      [...this.verificationCodes]
        .reverse()
        .find(
          code =>
            code.phone === where.phone &&
            code.purpose === where.purpose &&
            !code.consumedAt &&
            (!where.expiresAt ||
              code.expiresAt.getTime() > where.expiresAt.gt.getTime()),
        ) ?? null,
    findMany: async ({
      where,
    }: {
      where: {
        phone: string;
        purpose: 'login' | 'register' | 'reset';
        createdAt: { gte: Date };
      };
    }) =>
      this.verificationCodes.filter(
        code =>
          code.phone === where.phone &&
          code.purpose === where.purpose &&
          code.createdAt.getTime() >= where.createdAt.gte.getTime(),
      ),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { consumedAt: Date };
    }) => {
      const code = this.verificationCodes.find(item => item.id === where.id);
      if (code) {
        code.consumedAt = data.consumedAt;
      }
    },
  };
}

describe('AuthModule', () => {
  it('builds token service config from environment values', () => {
    expect(
      createTokenServiceConfigFromEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'env-access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '123',
        REFRESH_TOKEN_TTL_SECONDS: '456',
      }),
    ).toEqual({
      accessTokenSecret: 'env-access-secret',
      accessTtlSeconds: 123,
      refreshTtlSeconds: 456,
    });
  });

  it('rejects production token config without an access token secret', () => {
    expect(() =>
      createTokenServiceConfigFromEnv({
        NODE_ENV: 'production',
      }),
    ).toThrow('JWT_ACCESS_SECRET is required in production');
  });

  it('rejects placeholder access token secrets in production', () => {
    expect(() =>
      createTokenServiceConfigFromEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace-with-dev-access-secret',
      }),
    ).toThrow('JWT_ACCESS_SECRET must not use development placeholders');
  });

  it('requires strong access token secrets in production', () => {
    expect(() =>
      createTokenServiceConfigFromEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'short-secret',
      }),
    ).toThrow('JWT_ACCESS_SECRET must be at least 32 characters in production');
  });

  it('builds a non-exposing verification code config in production', () => {
    const config = createVerificationCodeConfigFromEnv(
      {
        NODE_ENV: 'production',
        VERIFICATION_CODE_TTL_SECONDS: '120',
      },
      () => '654321',
    );

    expect(config.exposeDevCode).toBe(false);
    expect(config.generateCode()).toBe('654321');
    expect(config.ttlSeconds).toBe(120);
  });

  it('keeps fixed development verification codes outside production', () => {
    const config = createVerificationCodeConfigFromEnv({
      NODE_ENV: 'test',
      VERIFICATION_CODE_TTL_SECONDS: '180',
    });

    expect(config.exposeDevCode).toBe(true);
    expect(config.generateCode()).toBe('123456');
    expect(config.ttlSeconds).toBe(180);
  });

  it('rejects invalid verification code ttl config', () => {
    expect(() =>
      createVerificationCodeConfigFromEnv({
        NODE_ENV: 'test',
        VERIFICATION_CODE_TTL_SECONDS: '0',
      }),
    ).toThrow('VERIFICATION_CODE_TTL_SECONDS must be a positive integer');
  });

  it('wires AuthService to PrismaAuthRepository through PrismaService', async () => {
    const prisma = new FakePrismaService();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const controller = moduleRef.get(AuthController);

    await controller.sendCode({
      phone: '13800138000',
      purpose: 'login',
    });

    expect(prisma.verificationCodes).toHaveLength(1);
    expect(prisma.verificationCodes[0]).toMatchObject({
      phone: '13800138000',
      purpose: 'login',
    });
    expect(prisma.verificationCodes[0].codeHash).toHaveLength(64);
    expect(prisma.verificationCodes[0].codeHash).not.toBe('123456');

    const response = await controller.login({
      phone: '13800138000',
      code: '123456',
      userType: 'shipper',
      deviceId: 'device-1',
    });

    expect(response.data.user).toEqual({
      id: 'db-user-1',
      phone: '13800138000',
      userType: 'shipper',
    });
    expect(prisma.users).toHaveLength(1);
    expect(prisma.sessions).toHaveLength(1);
    expect(prisma.sessions[0].refreshTokenHash).toHaveLength(64);
    expect(prisma.sessions[0].refreshTokenHash).not.toBe(
      response.data.tokens.refreshToken,
    );

    await moduleRef.close();
  });
});

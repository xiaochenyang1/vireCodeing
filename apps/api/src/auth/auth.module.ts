import { randomInt } from 'crypto';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import {
  AuthService,
  type VerificationCodeConfig,
} from './auth.service';
import { TokenService } from './token.service';
import {
  createVerificationCodeSenderFromEnv,
  type VerificationCodeSender,
} from './verification-code.sender';
import { PrismaVerificationCodeStore } from './verification-code.store';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAuthRepository } from './auth.repository';
import { AccessTokenGuard } from './access-token.guard';

export const verificationCodeSenderProviderToken =
  'VerificationCodeSender';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    {
      provide: PrismaVerificationCodeStore,
      useFactory: (prismaService: PrismaService) =>
        new PrismaVerificationCodeStore(prismaService),
      inject: [PrismaService],
    },
    {
      provide: TokenService,
      useFactory: () =>
        new TokenService(createTokenServiceConfigFromEnv(process.env)),
    },
    {
      provide: verificationCodeSenderProviderToken,
      useFactory: () => createVerificationCodeSenderFromEnv(process.env),
    },
    {
      provide: AuthService,
      useFactory: (
        codeStore: PrismaVerificationCodeStore,
        tokenService: TokenService,
        prismaService: PrismaService,
        codeSender: VerificationCodeSender,
      ) =>
        new AuthService(
          codeStore,
          tokenService,
          undefined,
          new PrismaAuthRepository(prismaService),
          createVerificationCodeConfigFromEnv(process.env),
          codeSender,
        ),
      inject: [
        PrismaVerificationCodeStore,
        TokenService,
        PrismaService,
        verificationCodeSenderProviderToken,
      ],
    },
    AccessTokenGuard,
  ],
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}

export function createTokenServiceConfigFromEnv(
  env: NodeJS.ProcessEnv,
): {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  accessTokenSecret: string;
} {
  return {
    accessTtlSeconds: parsePositiveInteger(
      env.ACCESS_TOKEN_TTL_SECONDS,
      900,
      'ACCESS_TOKEN_TTL_SECONDS',
    ),
    refreshTtlSeconds: parsePositiveInteger(
      env.REFRESH_TOKEN_TTL_SECONDS,
      604800,
      'REFRESH_TOKEN_TTL_SECONDS',
    ),
    accessTokenSecret: getAccessTokenSecret(env),
  };
}

export function createVerificationCodeConfigFromEnv(
  env: NodeJS.ProcessEnv,
  generateCode: () => string = createSixDigitVerificationCode,
): VerificationCodeConfig {
  const ttlSeconds = parsePositiveInteger(
    env.VERIFICATION_CODE_TTL_SECONDS,
    300,
    'VERIFICATION_CODE_TTL_SECONDS',
  );

  if (env.NODE_ENV === 'production') {
    return {
      exposeDevCode: false,
      generateCode,
      ttlSeconds,
    };
  }

  return {
    exposeDevCode: true,
    generateCode: () => '123456',
    ttlSeconds,
  };
}

const developmentAccessTokenSecretPlaceholders = new Set([
  'replace-with-dev-access-secret',
]);

function getAccessTokenSecret(env: NodeJS.ProcessEnv): string {
  if (env.JWT_ACCESS_SECRET) {
    if (env.NODE_ENV === 'production') {
      validateProductionAccessTokenSecret(env.JWT_ACCESS_SECRET);
    }

    return env.JWT_ACCESS_SECRET;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_ACCESS_SECRET is required in production');
  }

  return 'local-development-access-secret';
}

function validateProductionAccessTokenSecret(secret: string): void {
  if (developmentAccessTokenSecretPlaceholders.has(secret)) {
    throw new Error('JWT_ACCESS_SECRET must not use development placeholders');
  }

  if (secret.length < 32) {
    throw new Error(
      'JWT_ACCESS_SECRET must be at least 32 characters in production',
    );
  }
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function createSixDigitVerificationCode(): string {
  return randomInt(0, 1000000).toString().padStart(6, '0');
}

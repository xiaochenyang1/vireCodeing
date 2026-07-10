import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import type { TokenPair } from './dto';

type TokenServiceConfig = {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  accessTokenSecret: string;
  now?: () => Date;
};

const refreshTokenPattern =
  /^refresh\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TokenService {
  constructor(private readonly config: TokenServiceConfig) {}

  issueTokenPair(userId: string): TokenPair {
    return {
      accessToken: this.issueAccessToken(userId),
      refreshToken: this.issueRefreshToken(),
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  getUserIdFromAccessToken(accessToken: string): string {
    try {
      const [header, payload, signature, ...extraSegments] =
        accessToken.split('.');

      if (!header || !payload || !signature || extraSegments.length > 0) {
        throw new Error('Invalid access token');
      }

      this.verifySignature(`${header}.${payload}`, signature);

      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as {
        sub?: unknown;
        type?: unknown;
        iat?: unknown;
        exp?: unknown;
      };

      if (
        claims.type !== 'access' ||
        typeof claims.sub !== 'string' ||
        !claims.sub ||
        typeof claims.iat !== 'number' ||
        !Number.isInteger(claims.iat) ||
        typeof claims.exp !== 'number' ||
        !Number.isInteger(claims.exp) ||
        this.nowInSeconds() >= claims.exp
      ) {
        throw new Error('Invalid access token');
      }

      return claims.sub;
    } catch {
      throw new Error('Invalid access token');
    }
  }

  getRefreshTokenExpiresAt(refreshToken: string, now = new Date()): Date {
    if (!refreshTokenPattern.test(refreshToken)) {
      throw new Error('Invalid refresh token');
    }

    return new Date(now.getTime() + this.config.refreshTtlSeconds * 1000);
  }

  private issueRefreshToken(): string {
    return `refresh.${randomUUID()}`;
  }

  private issueAccessToken(userId: string): string {
    const iat = this.nowInSeconds();
    const header = this.encodeJson({
      alg: 'HS256',
      typ: 'JWT',
    });
    const payload = this.encodeJson({
      sub: userId,
      type: 'access',
      iat,
      exp: iat + this.config.accessTtlSeconds,
    });
    const signedContent = `${header}.${payload}`;

    return `${signedContent}.${this.sign(signedContent)}`;
  }

  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.accessTokenSecret)
      .update(value)
      .digest('base64url');
  }

  private verifySignature(signedContent: string, signature: string): void {
    const expected = Buffer.from(this.sign(signedContent), 'base64url');
    const actual = Buffer.from(signature, 'base64url');

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new Error('Invalid access token');
    }
  }

  private nowInSeconds(): number {
    return Math.floor((this.config.now?.() ?? new Date()).getTime() / 1000);
  }
}

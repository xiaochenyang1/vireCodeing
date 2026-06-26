import type { TokenPair } from './dto';

type TokenServiceConfig = {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

export class TokenService {
  constructor(private readonly config: TokenServiceConfig) {}

  issueTokenPair(userId: string): TokenPair {
    return {
      accessToken: `access.${userId}.${this.config.accessTtlSeconds}`,
      refreshToken: `refresh.${userId}.${this.config.refreshTtlSeconds}`,
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  refreshTokenPair(refreshToken: string): TokenPair {
    const [, userId] = refreshToken.split('.');

    if (!userId) {
      throw new Error('Invalid refresh token');
    }

    return this.issueTokenPair(userId);
  }
}

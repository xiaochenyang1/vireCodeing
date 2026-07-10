import { TokenService } from './token.service';

describe('TokenService', () => {
  const now = new Date('2026-06-26T06:00:00.000Z');

  function createService(currentDate = now) {
    return new TokenService({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      accessTokenSecret: 'test-access-secret',
      now: () => currentDate,
    });
  }

  function decodeJsonSegment(token: string, index: number) {
    return JSON.parse(
      Buffer.from(token.split('.')[index], 'base64url').toString('utf8'),
    );
  }

  it('issues a signed JWT access token with expiry claims', () => {
    const service = createService();

    const result = service.issueTokenPair('local-user-13800138000');

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(decodeJsonSegment(result.accessToken, 0)).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(decodeJsonSegment(result.accessToken, 1)).toEqual({
      sub: 'local-user-13800138000',
      type: 'access',
      iat: 1782453600,
      exp: 1782454500,
    });
    expect(service.getUserIdFromAccessToken(result.accessToken)).toBe(
      'local-user-13800138000',
    );
  });

  it('issues an opaque refresh token without user or ttl details', () => {
    const service = createService();

    const result = service.issueTokenPair('local-user-13800138000');

    expect(result.refreshToken).toMatch(
      /^refresh\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.refreshToken).not.toContain('local-user-13800138000');
    expect(result.refreshToken).not.toContain('604800');
    expect(service.getRefreshTokenExpiresAt(result.refreshToken, now)).toEqual(
      new Date('2026-07-03T06:00:00.000Z'),
    );
  });

  it('rejects malformed refresh tokens when calculating expiry', () => {
    const service = createService();

    for (const refreshToken of [
      'refresh.local-user-13800138000',
      'refresh.not-a-uuid',
      'access.550e8400-e29b-41d4-a716-446655440000',
      'refresh.',
    ]) {
      expect(() =>
        service.getRefreshTokenExpiresAt(refreshToken, now),
      ).toThrow('Invalid refresh token');
    }
  });

  it('rejects a tampered access token signature', () => {
    const service = createService();
    const token = service.issueTokenPair('local-user-13800138000').accessToken;
    const [header] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        sub: 'local-user-13900139000',
        type: 'access',
        iat: 1782453600,
        exp: 1782454500,
      }),
    ).toString('base64url');

    expect(() =>
      service.getUserIdFromAccessToken(`${header}.${tamperedPayload}.bad`),
    ).toThrow('Invalid access token');
    expect(() =>
      service.getUserIdFromAccessToken(`${header}.${tamperedPayload}`),
    ).toThrow('Invalid access token');
    expect(() =>
      service.getUserIdFromAccessToken(`${header}.${tamperedPayload}.`),
    ).toThrow('Invalid access token');
  });

  it('rejects an expired access token', () => {
    const service = createService();
    const token = service.issueTokenPair('local-user-13800138000').accessToken;
    const laterService = createService(
      new Date('2026-06-26T06:15:01.000Z'),
    );

    expect(() => laterService.getUserIdFromAccessToken(token)).toThrow(
      'Invalid access token',
    );
  });
});

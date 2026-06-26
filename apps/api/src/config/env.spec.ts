import { parseEnv } from './env';

describe('parseEnv', () => {
  it('parses required API environment values', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
    });
  });

  it('rejects missing JWT secrets', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toThrow('Invalid API environment');
  });
});

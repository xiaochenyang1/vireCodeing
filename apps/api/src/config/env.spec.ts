import { parseEnv } from './env';

describe('parseEnv', () => {
  it('parses required API environment values', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        VERIFICATION_CODE_TTL_SECONDS: '300',
        FILE_STORAGE_ROOT: 'var/uploads',
        FILE_PENDING_CLEANUP_INTERVAL_SECONDS: '3600',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
      JWT_ACCESS_SECRET: 'access-secret',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
      VERIFICATION_CODE_TTL_SECONDS: 300,
      ORDER_IDEMPOTENCY_TTL_SECONDS: 86400,
      PAYMENT_PROVIDER_MODE: 'disabled',
      PAYMENT_PLATFORM_FEE_BPS: 500,
      PAYMENT_ORDER_TTL_SECONDS: 900,
      MAP_PROVIDER: 'sandbox',
      FILE_STORAGE_PROVIDER: 'local',
      FILE_STORAGE_ROOT: 'var/uploads',
      FILE_PENDING_CLEANUP_INTERVAL_SECONDS: 3600,
    });
  });

  it('rejects invalid verification code ttl values', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        VERIFICATION_CODE_TTL_SECONDS: '0',
      }),
    ).toThrow('Invalid API environment');
  });

  it('parses custom order idempotency ttl values', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        ORDER_IDEMPOTENCY_TTL_SECONDS: '172800',
      }),
    ).toMatchObject({
      ORDER_IDEMPOTENCY_TTL_SECONDS: 172800,
    });
  });

  it('rejects invalid order idempotency ttl values', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        ORDER_IDEMPOTENCY_TTL_SECONDS: '0',
      }),
    ).toThrow('Invalid API environment');
  });

  it('parses sandbox payment configuration outside production', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        PAYMENT_PROVIDER_MODE: 'sandbox',
        PAYMENT_SANDBOX_SECRET: 'sandbox-payment-secret-32-characters',
        PAYMENT_PLATFORM_FEE_BPS: '650',
        PAYMENT_ORDER_TTL_SECONDS: '1200',
      }),
    ).toMatchObject({
      PAYMENT_PROVIDER_MODE: 'sandbox',
      PAYMENT_SANDBOX_SECRET: 'sandbox-payment-secret-32-characters',
      PAYMENT_PLATFORM_FEE_BPS: 650,
      PAYMENT_ORDER_TTL_SECONDS: 1200,
    });
  });

  it('rejects sandbox payment configuration in production', () => {
    expect(() =>
      parseEnv(createProductionEnv({
        PAYMENT_PROVIDER_MODE: 'sandbox',
        PAYMENT_SANDBOX_SECRET: 'sandbox-payment-secret-32-characters',
      })),
    ).toThrow('Production payment provider must not use sandbox');
  });

  it('rejects incomplete live Alipay configuration', () => {
    expect(() =>
      parseEnv(
        createProductionEnv({
          PAYMENT_PROVIDER_MODE: 'alipay',
          PAYMENT_CALLBACK_BASE_URL: 'https://api.example.com/api',
          ALIPAY_APP_ID: undefined,
          ALIPAY_SELLER_ID: undefined,
          ALIPAY_MERCHANT_PRIVATE_KEY_PEM: undefined,
          ALIPAY_PUBLIC_KEY_PEM: undefined,
        }),
      ),
    ).toThrow('Alipay payment config is incomplete');
  });

  it('accepts complete live Alipay configuration', () => {
    expect(
      parseEnv(
        createProductionEnv({
          PAYMENT_PROVIDER_MODE: 'alipay',
          PAYMENT_CALLBACK_BASE_URL: 'https://api.example.com/api',
          ALIPAY_APP_ID: 'alipay-app-id',
          ALIPAY_SELLER_ID: 'seller-id',
          ALIPAY_MERCHANT_PRIVATE_KEY_PEM: rsaPrivateKeyFixture,
          ALIPAY_PUBLIC_KEY_PEM: rsaPublicKeyFixture,
        }),
      ),
    ).toMatchObject({
      PAYMENT_PROVIDER_MODE: 'alipay',
      ALIPAY_APP_ID: 'alipay-app-id',
    });
  });

  it('parses webhook SMS environment values', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        VERIFICATION_CODE_TTL_SECONDS: '300',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
        SMS_WEBHOOK_TIMEOUT_MS: '5000',
        FILE_PREVIEW_URL_BASE: 'https://files.example.com/previews',
        FILE_PREVIEW_EXPIRES_IN_SECONDS: '600',
        FILE_PREVIEW_SIGNING_SECRET:
          'production-file-preview-secret-32-chars',
        FILE_STORAGE_CALLBACK_SIGNING_SECRET:
          'production-file-callback-secret-32-chars',
        MAP_PROVIDER: 'amap',
        AMAP_WEB_KEY: 'production-amap-web-key-16',
        PAYMENT_PROVIDER_MODE: 'alipay',
        PAYMENT_CALLBACK_BASE_URL: 'https://api.example.com/api',
        ALIPAY_APP_ID: 'alipay-app-id',
        ALIPAY_SELLER_ID: 'seller-id',
        ALIPAY_MERCHANT_PRIVATE_KEY_PEM: rsaPrivateKeyFixture,
        ALIPAY_PUBLIC_KEY_PEM: rsaPublicKeyFixture,
      }),
    ).toMatchObject({
      SMS_PROVIDER: 'webhook',
      SMS_WEBHOOK_URL: 'https://sms.example.com/send',
      SMS_WEBHOOK_TOKEN: 'production-webhook-token',
      SMS_WEBHOOK_TIMEOUT_MS: 5000,
      FILE_PREVIEW_URL_BASE: 'https://files.example.com/previews',
      FILE_PREVIEW_EXPIRES_IN_SECONDS: 600,
      FILE_PREVIEW_SIGNING_SECRET:
        'production-file-preview-secret-32-chars',
      FILE_STORAGE_CALLBACK_SIGNING_SECRET:
        'production-file-callback-secret-32-chars',
      MAP_PROVIDER: 'amap',
      AMAP_WEB_KEY: 'production-amap-web-key-16',
    });
  });

  it('requires an SMS provider in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toThrow('Production SMS provider is required');
  });

  it('requires production webhook SMS URLs to use HTTPS', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'http://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
      }),
    ).toThrow('Production SMS webhook URL must use https://');
  });

  it('rejects invalid SMS webhook timeout values', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'test-webhook-token',
        SMS_WEBHOOK_TIMEOUT_MS: '0',
      }),
    ).toThrow('Invalid API environment');
  });

  it('requires a file preview signing secret in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
      }),
    ).toThrow('Production file preview signing secret is required');
  });

  it('rejects weak file preview signing secrets in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
        FILE_PREVIEW_SIGNING_SECRET: 'short-secret',
      }),
    ).toThrow(
      'Production file preview signing secret must be at least 32 characters',
    );
  });

  it('requires a file storage callback signing secret in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
        FILE_PREVIEW_SIGNING_SECRET:
          'production-file-preview-secret-32-chars',
      }),
    ).toThrow('Production file storage callback signing secret is required');
  });

  it('rejects weak file storage callback signing secrets in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
        FILE_PREVIEW_SIGNING_SECRET:
          'production-file-preview-secret-32-chars',
        FILE_STORAGE_CALLBACK_SIGNING_SECRET: 'short-secret',
      }),
    ).toThrow(
      'Production file storage callback signing secret must be at least 32 characters',
    );
  });

  it('rejects invalid file preview expiry values', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        FILE_PREVIEW_EXPIRES_IN_SECONDS: '0',
      }),
    ).toThrow('Invalid API environment');
  });

  it('rejects invalid pending file cleanup interval values', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        FILE_PENDING_CLEANUP_INTERVAL_SECONDS: '0',
      }),
    ).toThrow('Invalid API environment');
  });

  it('parses S3 compatible file storage environment values', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        FILE_STORAGE_PROVIDER: 's3-compatible',
        S3_ENDPOINT: 'https://s3.example.com',
        S3_REGION: 'cn-north-1',
        S3_BUCKET: 'truck-files',
        S3_ACCESS_KEY_ID: 'access-key',
        S3_SECRET_ACCESS_KEY: 'secret-key',
        S3_FORCE_PATH_STYLE: 'false',
        S3_PUBLIC_URL_BASE: 'https://cdn.example.com/files',
        S3_UPLOAD_EXPIRES_IN_SECONDS: '600',
      }),
    ).toMatchObject({
      FILE_STORAGE_PROVIDER: 's3-compatible',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_REGION: 'cn-north-1',
      S3_BUCKET: 'truck-files',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret-key',
      S3_FORCE_PATH_STYLE: false,
      S3_PUBLIC_URL_BASE: 'https://cdn.example.com/files',
      S3_UPLOAD_EXPIRES_IN_SECONDS: 600,
    });
  });

  it('rejects S3 compatible file storage when required config is missing', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
        FILE_STORAGE_PROVIDER: 's3-compatible',
        S3_ENDPOINT: 'https://s3.example.com',
        S3_REGION: 'cn-north-1',
      }),
    ).toThrow('S3 compatible file storage config is incomplete');
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

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'https://example.com/database',
        JWT_ACCESS_SECRET: 'access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toThrow('DATABASE_URL must use postgresql://');
  });

  it('rejects placeholder JWT secrets in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'replace-with-dev-access-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toThrow(
      'Production JWT access secret must not use development placeholders',
    );
  });

  it('requires strong JWT secrets in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'short-secret',
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_SECONDS: '604800',
      }),
    ).toThrow('Production JWT access secret must be at least 32 characters');
  });

  it('rejects sandbox map provider in production', () => {
    expect(() =>
      parseEnv(
        createProductionEnv({
          MAP_PROVIDER: 'sandbox',
          AMAP_WEB_KEY: undefined,
        }),
      ),
    ).toThrow('Production map provider must not use sandbox');
  });

  it('requires AMAP_WEB_KEY when MAP_PROVIDER=amap', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        MAP_PROVIDER: 'amap',
      }),
    ).toThrow('AMAP_WEB_KEY is required when MAP_PROVIDER=amap');
  });

  it('parses amap map provider configuration', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
        MAP_PROVIDER: 'amap',
        AMAP_WEB_KEY: 'development-amap-web-key',
        AMAP_TIMEOUT_MS: '8000',
      }),
    ).toMatchObject({
      MAP_PROVIDER: 'amap',
      AMAP_WEB_KEY: 'development-amap-web-key',
      AMAP_TIMEOUT_MS: 8000,
    });
  });
});

const rsaPrivateKeyFixture = '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----';
const rsaPublicKeyFixture = '-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----';

function createProductionEnv(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
    JWT_ACCESS_SECRET: 'production-access-secret-with-32-chars',
    SMS_PROVIDER: 'webhook',
    SMS_WEBHOOK_URL: 'https://sms.example.com/send',
    SMS_WEBHOOK_TOKEN: 'production-webhook-token',
    FILE_PREVIEW_SIGNING_SECRET:
      'production-file-preview-secret-32-chars',
    FILE_STORAGE_CALLBACK_SIGNING_SECRET:
      'production-file-callback-secret-32-chars',
    MAP_PROVIDER: 'amap',
    AMAP_WEB_KEY: 'production-amap-web-key-16',
    PAYMENT_PROVIDER_MODE: 'alipay',
    PAYMENT_CALLBACK_BASE_URL: 'https://api.example.com/api',
    ALIPAY_APP_ID: 'alipay-app-id',
    ALIPAY_SELLER_ID: 'seller-id',
    ALIPAY_MERCHANT_PRIVATE_KEY_PEM: rsaPrivateKeyFixture,
    ALIPAY_PUBLIC_KEY_PEM: rsaPublicKeyFixture,
    ...overrides,
  };
}

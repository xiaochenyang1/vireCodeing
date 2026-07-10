import { z } from 'zod';

const optionalBooleanString = z.preprocess(value => {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true' || value === true) {
    return true;
  }

  if (value === 'false' || value === false) {
    return false;
  }

  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(value => value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use postgresql://',
    }),
  JWT_ACCESS_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604800),
  VERIFICATION_CODE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  SMS_PROVIDER: z.enum(['webhook']).optional(),
  SMS_WEBHOOK_URL: z.string().url().optional(),
  SMS_WEBHOOK_TOKEN: z.string().optional(),
  SMS_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  FILE_PREVIEW_URL_BASE: z.string().url().optional(),
  FILE_PREVIEW_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  FILE_PREVIEW_SIGNING_SECRET: z.string().optional(),
  FILE_STORAGE_CALLBACK_SIGNING_SECRET: z.string().optional(),
  FILE_STORAGE_PROVIDER: z
    .enum(['local', 's3-compatible'])
    .default('local'),
  FILE_STORAGE_ROOT: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: optionalBooleanString,
  S3_PUBLIC_URL_BASE: z.string().url().optional(),
  S3_UPLOAD_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  FILE_PENDING_CLEANUP_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

export type ApiEnv = z.infer<typeof envSchema>;

const developmentJwtSecretPlaceholders = new Set([
  'replace-with-dev-access-secret',
]);

export function parseEnv(input: NodeJS.ProcessEnv): ApiEnv {
  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid API environment: ${parsed.error.message}`);
  }

  if (parsed.data.NODE_ENV === 'production') {
    validateProductionJwtSecrets(parsed.data);
    validateProductionSmsConfig(parsed.data);
    validateProductionFilePreviewConfig(parsed.data);
    validateProductionFileStorageCallbackConfig(parsed.data);
  }

  validateWebhookSmsConfig(parsed.data);
  validateS3CompatibleFileStorageConfig(parsed.data);

  return parsed.data;
}

function validateS3CompatibleFileStorageConfig(env: ApiEnv): void {
  if (env.FILE_STORAGE_PROVIDER !== 's3-compatible') {
    return;
  }

  if (
    !env.S3_ENDPOINT ||
    !env.S3_REGION ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  ) {
    throw new Error('S3 compatible file storage config is incomplete');
  }
}

function validateProductionFilePreviewConfig(env: ApiEnv): void {
  if (!env.FILE_PREVIEW_SIGNING_SECRET) {
    throw new Error('Production file preview signing secret is required');
  }

  if (env.FILE_PREVIEW_SIGNING_SECRET.length < 32) {
    throw new Error(
      'Production file preview signing secret must be at least 32 characters',
    );
  }
}

function validateProductionFileStorageCallbackConfig(env: ApiEnv): void {
  if (!env.FILE_STORAGE_CALLBACK_SIGNING_SECRET) {
    throw new Error(
      'Production file storage callback signing secret is required',
    );
  }

  if (env.FILE_STORAGE_CALLBACK_SIGNING_SECRET.length < 32) {
    throw new Error(
      'Production file storage callback signing secret must be at least 32 characters',
    );
  }
}

function validateProductionJwtSecrets(env: ApiEnv): void {
  if (developmentJwtSecretPlaceholders.has(env.JWT_ACCESS_SECRET)) {
    throw new Error(
      'Production JWT access secret must not use development placeholders',
    );
  }

  if (env.JWT_ACCESS_SECRET.length < 32) {
    throw new Error(
      'Production JWT access secret must be at least 32 characters',
    );
  }
}

function validateProductionSmsConfig(env: ApiEnv): void {
  if (!env.SMS_PROVIDER) {
    throw new Error('Production SMS provider is required');
  }

  if (
    env.SMS_PROVIDER === 'webhook' &&
    !env.SMS_WEBHOOK_URL?.startsWith('https://')
  ) {
    throw new Error('Production SMS webhook URL must use https://');
  }

  if (
    env.SMS_PROVIDER === 'webhook' &&
    (env.SMS_WEBHOOK_TOKEN?.length ?? 0) < 16
  ) {
    throw new Error(
      'Production SMS webhook token must be at least 16 characters',
    );
  }
}

function validateWebhookSmsConfig(env: ApiEnv): void {
  if (env.SMS_PROVIDER !== 'webhook') {
    return;
  }

  if (!env.SMS_WEBHOOK_URL) {
    throw new Error('SMS_WEBHOOK_URL is required when SMS_PROVIDER=webhook');
  }

  if (!env.SMS_WEBHOOK_TOKEN) {
    throw new Error('SMS_WEBHOOK_TOKEN is required when SMS_PROVIDER=webhook');
  }
}

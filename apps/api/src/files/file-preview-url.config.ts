export function createFilePreviewUrlSignerConfigFromEnv(
  env: NodeJS.ProcessEnv,
) {
  const signingSecret = getFilePreviewSigningSecret(env);

  return {
    ...(env.FILE_PREVIEW_URL_BASE
      ? { previewUrlBase: env.FILE_PREVIEW_URL_BASE }
      : {}),
    previewExpiresInSeconds: parsePositiveInteger(
      env.FILE_PREVIEW_EXPIRES_IN_SECONDS,
      600,
      'FILE_PREVIEW_EXPIRES_IN_SECONDS',
    ),
    ...(signingSecret ? { signingSecret } : {}),
  };
}

function getFilePreviewSigningSecret(env: NodeJS.ProcessEnv) {
  const secret = env.FILE_PREVIEW_SIGNING_SECRET;

  if (secret) {
    if (env.NODE_ENV === 'production') {
      validateProductionFilePreviewSigningSecret(secret);
    }

    return secret;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('FILE_PREVIEW_SIGNING_SECRET is required in production');
  }

  return undefined;
}

function validateProductionFilePreviewSigningSecret(secret: string): void {
  if (secret.length < 32) {
    throw new Error(
      'FILE_PREVIEW_SIGNING_SECRET must be at least 32 characters in production',
    );
  }
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

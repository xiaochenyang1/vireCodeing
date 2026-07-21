/**
 * S3-compatible / MinIO file storage acceptance smoke.
 *
 * Proves production-integration prerequisites for FILE_STORAGE_PROVIDER=s3-compatible:
 * - create upload intent with SigV4 PUT URL
 * - client PUT bytes to presigned URL
 * - confirm via POST /files/{fileId}/uploaded (provider HEAD)
 * - optional HMAC storage callback path
 * - admin reject-expired / delete-rejected maintenance DELETE path when easy
 *
 * Requires:
 * - reachable PostgreSQL DATABASE_URL (or TEST_DATABASE_URL with --test)
 * - reachable S3-compatible endpoint with credentials:
 *   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *
 * Opt-in only: exits with a clear skip message when S3 env is incomplete.
 * Does not cover native MinIO/AWS event formats, virus scan, or S3 signed GET preview.
 */
const assert = require('assert/strict');
const { createHmac, randomUUID } = require('crypto');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const {
  formatDatabaseUrlForDisplay,
  resolveDatabaseUrl,
} = require('./verify-postgres');
const {
  STAGE_1_SHIPPER_PHONE,
  buildApiForSmoke,
  cleanupSmokeBuildOutputRoot,
  seedStage1Database,
} = require('./seed-stage-1');

const FILE_SMOKE_CALLBACK_SECRET =
  'file-storage-smoke-callback-secret-32chars!!';
const FILE_SMOKE_PREVIEW_SECRET =
  'file-storage-smoke-preview-secret-32chars!!';
const FILE_SMOKE_JWT_SECRET = 'file-storage-smoke-jwt-secret-32chars!!';
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EAD0QAAIBAgQDBgQEBQUBAAAAAAECAwQRAAUSITFBBhMiUWFxMoGRobHB0RQjQlLh8PEkM2JygiQzQ1OS/8QAGQEAAwEBAQAAAAAAAAAAAAAAAAECAwQF/8QAJBEAAgICAgICAwEAAAAAAAAAAAECEQMhEjFBBBNRImEy/9oADAMBAAIRAxEAPwD3+iiigAooooA//9k=',
  'base64',
);

function parseArgs(argv) {
  const extraArgs = argv.slice(2);
  if (
    extraArgs.length > 1 ||
    (extraArgs.length === 1 && extraArgs[0] !== '--test')
  ) {
    throw new Error('Usage: node scripts/verify-s3-file-storage.js [--test]');
  }

  return {
    useTestDatabase: extraArgs.includes('--test'),
  };
}

function resolveS3Config(env) {
  const required = [
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ];
  const missing = required.filter(key => !env[key]);
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
    };
  }

  return {
    ok: true,
    config: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
      publicUrlBase: env.S3_PUBLIC_URL_BASE,
    },
  };
}

async function main(argv = process.argv, env = process.env) {
  const { useTestDatabase } = parseArgs(argv);
  const s3 = resolveS3Config(env);
  if (!s3.ok) {
    console.log(
      JSON.stringify({
        skipped: true,
        reason:
          'S3-compatible env incomplete; set S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY to run acceptance',
        missing: s3.missing,
      }),
    );
    return 0;
  }

  const databaseUrl = resolveDatabaseUrl(env, useTestDatabase);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  const apiRoot = path.join(__dirname, '..');
  const buildOutputRoot = buildApiForSmoke(apiRoot);
  const apiPort = await allocateEphemeralPort();
  const smokeEnv = createFileSmokeEnv(env, databaseUrl, apiPort, s3.config);
  const serverController = startApiServerProcess(
    apiRoot,
    smokeEnv,
    spawn,
    buildOutputRoot,
  );
  const apiClient = createFileSmokeApiClient(`http://127.0.0.1:${apiPort}`);

  try {
    await prisma.$connect();
    await waitForApiServerReady(apiClient, serverController);
    await seedStage1Database(prisma);
    await resetSmokeVerificationCodes(prisma, [STAGE_1_SHIPPER_PHONE]);

    const shipper = await apiClient.loginWithCode(
      STAGE_1_SHIPPER_PHONE,
      'shipper',
      `file-smoke-${randomUUID()}`,
    );

    const headConfirm = await runPresignPutAndHeadConfirmScenario({
      apiClient,
      accessToken: shipper.tokens.accessToken,
    });
    const callback = await runStorageCallbackScenario({
      apiClient,
      accessToken: shipper.tokens.accessToken,
      callbackSecret: smokeEnv.FILE_STORAGE_CALLBACK_SIGNING_SECRET,
    });
    const maintenance = await runMaintenanceDeleteScenario({
      apiClient,
      accessToken: shipper.tokens.accessToken,
      adminAccessToken: await createAdminAccessToken(
        prisma,
        smokeEnv.JWT_ACCESS_SECRET,
      ),
    });

    console.log(
      JSON.stringify({
        databaseUrl: formatDatabaseUrlForDisplay(databaseUrl),
        s3Endpoint: s3.config.endpoint,
        s3Bucket: s3.config.bucket,
        headConfirm,
        callback,
        maintenance,
        ok: true,
      }),
    );
    return 0;
  } finally {
    await Promise.allSettled([
      stopApiServerProcess(serverController),
      prisma.$disconnect(),
      cleanupSmokeBuildOutputRoot(buildOutputRoot),
    ]);
  }
}

async function runPresignPutAndHeadConfirmScenario({ apiClient, accessToken }) {
  const intent = await apiClient.createUploadIntent(accessToken, {
    purpose: 'cargo',
    fileName: `smoke-${randomUUID()}.jpg`,
    contentType: 'image/jpeg',
    byteSize: JPEG_1X1.byteLength,
  });

  assert.equal(intent.status, 'pending');
  assert.ok(intent.uploadUrl);
  assert.match(intent.uploadUrl, /^https?:\/\//);

  const putResponse = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(JPEG_1X1.byteLength),
    },
    body: JPEG_1X1,
  });
  assert.ok(
    putResponse.ok,
    `presigned PUT failed with status ${putResponse.status}`,
  );

  const confirmed = await apiClient.confirmUploaded(accessToken, intent.id, {});
  assert.equal(confirmed.status, 'uploaded');
  assert.equal(confirmed.id, intent.id);

  return {
    intentCreated: true,
    presignedPutSucceeded: true,
    headConfirmUploaded: true,
    fileId: confirmed.id,
  };
}

async function runStorageCallbackScenario({
  apiClient,
  accessToken,
  callbackSecret,
}) {
  const intent = await apiClient.createUploadIntent(accessToken, {
    purpose: 'identity',
    fileName: `callback-${randomUUID()}.jpg`,
    contentType: 'image/jpeg',
    byteSize: JPEG_1X1.byteLength,
  });

  const putResponse = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(JPEG_1X1.byteLength),
    },
    body: JPEG_1X1,
  });
  assert.ok(putResponse.ok, `callback scenario PUT failed: ${putResponse.status}`);

  const callbackBody = {
    fileId: intent.id,
    objectKey: intent.objectKey,
    byteSize: intent.byteSize,
    contentType: intent.contentType,
    etag: putResponse.headers.get('etag') || undefined,
    versionId: putResponse.headers.get('x-amz-version-id') || undefined,
  };
  const signature = signStorageCallback(callbackBody, callbackSecret);
  const confirmed = await apiClient.confirmStorageCallback({
    ...callbackBody,
    signature,
  });
  assert.equal(confirmed.status, 'uploaded');

  await assert.rejects(
    () =>
      apiClient.confirmStorageCallback({
        ...callbackBody,
        signature: '0'.repeat(64),
      }),
    error => {
      assert.equal(error.code, 'FILE_STORAGE_CALLBACK_INVALID');
      return true;
    },
  );

  return {
    validCallbackUploaded: true,
    invalidCallbackRejected: true,
    fileId: confirmed.id,
  };
}

async function runMaintenanceDeleteScenario({
  apiClient,
  accessToken,
  adminAccessToken,
}) {
  const intent = await apiClient.createUploadIntent(accessToken, {
    purpose: 'exception',
    fileName: `maintenance-${randomUUID()}.jpg`,
    contentType: 'image/jpeg',
    byteSize: JPEG_1X1.byteLength,
  });

  // Leave as pending and force reject via admin batch if possible; otherwise reject-expired.
  // For smoke without waiting expiry, use batch-governance reject_pending.
  const batch = await apiClient.batchGovernance(adminAccessToken, {
    action: 'reject_pending',
    fileIds: [intent.id],
  });
  assert.ok(batch.processedCount >= 1 || batch.matchedCount >= 1);

  const deleted = await apiClient.batchGovernance(adminAccessToken, {
    action: 'delete_rejected_objects',
    fileIds: [intent.id],
  });

  return {
    rejectPendingProcessed: batch.processedCount ?? 0,
    deleteRejectedProcessed: deleted.processedCount ?? 0,
    deleteRejectedAttempted: true,
  };
}

function signStorageCallback(input, secret) {
  return createHmac('sha256', secret)
    .update(
      [
        input.fileId,
        input.objectKey,
        String(input.byteSize),
        input.contentType,
        input.etag ?? '',
        input.versionId ?? '',
      ].join('\n'),
    )
    .digest('hex');
}

function createFileSmokeEnv(env, databaseUrl, port, s3Config) {
  return {
    ...env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET || FILE_SMOKE_JWT_SECRET,
    ACCESS_TOKEN_TTL_SECONDS: env.ACCESS_TOKEN_TTL_SECONDS || '900',
    REFRESH_TOKEN_TTL_SECONDS: env.REFRESH_TOKEN_TTL_SECONDS || '604800',
    VERIFICATION_CODE_TTL_SECONDS:
      env.VERIFICATION_CODE_TTL_SECONDS || '300',
    ORDER_IDEMPOTENCY_TTL_SECONDS:
      env.ORDER_IDEMPOTENCY_TTL_SECONDS || '86400',
    FILE_STORAGE_PROVIDER: 's3-compatible',
    S3_ENDPOINT: s3Config.endpoint,
    S3_REGION: s3Config.region,
    S3_BUCKET: s3Config.bucket,
    S3_ACCESS_KEY_ID: s3Config.accessKeyId,
    S3_SECRET_ACCESS_KEY: s3Config.secretAccessKey,
    S3_FORCE_PATH_STYLE: s3Config.forcePathStyle ? 'true' : 'false',
    ...(s3Config.publicUrlBase
      ? { S3_PUBLIC_URL_BASE: s3Config.publicUrlBase }
      : {}),
    FILE_STORAGE_CALLBACK_SIGNING_SECRET:
      env.FILE_STORAGE_CALLBACK_SIGNING_SECRET || FILE_SMOKE_CALLBACK_SECRET,
    FILE_PREVIEW_SIGNING_SECRET:
      env.FILE_PREVIEW_SIGNING_SECRET || FILE_SMOKE_PREVIEW_SECRET,
  };
}

function createFileSmokeApiClient(baseUrl, fetchImpl = fetch) {
  return {
    async ping() {
      const response = await fetchImpl(`${baseUrl}/api/me`, { method: 'GET' });
      return response.status > 0;
    },
    async loginWithCode(phone, userType, deviceId) {
      const sendCodeResult = await requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        '/api/auth/send-code',
        {
          body: {
            phone,
            purpose: 'login',
          },
        },
      );
      const code = sendCodeResult.devCode || '123456';
      return requestApi(fetchImpl, baseUrl, 'POST', '/api/auth/login', {
        body: {
          phone,
          code,
          userType,
          deviceId,
        },
      });
    },
    createUploadIntent(accessToken, body) {
      return requestApi(fetchImpl, baseUrl, 'POST', '/api/files/upload-intents', {
        accessToken,
        body,
      });
    },
    confirmUploaded(accessToken, fileId, body = {}) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        `/api/files/${fileId}/uploaded`,
        {
          accessToken,
          body,
        },
      );
    },
    confirmStorageCallback(body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        '/api/files/storage-callbacks/s3-compatible',
        {
          body,
        },
      );
    },
    batchGovernance(accessToken, body) {
      return requestApi(
        fetchImpl,
        baseUrl,
        'POST',
        '/api/files/maintenance/batch-governance',
        {
          accessToken,
          body,
        },
      );
    },
  };
}

async function createAdminAccessToken(prisma, secret) {
  const admin = await prisma.user.findFirst({
    where: { userType: 'admin', status: 'active' },
  });
  if (!admin) {
    throw new Error('No admin user found for file maintenance smoke');
  }
  return createAccessToken(admin.id, secret, 900);
}

function createAccessToken(userId, secret, ttlSeconds, now = new Date()) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      type: 'access',
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

async function requestApi(fetchImpl, baseUrl, method, pathname, options = {}) {
  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.accessToken
        ? { authorization: `Bearer ${options.accessToken}` }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || (payload.code && payload.code !== 'OK')) {
    const error = new Error(payload.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload.code || `HTTP_${response.status}`;
    error.payload = payload;
    throw error;
  }

  return payload.data ?? payload;
}

async function resetSmokeVerificationCodes(prisma, phones) {
  if (!prisma.verificationCode?.deleteMany) {
    return;
  }
  await prisma.verificationCode.deleteMany({
    where: {
      phone: {
        in: phones,
      },
    },
  });
}

function startApiServerProcess(apiRoot, env, spawnImpl, buildOutputRoot) {
  const builtApiRoot = buildOutputRoot || path.join(apiRoot, 'dist');
  const child = spawnImpl(process.execPath, [path.join(builtApiRoot, 'main.js')], {
    cwd: apiRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout?.on('data', chunk => stdout.push(Buffer.from(chunk)));
  child.stderr?.on('data', chunk => stderr.push(Buffer.from(chunk)));
  return {
    child,
    getLogs() {
      return Buffer.concat([...stdout, ...stderr]).toString('utf8');
    },
  };
}

async function waitForApiServerReady(
  apiClient,
  serverController,
  timeoutMs = 30000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasChildProcessExited(serverController.child)) {
      throw new Error(
        `API smoke server exited early with code ${
          serverController.child.exitCode ?? serverController.child.signalCode
        }\n${serverController.getLogs()}`,
      );
    }
    try {
      if (await apiClient.ping()) {
        return;
      }
    } catch {
      // startup race
    }
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for API smoke server readiness\n${serverController.getLogs()}`,
  );
}

async function stopApiServerProcess(serverController) {
  if (!serverController || hasChildProcessExited(serverController.child)) {
    return;
  }
  serverController.child.kill();
  await Promise.race([
    new Promise(resolve => {
      serverController.child.once('exit', () => resolve(undefined));
    }),
    delay(5000),
  ]);
}

function hasChildProcessExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate port')));
        return;
      }
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().then(
    exitCode => {
      process.exitCode = exitCode;
    },
    error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  createFileSmokeEnv,
  main,
  parseArgs,
  resolveS3Config,
  signStorageCallback,
};

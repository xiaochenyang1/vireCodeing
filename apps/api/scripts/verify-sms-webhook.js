/**
 * SMS webhook acceptance smoke.
 *
 * Proves production-integration prerequisites for the generic webhook SMS port:
 * - API starts with SMS_PROVIDER=webhook
 * - send-code POSTs phone/purpose/code/expiresAt with Bearer token
 * - login works with the webhook-captured code (not only fixed devCode)
 * - non-2xx webhook delivery revokes the undelivered code and returns AUTH_CODE_DELIVERY_FAILED
 *
 * Requires a reachable PostgreSQL DATABASE_URL (or TEST_DATABASE_URL with --test).
 * This is not a carrier SMS vendor SDK acceptance.
 */
const assert = require('assert/strict');
const http = require('http');
const net = require('net');
const path = require('path');
const { randomUUID } = require('crypto');
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

const SMS_SMOKE_TOKEN = 'sms-webhook-smoke-token-16';
const SMS_SMOKE_JWT_SECRET = 'sms-webhook-smoke-jwt-secret-32chars!!';

function parseArgs(argv) {
  const extraArgs = argv.slice(2);
  if (
    extraArgs.length > 1 ||
    (extraArgs.length === 1 && extraArgs[0] !== '--test')
  ) {
    throw new Error('Usage: node scripts/verify-sms-webhook.js [--test]');
  }

  return {
    useTestDatabase: extraArgs.includes('--test'),
  };
}

async function main(argv = process.argv, env = process.env) {
  const { useTestDatabase } = parseArgs(argv);
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
  const webhookPort = await allocateEphemeralPort();
  const apiPort = await allocateEphemeralPort();
  const webhook = startSmsWebhookReceiver(webhookPort);
  const smokeEnv = createSmsSmokeEnv(env, databaseUrl, apiPort, webhook.url);
  const serverController = startApiServerProcess(
    apiRoot,
    smokeEnv,
    spawn,
    buildOutputRoot,
  );
  const apiClient = createSmsSmokeApiClient(`http://127.0.0.1:${apiPort}`);

  try {
    await prisma.$connect();
    await waitForApiServerReady(apiClient, serverController);
    await seedStage1Database(prisma);
    await resetSmokeVerificationCodes(prisma, [
      STAGE_1_SHIPPER_PHONE,
      '13800138888',
    ]);

    const delivery = await runSuccessfulWebhookDeliveryScenario({
      apiClient,
      webhook,
      phone: STAGE_1_SHIPPER_PHONE,
    });
    const failure = await runWebhookDeliveryFailureScenario({
      apiClient,
      webhook,
      phone: '13800138888',
    });

    console.log(
      JSON.stringify({
        databaseUrl: formatDatabaseUrlForDisplay(databaseUrl),
        delivery,
        failure,
        ok: true,
      }),
    );
    return 0;
  } finally {
    await Promise.allSettled([
      stopApiServerProcess(serverController),
      webhook.close(),
      prisma.$disconnect(),
      cleanupSmokeBuildOutputRoot(buildOutputRoot),
    ]);
  }
}

async function runSuccessfulWebhookDeliveryScenario({
  apiClient,
  webhook,
  phone,
}) {
  webhook.setNextStatus(200);
  webhook.clearDeliveries();

  const sendResult = await apiClient.sendCode(phone, 'login');
  assert.equal(sendResult.code, undefined);
  assert.ok(sendResult.expireSeconds > 0);

  const delivery = await webhook.waitForDelivery(5000);
  assert.equal(delivery.authorization, `Bearer ${SMS_SMOKE_TOKEN}`);
  assert.equal(delivery.body.phone, phone);
  assert.equal(delivery.body.purpose, 'login');
  assert.match(String(delivery.body.code), /^\d{6}$/);
  assert.ok(delivery.body.expiresAt);

  const loginResult = await apiClient.loginWithCode(
    phone,
    delivery.body.code,
    'shipper',
    `sms-smoke-${randomUUID()}`,
  );
  assert.ok(loginResult.tokens?.accessToken);
  assert.equal(loginResult.user?.phone, phone);

  return {
    webhookDelivered: true,
    loginWithCapturedCode: true,
    capturedCodeLength: String(delivery.body.code).length,
    hadDevCode: Boolean(sendResult.devCode),
  };
}

async function runWebhookDeliveryFailureScenario({
  apiClient,
  webhook,
  phone,
}) {
  webhook.setNextStatus(503);
  webhook.clearDeliveries();

  await assert.rejects(
    () => apiClient.sendCode(phone, 'login'),
    error => {
      assert.equal(error.code, 'AUTH_CODE_DELIVERY_FAILED');
      assert.equal(error.status, 502);
      return true;
    },
  );

  const delivery = await webhook.waitForDelivery(5000);
  assert.equal(delivery.body.phone, phone);
  assert.match(String(delivery.body.code), /^\d{6}$/);

  await assert.rejects(
    () =>
      apiClient.loginWithCode(
        phone,
        delivery.body.code,
        'shipper',
        `sms-smoke-fail-${randomUUID()}`,
      ),
    error => {
      assert.ok(
        error.code === 'AUTH_CODE_INVALID' ||
          error.code === 'AUTH_CODE_EXPIRED',
      );
      return true;
    },
  );

  return {
    deliveryFailedWith502: true,
    undeliveredCodeUnusable: true,
  };
}

function startSmsWebhookReceiver(port) {
  /** @type {Array<{ authorization?: string, body: any }>} */
  const deliveries = [];
  let nextStatus = 200;
  /** @type {((delivery: any) => void) | null} */
  let pendingResolve = null;

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { raw };
      }

      const delivery = {
        authorization: req.headers.authorization,
        body,
      };
      deliveries.push(delivery);
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(delivery);
      }

      const status = nextStatus;
      nextStatus = 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: status >= 200 && status < 300 }));
    });
  });

  server.listen(port, '127.0.0.1');

  return {
    url: `http://127.0.0.1:${port}/sms-webhook`,
    setNextStatus(status) {
      nextStatus = status;
    },
    clearDeliveries() {
      deliveries.length = 0;
      pendingResolve = null;
    },
    waitForDelivery(timeoutMs = 5000) {
      if (deliveries.length > 0) {
        return Promise.resolve(deliveries[deliveries.length - 1]);
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingResolve = null;
          reject(new Error('Timed out waiting for SMS webhook delivery'));
        }, timeoutMs);

        pendingResolve = delivery => {
          clearTimeout(timer);
          resolve(delivery);
        };
      });
    },
    close() {
      return new Promise(resolve => {
        server.close(() => resolve(undefined));
      });
    },
  };
}

function createSmsSmokeEnv(env, databaseUrl, port, webhookUrl) {
  return {
    ...env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET || SMS_SMOKE_JWT_SECRET,
    ACCESS_TOKEN_TTL_SECONDS: env.ACCESS_TOKEN_TTL_SECONDS || '900',
    REFRESH_TOKEN_TTL_SECONDS: env.REFRESH_TOKEN_TTL_SECONDS || '604800',
    VERIFICATION_CODE_TTL_SECONDS:
      env.VERIFICATION_CODE_TTL_SECONDS || '300',
    ORDER_IDEMPOTENCY_TTL_SECONDS:
      env.ORDER_IDEMPOTENCY_TTL_SECONDS || '86400',
    FILE_STORAGE_PROVIDER: 'local',
    SMS_PROVIDER: 'webhook',
    SMS_WEBHOOK_URL: webhookUrl,
    SMS_WEBHOOK_TOKEN: SMS_SMOKE_TOKEN,
    SMS_WEBHOOK_TIMEOUT_MS: '3000',
  };
}

function createSmsSmokeApiClient(baseUrl, fetchImpl = fetch) {
  return {
    async ping() {
      const response = await fetchImpl(`${baseUrl}/api/me`, { method: 'GET' });
      return response.status > 0;
    },
    async sendCode(phone, purpose) {
      return requestApi(fetchImpl, baseUrl, 'POST', '/api/auth/send-code', {
        body: { phone, purpose },
      });
    },
    async loginWithCode(phone, code, userType, deviceId) {
      return requestApi(fetchImpl, baseUrl, 'POST', '/api/auth/login', {
        body: { phone, code, userType, deviceId },
      });
    },
  };
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
  createSmsSmokeEnv,
  main,
  parseArgs,
  startSmsWebhookReceiver,
};

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const {
  createSmsSmokeEnv,
  parseArgs: parseSmsArgs,
  startSmsWebhookReceiver,
} = require('../../scripts/verify-sms-webhook');
const {
  parseArgs: parseS3Args,
  resolveS3Config,
  signStorageCallback,
  createFileSmokeEnv,
} = require('../../scripts/verify-s3-file-storage');

describe('SMS webhook and S3 file storage acceptance scripts', () => {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const envExamplePath = join(__dirname, '..', '..', '.env.example');
  const minioComposePath = join(
    __dirname,
    '..',
    '..',
    'docker-compose.minio.yml',
  );
  const smsScriptPath = join(
    __dirname,
    '..',
    '..',
    'scripts',
    'verify-sms-webhook.js',
  );
  const s3ScriptPath = join(
    __dirname,
    '..',
    '..',
    'scripts',
    'verify-s3-file-storage.js',
  );

  it('exposes npm scripts for SMS webhook and S3 storage smoke', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:postgres:sms-smoke']).toBe(
      'node scripts/verify-sms-webhook.js',
    );
    expect(packageJson.scripts['db:test:postgres:sms-smoke']).toBe(
      'node scripts/verify-sms-webhook.js --test',
    );
    expect(packageJson.scripts['db:postgres:s3-smoke']).toBe(
      'node scripts/verify-s3-file-storage.js',
    );
    expect(packageJson.scripts['db:test:postgres:s3-smoke']).toBe(
      'node scripts/verify-s3-file-storage.js --test',
    );
    expect(packageJson.scripts['db:dev:minio:up']).toBe(
      'docker compose -f docker-compose.minio.yml up -d',
    );
    expect(packageJson.scripts['db:dev:minio:down']).toBe(
      'docker compose -f docker-compose.minio.yml down',
    );
  });

  it('keeps default bootstrap free of required SMS/S3 acceptance', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:postgres:bootstrap']).not.toContain(
      'sms-smoke',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).not.toContain(
      's3-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).not.toContain(
      'sms-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).not.toContain(
      's3-smoke',
    );
  });

  it('documents SMS and S3 acceptance commands in .env.example', () => {
    const source = readFileSync(envExamplePath, 'utf8');
    expect(source).toContain('db:postgres:sms-smoke');
    expect(source).toContain('db:postgres:s3-smoke');
    expect(source).toContain('db:dev:minio:up');
    expect(source).toContain('S3_ENDPOINT=http://127.0.0.1:9000');
  });

  it('ships MinIO compose and acceptance scripts', () => {
    expect(existsSync(minioComposePath)).toBe(true);
    expect(existsSync(smsScriptPath)).toBe(true);
    expect(existsSync(s3ScriptPath)).toBe(true);

    const minio = readFileSync(minioComposePath, 'utf8');
    expect(minio).toContain('minio/minio');
    expect(minio).toContain('truck-files');
  });

  it('parses SMS and S3 smoke args', () => {
    expect(parseSmsArgs(['node', 'verify-sms-webhook.js'])).toEqual({
      useTestDatabase: false,
    });
    expect(parseSmsArgs(['node', 'verify-sms-webhook.js', '--test'])).toEqual({
      useTestDatabase: true,
    });
    expect(parseS3Args(['node', 'verify-s3-file-storage.js'])).toEqual({
      useTestDatabase: false,
    });
    expect(parseS3Args(['node', 'verify-s3-file-storage.js', '--test'])).toEqual(
      {
        useTestDatabase: true,
      },
    );
  });

  it('builds SMS smoke env with webhook provider settings', () => {
    const env = createSmsSmokeEnv(
      {},
      'postgresql://truck:truck@localhost:5432/truck_platform',
      3456,
      'http://127.0.0.1:9999/sms-webhook',
    );

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: '3456',
      SMS_PROVIDER: 'webhook',
      SMS_WEBHOOK_URL: 'http://127.0.0.1:9999/sms-webhook',
      FILE_STORAGE_PROVIDER: 'local',
    });
    expect(env.SMS_WEBHOOK_TOKEN.length).toBeGreaterThanOrEqual(16);
  });

  it('skips S3 acceptance when credentials are incomplete', () => {
    expect(resolveS3Config({})).toEqual({
      ok: false,
      missing: [
        'S3_ENDPOINT',
        'S3_REGION',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ],
    });

    expect(
      resolveS3Config({
        S3_ENDPOINT: 'http://127.0.0.1:9000',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'truck-files',
        S3_ACCESS_KEY_ID: 'minioadmin',
        S3_SECRET_ACCESS_KEY: 'minioadmin',
      }),
    ).toMatchObject({
      ok: true,
      config: {
        endpoint: 'http://127.0.0.1:9000',
        bucket: 'truck-files',
        forcePathStyle: true,
      },
    });
  });

  it('builds S3 smoke env and signs storage callbacks like the service', () => {
    const env = createFileSmokeEnv(
      {},
      'postgresql://truck:truck@localhost:5432/truck_platform',
      3457,
      {
        endpoint: 'http://127.0.0.1:9000',
        region: 'us-east-1',
        bucket: 'truck-files',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
        forcePathStyle: true,
      },
    );

    expect(env).toMatchObject({
      FILE_STORAGE_PROVIDER: 's3-compatible',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_BUCKET: 'truck-files',
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(env.FILE_STORAGE_CALLBACK_SIGNING_SECRET.length).toBeGreaterThanOrEqual(
      32,
    );

    const signature = signStorageCallback(
      {
        fileId: 'file-1',
        objectKey: 'cargo/file-1.jpg',
        byteSize: 123,
        contentType: 'image/jpeg',
        etag: '"abc"',
        versionId: 'v1',
      },
      env.FILE_STORAGE_CALLBACK_SIGNING_SECRET,
    );
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('can start and stop an ephemeral SMS webhook receiver', async () => {
    const net = await import('net');
    const port = await new Promise<number | undefined>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', error => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'EACCES') {
          resolve(undefined);
          return;
        }

        reject(error);
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('port alloc failed'));
          return;
        }
        const allocated = address.port;
        server.close(() => resolve(allocated));
      });
    });

    if (port === undefined) {
      return;
    }

    const receiver = startSmsWebhookReceiver(port);
    receiver.setNextStatus(200);

    const response = await fetch(receiver.url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer sms-webhook-smoke-token-16',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        phone: '13800138000',
        purpose: 'login',
        code: '654321',
        expiresAt: '2026-07-21T12:00:00.000Z',
      }),
    });
    expect(response.ok).toBe(true);

    const delivery = await receiver.waitForDelivery(1000);
    expect(delivery.body).toMatchObject({
      phone: '13800138000',
      code: '654321',
    });

    await receiver.close();
  });
});

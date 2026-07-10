import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const {
  createPrismaConnectionInvocation,
  createPostgresDoctorReport,
  createPrismaInvocation,
  formatDatabaseUrlForDisplay,
  parseArgs,
  resolveDatabaseUrl,
} = require('../../scripts/verify-postgres');

describe('PostgreSQL verification script', () => {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const composePath = join(__dirname, '..', '..', 'docker-compose.postgres.yml');
  const envExamplePath = join(__dirname, '..', '..', '.env.example');

  it('uses the default local DATABASE_URL for normal PostgreSQL verification', () => {
    expect(resolveDatabaseUrl({})).toBe(
      'postgresql://truck:truck@localhost:5432/truck_platform',
    );
  });

  it('uses explicit DATABASE_URL when provided for normal PostgreSQL verification', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
      }),
    ).toBe('postgresql://truck:truck@localhost:5432/truck_platform');
  });

  it('masks database credentials in doctor display output', () => {
    expect(
      formatDatabaseUrlForDisplay(
        'postgresql://truck:secret-pass@localhost:5432/truck_platform',
      ),
    ).toBe('postgresql://truck:***@localhost:5432/truck_platform');

    expect(formatDatabaseUrlForDisplay('not-a-url')).toBe('not-a-url');
  });

  it('requires an isolated TEST_DATABASE_URL for test database verification', () => {
    expect(() =>
      resolveDatabaseUrl({
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
      }, true),
    ).toThrow('TEST_DATABASE_URL is required');

    expect(() =>
      resolveDatabaseUrl(
        {
          DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
          TEST_DATABASE_URL:
            'postgresql://truck:truck@localhost:5432/truck_platform',
        },
        true,
      ),
    ).toThrow('TEST_DATABASE_URL must be different from DATABASE_URL');
  });

  it('exposes explicit PostgreSQL status and deploy scripts', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:postgres:doctor']).toBe(
      'node scripts/verify-postgres.js doctor',
    );
    expect(packageJson.scripts['db:postgres:status']).toBe(
      'node scripts/verify-postgres.js status',
    );
    expect(packageJson.scripts['db:postgres:deploy']).toBe(
      'node scripts/verify-postgres.js deploy',
    );
    expect(packageJson.scripts['db:postgres:wait']).toBe(
      'node scripts/verify-postgres.js wait',
    );
    expect(packageJson.scripts['db:test:postgres:doctor']).toBe(
      'node scripts/verify-postgres.js doctor --test',
    );
    expect(packageJson.scripts['db:test:postgres:status']).toBe(
      'node scripts/verify-postgres.js status --test',
    );
    expect(packageJson.scripts['db:test:postgres:deploy']).toBe(
      'node scripts/verify-postgres.js deploy --test',
    );
    expect(packageJson.scripts['db:test:postgres:wait']).toBe(
      'node scripts/verify-postgres.js wait --test',
    );
  });

  it('exposes local PostgreSQL compose and bootstrap scripts', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:dev:postgres:up']).toBe(
      'docker compose -f docker-compose.postgres.yml up -d postgres',
    );
    expect(packageJson.scripts['db:dev:postgres:down']).toBe(
      'docker compose -f docker-compose.postgres.yml down',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).toBe(
      'npm run db:postgres:wait && npm run db:postgres:deploy && npm run db:postgres:seed && npm run db:postgres:auth-smoke && npm run db:postgres:order-smoke && npm run db:postgres:driver-certification-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toBe(
      'npm run db:test:postgres:wait && npm run db:test:postgres:deploy && npm run db:test:postgres:seed && npm run db:test:postgres:auth-smoke && npm run db:test:postgres:order-smoke && npm run db:test:postgres:driver-certification-smoke',
    );
  });

  it('keeps the local PostgreSQL compose defaults aligned with DATABASE_URL', () => {
    expect(existsSync(composePath)).toBe(true);

    const composeSource = readFileSync(composePath, 'utf8');

    expect(composeSource).toContain('image: postgres:16-alpine');
    expect(composeSource).toContain('POSTGRES_DB: truck_platform');
    expect(composeSource).toContain('POSTGRES_USER: truck');
    expect(composeSource).toContain('POSTGRES_PASSWORD: truck');
    expect(composeSource).toContain('"5432:5432"');
    expect(composeSource).toContain('pg_isready -U truck -d truck_platform');
  });

  it('documents normal and test database URLs in the API env example', () => {
    const envExample = readFileSync(envExamplePath, 'utf8');

    expect(envExample).toContain(
      'DATABASE_URL=postgresql://truck:truck@localhost:5432/truck_platform',
    );
    expect(envExample).toContain(
      'TEST_DATABASE_URL=postgresql://truck:truck@localhost:5432/truck_platform_test',
    );
  });

  it('runs the local Prisma CLI through node instead of npx', () => {
    const invocation = createPrismaInvocation('status');

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toContain('migrate');
    expect(invocation.args).toContain('status');
    expect(invocation.args).toContain('--schema');
    expect(invocation.args).toContain('prisma/schema.prisma');
  });

  it('parses doctor as a non-mutating PostgreSQL verification command', () => {
    expect(parseArgs(['node', 'verify-postgres.js', 'doctor'])).toEqual({
      command: 'doctor',
      useTestDatabase: false,
    });
    expect(parseArgs(['node', 'verify-postgres.js', 'doctor', '--test'])).toEqual({
      command: 'doctor',
      useTestDatabase: true,
    });
  });

  it('parses wait as a non-mutating PostgreSQL readiness command', () => {
    expect(parseArgs(['node', 'verify-postgres.js', 'wait'])).toEqual({
      command: 'wait',
      useTestDatabase: false,
    });
    expect(parseArgs(['node', 'verify-postgres.js', 'wait', '--test'])).toEqual({
      command: 'wait',
      useTestDatabase: true,
    });
  });

  it('creates a Prisma db execute invocation for wait connectivity checks', () => {
    const invocation = createPrismaConnectionInvocation();

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toContain('db');
    expect(invocation.args).toContain('execute');
    expect(invocation.args).toContain('--stdin');
    expect(invocation.args).toContain('--schema');
    expect(invocation.args).toContain('prisma/schema.prisma');
  });

  it('reports Docker and database status for local PostgreSQL readiness', () => {
    const spawnSync = jest
      .fn()
      .mockReturnValueOnce({
        status: 1,
        error: Object.assign(new Error('docker is not installed'), {
          code: 'ENOENT',
        }),
      })
      .mockReturnValueOnce({
        status: 1,
        stderr: Buffer.from("Error: P1001: Can't reach database server"),
      });

    const report = createPostgresDoctorReport(
      {
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
      },
      spawnSync,
    );

    expect(report).toEqual({
      databaseUrl: 'postgresql://truck:truck@localhost:5432/truck_platform',
      docker: {
        ok: false,
        detail: 'docker is not installed',
      },
      prismaStatus: {
        ok: false,
        exitCode: 1,
        detail: "Error: P1001: Can't reach database server",
      },
      suggestions: [
        'Install Docker Desktop or provide a reachable PostgreSQL DATABASE_URL.',
        'Run npm --prefix apps/api run db:dev:postgres:up after Docker is available.',
        'Run npm --prefix apps/api run db:postgres:bootstrap after PostgreSQL is reachable.',
      ],
    });
    expect(spawnSync).toHaveBeenCalledWith('docker', ['--version'], {
      encoding: 'utf8',
    });
  });

  it('suggests the test database bootstrap command for test PostgreSQL readiness', () => {
    const spawnSync = jest
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from('Docker version 27.0.0'),
      })
      .mockReturnValueOnce({
        status: 1,
        stderr: Buffer.from("Error: P1001: Can't reach database server"),
      });

    const report = createPostgresDoctorReport(
      {
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        TEST_DATABASE_URL:
          'postgresql://truck:truck@localhost:5432/truck_platform_test',
      },
      spawnSync,
      true,
    );

    expect(report.databaseUrl).toBe(
      'postgresql://truck:truck@localhost:5432/truck_platform_test',
    );
    expect(report.suggestions).toContain(
      'Run npm --prefix apps/api run db:test:postgres:bootstrap after PostgreSQL is reachable.',
    );
    expect(report.suggestions).not.toContain(
      'Run npm --prefix apps/api run db:postgres:bootstrap after PostgreSQL is reachable.',
    );
  });
});

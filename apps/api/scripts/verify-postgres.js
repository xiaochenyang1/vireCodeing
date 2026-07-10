const { spawnSync } = require('child_process');
const path = require('path');

const DEFAULT_DATABASE_URL =
  'postgresql://truck:truck@localhost:5432/truck_platform';

function resolveDatabaseUrl(env, useTestDatabase = false) {
  if (!useTestDatabase) {
    return env.DATABASE_URL || DEFAULT_DATABASE_URL;
  }

  if (!env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required');
  }

  if (env.DATABASE_URL && env.TEST_DATABASE_URL === env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL');
  }

  return env.TEST_DATABASE_URL;
}

function formatDatabaseUrlForDisplay(databaseUrl) {
  try {
    const url = new URL(databaseUrl);

    if (url.password) {
      url.password = '***';
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function parseArgs(argv) {
  const command = argv[2];
  const useTestDatabase = argv.includes('--test');

  if (
    command !== 'status' &&
    command !== 'deploy' &&
    command !== 'doctor' &&
    command !== 'wait'
  ) {
    throw new Error(
      'Usage: node scripts/verify-postgres.js <doctor|status|deploy|wait> [--test]',
    );
  }

  return {
    command,
    useTestDatabase,
  };
}

function createPrismaInvocation(command) {
  const prismaCommand =
    command === 'status' ? ['migrate', 'status'] : ['migrate', 'deploy'];
  const prismaCliPath = require.resolve('prisma/build/index.js');

  return {
    command: process.execPath,
    args: [prismaCliPath, ...prismaCommand, '--schema', 'prisma/schema.prisma'],
  };
}

function createPrismaConnectionInvocation() {
  const prismaCliPath = require.resolve('prisma/build/index.js');

  return {
    command: process.execPath,
    args: [
      prismaCliPath,
      'db',
      'execute',
      '--stdin',
      '--schema',
      'prisma/schema.prisma',
    ],
  };
}

function formatSpawnDetail(result) {
  if (result.error) {
    return result.error.message;
  }

  const output = [result.stderr, result.stdout]
    .map(value => {
      if (!value) {
        return '';
      }

      return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
    })
    .join('\n')
    .trim();

  return output || `exit code ${result.status ?? 1}`;
}

function createPostgresDoctorReport(
  env,
  spawnSyncImpl = spawnSync,
  useTestDatabase = false,
) {
  const databaseUrl = resolveDatabaseUrl(env, useTestDatabase);
  const dockerResult = spawnSyncImpl('docker', ['--version'], {
    encoding: 'utf8',
  });
  const docker = {
    ok: !dockerResult.error && dockerResult.status === 0,
    detail: formatSpawnDetail(dockerResult),
  };

  const prismaInvocation = createPrismaInvocation('status');
  const prismaResult = spawnSyncImpl(
    prismaInvocation.command,
    prismaInvocation.args,
    {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        ...env,
        DATABASE_URL: databaseUrl,
      },
      encoding: 'utf8',
    },
  );
  const prismaStatus = {
    ok: !prismaResult.error && prismaResult.status === 0,
    exitCode: prismaResult.status ?? 1,
    detail: formatSpawnDetail(prismaResult),
  };
  const suggestions = [];

  if (!docker.ok) {
    suggestions.push(
      'Install Docker Desktop or provide a reachable PostgreSQL DATABASE_URL.',
    );
  }

  if (!prismaStatus.ok) {
    suggestions.push(
      'Run npm --prefix apps/api run db:dev:postgres:up after Docker is available.',
    );
    suggestions.push(
      useTestDatabase
        ? 'Run npm --prefix apps/api run db:test:postgres:bootstrap after PostgreSQL is reachable.'
        : 'Run npm --prefix apps/api run db:postgres:bootstrap after PostgreSQL is reachable.',
    );
  }

  return {
    databaseUrl,
    docker,
    prismaStatus,
    suggestions,
  };
}

function printPostgresDoctorReport(report) {
  console.log(`DATABASE_URL: ${formatDatabaseUrlForDisplay(report.databaseUrl)}`);
  console.log(`Docker: ${report.docker.ok ? 'ok' : 'not ready'}`);
  console.log(`Docker detail: ${report.docker.detail}`);
  console.log(`Prisma migrate status: ${report.prismaStatus.ok ? 'ok' : 'not ready'}`);
  console.log(`Prisma detail: ${report.prismaStatus.detail}`);

  if (report.suggestions.length > 0) {
    console.log('Next steps:');
    for (const suggestion of report.suggestions) {
      console.log(`- ${suggestion}`);
    }
  }
}

function runPrisma(command, databaseUrl) {
  const invocation = createPrismaInvocation(command);
  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd: __dirname + '/..',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function runPrismaConnectionCheck(databaseUrl) {
  const invocation = createPrismaConnectionInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    input: 'SELECT 1;',
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main(argv = process.argv, env = process.env) {
  const { command, useTestDatabase } = parseArgs(argv);
  const databaseUrl = resolveDatabaseUrl(env, useTestDatabase);

  if (command === 'doctor') {
    const report = createPostgresDoctorReport(env, spawnSync, useTestDatabase);
    printPostgresDoctorReport(report);
    return report.prismaStatus.ok ? 0 : 1;
  }

  if (command === 'wait') {
    return runPrismaConnectionCheck(databaseUrl);
  }

  return runPrisma(command, databaseUrl);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_DATABASE_URL,
  createPrismaConnectionInvocation,
  createPostgresDoctorReport,
  createPrismaInvocation,
  formatDatabaseUrlForDisplay,
  main,
  parseArgs,
  printPostgresDoctorReport,
  resolveDatabaseUrl,
  runPrismaConnectionCheck,
};

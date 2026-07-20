import { existsSync } from 'fs';
import { join, resolve } from 'path';

type RunnerModule = Record<string, unknown>;

const runnerPath = resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'verify-order-coupon-migration.js',
);
const runner = (existsSync(runnerPath) ? require(runnerPath) : {}) as RunnerModule;

function getExport<T extends (...args: any[]) => any>(name: string): T {
  const value = runner[name];
  expect(typeof value).toBe('function');
  return value as T;
}

describe('order coupon migration verification script', () => {
  it('parses normal and isolated test database arguments', () => {
    const parseArgs = getExport<(argv: string[]) => unknown>('parseArgs');
    const resolveDatabaseUrl = getExport<
      (env: NodeJS.ProcessEnv, useTestDatabase?: boolean) => string
    >('resolveDatabaseUrl');

    expect(parseArgs(['node', 'verify-order-coupon-migration.js'])).toEqual({
      useTestDatabase: false,
    });
    expect(
      parseArgs(['node', 'verify-order-coupon-migration.js', '--test']),
    ).toEqual({ useTestDatabase: true });
    expect(() =>
      parseArgs(['node', 'verify-order-coupon-migration.js', '--unknown']),
    ).toThrow('Usage: node scripts/verify-order-coupon-migration.js [--test]');
    expect(() => resolveDatabaseUrl({}, true)).toThrow(
      'TEST_DATABASE_URL is required',
    );
    expect(() =>
      resolveDatabaseUrl(
        {
          DATABASE_URL: 'postgresql://truck:pw@localhost:5432/main',
          TEST_DATABASE_URL: 'postgresql://truck:pw@localhost:5432/main',
        },
        true,
      ),
    ).toThrow('TEST_DATABASE_URL must be different from DATABASE_URL');
  });

  it('adds an isolated schema without dropping existing URL parameters', () => {
    const withSchemaQueryParameter = getExport<
      (databaseUrl: string, schemaName: string) => string
    >('withSchemaQueryParameter');
    const result = new URL(
      withSchemaQueryParameter(
        'postgresql://truck:pw@localhost:5432/test?sslmode=require&connection_limit=4',
        'order_coupon_migration_abc123',
      ),
    );

    expect(result.searchParams.get('schema')).toBe(
      'order_coupon_migration_abc123',
    );
    expect(result.searchParams.get('sslmode')).toBe('require');
    expect(result.searchParams.get('connection_limit')).toBe('4');
  });

  it('creates safe schema names and only removes owned temp workspaces', () => {
    const createSafeSchemaName = getExport<(token?: string) => string>(
      'createSafeSchemaName',
    );
    const removeTempWorkspaceSafely = getExport<
      (
        workspacePath: string,
        tempRoot: string,
        remove: (path: string, options: unknown) => void,
      ) => void
    >('removeTempWorkspaceSafely');
    const schemaName = createSafeSchemaName('ABC-123_DEF');
    const tempRoot = resolve('C:/Temp');
    const ownedWorkspace = join(tempRoot, 'order-coupon-migration-owned');
    const remove = jest.fn();

    expect(schemaName).toMatch(/^[a-z][a-z0-9_]*$/);
    removeTempWorkspaceSafely(ownedWorkspace, tempRoot, remove);
    expect(remove).toHaveBeenCalledWith(ownedWorkspace, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
    expect(() => removeTempWorkspaceSafely(tempRoot, tempRoot, remove)).toThrow(
      'Refusing to remove unsafe migration workspace',
    );
    expect(() =>
      removeTempWorkspaceSafely(join(tempRoot, 'unrelated'), tempRoot, remove),
    ).toThrow('Refusing to remove unsafe migration workspace');
  });

  it('selects only migration_lock.toml and migration directories before the target', () => {
    const shouldCopyMigrationEntry = getExport<
      (
        entryName: string,
        isDirectory: boolean,
        targetMigration?: string,
      ) => boolean
    >('shouldCopyMigrationEntry');
    const target =
      '20260714010000_shipper_order_create_idempotency_coupon_atomicity';

    expect(shouldCopyMigrationEntry('migration_lock.toml', false, target)).toBe(
      true,
    );
    expect(
      shouldCopyMigrationEntry(
        '20260712010000_order_mutation_idempotency',
        true,
        target,
      ),
    ).toBe(true);
    expect(shouldCopyMigrationEntry(target, true, target)).toBe(false);
    expect(
      shouldCopyMigrationEntry(
        '20260715000000_future_migration',
        true,
        target,
      ),
    ).toBe(false);
    expect(
      shouldCopyMigrationEntry(
        '20260712010000_order_mutation_idempotency',
        false,
        target,
      ),
    ).toBe(false);
    expect(shouldCopyMigrationEntry('README.md', false, target)).toBe(false);
  });

  it('builds a workspace with a migration-only schema and no future migrations', () => {
    const createMigrationWorkspace = getExport<
      (fileSystem?: Record<string, unknown>) => {
        root: string;
        migrationsRoot: string;
        schemaPath: string;
      }
    >('createMigrationWorkspace');
    const tempRoot = resolve('C:/Temp');
    const workspaceRoot = join(
      tempRoot,
      'order-coupon-migration-workspace-contract',
    );
    const mkdir = jest.fn();
    const writeFile = jest.fn();
    const copy = jest.fn();
    const entries = [
      createDirectoryEntry('20260712010000_order_mutation_idempotency', true),
      createDirectoryEntry(
        '20260714010000_shipper_order_create_idempotency_coupon_atomicity',
        true,
      ),
      createDirectoryEntry('20260715000000_future_migration', true),
      createDirectoryEntry('migration_lock.toml', false),
      createDirectoryEntry('README.md', false),
    ];

    const workspace = createMigrationWorkspace({
      tempRoot,
      mkdtemp: jest.fn(() => workspaceRoot),
      mkdir,
      writeFile,
      readdir: jest.fn(() => entries),
      copy,
      remove: jest.fn(),
    });

    expect(workspace).toEqual({
      root: workspaceRoot,
      migrationsRoot: join(workspaceRoot, 'prisma', 'migrations'),
      schemaPath: join(workspaceRoot, 'prisma', 'schema.prisma'),
    });
    expect(mkdir).toHaveBeenCalledWith(workspace.migrationsRoot, {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toBe(workspace.schemaPath);
    expect(writeFile.mock.calls[0][1]).toBe(
      [
        'datasource db {',
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        '}',
        '',
      ].join('\n'),
    );
    expect(writeFile.mock.calls[0][2]).toBe('utf8');
    expect(
      copy.mock.calls.map(([source]) => String(source).split(/[\\/]/).at(-1)),
    ).toEqual([
      '20260712010000_order_mutation_idempotency',
      'migration_lock.toml',
    ]);
  });

  it('removes an owned workspace when construction fails partway through', () => {
    const createMigrationWorkspace = getExport<
      (fileSystem?: Record<string, unknown>) => unknown
    >('createMigrationWorkspace');
    const tempRoot = resolve('C:/Temp');
    const workspaceRoot = join(
      tempRoot,
      'order-coupon-migration-workspace-failure',
    );
    const remove = jest.fn();

    expect(() =>
      createMigrationWorkspace({
        tempRoot,
        mkdtemp: jest.fn(() => workspaceRoot),
        mkdir: jest.fn(),
        writeFile: jest.fn(() => {
          throw new Error('schema write failure');
        }),
        readdir: jest.fn(() => []),
        copy: jest.fn(),
        remove,
      }),
    ).toThrow('schema write failure');
    expect(remove).toHaveBeenCalledWith(workspaceRoot, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  });

  it('invokes the local Prisma CLI through node and redacts failures', () => {
    const createPrismaInvocation = getExport<
      (args: string[], schemaPath: string) => { command: string; args: string[] }
    >('createPrismaInvocation');
    const formatPrismaFailure = getExport<
      (
        phase: string,
        result: { status: number; stdout?: string; stderr?: string },
        databaseUrl: string,
      ) => string
    >('formatPrismaFailure');
    const invocation = createPrismaInvocation(
      ['migrate', 'deploy'],
      'C:/Temp/work/prisma/schema.prisma',
    );
    const secretUrl =
      'postgresql://truck:super-secret@localhost:5432/test?schema=fixture';
    const detail = formatPrismaFailure(
      'target deploy',
      {
        status: 1,
        stderr: `failed for ${secretUrl}`,
      },
      secretUrl,
    );

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args[0]).toBe(require.resolve('prisma/build/index.js'));
    expect(invocation.args).toEqual([
      require.resolve('prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      'C:/Temp/work/prisma/schema.prisma',
    ]);
    expect(detail).toContain('target deploy failed');
    expect(detail).toContain('postgresql://truck:***@localhost:5432/test');
    expect(detail).not.toContain('super-secret');
  });

  it('runs Prisma outside the disposable workspace so Windows can remove it', () => {
    const runPrismaCommand = getExport<
      (
        args: string[],
        workspace: { root: string; schemaPath: string },
        databaseUrl: string,
        spawn: (...args: any[]) => unknown,
      ) => unknown
    >('runPrismaCommand');
    const apiRoot = resolve(__dirname, '..', '..');
    const workspace = {
      root: resolve('C:/Temp/order-coupon-migration-prisma-cwd'),
      schemaPath: resolve(
        'C:/Temp/order-coupon-migration-prisma-cwd/prisma/schema.prisma',
      ),
    };
    const spawn = jest.fn<
      { status: number; stderr: string; stdout: string },
      [string, string[], { cwd: string }]
    >(() => ({ status: 0, stderr: '', stdout: '' }));

    runPrismaCommand(
      ['migrate', 'deploy'],
      workspace,
      'postgresql://truck:pw@localhost:5432/test',
      spawn,
    );

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][2]).toEqual(
      expect.objectContaining({ cwd: apiRoot }),
    );
    expect(spawn.mock.calls[0][2].cwd).not.toBe(workspace.root);
  });

  it('redacts encoded passwords and non-whitelisted query values', () => {
    const formatDatabaseUrlForDisplay = getExport<
      (databaseUrl: string) => string
    >('formatDatabaseUrlForDisplay');
    const formatPrismaFailure = getExport<
      (
        phase: string,
        result: { status: number; stderr?: string },
        databaseUrl: string,
      ) => string
    >('formatPrismaFailure');
    const secretUrl =
      'postgresql://truck:p%40ss@localhost:5432/test?sslpassword=query%2Dsecret&api_key=key%2Dsecret&schema=fixture_safe&sslmode=require';
    const leakedForms = [
      'p%40ss',
      'p@ss',
      'query%2Dsecret',
      'query-secret',
      'key%2Dsecret',
      'key-secret',
    ];
    const display = formatDatabaseUrlForDisplay(secretUrl);
    const detail = formatPrismaFailure(
      'target deploy',
      {
        status: 1,
        stderr: [
          secretUrl,
          'password forms: p%40ss p@ss',
          'query forms: query%2Dsecret query-secret key%2Dsecret key-secret',
        ].join('\n'),
      },
      secretUrl,
    );

    for (const value of leakedForms) {
      expect(display).not.toContain(value);
      expect(detail).not.toContain(value);
    }
    for (const value of [display, detail]) {
      expect(value).toContain('postgresql://truck:***@localhost:5432/test');
      expect(value).toContain('sslpassword=***');
      expect(value).toContain('api_key=***');
      expect(value).toContain('schema=fixture_safe');
      expect(value).toContain('sslmode=require');
    }
  });

  it('defines the approved deterministic fixture matrix', () => {
    const createCouponMigrationFixtures = getExport<() => any[]>(
      'createCouponMigrationFixtures',
    );
    const fixtures = createCouponMigrationFixtures();

    expect(fixtures.map(fixture => [fixture.name, fixture.expected])).toEqual([
      ['multi-completed', 'reject'],
      ['cancelled-and-active', 'locked'],
      ['locked-completed-owner', 'used'],
      ['locked-completed-null', 'used'],
      ['locked-completed-other-real', 'reject'],
      ['used-without-completed', 'reject'],
      ['completed-and-cancelled', 'used'],
      ['future-only-cancelled', 'usable'],
      ['orphan-locked-null', 'usable'],
      ['orphan-locked-dangling', 'usable'],
      ['orphan-locked-other-real', 'reject'],
      ['expired-orphan', 'expired'],
      ['expired-and-cancelled', 'expired'],
      ['missing-coupon', 'reject'],
      ['unknown-status', 'reject'],
      ['cross-shipper', 'reject'],
    ]);

    for (const fixture of fixtures) {
      expect(fixture.seed).toEqual(
        expect.objectContaining({
          coupons: expect.any(Array),
          orders: expect.any(Array),
          users: expect.any(Array),
        }),
      );
      if (fixture.expected === 'reject') {
        expect(fixture.correction?.operations.length).toBeGreaterThan(0);
        expect(fixture.correctedAssertion).toEqual(
          expect.objectContaining({ couponId: expect.any(String) }),
        );
      } else {
        expect(fixture.assertion).toEqual(
          expect.objectContaining({
            couponId: expect.any(String),
            status: fixture.expected,
          }),
        );
      }
    }

    for (const name of ['locked-completed-owner', 'locked-completed-null']) {
      const fixture = fixtures.find(item => item.name === name);
      expect(fixture.assertion.usedAtIso).toBe(
        fixture.seed.orders.find((order: any) => order.status === 'completed')
          .updatedAtIso,
      );
    }

    const expiredOrphan = fixtures.find(
      fixture => fixture.name === 'expired-orphan',
    );
    expect(expiredOrphan.seed.coupons[0]).toEqual(
      expect.objectContaining({
        status: 'expired',
        validUntilIso: '2099-12-31T00:00:00.000Z',
      }),
    );
    const expiredAndCancelled = fixtures.find(
      fixture => fixture.name === 'expired-and-cancelled',
    );
    expect(expiredAndCancelled.seed.coupons[0]).toEqual(
      expect.objectContaining({
        status: 'locked',
        validUntilIso: '2020-01-01T00:00:00.000Z',
      }),
    );

    const transactionStartFixture = fixtures.find(
      fixture => fixture.name === 'cancelled-and-active',
    );
    expect(transactionStartFixture.transactionStartProbe).toEqual({
      offsetSeconds: 0.25,
      probeCouponId: 'coupon-transaction-start-probe',
      sleepSeconds: 0.75,
      sourceCouponId: 'coupon-main',
    });
    expect(
      transactionStartFixture.seed.coupons.find(
        (coupon: any) => coupon.id === 'coupon-transaction-start-probe',
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'locked',
        validUntilIso: '2099-12-31T00:00:00.000Z',
      }),
    );
    expect(transactionStartFixture.assertion.transactionStartProbe).toEqual({
      couponId: 'coupon-transaction-start-probe',
      expectedStatus: 'usable',
    });
  });

  it('installs the transaction-start probe through raw SQL after seeding', async () => {
    const seedFixture = getExport<
      (context: unknown, fixture: unknown) => Promise<void>
    >('seedFixture');
    const execute = jest.fn<Promise<number>, [string, ...unknown[]]>(
      async () => 1,
    );

    await seedFixture(
      { client: { $executeRawUnsafe: execute } },
      {
        seed: { users: [], coupons: [], orders: [] },
        transactionStartProbe: {
          offsetSeconds: 0.25,
          probeCouponId: 'coupon-transaction-start-probe',
          sleepSeconds: 0.75,
          sourceCouponId: 'coupon-main',
        },
      },
    );

    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining(
        'CREATE TABLE "_OrderCouponMigrationTransactionProbe"',
      ),
      expect.stringContaining(
        'INSERT INTO "_OrderCouponMigrationTransactionProbe"',
      ),
      expect.stringContaining(
        'CREATE OR REPLACE FUNCTION "_order_coupon_migration_transaction_probe"',
      ),
      expect.stringContaining(
        'CREATE TRIGGER "_order_coupon_migration_transaction_probe_trigger"',
      ),
    ]);
    expect(execute.mock.calls[1].slice(1)).toEqual([
      'coupon-main',
      'coupon-transaction-start-probe',
      0.25,
      0.75,
    ]);
    expect(execute.mock.calls[1][0]).toContain('$1');
    expect(execute.mock.calls[1][0]).toContain('$4');
    expect(execute.mock.calls[1][0]).not.toContain('coupon-main');
    expect(execute.mock.calls[2][0]).toContain(
      "transaction_start AT TIME ZONE 'UTC'",
    );
  });

  it('seeds fixtures through parameterized raw SQL without model delegates', async () => {
    const seedFixture = getExport<
      (context: unknown, fixture: unknown) => Promise<void>
    >('seedFixture');
    const createCouponMigrationFixtures = getExport<() => any[]>(
      'createCouponMigrationFixtures',
    );
    const fixture = createCouponMigrationFixtures().find(
      item => item.name === 'future-only-cancelled',
    );
    const execute = jest.fn<Promise<number>, [string, ...unknown[]]>(
      async () => 1,
    );
    const context = { client: { $executeRawUnsafe: execute } };

    await seedFixture(context, fixture);

    expect(execute).toHaveBeenCalledTimes(
      fixture.seed.users.length +
        fixture.seed.coupons.length +
        fixture.seed.orders.length,
    );
    expect(execute.mock.calls.map(([sql]) => sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('INSERT INTO "User"'),
        expect.stringContaining('INSERT INTO "ShipperCoupon"'),
        expect.stringContaining('INSERT INTO "Order"'),
      ]),
    );
    for (const [sql, ...parameters] of execute.mock.calls) {
      expect(sql).toContain('$1');
      expect(parameters.length).toBeGreaterThan(0);
      expect(sql).toContain(`$${parameters.length}`);
      for (const fixtureValue of [
        '19900000001',
        '19900000002',
        'coupon-main',
        'order-cancelled',
        'HY202607140003',
        'Migration fixture coupon',
      ]) {
        expect(sql).not.toContain(fixtureValue);
      }
    }
  });

  it('captures fixed business columns through a raw-only client', async () => {
    const captureSnapshot = getExport<
      (context: unknown) => Promise<unknown>
    >('captureSnapshot');
    const coupon = {
      id: 'coupon-main',
      status: 'usable',
      lockedAt: null,
      usedAt: null,
    };
    const order = {
      id: 'order-main',
      status: 'waiting',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    };
    const query = jest.fn(async (sql: string) =>
      sql.includes('FROM "ShipperCoupon"') ? [coupon] : [order],
    );

    await expect(
      captureSnapshot({ client: { $queryRawUnsafe: query } }),
    ).resolves.toEqual({
      coupons: [coupon],
      orders: [
        {
          ...order,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls) {
      expect(sql).not.toContain('SELECT *');
      expect(sql).toContain('ORDER BY "id" ASC');
    }
  });

  it('applies approved corrections through parameterized raw SQL', async () => {
    const applyCorrection = getExport<
      (context: unknown, correction: unknown) => Promise<void>
    >('applyCorrection');
    const createCouponMigrationFixtures = getExport<() => any[]>(
      'createCouponMigrationFixtures',
    );
    const coupon = createCouponMigrationFixtures().find(
      fixture => fixture.name === 'expired-orphan',
    ).seed.coupons[0];
    const execute = jest.fn<Promise<number>, [string, ...unknown[]]>(
      async () => 1,
    );

    await applyCorrection(
      { client: { $executeRawUnsafe: execute } },
      {
        operations: [
          {
            type: 'update-order',
            id: 'order-main',
            data: { status: 'cancelled' },
          },
          {
            type: 'update-order',
            id: 'order-main',
            data: { shipperId: 'shipper-a' },
          },
          {
            type: 'update-coupon',
            id: 'coupon-main',
            data: { lockedOrderNo: null },
          },
          {
            type: 'update-coupon',
            id: 'coupon-main',
            data: { status: 'usable' },
          },
          { type: 'create-coupon', data: coupon },
        ],
      },
    );

    expect(execute).toHaveBeenCalledTimes(5);
    for (const [sql, ...parameters] of execute.mock.calls) {
      expect(sql).toContain('$1');
      expect(parameters.length).toBeGreaterThan(0);
      expect(sql).not.toContain('order-main');
      expect(sql).not.toContain('coupon-main');
    }
  });

  it('asserts coupon state through fixed raw columns', async () => {
    const assertFixture = getExport<
      (context: unknown, expectation: unknown) => Promise<void>
    >('assertFixture');
    const query = jest.fn<Promise<any[]>, [string, ...unknown[]]>(async () => [
      {
        status: 'used',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: 'HY202607140001',
        usedAt: new Date('2026-07-10T08:00:00.000Z'),
      },
    ]);

    await assertFixture(
      { client: { $queryRawUnsafe: query } },
      {
        couponId: 'coupon-main',
        status: 'used',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: 'HY202607140001',
        usedAtIso: '2026-07-10T08:00:00.000Z',
      },
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'SELECT "status", "lockedOrderNo", "lockedAt", "usedOrderNo", "usedAt"',
    );
    expect(query.mock.calls[0][0]).toContain('WHERE "id" = $1');
    expect(query.mock.calls[0][0]).not.toContain('coupon-main');
    expect(query.mock.calls[0][1]).toBe('coupon-main');
  });

  it('asserts an executed transaction-start probe crossed its wall-clock cutoff', async () => {
    const assertFixture = getExport<
      (context: unknown, expectation: unknown) => Promise<void>
    >('assertFixture');
    const query = createTransactionProbeQuery({
      clockAfterSleep: new Date('2026-07-14T00:00:01.000Z'),
      executed: true,
      status: 'usable',
      transactionTimestamp: new Date('2026-07-14T00:00:00.000Z'),
      validUntil: new Date('2026-07-14T00:00:00.250Z'),
    });

    await assertFixture(
      { client: { $queryRawUnsafe: query } },
      createTransactionProbeExpectation(),
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain(
      'FROM "_OrderCouponMigrationTransactionProbe"',
    );
    expect(query.mock.calls[1][0]).toContain(
      'JOIN "ShipperCoupon"',
    );
    expect(query.mock.calls[1][0]).toContain('WHERE probe."probeCouponId" = $1');
    expect(query.mock.calls[1][1]).toBe('coupon-transaction-start-probe');
  });

  it.each([
    {
      name: 'trigger did not execute',
      probe: {
        clockAfterSleep: null,
        executed: false,
        status: 'usable',
        transactionTimestamp: null,
        validUntil: new Date('2099-12-31T00:00:00.000Z'),
      },
      expectedError: 'transaction-start probe trigger did not execute',
    },
    {
      name: 'wall clock did not cross the cutoff',
      probe: {
        clockAfterSleep: new Date('2026-07-14T00:00:00.100Z'),
        executed: true,
        status: 'usable',
        transactionTimestamp: new Date('2026-07-14T00:00:00.000Z'),
        validUntil: new Date('2026-07-14T00:00:00.250Z'),
      },
      expectedError: 'wall clock did not advance past its cutoff',
    },
    {
      name: 'migration used advancing time and expired the coupon',
      probe: {
        clockAfterSleep: new Date('2026-07-14T00:00:01.000Z'),
        executed: true,
        status: 'expired',
        transactionTimestamp: new Date('2026-07-14T00:00:00.000Z'),
        validUntil: new Date('2026-07-14T00:00:00.250Z'),
      },
      expectedError: 'transaction-start probe coupon status',
    },
  ])('rejects a false-positive transaction probe when $name', async testCase => {
    const assertFixture = getExport<
      (context: unknown, expectation: unknown) => Promise<void>
    >('assertFixture');
    const query = createTransactionProbeQuery(testCase.probe);

    await expect(
      assertFixture(
        { client: { $queryRawUnsafe: query } },
        createTransactionProbeExpectation(),
      ),
    ).rejects.toThrow(testCase.expectedError);
  });

  it('requires the isolated order number sequence to exist and advance', async () => {
    const assertSequenceReady = getExport<
      (context: unknown) => Promise<void>
    >('assertSequenceReady');
    const query = jest
      .fn<Promise<any[]>, [string, ...unknown[]]>()
      .mockResolvedValueOnce([{ name: 'Order_order_no_seq' }])
      .mockResolvedValueOnce([{ value: 1n }]);
    const schemaName = 'order_coupon_migration_sequence';

    await assertSequenceReady({
      client: { $queryRawUnsafe: query },
      schemaName,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('to_regclass($1)');
    expect(query.mock.calls[1][0]).toContain('nextval($1::regclass)');
    for (const [sql, sequenceName] of query.mock.calls) {
      expect(sql).not.toContain(schemaName);
      expect(sequenceName).toBe(`"${schemaName}"."Order_order_no_seq"`);
    }
  });

  it('runs previous and target deploys in order for a successful fixture', async () => {
    const runMigrationFixture = getExport<
      (fixture: unknown, options: unknown) => Promise<void>
    >('runMigrationFixture');
    const log: string[] = [];
    const fixture = {
      name: 'success',
      expected: 'usable',
      seed: {},
      assertion: { couponId: 'coupon-main', status: 'usable' },
    };
    const dependencies = createWorkflowDependencies(log);

    await runMigrationFixture(fixture, {
      databaseUrl: 'postgresql://truck:pw@localhost:5432/test',
      dependencies,
      schemaName: 'order_coupon_migration_success',
    });

    expect(log).toEqual([
      'workspace:create',
      'database:create',
      'deploy:previous',
      'fixture:seed',
      'snapshot:capture',
      'migration:install-target',
      'deploy:target',
      'sequence:assert-ready',
      'fixture:assert:usable',
      'client:disconnect',
      'schema:drop',
      'admin:disconnect',
      'workspace:remove',
    ]);
  });

  it('verifies rollback then resolves corrects and redeploys a rejected fixture', async () => {
    const runMigrationFixture = getExport<
      (fixture: unknown, options: unknown) => Promise<void>
    >('runMigrationFixture');
    const log: string[] = [];
    const before = { coupons: [{ id: 'coupon-main', status: 'used' }] };
    const dependencies = createWorkflowDependencies(log, {
      targetStatuses: [1, 0],
      snapshots: [before, structuredClone(before)],
    });

    await runMigrationFixture(
      {
        name: 'reject',
        expected: 'reject',
        seed: {},
        correction: { operations: [{ type: 'update-coupon' }] },
        correctedAssertion: { couponId: 'coupon-main', status: 'used' },
      },
      {
        databaseUrl: 'postgresql://truck:pw@localhost:5432/test',
        dependencies,
        schemaName: 'order_coupon_migration_reject',
      },
    );

    expect(log).toEqual([
      'workspace:create',
      'database:create',
      'deploy:previous',
      'fixture:seed',
      'snapshot:capture',
      'migration:install-target',
      'deploy:target',
      'sequence:assert-absent',
      'snapshot:capture',
      'fixture:correct',
      'migration:resolve-rolled-back',
      'deploy:target',
      'sequence:assert-ready',
      'fixture:assert:used',
      'client:disconnect',
      'schema:drop',
      'admin:disconnect',
      'workspace:remove',
    ]);
  });

  it.each(['deploy', 'assertion'])(
    'always cleans schema clients and temp files after a %s failure',
    async failurePoint => {
      const runMigrationFixture = getExport<
        (fixture: unknown, options: unknown) => Promise<void>
      >('runMigrationFixture');
      const log: string[] = [];
      const dependencies = createWorkflowDependencies(log, {
        failAt: failurePoint,
      });

      await expect(
        runMigrationFixture(
          {
            name: `failure-${failurePoint}`,
            expected: 'usable',
            seed: {},
            assertion: { couponId: 'coupon-main', status: 'usable' },
          },
          {
            databaseUrl: 'postgresql://truck:pw@localhost:5432/test',
            dependencies,
            schemaName: `order_coupon_migration_failure_${failurePoint}`,
          },
        ),
      ).rejects.toThrow(failurePoint);

      expect(log.slice(-4)).toEqual([
        'client:disconnect',
        'schema:drop',
        'admin:disconnect',
        'workspace:remove',
      ]);
    },
  );

  it('reports operation and cleanup failures together', async () => {
    const runMigrationFixture = getExport<
      (fixture: unknown, options: unknown) => Promise<void>
    >('runMigrationFixture');
    const dependencies = createWorkflowDependencies([], {
      failAt: 'deploy',
      cleanupFailAt: 'schema',
    });
    let caught: unknown;

    try {
      await runMigrationFixture(
        {
          name: 'operation-and-cleanup-failure',
          expected: 'usable',
          seed: {},
          assertion: { couponId: 'coupon-main', status: 'usable' },
        },
        {
          databaseUrl: 'postgresql://truck:pw@localhost:5432/test',
          dependencies,
          schemaName: 'order_coupon_migration_aggregate_failure',
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.message).toContain('operation failed');
    expect(aggregate.message).toContain('cleanup failed');
    expect(
      aggregate.errors.map(error =>
        error instanceof Error ? error.message : String(error),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('deploy failure'),
        expect.stringContaining('schema cleanup failure'),
      ]),
    );
  });

  it('exports an async main entrypoint', () => {
    expect(typeof runner.main).toBe('function');
  });
});

function createWorkflowDependencies(
  log: string[],
  options: {
    cleanupFailAt?: string;
    failAt?: string;
    snapshots?: unknown[];
    targetStatuses?: number[];
  } = {},
) {
  const snapshots = [...(options.snapshots ?? [{ rows: [] }])];
  const targetStatuses = [...(options.targetStatuses ?? [0])];

  return {
    createWorkspace: jest.fn(() => {
      log.push('workspace:create');
      return { root: 'workspace', schemaPath: 'workspace/prisma/schema.prisma' };
    }),
    createDatabaseContext: jest.fn(async () => {
      log.push('database:create');
      return {};
    }),
    deployPrevious: jest.fn(() => {
      log.push('deploy:previous');
      if (options.failAt === 'deploy') {
        return { status: 1, stderr: 'deploy failure' };
      }
      return { status: 0 };
    }),
    seedFixture: jest.fn(async () => log.push('fixture:seed')),
    captureSnapshot: jest.fn(async () => {
      log.push('snapshot:capture');
      return snapshots.shift() ?? { rows: [] };
    }),
    installTargetMigration: jest.fn(() =>
      log.push('migration:install-target'),
    ),
    deployTarget: jest.fn(() => {
      log.push('deploy:target');
      return { status: targetStatuses.shift() ?? 0, stderr: 'target rejected' };
    }),
    assertSequenceAbsent: jest.fn(async () =>
      log.push('sequence:assert-absent'),
    ),
    assertSequenceReady: jest.fn(async () =>
      log.push('sequence:assert-ready'),
    ),
    applyCorrection: jest.fn(async () => log.push('fixture:correct')),
    resolveRolledBack: jest.fn(() => {
      log.push('migration:resolve-rolled-back');
      return { status: 0 };
    }),
    assertFixture: jest.fn(async (_context, assertion) => {
      log.push(`fixture:assert:${assertion.status}`);
      if (options.failAt === 'assertion') {
        throw new Error('assertion failure');
      }
    }),
    disconnectFixtureClient: jest.fn(async () =>
      log.push('client:disconnect'),
    ),
    dropSchema: jest.fn(async () => {
      log.push('schema:drop');
      if (options.cleanupFailAt === 'schema') {
        throw new Error('schema cleanup failure');
      }
    }),
    disconnectAdminClient: jest.fn(async () =>
      log.push('admin:disconnect'),
    ),
    removeWorkspace: jest.fn(() => log.push('workspace:remove')),
  };
}

function createDirectoryEntry(name: string, isDirectory: boolean) {
  return {
    name,
    isDirectory: () => isDirectory,
  };
}

function createTransactionProbeExpectation() {
  return {
    couponId: 'coupon-main',
    lockedAt: 'present',
    lockedOrderNo: 'HY202607140004',
    status: 'locked',
    transactionStartProbe: {
      couponId: 'coupon-transaction-start-probe',
      expectedStatus: 'usable',
    },
    usedAtIso: null,
    usedOrderNo: null,
  };
}

function createTransactionProbeQuery(probe: Record<string, unknown>) {
  return jest
    .fn<Promise<any[]>, [string, ...unknown[]]>()
    .mockResolvedValueOnce([
      {
        lockedAt: new Date('2026-07-14T00:00:00.000Z'),
        lockedOrderNo: 'HY202607140004',
        status: 'locked',
        usedAt: null,
        usedOrderNo: null,
      },
    ])
    .mockResolvedValueOnce([probe]);
}

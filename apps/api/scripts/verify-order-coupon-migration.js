const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require('fs');
const os = require('os');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { resolveDatabaseUrl } = require('./verify-postgres');

const TARGET_MIGRATION =
  '20260714010000_shipper_order_create_idempotency_coupon_atomicity';
const WORKSPACE_PREFIX = 'order-coupon-migration-';
const API_ROOT = path.join(__dirname, '..');
const PRISMA_ROOT = path.join(API_ROOT, 'prisma');
const FUTURE_VALID_UNTIL_ISO = '2099-12-31T00:00:00.000Z';
const PAST_VALID_UNTIL_ISO = '2020-01-01T00:00:00.000Z';
const VALID_FROM_ISO = '2020-01-01T00:00:00.000Z';
const ISSUED_AT_ISO = '2026-07-01T00:00:00.000Z';
const COMPLETED_AT_A_ISO = '2026-07-10T08:00:00.000Z';
const COMPLETED_AT_B_ISO = '2026-07-11T08:00:00.000Z';
const ACTIVE_UPDATED_AT_ISO = '2026-07-12T08:00:00.000Z';
const EXISTING_USED_AT_ISO = '2026-07-09T08:00:00.000Z';
const TRANSACTION_START_PROBE = Object.freeze({
  offsetSeconds: 0.25,
  probeCouponId: 'coupon-transaction-start-probe',
  sleepSeconds: 0.75,
  sourceCouponId: 'coupon-main',
});
const MIGRATION_ONLY_PRISMA_SCHEMA = [
  'datasource db {',
  '  provider = "postgresql"',
  '  url      = env("DATABASE_URL")',
  '}',
  '',
].join('\n');
const SAFE_DATABASE_QUERY_PARAMETERS = new Set([
  'connection_limit',
  'schema',
  'sslmode',
]);

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.length > 1 || (args.length === 1 && args[0] !== '--test')) {
    throw new Error(
      'Usage: node scripts/verify-order-coupon-migration.js [--test]',
    );
  }

  return { useTestDatabase: args[0] === '--test' };
}

function assertSafeSchemaName(schemaName) {
  if (!/^[a-z][a-z0-9_]{7,62}$/.test(schemaName)) {
    throw new Error(`Unsafe migration schema name: ${schemaName}`);
  }
}

function createSafeSchemaName(token = randomUUID()) {
  const normalizedToken = String(token)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 38);
  const schemaName = `order_coupon_migration_${normalizedToken || randomUUID().replace(/-/g, '')}`.slice(
    0,
    63,
  );
  assertSafeSchemaName(schemaName);
  return schemaName;
}

function withSchemaQueryParameter(databaseUrl, schemaName) {
  assertSafeSchemaName(schemaName);
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

function removeTempWorkspaceSafely(
  workspacePath,
  tempRoot = os.tmpdir(),
  remove = rmSync,
) {
  const resolvedWorkspace = path.resolve(workspacePath);
  const resolvedTempRoot = path.resolve(tempRoot);
  const relative = path.relative(resolvedTempRoot, resolvedWorkspace);
  const ownedName = path.basename(resolvedWorkspace).startsWith(WORKSPACE_PREFIX);

  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !ownedName
  ) {
    throw new Error(
      `Refusing to remove unsafe migration workspace: ${resolvedWorkspace}`,
    );
  }

  remove(resolvedWorkspace, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 100,
  });
}

function createPrismaInvocation(args, schemaPath) {
  return {
    command: process.execPath,
    args: [
      require.resolve('prisma/build/index.js'),
      ...args,
      '--schema',
      schemaPath,
    ],
  };
}

function formatDatabaseUrlForDisplay(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (url.password) {
      url.password = '***';
    }

    const queryEntries = [...url.searchParams.entries()];
    url.search = '';
    for (const [key, value] of queryEntries) {
      url.searchParams.append(
        key,
        SAFE_DATABASE_QUERY_PARAMETERS.has(key.toLowerCase()) ? value : '***',
      );
    }
    return url.toString();
  } catch {
    return '<invalid database URL>';
  }
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function collectSensitiveDatabaseValues(databaseUrl) {
  const sensitiveValues = new Set();
  const addValue = value => {
    if (value && value !== '***') {
      sensitiveValues.add(value);
      sensitiveValues.add(decodeUrlComponent(value));
    }
  };

  try {
    const parsed = new URL(databaseUrl);
    addValue(parsed.password);
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!SAFE_DATABASE_QUERY_PARAMETERS.has(key.toLowerCase())) {
        addValue(value);
        addValue(encodeURIComponent(value));
      }
    }

    const rawQuery = databaseUrl.split('?', 2)[1]?.split('#', 1)[0] || '';
    for (const part of rawQuery.split('&')) {
      const separator = part.indexOf('=');
      if (separator < 0) {
        continue;
      }
      const rawKey = part.slice(0, separator);
      const rawValue = part.slice(separator + 1);
      if (
        !SAFE_DATABASE_QUERY_PARAMETERS.has(
          decodeUrlComponent(rawKey).toLowerCase(),
        )
      ) {
        addValue(rawValue);
      }
    }
  } catch {
    // Invalid URLs are never echoed by formatDatabaseUrlForDisplay.
  }

  return [...sensitiveValues]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function redactSensitiveText(value, databaseUrl) {
  let result = String(value || '');
  const displayUrl = formatDatabaseUrlForDisplay(databaseUrl);
  result = result.split(databaseUrl).join(displayUrl);

  for (const sensitiveValue of collectSensitiveDatabaseValues(databaseUrl)) {
    result = result.split(sensitiveValue).join('***');
  }

  return result;
}

function formatPrismaFailure(phase, result, databaseUrl) {
  const detail = [result.error?.message, result.stderr, result.stdout]
    .filter(Boolean)
    .join('\n')
    .trim();
  const safeDetail = redactSensitiveText(
    detail || `exit code ${result.status ?? 1}`,
    databaseUrl,
  );
  return `${phase} failed for ${formatDatabaseUrlForDisplay(databaseUrl)}: ${safeDetail}`;
}

function runPrismaCommand(
  args,
  workspace,
  databaseUrl,
  spawnSyncImpl = spawnSync,
) {
  const invocation = createPrismaInvocation(args, workspace.schemaPath);
  const result = spawnSyncImpl(invocation.command, invocation.args, {
    cwd: API_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    encoding: 'utf8',
  });

  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function shouldCopyMigrationEntry(
  entryName,
  isDirectory,
  targetMigration = TARGET_MIGRATION,
) {
  if (entryName === 'migration_lock.toml') {
    return !isDirectory;
  }
  return (
    isDirectory &&
    /^\d{14}_.+/.test(entryName) &&
    entryName < targetMigration
  );
}

function createMigrationWorkspace(fileSystem = {}) {
  const tempRoot = fileSystem.tempRoot || os.tmpdir();
  const mkdtemp = fileSystem.mkdtemp || mkdtempSync;
  const mkdir = fileSystem.mkdir || mkdirSync;
  const writeFile = fileSystem.writeFile || writeFileSync;
  const readdir = fileSystem.readdir || readdirSync;
  const copy = fileSystem.copy || cpSync;
  const remove = fileSystem.remove || rmSync;
  let root;

  try {
    root = mkdtemp(path.join(tempRoot, WORKSPACE_PREFIX));
    const prismaRoot = path.join(root, 'prisma');
    const migrationsRoot = path.join(prismaRoot, 'migrations');
    const schemaPath = path.join(prismaRoot, 'schema.prisma');
    mkdir(migrationsRoot, { recursive: true });
    writeFile(schemaPath, MIGRATION_ONLY_PRISMA_SCHEMA, 'utf8');

    for (const entry of readdir(path.join(PRISMA_ROOT, 'migrations'), {
      withFileTypes: true,
    })) {
      if (
        !shouldCopyMigrationEntry(entry.name, entry.isDirectory())
      ) {
        continue;
      }
      copy(
        path.join(PRISMA_ROOT, 'migrations', entry.name),
        path.join(migrationsRoot, entry.name),
        { recursive: entry.isDirectory() },
      );
    }

    return { root, migrationsRoot, schemaPath };
  } catch (error) {
    if (!root) {
      throw error;
    }
    try {
      removeTempWorkspaceSafely(root, tempRoot, remove);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'migration workspace construction failed and cleanup failed',
      );
    }
    throw error;
  }
}

function installTargetMigration(workspace) {
  cpSync(
    path.join(PRISMA_ROOT, 'migrations', TARGET_MIGRATION),
    path.join(workspace.migrationsRoot, TARGET_MIGRATION),
    { recursive: true },
  );
}

async function createDatabaseContext(databaseUrl, schemaName) {
  assertSafeSchemaName(schemaName);
  const adminClient = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  } catch (error) {
    await adminClient.$disconnect();
    throw error;
  }

  const scopedDatabaseUrl = withSchemaQueryParameter(databaseUrl, schemaName);
  const client = new PrismaClient({
    datasources: { db: { url: scopedDatabaseUrl } },
  });

  return {
    adminClient,
    client,
    databaseUrl: scopedDatabaseUrl,
    schemaName,
  };
}

function createUsers() {
  return [
    {
      id: 'shipper-a',
      phone: '19900000001',
      userType: 'shipper',
      status: 'active',
      createdAtIso: ISSUED_AT_ISO,
      updatedAtIso: ISSUED_AT_ISO,
    },
    {
      id: 'shipper-b',
      phone: '19900000002',
      userType: 'shipper',
      status: 'active',
      createdAtIso: ISSUED_AT_ISO,
      updatedAtIso: ISSUED_AT_ISO,
    },
  ];
}

function createCoupon(overrides = {}) {
  return {
    id: 'coupon-main',
    shipperId: 'shipper-a',
    title: 'Migration fixture coupon',
    status: 'locked',
    conditionText: 'Full 300 minus 30',
    discountCents: 3000,
    minOrderAmountCents: 30000,
    validFromIso: VALID_FROM_ISO,
    validUntilIso: FUTURE_VALID_UNTIL_ISO,
    sourceText: 'migration fixture',
    issuedAtIso: ISSUED_AT_ISO,
    lockedOrderNo: null,
    lockedAtIso: ISSUED_AT_ISO,
    usedOrderNo: null,
    usedAtIso: null,
    ...overrides,
  };
}

function createOrder(id, orderNo, status, overrides = {}) {
  return {
    id,
    orderNo,
    shipperId: 'shipper-a',
    status,
    pricingMode: 'fixed',
    priceCents: 50000,
    payablePriceCents: 47000,
    paymentMethod: 'cod',
    couponId: 'coupon-main',
    couponTitle: 'Migration fixture coupon',
    couponDiscountCents: 3000,
    pickupTimeIso: '2026-07-20T08:00:00.000Z',
    createdAtIso: ISSUED_AT_ISO,
    updatedAtIso:
      status === 'completed' ? COMPLETED_AT_A_ISO : ACTIVE_UPDATED_AT_ISO,
    ...overrides,
  };
}

function createSeed(coupons, orders) {
  return { users: createUsers(), coupons, orders };
}

function createAssertion(couponId, status, overrides = {}) {
  return {
    couponId,
    status,
    lockedOrderNo: null,
    lockedAt: null,
    usedOrderNo: null,
    usedAtIso: null,
    ...overrides,
  };
}

function createCouponMigrationFixtures() {
  const completedA = createOrder(
    'order-completed-a',
    'HY202607140001',
    'completed',
    { updatedAtIso: COMPLETED_AT_A_ISO },
  );
  const completedB = createOrder(
    'order-completed-b',
    'HY202607140002',
    'completed',
    { updatedAtIso: COMPLETED_AT_B_ISO },
  );
  const cancelled = createOrder(
    'order-cancelled',
    'HY202607140003',
    'cancelled',
  );
  const active = createOrder('order-active', 'HY202607140004', 'waiting');
  const unrelated = createOrder(
    'order-unrelated',
    'HY202607140005',
    'waiting',
    { couponId: null, couponTitle: null, couponDiscountCents: null },
  );
  const usedAssertion = order =>
    createAssertion('coupon-main', 'used', {
      usedOrderNo: order.orderNo,
      usedAtIso: order.updatedAtIso,
    });
  const lockedAssertion = order =>
    createAssertion('coupon-main', 'locked', {
      lockedOrderNo: order.orderNo,
      lockedAt: 'present',
    });

  return [
    {
      name: 'multi-completed',
      expected: 'reject',
      seed: createSeed(
        [createCoupon({ lockedOrderNo: completedA.orderNo })],
        [completedA, completedB],
      ),
      correction: {
        operations: [
          {
            type: 'update-order',
            id: completedB.id,
            data: { status: 'cancelled' },
          },
        ],
      },
      correctedAssertion: usedAssertion(completedA),
    },
    {
      name: 'cancelled-and-active',
      expected: 'locked',
      seed: createSeed(
        [
          createCoupon(),
          createCoupon({ id: TRANSACTION_START_PROBE.probeCouponId }),
        ],
        [cancelled, active],
      ),
      assertion: {
        ...lockedAssertion(active),
        transactionStartProbe: {
          couponId: TRANSACTION_START_PROBE.probeCouponId,
          expectedStatus: 'usable',
        },
      },
      transactionStartProbe: { ...TRANSACTION_START_PROBE },
    },
    {
      name: 'locked-completed-owner',
      expected: 'used',
      seed: createSeed(
        [createCoupon({ lockedOrderNo: completedA.orderNo })],
        [completedA],
      ),
      assertion: usedAssertion(completedA),
    },
    {
      name: 'locked-completed-null',
      expected: 'used',
      seed: createSeed([createCoupon()], [completedA]),
      assertion: usedAssertion(completedA),
    },
    {
      name: 'locked-completed-other-real',
      expected: 'reject',
      seed: createSeed(
        [createCoupon({ lockedOrderNo: unrelated.orderNo })],
        [completedA, unrelated],
      ),
      correction: {
        operations: [
          {
            type: 'update-coupon',
            id: 'coupon-main',
            data: { lockedOrderNo: null },
          },
        ],
      },
      correctedAssertion: usedAssertion(completedA),
    },
    {
      name: 'used-without-completed',
      expected: 'reject',
      seed: createSeed(
        [
          createCoupon({
            status: 'used',
            lockedAtIso: null,
            usedOrderNo: active.orderNo,
            usedAtIso: EXISTING_USED_AT_ISO,
          }),
        ],
        [active],
      ),
      correction: {
        operations: [
          {
            type: 'update-order',
            id: active.id,
            data: { status: 'completed' },
          },
        ],
      },
      correctedAssertion: createAssertion('coupon-main', 'used', {
        usedOrderNo: active.orderNo,
        usedAtIso: EXISTING_USED_AT_ISO,
      }),
    },
    {
      name: 'completed-and-cancelled',
      expected: 'used',
      seed: createSeed([createCoupon()], [completedA, cancelled]),
      assertion: usedAssertion(completedA),
    },
    {
      name: 'future-only-cancelled',
      expected: 'usable',
      seed: createSeed(
        [createCoupon({ lockedOrderNo: cancelled.orderNo })],
        [cancelled],
      ),
      assertion: createAssertion('coupon-main', 'usable'),
    },
    {
      name: 'orphan-locked-null',
      expected: 'usable',
      seed: createSeed([createCoupon()], []),
      assertion: createAssertion('coupon-main', 'usable'),
    },
    {
      name: 'orphan-locked-dangling',
      expected: 'usable',
      seed: createSeed(
        [createCoupon({ lockedOrderNo: 'HY-DANGLING' })],
        [],
      ),
      assertion: createAssertion('coupon-main', 'usable'),
    },
    {
      name: 'orphan-locked-other-real',
      expected: 'reject',
      seed: createSeed(
        [createCoupon({ lockedOrderNo: unrelated.orderNo })],
        [unrelated],
      ),
      correction: {
        operations: [
          {
            type: 'update-coupon',
            id: 'coupon-main',
            data: { lockedOrderNo: null },
          },
        ],
      },
      correctedAssertion: createAssertion('coupon-main', 'usable'),
    },
    {
      name: 'expired-orphan',
      expected: 'expired',
      seed: createSeed(
        [
          createCoupon({
            status: 'expired',
            validUntilIso: FUTURE_VALID_UNTIL_ISO,
          }),
        ],
        [],
      ),
      assertion: createAssertion('coupon-main', 'expired'),
    },
    {
      name: 'expired-and-cancelled',
      expected: 'expired',
      seed: createSeed(
        [
          createCoupon({
            lockedOrderNo: cancelled.orderNo,
            validUntilIso: PAST_VALID_UNTIL_ISO,
          }),
        ],
        [cancelled],
      ),
      assertion: createAssertion('coupon-main', 'expired'),
    },
    {
      name: 'missing-coupon',
      expected: 'reject',
      seed: createSeed(
        [],
        [
          createOrder('order-missing-coupon', 'HY202607140006', 'waiting', {
            couponId: 'coupon-missing',
          }),
        ],
      ),
      correction: {
        operations: [
          {
            type: 'create-coupon',
            data: createCoupon({ id: 'coupon-missing', status: 'usable' }),
          },
        ],
      },
      correctedAssertion: createAssertion('coupon-missing', 'locked', {
        lockedOrderNo: 'HY202607140006',
        lockedAt: 'present',
      }),
    },
    {
      name: 'unknown-status',
      expected: 'reject',
      seed: createSeed([createCoupon({ status: 'mystery' })], []),
      correction: {
        operations: [
          {
            type: 'update-coupon',
            id: 'coupon-main',
            data: { status: 'usable' },
          },
        ],
      },
      correctedAssertion: createAssertion('coupon-main', 'usable'),
    },
    {
      name: 'cross-shipper',
      expected: 'reject',
      seed: createSeed(
        [createCoupon({ status: 'usable', lockedAtIso: null })],
        [createOrder('order-cross-shipper', 'HY202607140007', 'waiting', {
          shipperId: 'shipper-b',
        })],
      ),
      correction: {
        operations: [
          {
            type: 'update-order',
            id: 'order-cross-shipper',
            data: { shipperId: 'shipper-a' },
          },
        ],
      },
      correctedAssertion: createAssertion('coupon-main', 'locked', {
        lockedOrderNo: 'HY202607140007',
        lockedAt: 'present',
      }),
    },
  ];
}

async function insertUser(client, user) {
  await client.$executeRawUnsafe(
    `INSERT INTO "User" (
      "id", "phone", "userType", "status", "createdAt", "updatedAt"
    ) VALUES (
      $1, $2, $3::"UserType", $4::"UserStatus", $5::timestamp(3), $6::timestamp(3)
    )`,
    user.id,
    user.phone,
    user.userType,
    user.status,
    user.createdAtIso,
    user.updatedAtIso,
  );
}

async function insertCoupon(client, coupon) {
  await client.$executeRawUnsafe(
    `INSERT INTO "ShipperCoupon" (
      "id", "shipperId", "title", "status", "conditionText",
      "discountCents", "minOrderAmountCents", "validFrom", "validUntil",
      "sourceText", "issuedAt", "lockedOrderNo", "lockedAt", "usedOrderNo", "usedAt"
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8::timestamp(3), $9::timestamp(3),
      $10, $11::timestamp(3), $12, $13::timestamp(3), $14, $15::timestamp(3)
    )`,
    coupon.id,
    coupon.shipperId,
    coupon.title,
    coupon.status,
    coupon.conditionText,
    coupon.discountCents,
    coupon.minOrderAmountCents,
    coupon.validFromIso,
    coupon.validUntilIso,
    coupon.sourceText,
    coupon.issuedAtIso,
    coupon.lockedOrderNo,
    coupon.lockedAtIso,
    coupon.usedOrderNo,
    coupon.usedAtIso,
  );
}

async function insertOrder(client, order) {
  await client.$executeRawUnsafe(
    `INSERT INTO "Order" (
      "id", "orderNo", "shipperId", "status", "pricingMode",
      "priceCents", "payablePriceCents", "paymentMethod", "couponId",
      "couponTitle", "couponDiscountCents", "pickupTime", "expectedDeliveryText",
      "createdAt", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4::"OrderStatus", $5::"PricingMode",
      $6, $7, $8::"PaymentMethod", $9,
      $10, $11, $12::timestamp(3), $13,
      $14::timestamp(3), $15::timestamp(3)
    )`,
    order.id,
    order.orderNo,
    order.shipperId,
    order.status,
    order.pricingMode,
    order.priceCents,
    order.payablePriceCents,
    order.paymentMethod,
    order.couponId,
    order.couponTitle,
    order.couponDiscountCents,
    order.pickupTimeIso,
    order.expectedDeliveryText ?? null,
    order.createdAtIso,
    order.updatedAtIso,
  );
}

async function seedFixture(context, fixture) {
  for (const user of fixture.seed.users) {
    await insertUser(context.client, user);
  }
  for (const coupon of fixture.seed.coupons) {
    await insertCoupon(context.client, coupon);
  }
  for (const order of fixture.seed.orders) {
    await insertOrder(context.client, order);
  }

  const probe = fixture.transactionStartProbe;
  if (!probe) {
    return;
  }

  await context.client.$executeRawUnsafe(
    `CREATE TABLE "_OrderCouponMigrationTransactionProbe" (
      "sourceCouponId" TEXT PRIMARY KEY,
      "probeCouponId" TEXT NOT NULL UNIQUE,
      "offsetSeconds" DOUBLE PRECISION NOT NULL,
      "sleepSeconds" DOUBLE PRECISION NOT NULL,
      "executed" BOOLEAN NOT NULL DEFAULT FALSE,
      "transactionTimestamp" TIMESTAMPTZ,
      "clockAfterSleep" TIMESTAMPTZ
    )`,
  );
  await context.client.$executeRawUnsafe(
    `INSERT INTO "_OrderCouponMigrationTransactionProbe" (
      "sourceCouponId", "probeCouponId", "offsetSeconds", "sleepSeconds"
    ) VALUES ($1, $2, $3, $4)`,
    probe.sourceCouponId,
    probe.probeCouponId,
    probe.offsetSeconds,
    probe.sleepSeconds,
  );
  await context.client.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION "_order_coupon_migration_transaction_probe"()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      probe_row RECORD;
      transaction_start TIMESTAMPTZ;
    BEGIN
      SELECT *
      INTO probe_row
      FROM "_OrderCouponMigrationTransactionProbe"
      WHERE "sourceCouponId" = NEW."id"
        AND "executed" = FALSE
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN NEW;
      END IF;

      transaction_start := transaction_timestamp();
      UPDATE "_OrderCouponMigrationTransactionProbe"
      SET "executed" = TRUE,
          "transactionTimestamp" = transaction_start
      WHERE "sourceCouponId" = probe_row."sourceCouponId";

      UPDATE "ShipperCoupon"
      SET "validUntil" = (transaction_start AT TIME ZONE 'UTC')
        + make_interval(secs => probe_row."offsetSeconds")
      WHERE "id" = probe_row."probeCouponId";

      PERFORM pg_sleep(probe_row."sleepSeconds");

      UPDATE "_OrderCouponMigrationTransactionProbe"
      SET "clockAfterSleep" = clock_timestamp()
      WHERE "sourceCouponId" = probe_row."sourceCouponId";

      RETURN NEW;
    END;
    $$`,
  );
  await context.client.$executeRawUnsafe(
    `CREATE TRIGGER "_order_coupon_migration_transaction_probe_trigger"
    AFTER UPDATE ON "ShipperCoupon"
    FOR EACH ROW
    EXECUTE FUNCTION "_order_coupon_migration_transaction_probe"()`,
  );
}

function normalizeSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

async function captureSnapshot(context) {
  const [coupons, orders] = await Promise.all([
    context.client.$queryRawUnsafe(
      `SELECT "id", "shipperId", "title", "status", "conditionText",
        "discountCents", "minOrderAmountCents", "validFrom", "validUntil",
        "sourceText", "issuedAt", "lockedOrderNo", "lockedAt", "usedOrderNo", "usedAt"
       FROM "ShipperCoupon"
       ORDER BY "id" ASC`,
    ),
    context.client.$queryRawUnsafe(
      `SELECT "id", "orderNo", "shipperId", "status", "pricingMode",
        "priceCents", "payablePriceCents", "paymentMethod", "couponId",
        "couponTitle", "couponDiscountCents", "pickupTime", "expectedDeliveryText",
        "createdAt", "updatedAt"
       FROM "Order"
       ORDER BY "id" ASC`,
    ),
  ]);
  return normalizeSnapshot({ coupons, orders });
}

function getSequenceRegclass(context) {
  assertSafeSchemaName(context.schemaName);
  return `"${context.schemaName}"."Order_order_no_seq"`;
}

async function assertSequenceAbsent(context) {
  const rows = await context.client.$queryRawUnsafe(
    'SELECT to_regclass($1)::text AS "name"',
    getSequenceRegclass(context),
  );
  assert.equal(rows[0]?.name ?? null, null, 'failed migration left its sequence');
}

async function assertSequenceReady(context) {
  const sequenceName = getSequenceRegclass(context);
  const sequenceRows = await context.client.$queryRawUnsafe(
    'SELECT to_regclass($1)::text AS "name"',
    sequenceName,
  );
  assert.ok(sequenceRows[0]?.name, 'target migration did not create its sequence');
  const nextValueRows = await context.client.$queryRawUnsafe(
    'SELECT nextval($1::regclass) AS "value"',
    sequenceName,
  );
  assert.notEqual(
    nextValueRows[0]?.value ?? null,
    null,
    'target migration sequence did not advance',
  );
}

function assertCorrectionShape(operation, allowedField) {
  const fields = Object.keys(operation.data || {});
  if (fields.length !== 1 || fields[0] !== allowedField) {
    throw new Error(
      `Unsupported fixture correction fields for ${operation.type}: ${fields.join(',')}`,
    );
  }
}

async function applyCorrection(context, correction) {
  for (const operation of correction.operations) {
    if (operation.type === 'update-order') {
      if (Object.prototype.hasOwnProperty.call(operation.data, 'status')) {
        assertCorrectionShape(operation, 'status');
        await context.client.$executeRawUnsafe(
          'UPDATE "Order" SET "status" = $1::"OrderStatus" WHERE "id" = $2',
          operation.data.status,
          operation.id,
        );
      } else if (
        Object.prototype.hasOwnProperty.call(operation.data, 'shipperId')
      ) {
        assertCorrectionShape(operation, 'shipperId');
        await context.client.$executeRawUnsafe(
          'UPDATE "Order" SET "shipperId" = $1 WHERE "id" = $2',
          operation.data.shipperId,
          operation.id,
        );
      } else {
        throw new Error('Unsupported fixture correction fields for update-order');
      }
      continue;
    }
    if (operation.type === 'update-coupon') {
      if (
        Object.prototype.hasOwnProperty.call(operation.data, 'lockedOrderNo')
      ) {
        assertCorrectionShape(operation, 'lockedOrderNo');
        await context.client.$executeRawUnsafe(
          'UPDATE "ShipperCoupon" SET "lockedOrderNo" = $1 WHERE "id" = $2',
          operation.data.lockedOrderNo,
          operation.id,
        );
      } else if (Object.prototype.hasOwnProperty.call(operation.data, 'status')) {
        assertCorrectionShape(operation, 'status');
        await context.client.$executeRawUnsafe(
          'UPDATE "ShipperCoupon" SET "status" = $1 WHERE "id" = $2',
          operation.data.status,
          operation.id,
        );
      } else {
        throw new Error('Unsupported fixture correction fields for update-coupon');
      }
      continue;
    }
    if (operation.type === 'create-coupon') {
      await insertCoupon(context.client, operation.data);
      continue;
    }
    throw new Error(`Unsupported fixture correction: ${operation.type}`);
  }
}

async function assertFixture(context, expectation) {
  const rows = await context.client.$queryRawUnsafe(
    `SELECT "status", "lockedOrderNo", "lockedAt", "usedOrderNo", "usedAt"
     FROM "ShipperCoupon"
     WHERE "id" = $1`,
    expectation.couponId,
  );
  const coupon = rows[0];
  assert.ok(coupon, `coupon not found: ${expectation.couponId}`);
  assert.equal(coupon.status, expectation.status);
  assert.equal(coupon.lockedOrderNo, expectation.lockedOrderNo);
  assert.equal(coupon.usedOrderNo, expectation.usedOrderNo);

  if (expectation.lockedAt === 'present') {
    assert.ok(coupon.lockedAt, 'expected lockedAt to be populated');
  } else {
    assert.equal(coupon.lockedAt, null);
  }

  assert.equal(
    coupon.usedAt ? new Date(coupon.usedAt).toISOString() : null,
    expectation.usedAtIso,
  );

  const probeExpectation = expectation.transactionStartProbe;
  if (!probeExpectation) {
    return;
  }

  const probeRows = await context.client.$queryRawUnsafe(
    `SELECT probe."executed", probe."transactionTimestamp", probe."clockAfterSleep",
       coupon."validUntil", coupon."status"
     FROM "_OrderCouponMigrationTransactionProbe" probe
     JOIN "ShipperCoupon" coupon ON coupon."id" = probe."probeCouponId"
     WHERE probe."probeCouponId" = $1`,
    probeExpectation.couponId,
  );
  const probe = probeRows[0];
  assert.ok(
    probe,
    `transaction-start probe not found: ${probeExpectation.couponId}`,
  );
  assert.equal(
    probe.executed,
    true,
    'transaction-start probe trigger did not execute',
  );
  assert.ok(
    probe.transactionTimestamp,
    'transaction-start probe transaction timestamp is missing',
  );
  assert.ok(
    probe.validUntil,
    'transaction-start probe coupon cutoff is missing',
  );
  assert.ok(
    probe.clockAfterSleep,
    'transaction-start probe wall clock is missing',
  );

  const transactionTimestamp = new Date(probe.transactionTimestamp).getTime();
  const validUntil = new Date(probe.validUntil).getTime();
  const clockAfterSleep = new Date(probe.clockAfterSleep).getTime();
  assert.ok(
    transactionTimestamp < validUntil,
    'transaction-start probe transaction timestamp did not precede its cutoff',
  );
  assert.ok(
    clockAfterSleep > validUntil,
    'transaction-start probe wall clock did not advance past its cutoff',
  );
  assert.equal(
    probe.status,
    probeExpectation.expectedStatus,
    'transaction-start probe coupon status did not preserve transaction-start semantics',
  );
}

function createDefaultDependencies() {
  return {
    createWorkspace: createMigrationWorkspace,
    createDatabaseContext,
    deployPrevious(workspace, context) {
      return runPrismaCommand(
        ['migrate', 'deploy'],
        workspace,
        context.databaseUrl,
      );
    },
    seedFixture,
    captureSnapshot,
    installTargetMigration,
    deployTarget(workspace, context) {
      return runPrismaCommand(
        ['migrate', 'deploy'],
        workspace,
        context.databaseUrl,
      );
    },
    assertSequenceAbsent,
    assertSequenceReady,
    applyCorrection,
    resolveRolledBack(workspace, context) {
      return runPrismaCommand(
        ['migrate', 'resolve', '--rolled-back', TARGET_MIGRATION],
        workspace,
        context.databaseUrl,
      );
    },
    assertFixture,
    async disconnectFixtureClient(context) {
      await context.client.$disconnect();
    },
    async dropSchema(context) {
      assertSafeSchemaName(context.schemaName);
      await context.adminClient.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${context.schemaName}" CASCADE`,
      );
    },
    async disconnectAdminClient(context) {
      await context.adminClient.$disconnect();
    },
    removeWorkspace(workspace) {
      removeTempWorkspaceSafely(workspace.root);
    },
  };
}

function assertPrismaSuccess(result, phase, databaseUrl) {
  if (result.status !== 0) {
    throw new Error(formatPrismaFailure(phase, result, databaseUrl));
  }
}

async function runMigrationFixture(fixture, options) {
  const dependencies = options.dependencies || createDefaultDependencies();
  const schemaName = options.schemaName || createSafeSchemaName();
  assertSafeSchemaName(schemaName);
  let workspace;
  let context;
  let operationError;

  try {
    workspace = await dependencies.createWorkspace();
    context = await dependencies.createDatabaseContext(
      options.databaseUrl,
      schemaName,
    );
    const previousResult = await dependencies.deployPrevious(workspace, context);
    assertPrismaSuccess(previousResult, 'previous migration deploy', context.databaseUrl || options.databaseUrl);
    await dependencies.seedFixture(context, fixture);
    const beforeSnapshot = await dependencies.captureSnapshot(context);
    await dependencies.installTargetMigration(workspace);
    const targetResult = await dependencies.deployTarget(workspace, context);

    if (fixture.expected !== 'reject') {
      assertPrismaSuccess(targetResult, 'target migration deploy', context.databaseUrl || options.databaseUrl);
      await dependencies.assertSequenceReady(context);
      await dependencies.assertFixture(context, fixture.assertion);
      return;
    }

    if (targetResult.status === 0) {
      throw new Error(`fixture ${fixture.name} expected target migration rejection`);
    }

    await dependencies.assertSequenceAbsent(context);
    const afterSnapshot = await dependencies.captureSnapshot(context);
    assert.equal(
      JSON.stringify(afterSnapshot),
      JSON.stringify(beforeSnapshot),
      `fixture ${fixture.name} changed business rows after rejected migration`,
    );
    await dependencies.applyCorrection(context, fixture.correction);
    const resolveResult = await dependencies.resolveRolledBack(workspace, context);
    assertPrismaSuccess(resolveResult, 'migration resolve rolled-back', context.databaseUrl || options.databaseUrl);
    const correctedResult = await dependencies.deployTarget(workspace, context);
    assertPrismaSuccess(correctedResult, 'corrected target migration deploy', context.databaseUrl || options.databaseUrl);
    await dependencies.assertSequenceReady(context);
    await dependencies.assertFixture(context, fixture.correctedAssertion);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    const cleanupSteps = [
      [dependencies.disconnectFixtureClient, context],
      [dependencies.dropSchema, context],
      [dependencies.disconnectAdminClient, context],
      [dependencies.removeWorkspace, workspace],
    ];
    for (const [cleanup, resource] of cleanupSteps) {
      if (!cleanup || !resource) {
        continue;
      }
      try {
        await cleanup(resource);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (operationError && cleanupErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors],
        'migration fixture operation failed and cleanup failed',
      );
    }
    if (!operationError && cleanupErrors.length === 1) {
      throw cleanupErrors[0];
    }
    if (!operationError && cleanupErrors.length > 1) {
      throw new AggregateError(
        cleanupErrors,
        'migration fixture cleanup failed in multiple steps',
      );
    }
  }
}

async function runAllMigrationFixtures(databaseUrl, options = {}) {
  const fixtures = options.fixtures || createCouponMigrationFixtures();
  const runFixture = options.runFixture || runMigrationFixture;

  for (const fixture of fixtures) {
    await runFixture(fixture, { databaseUrl });
    console.log(`order coupon migration fixture PASS: ${fixture.name}`);
  }

  return fixtures.length;
}

async function main(argv = process.argv, env = process.env, options = {}) {
  const { useTestDatabase } = parseArgs(argv);
  const databaseUrl = resolveDatabaseUrl(env, useTestDatabase);

  try {
    const count = await runAllMigrationFixtures(databaseUrl, options);
    console.log(`order coupon migration verification PASS: ${count} fixtures`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactSensitiveText(message, databaseUrl));
  }
}

if (require.main === module) {
  main()
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

module.exports = {
  TARGET_MIGRATION,
  applyCorrection,
  assertFixture,
  assertSafeSchemaName,
  assertSequenceReady,
  captureSnapshot,
  createCouponMigrationFixtures,
  createDefaultDependencies,
  createMigrationWorkspace,
  createPrismaInvocation,
  createSafeSchemaName,
  formatDatabaseUrlForDisplay,
  formatPrismaFailure,
  main,
  parseArgs,
  redactSensitiveText,
  removeTempWorkspaceSafely,
  resolveDatabaseUrl,
  runAllMigrationFixtures,
  runMigrationFixture,
  runPrismaCommand,
  seedFixture,
  shouldCopyMigrationEntry,
  withSchemaQueryParameter,
};

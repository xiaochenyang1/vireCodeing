# PostgreSQL Acceptance Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostgreSQL acceptance explicit, safer to run, and easier to diagnose without pretending the current Docker/PostgreSQL environment is ready.

**Architecture:** Keep the existing `apps/api/scripts/verify-postgres.js` and `apps/api/scripts/seed-stage-1.js` entry points. Add a non-mutating connection wait/check path, mask credentials in diagnostic output, wire root scripts, and update docs with the current true result.

**Tech Stack:** Node.js CommonJS scripts, Prisma CLI, Prisma Client, Jest, npm scripts, PostgreSQL, Docker Compose.

---

## File Structure

- Modify `apps/api/scripts/verify-postgres.js`: add safe display URL formatting and a `wait` command that checks database connectivity without deploying migrations.
- Modify `apps/api/package.json`: add `db:postgres:wait` and `db:test:postgres:wait`; run wait before bootstrap deploy.
- Modify `apps/api/src/config/postgres-verification-script.spec.ts`: cover password masking, wait parsing, and package scripts.
- Modify `docs/platform/README.md`: document the exact PostgreSQL acceptance sequence and current blocker.
- Modify `docs/03-项目当前状态与补全路线.md`: update the latest stage-2 status and current verification counts.

## Task 1: Safe Doctor Output

**Files:**
- Modify: `apps/api/scripts/verify-postgres.js`
- Modify: `apps/api/src/config/postgres-verification-script.spec.ts`

- [ ] **Step 1: Write failing tests for masked database URLs**

Add this test to `apps/api/src/config/postgres-verification-script.spec.ts`:

```ts
it('masks database credentials in doctor display output', () => {
  const {
    formatDatabaseUrlForDisplay,
  } = require('../../scripts/verify-postgres');

  expect(
    formatDatabaseUrlForDisplay(
      'postgresql://truck:secret-pass@localhost:5432/truck_platform',
    ),
  ).toBe('postgresql://truck:***@localhost:5432/truck_platform');

  expect(formatDatabaseUrlForDisplay('not-a-url')).toBe('not-a-url');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
```

Expected: fails because `formatDatabaseUrlForDisplay` is not exported yet.

- [ ] **Step 3: Implement password masking**

In `apps/api/scripts/verify-postgres.js`, add this function near `resolveDatabaseUrl`:

```js
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
```

Change `printPostgresDoctorReport` from:

```js
console.log(`DATABASE_URL: ${report.databaseUrl}`);
```

to:

```js
console.log(`DATABASE_URL: ${formatDatabaseUrlForDisplay(report.databaseUrl)}`);
```

Add `formatDatabaseUrlForDisplay` to `module.exports`.

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
```

Expected: pass.

- [ ] **Step 5: Commit safe doctor output**

Run:

```powershell
git add apps/api/scripts/verify-postgres.js apps/api/src/config/postgres-verification-script.spec.ts
git commit -m "chore(api): mask postgres doctor database url"
```

## Task 2: Add Non-Mutating Wait Command

**Files:**
- Modify: `apps/api/scripts/verify-postgres.js`
- Modify: `apps/api/src/config/postgres-verification-script.spec.ts`

- [ ] **Step 1: Write failing tests for `wait` command parsing and invocation**

Add this test to `apps/api/src/config/postgres-verification-script.spec.ts`:

```ts
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
```

Add this test in the same file:

```ts
it('creates a Prisma db execute invocation for wait connectivity checks', () => {
  const {
    createPrismaConnectionInvocation,
  } = require('../../scripts/verify-postgres');

  const invocation = createPrismaConnectionInvocation();

  expect(invocation.command).toBe(process.execPath);
  expect(invocation.args).toContain('db');
  expect(invocation.args).toContain('execute');
  expect(invocation.args).toContain('--stdin');
  expect(invocation.args).toContain('--schema');
  expect(invocation.args).toContain('prisma/schema.prisma');
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
```

Expected: fails because `wait` and `createPrismaConnectionInvocation` do not exist.

- [ ] **Step 3: Implement the wait command**

In `apps/api/scripts/verify-postgres.js`, update `parseArgs` command validation to include `wait`:

```js
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
```

Add this helper near `createPrismaInvocation`:

```js
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
```

Add this runner near `runPrisma`:

```js
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
```

Update `main`:

```js
if (command === 'wait') {
  return runPrismaConnectionCheck(databaseUrl);
}
```

Add `createPrismaConnectionInvocation` and `runPrismaConnectionCheck` to `module.exports`.

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
```

Expected: pass.

- [ ] **Step 5: Commit wait command**

Run:

```powershell
git add apps/api/scripts/verify-postgres.js apps/api/src/config/postgres-verification-script.spec.ts
git commit -m "chore(api): add postgres connectivity wait command"
```

## Task 3: Wire Wait Into npm Scripts

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config/postgres-verification-script.spec.ts`

- [ ] **Step 1: Write failing package script assertions**

Update `apps/api/src/config/postgres-verification-script.spec.ts` in the package script test:

```ts
expect(packageJson.scripts['db:postgres:wait']).toBe(
  'node scripts/verify-postgres.js wait',
);
expect(packageJson.scripts['db:test:postgres:wait']).toBe(
  'node scripts/verify-postgres.js wait --test',
);
expect(packageJson.scripts['db:postgres:bootstrap']).toBe(
  'npm run db:postgres:wait && npm run db:postgres:deploy && npm run db:postgres:seed && npm run db:postgres:auth-smoke && npm run db:postgres:order-smoke && npm run db:postgres:driver-certification-smoke',
);
expect(packageJson.scripts['db:test:postgres:bootstrap']).toBe(
  'npm run db:test:postgres:wait && npm run db:test:postgres:deploy && npm run db:test:postgres:seed && npm run db:test:postgres:auth-smoke && npm run db:test:postgres:order-smoke && npm run db:test:postgres:driver-certification-smoke',
);
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
```

Expected: fails because package scripts are not updated.

- [ ] **Step 3: Update `apps/api/package.json` scripts**

Change the database script block so it includes:

```json
"db:postgres:wait": "node scripts/verify-postgres.js wait",
"db:postgres:bootstrap": "npm run db:postgres:wait && npm run db:postgres:deploy && npm run db:postgres:seed && npm run db:postgres:auth-smoke && npm run db:postgres:order-smoke && npm run db:postgres:driver-certification-smoke",
"db:test:postgres:wait": "node scripts/verify-postgres.js wait --test",
"db:test:postgres:bootstrap": "npm run db:test:postgres:wait && npm run db:test:postgres:deploy && npm run db:test:postgres:seed && npm run db:test:postgres:auth-smoke && npm run db:test:postgres:order-smoke && npm run db:test:postgres:driver-certification-smoke"
```

Keep existing `doctor/status/deploy/seed/smoke` scripts unchanged.

- [ ] **Step 4: Run package script tests and API typecheck**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
npm --prefix apps/api run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit npm script wiring**

Run:

```powershell
git add apps/api/package.json apps/api/src/config/postgres-verification-script.spec.ts
git commit -m "chore(api): wire postgres wait into bootstrap"
```

## Task 4: Update Acceptance Documentation

**Files:**
- Modify: `docs/platform/README.md`
- Modify: `docs/03-项目当前状态与补全路线.md`

- [ ] **Step 1: Update platform README**

In `docs/platform/README.md`, update the PostgreSQL acceptance section to list this order:

```markdown
推荐真实库验收顺序：

1. `npm --prefix apps/api run db:postgres:doctor`
2. `npm --prefix apps/api run db:postgres:wait`
3. `npm --prefix apps/api run db:postgres:deploy`
4. `npm --prefix apps/api run db:postgres:seed`
5. `npm --prefix apps/api run db:postgres:auth-smoke`
6. `npm --prefix apps/api run db:postgres:order-smoke`
7. `npm --prefix apps/api run db:postgres:driver-certification-smoke`
8. `npm --prefix apps/api run db:postgres:bootstrap`
```

Also document:

```markdown
当前机器核验结果：`db:postgres:doctor` 仍失败，Docker CLI 缺失，默认 `localhost:5432` PostgreSQL 不可达，Prisma 返回 `P1001`。这属于环境阻塞，不是业务代码通过。
```

- [ ] **Step 2: Update project status document**

In `docs/03-项目当前状态与补全路线.md`, add or update the latest top section with:

```markdown
### 2026-07-07 阶段 2 数据库验收推进

- 已确认根 Jest、移动端类型检查、移动端 lint、API Jest、API 类型检查、API lint、Prisma validate 和 API build 通过。
- PostgreSQL 验收仍受环境阻塞：当前机器没有 Docker CLI，默认 `localhost:5432` PostgreSQL 不可达，`db:postgres:doctor` 返回 Prisma `P1001`。
- 下一步需要提供 Docker Desktop 或真实 `DATABASE_URL`，再运行 `db:postgres:bootstrap`。
```

- [ ] **Step 3: Verify documentation text**

Run:

```powershell
Select-String -Path 'docs\platform\README.md' -Pattern 'db:postgres:wait|推荐真实库验收顺序|P1001'
Select-String -Path 'docs\03-项目当前状态与补全路线.md' -Pattern '2026-07-07 阶段 2 数据库验收推进|P1001|db:postgres:bootstrap'
```

Expected: both commands print matching lines.

- [ ] **Step 4: Commit documentation updates**

Run:

```powershell
git add docs/platform/README.md docs/03-项目当前状态与补全路线.md
git commit -m "docs: update postgres acceptance status"
```

## Task 5: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused API tests**

Run:

```powershell
npm --prefix apps/api test -- postgres-verification-script
npm --prefix apps/api test -- stage-1-database-scripts
```

Expected: both pass.

- [ ] **Step 2: Run full automated checks**

Run:

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run prisma:validate
npm run api:build
```

Expected: all pass.

- [ ] **Step 3: Run PostgreSQL doctor and wait**

Run:

```powershell
npm --prefix apps/api run db:postgres:doctor
npm --prefix apps/api run db:postgres:wait
```

Expected with current machine: `doctor` and `wait` may fail because Docker CLI is missing and PostgreSQL is not reachable. Report the exact failure instead of claiming database acceptance passed.

- [ ] **Step 4: Run bootstrap only when PostgreSQL is reachable**

Run only after `db:postgres:wait` passes:

```powershell
npm --prefix apps/api run db:postgres:bootstrap
```

Expected with a reachable PostgreSQL: migration deploy, seed, auth smoke, order smoke, and driver certification smoke all pass.

- [ ] **Step 5: Commit final status if verification evidence changed**

If docs were updated with new verification output, run:

```powershell
git add docs/platform/README.md docs/03-项目当前状态与补全路线.md
git commit -m "docs: record postgres acceptance verification"
```

## Self Review

- Spec coverage: covers PostgreSQL acceptance closure, safer diagnostics, bootstrap clarity, docs status, and honest reporting of the current environment blocker.
- 占位扫描: clear.
- Type consistency: `wait`, `formatDatabaseUrlForDisplay`, `createPrismaConnectionInvocation`, and `runPrismaConnectionCheck` are named consistently across tests and implementation steps.

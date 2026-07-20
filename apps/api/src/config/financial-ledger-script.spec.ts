import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

type RunnerModule = Record<string, unknown>;

const runnerPath = resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'verify-financial-ledger.js',
);
const runner = (existsSync(runnerPath) ? require(runnerPath) : {}) as RunnerModule;

function getExport<T extends (...args: any[]) => any>(name: string): T {
  const value = runner[name];
  expect(typeof value).toBe('function');
  return value as T;
}

describe('financial ledger verification script', () => {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const workflowPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'verify.yml',
  );

  it('parses normal and isolated test database arguments', () => {
    const parseArgs = getExport<(argv: string[]) => unknown>('parseArgs');

    expect(parseArgs(['node', 'verify-financial-ledger.js'])).toEqual({
      useTestDatabase: false,
    });
    expect(
      parseArgs(['node', 'verify-financial-ledger.js', '--test']),
    ).toEqual({
      useTestDatabase: true,
    });
    expect(() =>
      parseArgs(['node', 'verify-financial-ledger.js', '--unknown']),
    ).toThrow('Usage: node scripts/verify-financial-ledger.js [--test]');
  });

  it('registers financial ledger smoke scripts and wires them into bootstrap', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:postgres:financial-ledger-smoke']).toBe(
      'node scripts/verify-financial-ledger.js',
    );
    expect(packageJson.scripts['db:test:postgres:financial-ledger-smoke']).toBe(
      'node scripts/verify-financial-ledger.js --test',
    );
    expect(packageJson.scripts['db:postgres:bootstrap']).toContain(
      'npm run db:postgres:financial-ledger-smoke',
    );
    expect(packageJson.scripts['db:test:postgres:bootstrap']).toContain(
      'npm run db:test:postgres:financial-ledger-smoke',
    );
    expect(
      packageJson.scripts['db:postgres:bootstrap'].indexOf(
        'order-coupon-atomicity-smoke',
      ),
    ).toBeLessThan(
      packageJson.scripts['db:postgres:bootstrap'].indexOf(
        'financial-ledger-smoke',
      ),
    );
    expect(
      packageJson.scripts['db:test:postgres:bootstrap'].indexOf(
        'order-coupon-atomicity-smoke',
      ),
    ).toBeLessThan(
      packageJson.scripts['db:test:postgres:bootstrap'].indexOf(
        'financial-ledger-smoke',
      ),
    );
  });

  it('keeps the verification workflow aligned with financial ledger smoke coverage', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain(
      'Verify PostgreSQL coupon migration, atomicity, and financial ledger smoke flows',
    );
    expect(workflow).toContain(
      'npm --prefix apps/api run db:test:postgres:bootstrap',
    );
  });

  it('exports an async main entrypoint', () => {
    expect(typeof runner.main).toBe('function');
  });
});

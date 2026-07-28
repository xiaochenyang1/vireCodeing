import { readFileSync } from 'fs';
import { join } from 'path';

describe('evaluation appeals migration', () => {
  const migrationPath = join(
    __dirname,
    '..',
    '..',
    'prisma',
    'migrations',
    '20260727030000_evaluation_appeals',
    'migration.sql',
  );

  it('persists versioned appeal attempts with coherent resolution fields', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain(
      'CREATE TYPE "EvaluationAppealStatus" AS ENUM (\'requested\', \'accepted\', \'rejected\')',
    );
    expect(sql).toContain('CREATE TABLE "EvaluationAppeal"');
    expect(sql).toContain('EvaluationAppeal_reason_length_check');
    expect(sql).toContain('char_length("reason") BETWEEN 6 AND 500');
    expect(sql).toContain('EvaluationAppeal_resolution_check');
    expect(sql).toContain('"resolvedByAdminId" IS NOT NULL');
    expect(sql).toContain('"resolvedAt" IS NOT NULL');
  });

  it('allows only one requested appeal per evaluation while retaining resolved history', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain(
      'CREATE UNIQUE INDEX "EvaluationAppeal_open_event_unique"',
    );
    expect(sql).toContain('ON "EvaluationAppeal"("evaluationEventId")');
    expect(sql).toContain('WHERE "status" = \'requested\'');
  });

  it('appends version-linked submission and decision actions', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE "EvaluationAppealAction"');
    expect(sql).toContain('EvaluationAppealAction_transition_check');
    expect(sql).toContain('"toVersion" = "fromVersion" + 1');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "EvaluationAppealAction_appeal_version_unique"',
    );
    expect(sql).toContain('REFERENCES "EvaluationAppeal"("id")');
  });
});

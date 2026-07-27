import { readFileSync } from 'fs';
import { join } from 'path';

describe('evaluation moderation migration', () => {
  const migrationPath = join(
    __dirname,
    '..',
    '..',
    'prisma',
    'migrations',
    '20260727020000_evaluation_moderation',
    'migration.sql',
  );

  it('persists one versioned moderation snapshot per evaluation event', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain(
      'CREATE TYPE "EvaluationModerationStatus" AS ENUM (\'visible\', \'hidden\')',
    );
    expect(sql).toContain('CREATE TABLE "EvaluationModeration"');
    expect(sql).toContain(
      'PRIMARY KEY ("evaluationEventId")',
    );
    expect(sql).toContain('"version" INTEGER NOT NULL DEFAULT 1');
    expect(sql).toContain('"version" >= 1');
    expect(sql).toContain(
      'EvaluationModeration_reason_length_check" CHECK (char_length("reason") BETWEEN 2 AND 200)',
    );
    expect(sql).toContain('REFERENCES "OrderEvent"("id")');
    expect(sql).toContain('REFERENCES "User"("id")');
  });

  it('appends version-linked admin actions for every moderation decision', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE "EvaluationModerationAction"');
    expect(sql).toContain('"fromStatus" "EvaluationModerationStatus" NOT NULL');
    expect(sql).toContain('"toStatus" "EvaluationModerationStatus" NOT NULL');
    expect(sql).toContain('"toVersion" = "fromVersion" + 1');
    expect(sql).toContain(
      'EvaluationModerationAction_reason_length_check" CHECK (char_length("reason") BETWEEN 2 AND 200)',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "EvaluationModerationAction_event_version_unique" ON "EvaluationModerationAction"("evaluationEventId", "toVersion")',
    );
    expect(sql).toContain('EvaluationModerationAction_event_created_idx');
    expect(sql).toContain(
      'REFERENCES "EvaluationModeration"("evaluationEventId")',
    );
  });
});

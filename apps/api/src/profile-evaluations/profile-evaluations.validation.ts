import { z } from 'zod';
import type { AdminEvaluationAuditListQuery } from './dto';

export const adminEvaluationAuditListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export function parseAdminEvaluationAuditListQuery(
  input: unknown,
): AdminEvaluationAuditListQuery {
  const parsed = adminEvaluationAuditListQuerySchema.parse(input);

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

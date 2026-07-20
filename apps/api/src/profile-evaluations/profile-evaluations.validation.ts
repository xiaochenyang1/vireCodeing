import { z } from 'zod';
import type { AdminEvaluationAuditListQuery } from './dto';

export const adminEvaluationAuditListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  direction: z
    .enum(['shipper_to_driver', 'driver_to_shipper'])
    .optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  keyword: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
});

export function parseAdminEvaluationAuditListQuery(
  input: unknown,
): AdminEvaluationAuditListQuery {
  const parsed = adminEvaluationAuditListQuerySchema.parse(input);

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    ...(parsed.direction ? { direction: parsed.direction } : {}),
    ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
    ...(parsed.keyword ? { keyword: parsed.keyword } : {}),
  };
}

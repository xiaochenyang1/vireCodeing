import { z } from 'zod';
import type {
  AdminEvaluationAuditListQuery,
  ModerateAdminEvaluationRequest,
} from './dto';

export const adminEvaluationAuditListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  direction: z
    .enum(['shipper_to_driver', 'driver_to_shipper'])
    .optional(),
  moderationStatus: z.enum(['visible', 'hidden']).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  keyword: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
});

export const moderateAdminEvaluationSchema = z.object({
  status: z.enum(['visible', 'hidden']),
  reason: z
    .string()
    .trim()
    .min(2, '处置原因至少 2 个字符')
    .max(200, '处置原因最多 200 个字符'),
  baseModerationVersion: z
    .number()
    .int('评价处置版本必须是整数')
    .min(0, '评价处置版本不能小于 0'),
});

export function parseAdminEvaluationAuditListQuery(
  input: unknown,
): AdminEvaluationAuditListQuery {
  const parsed = adminEvaluationAuditListQuerySchema.parse(input);

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    ...(parsed.direction ? { direction: parsed.direction } : {}),
    ...(parsed.moderationStatus
      ? { moderationStatus: parsed.moderationStatus }
      : {}),
    ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
    ...(parsed.keyword ? { keyword: parsed.keyword } : {}),
  };
}

export function parseModerateAdminEvaluationRequest(
  input: unknown,
): ModerateAdminEvaluationRequest {
  return moderateAdminEvaluationSchema.parse(input);
}

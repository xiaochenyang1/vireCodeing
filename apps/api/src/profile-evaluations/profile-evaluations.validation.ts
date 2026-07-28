import { z } from 'zod';
import type {
  AdminEvaluationAuditListQuery,
  ModerateAdminEvaluationRequest,
  ResolveAdminEvaluationAppealRequest,
  SubmitEvaluationAppealRequest,
} from './dto';

export const adminEvaluationAuditListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  direction: z
    .enum(['shipper_to_driver', 'driver_to_shipper'])
    .optional(),
  moderationStatus: z.enum(['visible', 'hidden']).optional(),
  appealStatus: z
    .enum(['none', 'requested', 'accepted', 'rejected'])
    .optional(),
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

export const submitEvaluationAppealSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(6, '评价申诉理由至少 6 个字符')
    .max(500, '评价申诉理由最多 500 个字符'),
  baseModerationVersion: z
    .number()
    .int('评价处置版本必须是整数')
    .min(1, '评价处置版本不能小于 1'),
});

export const resolveAdminEvaluationAppealSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  reason: z
    .string()
    .trim()
    .min(2, '申诉裁定原因至少 2 个字符')
    .max(500, '申诉裁定原因最多 500 个字符'),
  baseAppealVersion: z
    .number()
    .int('评价申诉版本必须是整数')
    .min(1, '评价申诉版本不能小于 1'),
  baseModerationVersion: z
    .number()
    .int('评价处置版本必须是整数')
    .min(1, '评价处置版本不能小于 1'),
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
    ...(parsed.appealStatus ? { appealStatus: parsed.appealStatus } : {}),
    ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
    ...(parsed.keyword ? { keyword: parsed.keyword } : {}),
  };
}

export function parseModerateAdminEvaluationRequest(
  input: unknown,
): ModerateAdminEvaluationRequest {
  return moderateAdminEvaluationSchema.parse(input);
}

export function parseSubmitEvaluationAppealRequest(
  input: unknown,
): SubmitEvaluationAppealRequest {
  return submitEvaluationAppealSchema.parse(input);
}

export function parseResolveAdminEvaluationAppealRequest(
  input: unknown,
): ResolveAdminEvaluationAppealRequest {
  return resolveAdminEvaluationAppealSchema.parse(input);
}

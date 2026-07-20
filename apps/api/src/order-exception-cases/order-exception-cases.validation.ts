import { z } from 'zod';
import type {
  OrderExceptionCaseListQuery,
  ResolveOrderExceptionCaseRequest,
  UpdateOrderExceptionCaseRequest,
} from './dto';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform(value => (value === '' ? undefined : value));

const optionalIsoDateString = optionalTrimmedString.refine(
  value => value === undefined || !Number.isNaN(Date.parse(value)),
  '时间范围不合法',
);

export const orderExceptionCaseListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: z
      .enum(['pending', 'processing', 'resolved', 'closed'])
      .optional(),
    sourceRole: z.enum(['shipper', 'driver']).optional(),
    keyword: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform(value => (value === '' ? undefined : value)),
    createdFromIso: optionalIsoDateString,
    createdToIso: optionalIsoDateString,
  })
  .superRefine((value, context) => {
    if (
      value.createdFromIso &&
      value.createdToIso &&
      Date.parse(value.createdFromIso) >= Date.parse(value.createdToIso)
    ) {
      context.addIssue({
        code: 'custom',
        message: '开始时间必须早于结束时间',
        path: ['createdFromIso'],
      });
    }
  });

export const updateOrderExceptionCaseSchema = z.object({
  baseUpdatedAtIso: z
    .string()
    .trim()
    .refine(value => !Number.isNaN(Date.parse(value)), '工单版本时间不合法'),
  content: z
    .string()
    .trim()
    .min(6, '处理说明至少 6 个字')
    .max(500, '处理说明最多 500 字'),
});

export const resolveOrderExceptionCaseSchema = updateOrderExceptionCaseSchema
  .extend({
    compensationStatus: z.enum(['not_required', 'pending', 'offline_completed']),
    compensationTargetRole: z.enum(['shipper', 'driver']).optional(),
    compensationAmountCents: z
      .number()
      .int('赔付金额必须是大于 0 的整数分')
      .positive('赔付金额必须是大于 0 的整数分')
      .max(100000000, '赔付金额不能超过 100000000 分')
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.compensationStatus === 'not_required') {
      if (
        value.compensationTargetRole !== undefined ||
        value.compensationAmountCents !== undefined
      ) {
        context.addIssue({
          code: 'custom',
          message: '无需赔付时不能再填赔付对象或金额',
          path: ['compensationStatus'],
        });
      }
      return;
    }

    if (!value.compensationTargetRole) {
      context.addIssue({
        code: 'custom',
        message: '待赔付或线下已赔付必须指定赔付对象',
        path: ['compensationTargetRole'],
      });
    }

    if (value.compensationAmountCents === undefined) {
      context.addIssue({
        code: 'custom',
        message: '待赔付或线下已赔付必须填写赔付金额',
        path: ['compensationAmountCents'],
      });
    }
  });

const orderIdSchema = z.string().trim().min(1, '订单 ID 不能为空').max(120);
const caseIdSchema = z.string().trim().min(1, '工单 ID 不能为空').max(120);

export function parseOrderExceptionCaseListQuery(
  input: unknown,
): OrderExceptionCaseListQuery {
  return orderExceptionCaseListQuerySchema.parse(input);
}

export function parseUpdateOrderExceptionCaseRequest(
  input: unknown,
): UpdateOrderExceptionCaseRequest {
  return updateOrderExceptionCaseSchema.parse(input);
}

export function parseResolveOrderExceptionCaseRequest(
  input: unknown,
): ResolveOrderExceptionCaseRequest {
  return resolveOrderExceptionCaseSchema.parse(input);
}

export function parseOrderExceptionOrderId(input: unknown) {
  return orderIdSchema.parse(input);
}

export function parseOrderExceptionCaseId(input: unknown) {
  return caseIdSchema.parse(input);
}

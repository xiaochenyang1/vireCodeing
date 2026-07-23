import { createHash } from 'crypto';
import { z } from 'zod';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  BatchReviewAdminWithdrawalsRequest,
  CreatePaymentRequest,
} from './dto';

const createPaymentRequestSchema = z
  .object({
    channel: z.enum(['wechat', 'alipay']),
  })
  .strict();

const paymentIdempotencyKeySchema = z.string().trim().uuid().max(64);
const adminWithdrawalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120);
const adminFinanceReasonSchema = z.string().trim().min(1).max(500);

export const batchReviewAdminWithdrawalsRequestSchema = z
  .object({
    items: z
      .array(
        z.object({
          withdrawalId: adminWithdrawalIdSchema,
          expectedVersion: z.number().int().nonnegative(),
        }),
      )
      .min(1, '至少选择 1 条提现')
      .max(50, '单次最多批量审核 50 条提现'),
    action: z.enum(['approve', 'reject']),
    reason: adminFinanceReasonSchema,
  })
  .superRefine((value, context) => {
    const withdrawalIds = value.items.map(item => item.withdrawalId);
    const uniqueWithdrawalIds = new Set(withdrawalIds);

    if (uniqueWithdrawalIds.size !== withdrawalIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: '批量提现 ID 不能重复',
      });
    }
  });

export function parseCreatePaymentRequest(value: unknown): CreatePaymentRequest {
  const parsed = createPaymentRequestSchema.safeParse(value);

  if (!parsed.success) {
    throw new BusinessError(
      ApiErrorCode.VALIDATION_ERROR,
      '支付渠道参数无效',
    );
  }

  return parsed.data;
}

export function parsePaymentIdempotencyKey(value: unknown) {
  const parsed = paymentIdempotencyKeySchema.safeParse(value);

  if (!parsed.success) {
    throw new BusinessError(
      ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
      'Idempotency-Key 无效',
    );
  }

  return parsed.data;
}

export function parseBatchReviewAdminWithdrawalsRequest(
  value: unknown,
): BatchReviewAdminWithdrawalsRequest {
  const parsed = batchReviewAdminWithdrawalsRequestSchema.safeParse(value);

  if (!parsed.success) {
    throw new BusinessError(
      ApiErrorCode.VALIDATION_ERROR,
      '批量提现审核参数无效',
    );
  }

  return parsed.data;
}

export function createPaymentCreateFingerprint(
  orderId: string,
  input: CreatePaymentRequest,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        operation: 'shipper_create_payment',
        orderId,
        channel: input.channel,
      }),
    )
    .digest('hex');
}

export function createPaymentsConfigFromEnv(env: NodeJS.ProcessEnv) {
  const rawValue = env.PAYMENT_EXPIRES_SECONDS;
  const paymentExpiresSeconds = rawValue === undefined ? 900 : Number(rawValue);

  if (
    !Number.isInteger(paymentExpiresSeconds) ||
    paymentExpiresSeconds < 60 ||
    paymentExpiresSeconds > 86400
  ) {
    throw new Error(
      'PAYMENT_EXPIRES_SECONDS must be an integer between 60 and 86400',
    );
  }

  return { paymentExpiresSeconds };
}

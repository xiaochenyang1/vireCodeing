import { createHash } from 'crypto';
import { z } from 'zod';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { CreatePaymentRequest } from './dto';

const createPaymentRequestSchema = z
  .object({
    channel: z.enum(['wechat', 'alipay']),
  })
  .strict();

const paymentIdempotencyKeySchema = z.string().trim().uuid().max(64);

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

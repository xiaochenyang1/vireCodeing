import { createHash } from 'crypto';
import { z } from 'zod';
import { ApiErrorCode, BusinessError } from '../common/errors';

export const ADMIN_COUPON_ISSUE_OPERATIONS = [
  'single_issue',
  'batch_issue',
] as const;

export type AdminCouponIssueOperation =
  (typeof ADMIN_COUPON_ISSUE_OPERATIONS)[number];

const couponIssueIdempotencyKeySchema = z.string().trim().uuid().max(64);

export function parseCouponIssueIdempotencyKey(value: unknown) {
  const parsed = couponIssueIdempotencyKeySchema.safeParse(value);

  if (!parsed.success) {
    throw new BusinessError(
      ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
      'Idempotency-Key 无效',
    );
  }

  return parsed.data;
}

export function createCouponIssueFingerprint(
  operation: AdminCouponIssueOperation,
  request: unknown,
) {
  return createHash('sha256')
    .update(JSON.stringify(sortJsonValue({ operation, request })))
    .digest('hex');
}

export function createCouponIssueIdempotencyConfigFromEnv(
  env: NodeJS.ProcessEnv,
) {
  const rawValue = env.COUPON_ISSUE_IDEMPOTENCY_TTL_SECONDS;
  const ttlSeconds = rawValue === undefined ? 86400 : Number(rawValue);

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(
      'COUPON_ISSUE_IDEMPOTENCY_TTL_SECONDS must be a positive integer',
    );
  }

  return { ttlSeconds };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortJsonValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, [key, entryValue]) => {
        result[key] = sortJsonValue(entryValue);
        return result;
      }, {});
  }

  return value;
}

import { createHash } from 'crypto';
import { z } from 'zod';
import { ApiErrorCode, BusinessError } from '../common/errors';

export const ORDER_MUTATION_OPERATIONS = [
  'shipper_update',
  'shipper_cancel',
  'shipper_status',
  'shipper_complete',
  'shipper_accept_quote',
  'shipper_add_bonus',
  'driver_accept',
  'driver_status',
  'driver_cancel',
  'driver_evaluation_reply',
  'driver_shipper_evaluation',
] as const;

export const ADMIN_ORDER_BATCH_CANCEL_IDEMPOTENCY_OPERATION =
  'admin_batch_cancel' as const;

export const ORDER_IDEMPOTENCY_OPERATIONS = [
  'shipper_create',
  ...ORDER_MUTATION_OPERATIONS,
] as const;

export type OrderIdempotencyOperation =
  (typeof ORDER_IDEMPOTENCY_OPERATIONS)[number];

export type OrderMutationOperation = Exclude<
  OrderIdempotencyOperation,
  'shipper_create'
>;

const idempotencyKeySchema = z.string().trim().uuid().max(64);

export function parseOrderIdempotencyKey(value: unknown) {
  const parsed = idempotencyKeySchema.safeParse(value);

  if (!parsed.success) {
    throw new BusinessError(
      ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
      'Idempotency-Key 无效',
    );
  }

  return parsed.data;
}

export function createOrderMutationFingerprint(
  orderId: string,
  request: unknown,
) {
  return createHash('sha256')
    .update(JSON.stringify(sortJsonValue({ orderId, request })))
    .digest('hex');
}

export function createDriverEvaluationReplyFingerprint(
  orderId: string,
  request: { evaluationEventId: string; content: string },
) {
  return createOrderMutationFingerprint(orderId.trim(), {
    evaluationEventId: request.evaluationEventId.trim(),
    content: request.content.trim(),
  });
}

export function normalizeDriverShipperEvaluationRequest(request: {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
  photoCount?: number;
  photoFileIds?: string[];
}) {
  const tags = Array.from(new Set(request.tags.map(tag => tag.trim())));
  const photoFileIds = Array.from(
    new Set((request.photoFileIds ?? []).map(fileId => fileId.trim())),
  );
  const hasPhotoFileIds = request.photoFileIds !== undefined;

  return {
    rating: request.rating,
    tags,
    content: request.content.trim(),
    anonymous: request.anonymous ?? false,
    photoCount: hasPhotoFileIds
      ? photoFileIds.length
      : request.photoCount ?? 0,
    ...(hasPhotoFileIds ? { photoFileIds } : {}),
  };
}

export function createDriverShipperEvaluationFingerprint(
  orderId: string,
  request: Parameters<typeof normalizeDriverShipperEvaluationRequest>[0],
) {
  const normalizedRequest = normalizeDriverShipperEvaluationRequest(request);

  return createOrderMutationFingerprint(
    orderId.trim(),
    {
      ...normalizedRequest,
      photoFileIds: normalizedRequest.photoFileIds ?? [],
    },
  );
}

export function createAdminOrderBatchCancelFingerprint(request: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        sortJsonValue({
          operation: ADMIN_ORDER_BATCH_CANCEL_IDEMPOTENCY_OPERATION,
          request,
        }),
      ),
    )
    .digest('hex');
}

export function createOrderCreateFingerprint(request: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify(sortJsonValue({ operation: 'shipper_create', request })),
    )
    .digest('hex');
}

export function createOrderMutationIdempotencyConfigFromEnv(
  env: NodeJS.ProcessEnv,
) {
  return {
    ttlSeconds: parsePositiveInteger(
      env.ORDER_IDEMPOTENCY_TTL_SECONDS,
      86400,
      'ORDER_IDEMPOTENCY_TTL_SECONDS',
    ),
  };
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

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

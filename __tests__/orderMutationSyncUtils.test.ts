import { PlatformApiError } from '../src/services/platformApiClient';
import {
  createFailedOrderMutationSyncState,
  createOrderCreateContext,
  createOrderMutationContext,
  getOrderCreateFailureAction,
  getOrderMutationFailureAction,
  getOrderMutationRetryContext,
} from '../src/utils/orderMutationSync';

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('creates a standalone order create idempotency context', () => {
  expect(createOrderCreateContext()).toEqual({
    idempotencyKey: expect.stringMatching(uuidV4Pattern),
  });
});

test('creates a mutation context with the provided base version', () => {
  const mutationContext = createOrderMutationContext(
    '2026-07-13T08:00:00.000Z',
  );

  expect(mutationContext).toMatchObject({
    idempotencyKey: expect.stringMatching(uuidV4Pattern),
    baseUpdatedAtIso: '2026-07-13T08:00:00.000Z',
  });
});

test('creates a failed mutation sync state that keeps retry context', () => {
  const mutationContext = {
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    baseUpdatedAtIso: '2026-07-13T08:00:00.000Z',
  };

  expect(
    createFailedOrderMutationSyncState(
      '平台订单修改失败，已保留本地修改记录。',
      'update',
      mutationContext,
      1000,
    ),
  ).toMatchObject({
    status: 'failed',
    operation: 'update',
    mutationContext,
  });
});

test('reuses stored mutation context and backfills one from the order version when missing', () => {
  const storedMutationContext = {
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    baseUpdatedAtIso: '2026-07-13T08:00:00.000Z',
  };

  expect(
    getOrderMutationRetryContext({
      syncState: {
        status: 'failed',
        message: '需要重试',
        updatedAtText: '刚刚',
        mutationContext: storedMutationContext,
      },
      updatedAtIso: '2026-07-13T08:05:00.000Z',
      createdAtIso: '2026-07-13T08:00:00.000Z',
    }),
  ).toEqual(storedMutationContext);

  expect(
    getOrderMutationRetryContext({
      syncState: {
        status: 'failed',
        message: '需要重试',
        updatedAtText: '刚刚',
      },
      updatedAtIso: '2026-07-13T08:05:00.000Z',
      createdAtIso: '2026-07-13T08:00:00.000Z',
    }),
  ).toMatchObject({
    idempotencyKey: expect.stringMatching(uuidV4Pattern),
    baseUpdatedAtIso: '2026-07-13T08:05:00.000Z',
  });
});

test('maps mutation failures to retry, refresh, and reinitiate actions', () => {
  expect(
    getOrderMutationFailureAction(
      new PlatformApiError('订单已被其他操作更新', 'ORDER_CONFLICT', 409),
    ),
  ).toBe('refresh');
  expect(
    getOrderMutationFailureAction(
      new PlatformApiError(
        'Idempotency-Key 已被其他请求复用',
        'IDEMPOTENCY_KEY_REUSED',
        409,
      ),
    ),
  ).toBe('reinitiate');
  expect(
    getOrderMutationFailureAction(
      new PlatformApiError('Idempotency-Key 已过期', 'IDEMPOTENCY_KEY_EXPIRED', 409),
    ),
  ).toBe('reinitiate');
  expect(
    getOrderMutationFailureAction(new PlatformApiError('网络失败', 'NETWORK_ERROR', 0)),
  ).toBe('retry');
  expect(getOrderMutationFailureAction(new Error('unknown'))).toBe('retry');
});

test('classifies create failures without treating ORDER_CONFLICT as a mutation refresh', () => {
  expect(
    getOrderCreateFailureAction(
      new PlatformApiError(
        'Idempotency-Key 已被其他请求复用',
        'IDEMPOTENCY_KEY_REUSED',
        409,
      ),
    ),
  ).toBe('refresh');
  expect(
    getOrderCreateFailureAction(
      new PlatformApiError('Idempotency-Key 已过期', 'IDEMPOTENCY_KEY_EXPIRED', 409),
    ),
  ).toBe('refresh');
  expect(
    getOrderCreateFailureAction(
      new PlatformApiError('unexpected conflict', 'ORDER_CONFLICT', 409),
    ),
  ).toBe('contract-error');
  expect(
    getOrderCreateFailureAction(
      new PlatformApiError('网络失败', 'NETWORK_ERROR', 0),
    ),
  ).toBe('retry');
  expect(getOrderCreateFailureAction(new Error('unknown'))).toBe('retry');
});

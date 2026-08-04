import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  ORDER_IDEMPOTENCY_OPERATIONS,
  ORDER_MUTATION_OPERATIONS,
  createDriverEvaluationReplyFingerprint,
  createDriverShipperEvaluationFingerprint,
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
  createOrderMutationIdempotencyConfigFromEnv,
  normalizeDriverShipperEvaluationRequest,
  parseOrderIdempotencyKey,
  type OrderMutationOperation,
} from './order-mutation-idempotency';

describe('order mutation idempotency', () => {
  it('normalizes a UUID idempotency key', () => {
    expect(
      parseOrderIdempotencyKey(' 550e8400-e29b-41d4-a716-446655440000 '),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects an invalid idempotency key', () => {
    expect(() => parseOrderIdempotencyKey('repeat-click')).toThrow(
      new BusinessError(
        ApiErrorCode.IDEMPOTENCY_KEY_INVALID,
        'Idempotency-Key 无效',
      ),
    );
  });

  it('creates a stable fingerprint from normalized object keys', () => {
    expect(createOrderMutationFingerprint('order-1', { b: 2, a: ' x ' })).toBe(
      createOrderMutationFingerprint('order-1', {
        a: ' x ',
        b: 2,
      }),
    );
  });

  it('changes the fingerprint when order id or request changes', () => {
    expect(
      createOrderMutationFingerprint('order-1', { a: 'x', b: 2 }),
    ).not.toBe(createOrderMutationFingerprint('order-2', { a: 'x', b: 2 }));
    expect(
      createOrderMutationFingerprint('order-1', { a: 'x', b: 2 }),
    ).not.toBe(createOrderMutationFingerprint('order-1', { a: 'x', b: 3 }));
  });

  it('normalizes evaluation reply fingerprint fields', () => {
    expect(
      createDriverEvaluationReplyFingerprint('  order-1  ', {
        evaluationEventId: '  evaluation-1  ',
        content: '  谢谢认可。  ',
      }),
    ).toBe(
      createDriverEvaluationReplyFingerprint('order-1', {
        evaluationEventId: 'evaluation-1',
        content: '谢谢认可。',
      }),
    );
    expect(
      createDriverEvaluationReplyFingerprint('order-2', {
        evaluationEventId: 'evaluation-1',
        content: '谢谢认可。',
      }),
    ).not.toBe(
      createDriverEvaluationReplyFingerprint('order-1', {
        evaluationEventId: 'evaluation-1',
        content: '谢谢认可。',
      }),
    );
  });

  it('normalizes driver shipper evaluation fields without changing display order', () => {
    expect(
      normalizeDriverShipperEvaluationRequest({
        rating: 5,
        tags: [' 装货配合 ', '沟通顺畅', '装货配合'],
        content: '  货主配合顺畅。  ',
        photoCount: 6,
        photoFileIds: [' file-2 ', 'file-1', 'file-2'],
      }),
    ).toEqual({
      rating: 5,
      tags: ['装货配合', '沟通顺畅'],
      content: '货主配合顺畅。',
      anonymous: false,
      photoCount: 2,
      photoFileIds: ['file-2', 'file-1'],
    });
  });

  it('uses effective photo semantics in driver shipper evaluation fingerprints', () => {
    const request = {
      rating: 5,
      tags: ['沟通顺畅'],
      content: '货主装货配合好，结算沟通清楚。',
    };

    expect(
      createDriverShipperEvaluationFingerprint(' order-1 ', request),
    ).toBe(
      createDriverShipperEvaluationFingerprint('order-1', {
        ...request,
        anonymous: false,
        photoCount: 0,
        photoFileIds: [],
      }),
    );
    expect(
      createDriverShipperEvaluationFingerprint('order-1', {
        ...request,
        photoCount: 2,
      }),
    ).not.toBe(
      createDriverShipperEvaluationFingerprint('order-1', {
        ...request,
        photoCount: 2,
        photoFileIds: [],
      }),
    );
  });

  it('keeps event-significant ordering in driver shipper evaluation fingerprints', () => {
    const request = {
      rating: 5,
      tags: ['沟通顺畅', '装货配合'],
      content: '货主装货配合好，结算沟通清楚。',
      photoFileIds: ['file-1', 'file-2'],
    };

    expect(
      createDriverShipperEvaluationFingerprint('order-1', request),
    ).not.toBe(
      createDriverShipperEvaluationFingerprint('order-1', {
        ...request,
        tags: [...request.tags].reverse(),
      }),
    );
    expect(
      createDriverShipperEvaluationFingerprint('order-1', request),
    ).not.toBe(
      createDriverShipperEvaluationFingerprint('order-1', {
        ...request,
        photoFileIds: [...request.photoFileIds].reverse(),
      }),
    );
  });

  it('creates a stable shipper create fingerprint from normalized object keys', () => {
    const expectedDigest =
      'e6ad7906f6d64a9e20c66858ea984653c940a8bc313f48645919626186c955cc';

    expect(createOrderCreateFingerprint({ b: 2, a: 'x' })).toBe(expectedDigest);
    expect(createOrderCreateFingerprint({ a: 'x', b: 2 })).toBe(expectedDigest);
  });

  it('changes the shipper create fingerprint when the request changes', () => {
    expect(createOrderCreateFingerprint({ a: 'x' })).not.toBe(
      createOrderCreateFingerprint({ a: 'y' }),
    );
  });

  it('keeps the original versioned mutation operations in order', () => {
    expect(ORDER_MUTATION_OPERATIONS).toEqual([
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
    ]);
  });

  it('registers shipper creation before the versioned mutation operations', () => {
    expect(ORDER_IDEMPOTENCY_OPERATIONS).toEqual([
      'shipper_create',
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
    ]);
  });

  it('keeps shipper creation out of versioned mutation operations', () => {
    const mutationOperation: OrderMutationOperation = 'shipper_update';
    // @ts-expect-error shipper_create is not a versioned mutation.
    const createOperationAsMutation: OrderMutationOperation = 'shipper_create';

    expect(mutationOperation).toBe('shipper_update');
    expect(createOperationAsMutation).toBe('shipper_create');
  });

  it('parses the idempotency ttl config from env', () => {
    expect(
      createOrderMutationIdempotencyConfigFromEnv({
        ORDER_IDEMPOTENCY_TTL_SECONDS: '172800',
      }),
    ).toEqual({
      ttlSeconds: 172800,
    });
  });

  it('rejects an invalid idempotency ttl config', () => {
    expect(() =>
      createOrderMutationIdempotencyConfigFromEnv({
        ORDER_IDEMPOTENCY_TTL_SECONDS: '0',
      }),
    ).toThrow('ORDER_IDEMPOTENCY_TTL_SECONDS must be a positive integer');
  });
});

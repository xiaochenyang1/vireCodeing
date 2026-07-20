import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  ORDER_IDEMPOTENCY_OPERATIONS,
  ORDER_MUTATION_OPERATIONS,
  createOrderCreateFingerprint,
  createOrderMutationFingerprint,
  createOrderMutationIdempotencyConfigFromEnv,
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
    expect(
      createOrderMutationFingerprint('order-1', { b: 2, a: ' x ' }),
    ).toBe(
      createOrderMutationFingerprint('order-1', {
        a: ' x ',
        b: 2,
      }),
    );
  });

  it('changes the fingerprint when order id or request changes', () => {
    expect(
      createOrderMutationFingerprint('order-1', { a: 'x', b: 2 }),
    ).not.toBe(
      createOrderMutationFingerprint('order-2', { a: 'x', b: 2 }),
    );
    expect(
      createOrderMutationFingerprint('order-1', { a: 'x', b: 2 }),
    ).not.toBe(
      createOrderMutationFingerprint('order-1', { a: 'x', b: 3 }),
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
      'driver_accept',
      'driver_status',
    ]);
  });

  it('registers shipper creation before the versioned mutation operations', () => {
    expect(ORDER_IDEMPOTENCY_OPERATIONS).toEqual([
      'shipper_create',
      'shipper_update',
      'shipper_cancel',
      'shipper_status',
      'shipper_complete',
      'driver_accept',
      'driver_status',
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

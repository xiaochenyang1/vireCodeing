import { ApiErrorCode } from '../common/errors';
import {
  ADMIN_COUPON_ISSUE_OPERATIONS,
  createCouponIssueFingerprint,
  createCouponIssueIdempotencyConfigFromEnv,
  parseCouponIssueIdempotencyKey,
} from './profile-coupons.idempotency';

describe('admin coupon issue idempotency', () => {
  it('accepts trimmed UUID keys and exposes both issue operations', () => {
    expect(
      parseCouponIssueIdempotencyKey(
        ' 550e8400-e29b-41d4-a716-446655440000 ',
      ),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(ADMIN_COUPON_ISSUE_OPERATIONS).toEqual([
      'single_issue',
      'batch_issue',
    ]);
  });

  it.each([undefined, '', 'repeat-click', '550e8400']) (
    'rejects invalid key %p',
    value => {
      expect(() => parseCouponIssueIdempotencyKey(value)).toThrow(
        expect.objectContaining({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID }),
      );
    },
  );

  it('creates stable operation-scoped request fingerprints', () => {
    const left = createCouponIssueFingerprint('single_issue', {
      shipperId: 'shipper-1',
      title: '补偿券',
    });
    const reordered = createCouponIssueFingerprint('single_issue', {
      title: '补偿券',
      shipperId: 'shipper-1',
    });
    const batch = createCouponIssueFingerprint('batch_issue', {
      title: '补偿券',
      shipperId: 'shipper-1',
    });

    expect(reordered).toBe(left);
    expect(batch).not.toBe(left);
  });

  it('parses a configurable positive replay window', () => {
    expect(createCouponIssueIdempotencyConfigFromEnv({})).toEqual({
      ttlSeconds: 86400,
    });
    expect(
      createCouponIssueIdempotencyConfigFromEnv({
        COUPON_ISSUE_IDEMPOTENCY_TTL_SECONDS: '172800',
      }),
    ).toEqual({ ttlSeconds: 172800 });
    expect(() =>
      createCouponIssueIdempotencyConfigFromEnv({
        COUPON_ISSUE_IDEMPOTENCY_TTL_SECONDS: '0',
      }),
    ).toThrow(
      'COUPON_ISSUE_IDEMPOTENCY_TTL_SECONDS must be a positive integer',
    );
  });
});

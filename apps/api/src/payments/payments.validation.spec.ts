import { ApiErrorCode } from '../common/errors';
import {
  createPaymentCreateFingerprint,
  createPaymentsConfigFromEnv,
  parseBatchReviewAdminWithdrawalsRequest,
  parseCreatePaymentRequest,
  parsePaymentIdempotencyKey,
} from './payments.validation';

describe('payments validation', () => {
  it.each(['wechat', 'alipay'] as const)(
    'accepts the %s client payment channel',
    channel => {
      expect(parseCreatePaymentRequest({ channel })).toEqual({ channel });
    },
  );

  it.each([
    { channel: 'sandbox' },
    { channel: 'unionpay' },
    { channel: 'wechat', extra: true },
    {},
  ])('rejects a non-client payment request: %p', request => {
    expect(() => parseCreatePaymentRequest(request)).toThrow(
      expect.objectContaining({ code: ApiErrorCode.VALIDATION_ERROR }),
    );
  });

  it('normalizes a UUID payment idempotency key', () => {
    expect(
      parsePaymentIdempotencyKey(
        ' 550e8400-e29b-41d4-a716-446655440000 ',
      ),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it.each([undefined, '', 'repeat-click', '550e8400-e29b-41d4']) (
    'rejects invalid payment idempotency key %p',
    value => {
      expect(() => parsePaymentIdempotencyKey(value)).toThrow(
        expect.objectContaining({ code: ApiErrorCode.IDEMPOTENCY_KEY_INVALID }),
      );
    },
  );

  it('creates a stable fingerprint scoped to the order', () => {
    expect(
      createPaymentCreateFingerprint('order-1', { channel: 'wechat' }),
    ).toBe(
      createPaymentCreateFingerprint('order-1', { channel: 'wechat' }),
    );
    expect(
      createPaymentCreateFingerprint('order-1', { channel: 'wechat' }),
    ).not.toBe(
      createPaymentCreateFingerprint('order-2', { channel: 'wechat' }),
    );
    expect(
      createPaymentCreateFingerprint('order-1', { channel: 'wechat' }),
    ).not.toBe(
      createPaymentCreateFingerprint('order-1', { channel: 'alipay' }),
    );
  });

  it('parses a batch withdrawal review request with action, reason and CAS baselines', () => {
    expect(
      parseBatchReviewAdminWithdrawalsRequest({
        items: [
          { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
          { withdrawalId: 'withdrawal-2', expectedVersion: 3 },
        ],
        action: 'approve',
        reason: '财务复核后统一放款',
      }),
    ).toEqual({
      items: [
        { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
        { withdrawalId: 'withdrawal-2', expectedVersion: 3 },
      ],
      action: 'approve',
      reason: '财务复核后统一放款',
    });
  });

  it.each([
    {
      items: [],
      action: 'approve',
      reason: '财务复核后统一放款',
    },
    {
      items: [{ withdrawalId: 'withdrawal-1', expectedVersion: 0 }],
      action: 'approve',
      reason: '',
    },
    {
      items: [
        { withdrawalId: 'withdrawal-1', expectedVersion: 0 },
        { withdrawalId: 'withdrawal-1', expectedVersion: 1 },
      ],
      action: 'approve',
      reason: '重复 ID',
    },
    {
      items: [{ withdrawalId: 'withdrawal-1', expectedVersion: -1 }],
      action: 'approve',
      reason: '非法版本',
    },
    {
      items: [{ withdrawalId: 'withdrawal-1', expectedVersion: 0 }],
      action: 'hold',
      reason: '非法动作',
    },
  ])('rejects an invalid batch withdrawal review request: %p', request => {
    expect(() => parseBatchReviewAdminWithdrawalsRequest(request)).toThrow(
      expect.objectContaining({ code: ApiErrorCode.VALIDATION_ERROR }),
    );
  });

  it('parses payment expiry config with a bounded default', () => {
    expect(createPaymentsConfigFromEnv({})).toEqual({
      paymentExpiresSeconds: 900,
    });
    expect(
      createPaymentsConfigFromEnv({ PAYMENT_EXPIRES_SECONDS: '1800' }),
    ).toEqual({ paymentExpiresSeconds: 1800 });
  });

  it.each(['0', '-1', '3.5', '86401', 'invalid'])(
    'rejects invalid PAYMENT_EXPIRES_SECONDS=%s',
    value => {
      expect(() =>
        createPaymentsConfigFromEnv({ PAYMENT_EXPIRES_SECONDS: value }),
      ).toThrow('PAYMENT_EXPIRES_SECONDS must be an integer between 60 and 86400');
    },
  );
});

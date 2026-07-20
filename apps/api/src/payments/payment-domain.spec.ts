import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  assertLedgerBalanced,
  assertOrderCanCompleteFinancially,
  assertOrderCanEnterDriverHall,
  createInitialOrderPaymentStatus,
  createOfflineSettlementEntries,
  createOnlineEscrowEntries,
  createOnlineRefundEntries,
  createOnlineSettlementEntries,
  createSettlementBreakdown,
  createWithdrawalEntries,
  resolveCancellationPaymentStatus,
  resolveSuccessfulPaymentStatus,
  sumSignedLedgerEntries,
} from './payment-domain';

describe('payment domain', () => {
  it('creates an explicit initial payment status', () => {
    expect(createInitialOrderPaymentStatus('cod', 'fixed')).toBe(
      'not_required',
    );
    expect(createInitialOrderPaymentStatus('online', 'fixed')).toBe('pending');
  });

  it('rejects online negotiable orders before an agreed amount exists', () => {
    expect(() =>
      createInitialOrderPaymentStatus('online', 'negotiable'),
    ).toThrow(
      expect.objectContaining({ code: ApiErrorCode.PAYMENT_AMOUNT_INVALID }),
    );
  });

  it.each([
    { paymentMethod: 'cod' as const, paymentStatus: 'not_required' as const },
    { paymentMethod: 'online' as const, paymentStatus: 'escrowed' as const },
  ])('allows a financially ready order into the driver hall', input => {
    expect(() => assertOrderCanEnterDriverHall(input)).not.toThrow();
  });

  it.each(['pending', 'failed', 'refund_pending', 'refunded'] as const)(
    'rejects an online %s order from the driver hall',
    paymentStatus => {
      expect(() =>
        assertOrderCanEnterDriverHall({
          paymentMethod: 'online',
          paymentStatus,
        }),
      ).toThrow(
        expect.objectContaining({ code: ApiErrorCode.PAYMENT_REQUIRED }),
      );
    },
  );

  it('requires escrow before completing an online order', () => {
    expect(() =>
      assertOrderCanCompleteFinancially({
        paymentMethod: 'online',
        paymentStatus: 'pending',
      }),
    ).toThrow(
      expect.objectContaining({ code: ApiErrorCode.PAYMENT_REQUIRED }),
    );
    expect(() =>
      assertOrderCanCompleteFinancially({
        paymentMethod: 'online',
        paymentStatus: 'escrowed',
      }),
    ).not.toThrow();
    expect(() =>
      assertOrderCanCompleteFinancially({
        paymentMethod: 'cod',
        paymentStatus: 'not_required',
      }),
    ).not.toThrow();
  });

  it.each([
    ['not_required', 'cancelled'],
    ['pending', 'cancelled'],
    ['failed', 'cancelled'],
    ['escrowed', 'refund_pending'],
  ] as const)(
    'maps cancellation from %s to %s',
    (currentStatus, expectedStatus) => {
      expect(resolveCancellationPaymentStatus(currentStatus)).toBe(
        expectedStatus,
      );
    },
  );

  it('maps a late successful payment on a cancelled order to refund pending', () => {
    expect(resolveSuccessfulPaymentStatus('cancelled', 'pending')).toBe(
      'refund_pending',
    );
    expect(resolveSuccessfulPaymentStatus('cancelled', 'processing')).toBe(
      'refund_pending',
    );
    for (const paymentStatus of ['failed', 'expired', 'cancelled'] as const) {
      expect(
        resolveSuccessfulPaymentStatus('cancelled', paymentStatus),
      ).toBe('refund_pending');
      expect(resolveSuccessfulPaymentStatus('waiting', paymentStatus)).toBe(
        'escrowed',
      );
    }
    expect(resolveSuccessfulPaymentStatus('waiting', 'pending')).toBe(
      'escrowed',
    );
    expect(resolveSuccessfulPaymentStatus('waiting', 'escrowed')).toBe(
      'escrowed',
    );
  });

  it('rejects a successful callback against an incompatible payment state', () => {
    expect(() => resolveSuccessfulPaymentStatus('waiting', 'refunded')).toThrow(
      expect.objectContaining({
        code: ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
      }),
    );
  });

  it('creates a stable integer settlement breakdown', () => {
    expect(createSettlementBreakdown(76000, 500)).toEqual({
      grossAmountCents: 76000,
      platformFeeRateBps: 500,
      platformFeeCents: 3800,
      driverNetAmountCents: 72200,
    });
    expect(createSettlementBreakdown(101, 500)).toEqual({
      grossAmountCents: 101,
      platformFeeRateBps: 500,
      platformFeeCents: 5,
      driverNetAmountCents: 96,
    });
  });

  it.each([
    [0, 500],
    [-1, 500],
    [100, -1],
    [100, 10001],
    [Number.MAX_SAFE_INTEGER + 1, 500],
  ])('rejects invalid settlement inputs %s/%s', (amount, rate) => {
    expect(() => createSettlementBreakdown(amount, rate)).toThrow(
      expect.objectContaining({ code: ApiErrorCode.PAYMENT_AMOUNT_INVALID }),
    );
  });

  it('builds balanced immutable-entry drafts for every money movement', () => {
    const breakdown = createSettlementBreakdown(76000, 500);
    const entryGroups = [
      createOnlineEscrowEntries(76000, 'shipper-1'),
      createOnlineSettlementEntries(breakdown, 'driver-1'),
      createOfflineSettlementEntries(breakdown, 'driver-1'),
      createOnlineRefundEntries(76000, 'shipper-1'),
      createWithdrawalEntries(72200, 'driver-1'),
    ];

    for (const entries of entryGroups) {
      expect(sumSignedLedgerEntries(entries)).toBe(0);
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
      expect(entries.every(entry => entry.amountCents > 0)).toBe(true);
    }
  });

  it('rejects an unbalanced or empty ledger transaction', () => {
    expect(() => assertLedgerBalanced([])).toThrow(
      expect.objectContaining({
        code: ApiErrorCode.FINANCIAL_LEDGER_UNBALANCED,
      }),
    );
    expect(() =>
      assertLedgerBalanced([
        {
          accountType: 'platform_escrow',
          direction: 'credit',
          amountCents: 100,
        },
      ]),
    ).toThrow(
      expect.objectContaining({
        code: ApiErrorCode.FINANCIAL_LEDGER_UNBALANCED,
      }),
    );
  });

  it('uses typed business errors for domain rejections', () => {
    expect(() =>
      assertOrderCanEnterDriverHall({
        paymentMethod: 'online',
        paymentStatus: 'pending',
      }),
    ).toThrow(BusinessError);
  });
});

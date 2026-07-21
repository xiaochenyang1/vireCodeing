import { ApiErrorCode, BusinessError } from '../common/errors';

export type OrderPaymentStatus =
  | 'not_required'
  | 'pending'
  | 'escrowed'
  | 'settled'
  | 'failed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed'
  | 'legacy_unverified';

export type PaymentOrderStatus =
  | 'pending'
  | 'processing'
  | 'escrowed'
  | 'settled'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed';

export type RefundStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed';

export type FinancialAccountType =
  | 'gateway_clearing'
  | 'platform_escrow'
  | 'driver_payable'
  | 'platform_revenue'
  | 'offline_clearing';

export type LedgerDirection = 'debit' | 'credit';

export type LedgerEntryDraft = {
  accountType: FinancialAccountType;
  direction: LedgerDirection;
  amountCents: number;
  accountUserId?: string;
};

export type SettlementBreakdown = {
  grossAmountCents: number;
  platformFeeRateBps: number;
  platformFeeCents: number;
  driverNetAmountCents: number;
};

type PaymentMethod = 'cod' | 'online';
type PricingMode = 'fixed' | 'negotiable';
type OrderBusinessStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export function createInitialOrderPaymentStatus(
  paymentMethod: PaymentMethod,
  pricingMode: PricingMode,
): OrderPaymentStatus {
  if (paymentMethod === 'cod') {
    return 'not_required';
  }

  if (pricingMode !== 'fixed') {
    throw new BusinessError(
      ApiErrorCode.PAYMENT_AMOUNT_INVALID,
      '在线支付订单必须先确定最终金额',
    );
  }

  return 'pending';
}

export function assertOrderCanEnterDriverHall(input: {
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
}): void {
  if (
    (input.paymentMethod === 'cod' && input.paymentStatus === 'not_required') ||
    (input.paymentMethod === 'online' && input.paymentStatus === 'escrowed')
  ) {
    return;
  }

  throw new BusinessError(
    ApiErrorCode.PAYMENT_REQUIRED,
    '订单完成资金准备后才能进入司机大厅',
  );
}

export function assertOrderCanCompleteFinancially(input: {
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
}): void {
  if (
    (input.paymentMethod === 'cod' && input.paymentStatus === 'not_required') ||
    (input.paymentMethod === 'online' && input.paymentStatus === 'escrowed')
  ) {
    return;
  }

  throw new BusinessError(
    ApiErrorCode.PAYMENT_REQUIRED,
    '订单资金状态不允许完成结算',
  );
}

export function resolveCancellationPaymentStatus(
  currentStatus: OrderPaymentStatus,
): OrderPaymentStatus {
  switch (currentStatus) {
    case 'not_required':
    case 'pending':
    case 'failed':
      return 'cancelled';
    case 'escrowed':
      return 'refund_pending';
    case 'cancelled':
    case 'refund_pending':
    case 'refund_failed':
      return currentStatus;
    default:
      throw new BusinessError(
        ApiErrorCode.REFUND_NOT_AVAILABLE,
        '当前资金状态不允许取消或退款',
      );
  }
}

export function resolveSuccessfulPaymentStatus(
  orderStatus: OrderBusinessStatus,
  currentStatus: PaymentOrderStatus,
): Extract<OrderPaymentStatus, 'escrowed' | 'refund_pending'> {
  if (currentStatus === 'escrowed') {
    return 'escrowed';
  }

  if (
    currentStatus === 'pending' ||
    currentStatus === 'processing' ||
    currentStatus === 'failed' ||
    currentStatus === 'expired' ||
    currentStatus === 'cancelled'
  ) {
    return orderStatus === 'cancelled' ? 'refund_pending' : 'escrowed';
  }

  throw new BusinessError(
    ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
    '支付回调与当前支付状态冲突',
  );
}

export function createSettlementBreakdown(
  grossAmountCents: number,
  platformFeeRateBps: number,
): SettlementBreakdown {
  assertPositiveSafeInteger(grossAmountCents);

  if (
    !Number.isSafeInteger(platformFeeRateBps) ||
    platformFeeRateBps < 0 ||
    platformFeeRateBps > 10000
  ) {
    throwPaymentAmountInvalid();
  }

  const platformFeeCents = Math.round(
    (grossAmountCents * platformFeeRateBps) / 10000,
  );

  return {
    grossAmountCents,
    platformFeeRateBps,
    platformFeeCents,
    driverNetAmountCents: grossAmountCents - platformFeeCents,
  };
}

export function createOnlineEscrowEntries(
  amountCents: number,
  shipperId: string,
): LedgerEntryDraft[] {
  assertPositiveSafeInteger(amountCents);

  return [
    {
      accountType: 'gateway_clearing',
      accountUserId: shipperId,
      direction: 'debit',
      amountCents,
    },
    {
      accountType: 'platform_escrow',
      direction: 'credit',
      amountCents,
    },
  ];
}

export function createOnlineSettlementEntries(
  breakdown: SettlementBreakdown,
  driverId: string,
): LedgerEntryDraft[] {
  assertSettlementBreakdown(breakdown);

  return createSettlementEntries(
    'platform_escrow',
    breakdown,
    driverId,
  );
}

export function createOfflineSettlementEntries(
  breakdown: SettlementBreakdown,
  driverId: string,
): LedgerEntryDraft[] {
  assertSettlementBreakdown(breakdown);

  return createSettlementEntries(
    'offline_clearing',
    breakdown,
    driverId,
  );
}

export function createOnlineRefundEntries(
  amountCents: number,
  shipperId: string,
): LedgerEntryDraft[] {
  assertPositiveSafeInteger(amountCents);

  return [
    {
      accountType: 'platform_escrow',
      direction: 'debit',
      amountCents,
    },
    {
      accountType: 'gateway_clearing',
      accountUserId: shipperId,
      direction: 'credit',
      amountCents,
    },
  ];
}

export function createWithdrawalEntries(
  amountCents: number,
  driverId: string,
): LedgerEntryDraft[] {
  assertPositiveSafeInteger(amountCents);

  return [
    {
      accountType: 'driver_payable',
      accountUserId: driverId,
      direction: 'debit',
      amountCents,
    },
    {
      accountType: 'gateway_clearing',
      direction: 'credit',
      amountCents,
    },
  ];
}

export function createDriverCompensationEntries(
  amountCents: number,
  driverId: string,
): LedgerEntryDraft[] {
  assertPositiveSafeInteger(amountCents);

  return [
    {
      accountType: 'platform_revenue',
      direction: 'debit',
      amountCents,
    },
    {
      accountType: 'driver_payable',
      accountUserId: driverId,
      direction: 'credit',
      amountCents,
    },
  ];
}

export function createShipperCompensationEntries(
  amountCents: number,
  shipperId: string,
): LedgerEntryDraft[] {
  assertPositiveSafeInteger(amountCents);

  return [
    {
      accountType: 'platform_revenue',
      direction: 'debit',
      amountCents,
    },
    {
      accountType: 'offline_clearing',
      accountUserId: shipperId,
      direction: 'credit',
      amountCents,
    },
  ];
}

export function sumSignedLedgerEntries(entries: LedgerEntryDraft[]): number {
  return entries.reduce(
    (total, entry) =>
      total + (entry.direction === 'credit' ? entry.amountCents : -entry.amountCents),
    0,
  );
}

export function assertLedgerBalanced(entries: LedgerEntryDraft[]): void {
  if (
    entries.length < 2 ||
    entries.some(
      entry =>
        !Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0,
    ) ||
    !Number.isSafeInteger(sumSignedLedgerEntries(entries)) ||
    sumSignedLedgerEntries(entries) !== 0
  ) {
    throw new BusinessError(
      ApiErrorCode.FINANCIAL_LEDGER_UNBALANCED,
      '资金流水借贷不平衡',
    );
  }
}

function createSettlementEntries(
  sourceAccountType: Extract<
    FinancialAccountType,
    'platform_escrow' | 'offline_clearing'
  >,
  breakdown: SettlementBreakdown,
  driverId: string,
): LedgerEntryDraft[] {
  const entries: LedgerEntryDraft[] = [
    {
      accountType: sourceAccountType,
      direction: 'debit',
      amountCents: breakdown.grossAmountCents,
    },
    {
      accountType: 'driver_payable',
      accountUserId: driverId,
      direction: 'credit',
      amountCents: breakdown.driverNetAmountCents,
    },
  ];

  if (breakdown.platformFeeCents > 0) {
    entries.push({
      accountType: 'platform_revenue',
      direction: 'credit',
      amountCents: breakdown.platformFeeCents,
    });
  }

  return entries;
}

function assertSettlementBreakdown(breakdown: SettlementBreakdown): void {
  const expected = createSettlementBreakdown(
    breakdown.grossAmountCents,
    breakdown.platformFeeRateBps,
  );

  if (
    expected.platformFeeCents !== breakdown.platformFeeCents ||
    expected.driverNetAmountCents !== breakdown.driverNetAmountCents ||
    breakdown.driverNetAmountCents <= 0
  ) {
    throwPaymentAmountInvalid();
  }
}

function assertPositiveSafeInteger(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throwPaymentAmountInvalid();
  }
}

function throwPaymentAmountInvalid(): never {
  throw new BusinessError(
    ApiErrorCode.PAYMENT_AMOUNT_INVALID,
    '支付金额不合法',
  );
}

import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ShipperCouponRecord } from '../profile-coupons/dto';
import type {
  CreateShipperOrderRequest,
  ShipperOrderRecord,
} from './dto';

export type CanonicalOrderCouponPricing = {
  couponId: string;
  couponTitle: string;
  couponDiscountCents: number;
  payablePriceCents: number;
};

export type CurrentOrderCouponTarget =
  | { kind: 'keep-locked' }
  | { kind: 'release-to-usable' }
  | {
      kind: 'redeem-to-used';
      uniqueNonCancelledOwnerOrderId?: string;
    };

type ReservableCoupon = Pick<
  ShipperCouponRecord,
  | 'id'
  | 'shipperId'
  | 'title'
  | 'status'
  | 'discountCents'
  | 'minOrderAmountCents'
  | 'validFromIso'
  | 'validUntilIso'
>;

type ReservableCouponInput = Pick<
  CreateShipperOrderRequest,
  | 'couponTitle'
  | 'couponDiscountCents'
  | 'payablePriceCents'
  | 'priceCents'
> & {
  shipperId: string;
};

type CurrentOrderCoupon = Pick<ShipperCouponRecord, 'shipperId' | 'status'> & {
  lockedOrderNo?: string | null;
  usedOrderNo?: string | null;
};

type CurrentOrder = Pick<ShipperOrderRecord, 'id' | 'orderNo' | 'shipperId'>;

export function resolveReservableCouponPricing(
  coupon: ReservableCoupon,
  input: ReservableCouponInput,
  now: Date,
): CanonicalOrderCouponPricing {
  if (coupon.shipperId !== input.shipperId) {
    throwCouponNotAvailable('优惠券不属于当前货主');
  }

  if (coupon.status !== 'usable') {
    throwCouponNotAvailable('优惠券当前状态不可用');
  }

  const nowMs = now.getTime();
  const validFromMs = new Date(coupon.validFromIso).getTime();
  const validUntilMs = new Date(coupon.validUntilIso).getTime();

  if (!(validFromMs <= nowMs && nowMs < validUntilMs)) {
    throwCouponNotAvailable('优惠券不在有效期内');
  }

  return resolveCanonicalCouponPricing(coupon, input);
}

export function resolveCurrentOrderCouponPricing(
  coupon: ReservableCoupon,
  input: ReservableCouponInput,
): CanonicalOrderCouponPricing {
  if (coupon.shipperId !== input.shipperId) {
    throwCouponNotAvailable('优惠券不属于当前货主');
  }

  return resolveCanonicalCouponPricing(coupon, input);
}

function resolveCanonicalCouponPricing(
  coupon: ReservableCoupon,
  input: ReservableCouponInput,
): CanonicalOrderCouponPricing {

  if (
    input.priceCents === undefined ||
    !(input.priceCents >= coupon.minOrderAmountCents)
  ) {
    throwCouponNotAvailable('订单金额未达到优惠券使用门槛');
  }

  const canonicalPricing: CanonicalOrderCouponPricing = {
    couponId: coupon.id,
    couponTitle: coupon.title,
    couponDiscountCents: coupon.discountCents,
    payablePriceCents: input.priceCents - coupon.discountCents,
  };

  if (
    input.couponTitle !== canonicalPricing.couponTitle ||
    input.couponDiscountCents !== canonicalPricing.couponDiscountCents ||
    input.payablePriceCents !== canonicalPricing.payablePriceCents
  ) {
    throw new BusinessError(
      ApiErrorCode.PROFILE_COUPON_PRICE_MISMATCH,
      '优惠券金额与服务端记录不一致',
    );
  }

  return canonicalPricing;
}

export function assertCurrentOrderCouponOwnership(
  coupon: CurrentOrderCoupon,
  currentOrder: CurrentOrder,
  target: CurrentOrderCouponTarget,
): void {
  if (coupon.shipperId !== currentOrder.shipperId) {
    throwCouponNotAvailable('优惠券不属于当前货主');
  }

  const isCurrentOrderLock =
    coupon.status === 'locked' &&
    (coupon.lockedOrderNo == null ||
      coupon.lockedOrderNo === currentOrder.orderNo);

  switch (target.kind) {
    case 'keep-locked':
      if (isCurrentOrderLock) {
        return;
      }
      break;

    case 'release-to-usable':
      if (isCurrentOrderLock || coupon.status === 'usable') {
        return;
      }
      break;

    case 'redeem-to-used':
      if (
        isCurrentOrderLock ||
        (coupon.status === 'used' &&
          coupon.usedOrderNo === currentOrder.orderNo) ||
        (coupon.status === 'usable' &&
          target.uniqueNonCancelledOwnerOrderId === currentOrder.id)
      ) {
        return;
      }
      break;
  }

  throwCouponNotAvailable('优惠券不属于当前订单或状态不可用');
}

function throwCouponNotAvailable(message: string): never {
  throw new BusinessError(ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE, message);
}

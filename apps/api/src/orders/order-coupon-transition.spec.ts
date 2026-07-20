import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ShipperCouponRecord } from '../profile-coupons/dto';
import type {
  CreateShipperOrderRequest,
  ShipperOrderRecord,
} from './dto';
import {
  assertCurrentOrderCouponOwnership,
  resolveCurrentOrderCouponPricing,
  resolveReservableCouponPricing,
  type CurrentOrderCouponTarget,
} from './order-coupon-transition';

type CouponFixture = Omit<
  ShipperCouponRecord,
  'lockedOrderNo' | 'usedOrderNo'
> & {
  lockedOrderNo?: string | null;
  usedOrderNo?: string | null;
};

type ReservableCouponInput = Pick<
  CreateShipperOrderRequest,
  | 'couponId'
  | 'couponTitle'
  | 'couponDiscountCents'
  | 'payablePriceCents'
  | 'priceCents'
> & {
  shipperId: string;
};

type CurrentOrder = Pick<ShipperOrderRecord, 'id' | 'orderNo' | 'shipperId'>;

const NOW = new Date('2026-07-14T08:00:00.000Z');

describe('order coupon transition', () => {
  describe('resolveReservableCouponPricing', () => {
    it('returns canonical pricing derived from the server coupon and order price', () => {
      const coupon = createCoupon();
      const input = createReservableInput({ couponId: 'client-coupon-id' });

      expect(resolveReservableCouponPricing(coupon, input, NOW)).toEqual({
        couponId: 'coupon-1',
        couponTitle: '满 30 元减 12 元',
        couponDiscountCents: 1200,
        payablePriceCents: 3800,
      });
    });

    it('accepts the exact validFrom boundary', () => {
      const coupon = createCoupon();

      expect(
        resolveReservableCouponPricing(
          coupon,
          createReservableInput(),
          new Date(coupon.validFromIso),
        ),
      ).toEqual({
        couponId: coupon.id,
        couponTitle: coupon.title,
        couponDiscountCents: coupon.discountCents,
        payablePriceCents: 3800,
      });
    });

    it('rejects a coupon owned by another shipper before checking client pricing', () => {
      expectBusinessError(
        () =>
          resolveReservableCouponPricing(
            createCoupon({ shipperId: 'shipper-2' }),
            createReservableInput({ couponTitle: 'stale title' }),
            NOW,
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it.each(['locked', 'used', 'expired'] as const)(
      'rejects a coupon whose status is %s',
      status => {
        expectBusinessError(
          () =>
            resolveReservableCouponPricing(
              createCoupon({ status }),
              createReservableInput(),
              NOW,
            ),
          ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        );
      },
    );

    it('rejects a coupon that has not become valid yet', () => {
      expectBusinessError(
        () =>
          resolveReservableCouponPricing(
            createCoupon({ validFromIso: '2026-07-14T08:00:00.001Z' }),
            createReservableInput(),
            NOW,
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it('rejects the exact validUntil boundary', () => {
      const coupon = createCoupon();

      expectBusinessError(
        () =>
          resolveReservableCouponPricing(
            coupon,
            createReservableInput(),
            new Date(coupon.validUntilIso),
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it('rejects a coupon after validUntil', () => {
      expectBusinessError(
        () =>
          resolveReservableCouponPricing(
            createCoupon(),
            createReservableInput(),
            new Date('2027-01-01T00:00:00.001Z'),
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it.each([
      ['below the threshold', { priceCents: 2999 }],
      ['missing a fixed price', { priceCents: undefined }],
    ] as const)('rejects an order %s', (_label, overrides) => {
      expectBusinessError(
        () =>
          resolveReservableCouponPricing(
            createCoupon(),
            createReservableInput(overrides),
            NOW,
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it.each([
      ['title', { couponTitle: '旧标题' }],
      ['discount', { couponDiscountCents: 1199 }],
      ['payable price', { payablePriceCents: 3799 }],
    ] as const)('rejects client %s drift', (_label, overrides) => {
      expectBusinessError(
        () =>
          resolveReservableCouponPricing(
            createCoupon(),
            createReservableInput(overrides),
            NOW,
          ),
        ApiErrorCode.PROFILE_COUPON_PRICE_MISMATCH,
      );
    });

    it.each([
      [
        'non-usable status',
        createCoupon({ status: 'locked' }),
        createReservableInput({ couponDiscountCents: 1199 }),
        NOW,
      ],
      [
        'invalid validity window',
        createCoupon({ validFromIso: '2026-07-14T08:00:00.001Z' }),
        createReservableInput({ couponDiscountCents: 1199 }),
        NOW,
      ],
      [
        'insufficient order price',
        createCoupon(),
        createReservableInput({
          priceCents: 2999,
          couponDiscountCents: 1199,
        }),
        NOW,
      ],
    ] as const)(
      'reports %s as unavailable before client pricing drift',
      (_label, coupon, input, now) => {
        expectBusinessError(
          () => resolveReservableCouponPricing(coupon, input, now),
          ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        );
      },
    );

    it('does not mutate the coupon or request while resolving pricing', () => {
      const coupon = createCoupon();
      const input = createReservableInput();
      const couponBefore = { ...coupon };
      const inputBefore = { ...input };

      resolveReservableCouponPricing(coupon, input, NOW);

      expect(coupon).toEqual(couponBefore);
      expect(input).toEqual(inputBefore);
    });
  });

  describe('resolveCurrentOrderCouponPricing', () => {
    it('uses the server snapshot for an already locked coupon without rechecking its validity window', () => {
      const coupon = createCoupon({
        status: 'locked',
        validUntilIso: '2026-07-14T07:59:59.000Z',
      });

      expect(
        resolveCurrentOrderCouponPricing(coupon, createReservableInput()),
      ).toEqual({
        couponId: coupon.id,
        couponTitle: coupon.title,
        couponDiscountCents: coupon.discountCents,
        payablePriceCents: 3800,
      });
    });

    it('rejects client pricing that differs from the current server coupon', () => {
      expectBusinessError(
        () =>
          resolveCurrentOrderCouponPricing(
            createCoupon({ status: 'locked' }),
            createReservableInput({ couponDiscountCents: 999 }),
          ),
        ApiErrorCode.PROFILE_COUPON_PRICE_MISMATCH,
      );
    });

    it('rejects keeping a coupon after the updated order drops below its threshold', () => {
      expectBusinessError(
        () =>
          resolveCurrentOrderCouponPricing(
            createCoupon({ status: 'locked' }),
            createReservableInput({ priceCents: 2999, payablePriceCents: 1799 }),
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });
  });

  describe('assertCurrentOrderCouponOwnership', () => {
    it.each([
      ['the same order number', 'order-no-1'],
      ['a historical null owner', null],
    ] as const)('keeps a locked coupon owned by %s', (_label, lockedOrderNo) => {
      expect(() =>
        assertCurrentOrderCouponOwnership(
          createCoupon({ status: 'locked', lockedOrderNo }),
          createCurrentOrder(),
          { kind: 'keep-locked' },
        ),
      ).not.toThrow();
    });

    it('rejects keeping a coupon locked by another order', () => {
      expectBusinessError(
        () =>
          assertCurrentOrderCouponOwnership(
            createCoupon({ status: 'locked', lockedOrderNo: 'order-no-2' }),
            createCurrentOrder(),
            { kind: 'keep-locked' },
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it.each([
      ['the same order number', createCoupon({ status: 'locked', lockedOrderNo: 'order-no-1' })],
      ['a historical null owner', createCoupon({ status: 'locked', lockedOrderNo: null })],
      ['an already usable target state', createCoupon({ status: 'usable' })],
    ] as const)('releases a coupon from %s', (_label, coupon) => {
      expect(() =>
        assertCurrentOrderCouponOwnership(
          coupon,
          createCurrentOrder(),
          { kind: 'release-to-usable' },
        ),
      ).not.toThrow();
    });

    it.each([
      ['a used coupon', createCoupon({ status: 'used', usedOrderNo: 'order-no-1' })],
      [
        'a coupon locked by another order',
        createCoupon({ status: 'locked', lockedOrderNo: 'order-no-2' }),
      ],
    ] as const)('rejects releasing %s', (_label, coupon) => {
      expectBusinessError(
        () =>
          assertCurrentOrderCouponOwnership(
            coupon,
            createCurrentOrder(),
            { kind: 'release-to-usable' },
          ),
        ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      );
    });

    it.each([
      [
        'a lock for the same order number',
        createCoupon({ status: 'locked', lockedOrderNo: 'order-no-1' }),
        { kind: 'redeem-to-used' },
      ],
      [
        'a historical null lock owner',
        createCoupon({ status: 'locked', lockedOrderNo: null }),
        { kind: 'redeem-to-used' },
      ],
      [
        'an already used target state for the same order',
        createCoupon({ status: 'used', usedOrderNo: 'order-no-1' }),
        { kind: 'redeem-to-used' },
      ],
      [
        'a usable coupon with unique current-order proof',
        createCoupon({ status: 'usable' }),
        {
          kind: 'redeem-to-used',
          uniqueNonCancelledOwnerOrderId: 'order-1',
        },
      ],
    ] as const)(
      'redeems %s',
      (_label, coupon, target: CurrentOrderCouponTarget) => {
        expect(() =>
          assertCurrentOrderCouponOwnership(
            coupon,
            createCurrentOrder(),
            target,
          ),
        ).not.toThrow();
      },
    );

    it.each([
      [
        'a lock for another order',
        createCoupon({ status: 'locked', lockedOrderNo: 'order-no-2' }),
        { kind: 'redeem-to-used' },
      ],
      [
        'a used state for another order',
        createCoupon({ status: 'used', usedOrderNo: 'order-no-2' }),
        { kind: 'redeem-to-used' },
      ],
      [
        'a usable state with another unique owner',
        createCoupon({ status: 'usable' }),
        {
          kind: 'redeem-to-used',
          uniqueNonCancelledOwnerOrderId: 'order-2',
        },
      ],
      [
        'a usable state without unique-owner proof',
        createCoupon({ status: 'usable' }),
        { kind: 'redeem-to-used' },
      ],
      [
        'an expired state',
        createCoupon({ status: 'expired' }),
        { kind: 'redeem-to-used' },
      ],
    ] as const)(
      'rejects redeeming %s',
      (_label, coupon, target: CurrentOrderCouponTarget) => {
        expectBusinessError(
          () =>
            assertCurrentOrderCouponOwnership(
              coupon,
              createCurrentOrder(),
              target,
            ),
          ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        );
      },
    );

    it.each([
      [
        createCoupon({
          shipperId: 'shipper-2',
          status: 'locked',
          lockedOrderNo: 'order-no-1',
        }),
        { kind: 'keep-locked' },
      ],
      [
        createCoupon({ shipperId: 'shipper-2', status: 'usable' }),
        { kind: 'release-to-usable' },
      ],
      [
        createCoupon({
          shipperId: 'shipper-2',
          status: 'used',
          usedOrderNo: 'order-no-1',
        }),
        { kind: 'redeem-to-used' },
      ],
    ] as const)(
      'rejects a cross-shipper coupon for target %#',
      (coupon, target: CurrentOrderCouponTarget) => {
        expectBusinessError(
          () =>
            assertCurrentOrderCouponOwnership(
              coupon,
              createCurrentOrder(),
              target,
            ),
          ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
        );
      },
    );

    it('only asserts ownership and does not mutate current state', () => {
      const coupon = createCoupon({
        status: 'locked',
        lockedOrderNo: 'order-no-1',
      });
      const currentOrder = createCurrentOrder();
      const couponBefore = { ...coupon };
      const orderBefore = { ...currentOrder };

      assertCurrentOrderCouponOwnership(coupon, currentOrder, {
        kind: 'release-to-usable',
      });

      expect(coupon).toEqual(couponBefore);
      expect(currentOrder).toEqual(orderBefore);
    });
  });
});

function createCoupon(overrides: Partial<CouponFixture> = {}): CouponFixture {
  return {
    id: 'coupon-1',
    shipperId: 'shipper-1',
    title: '满 30 元减 12 元',
    status: 'usable',
    conditionText: '订单满 30 元可用',
    discountCents: 1200,
    minOrderAmountCents: 3000,
    validFromIso: '2026-01-01T00:00:00.000Z',
    validUntilIso: '2027-01-01T00:00:00.000Z',
    sourceText: '新客活动',
    issuedAtIso: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createReservableInput(
  overrides: Partial<ReservableCouponInput> = {},
): ReservableCouponInput {
  return {
    shipperId: 'shipper-1',
    couponId: 'coupon-1',
    couponTitle: '满 30 元减 12 元',
    couponDiscountCents: 1200,
    priceCents: 5000,
    payablePriceCents: 3800,
    ...overrides,
  };
}

function createCurrentOrder(
  overrides: Partial<CurrentOrder> = {},
): CurrentOrder {
  return {
    id: 'order-1',
    orderNo: 'order-no-1',
    shipperId: 'shipper-1',
    ...overrides,
  };
}

function expectBusinessError(
  action: () => unknown,
  expectedCode: BusinessError['code'],
) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe(expectedCode);
    return;
  }

  throw new Error(`Expected BusinessError ${expectedCode}`);
}

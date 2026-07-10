import type { CouponItem } from '../src/utils/profileLocalState';
import {
  createLocalCouponsFromPlatformWallet,
  createOrderCouponUsageChanges,
  createUsedCouponChanges,
  filterCoupons,
} from '../src/utils/profileCoupons';

function createCoupon(overrides: Partial<CouponItem>): CouponItem {
  return {
    id: 'coupon-a',
    title: '满 300 减 30',
    statusText: '可使用',
    conditionText: '发单满 300 元可用',
    validUntilText: '有效期至 2026-07-31',
    sourceText: '活动发放',
    ...overrides,
  };
}

test('filters profile coupons by usable, used and expired status', () => {
  const coupons = [
    createCoupon({ id: 'usable', statusText: '可使用' }),
    createCoupon({ id: 'used', statusText: '已使用' }),
    createCoupon({ id: 'expired', statusText: '已过期' }),
  ];

  expect(filterCoupons(coupons, 'all').map(item => item.id)).toEqual([
    'usable',
    'used',
    'expired',
  ]);
  expect(filterCoupons(coupons, 'usable').map(item => item.id)).toEqual([
    'usable',
  ]);
  expect(filterCoupons(coupons, 'used').map(item => item.id)).toEqual(['used']);
  expect(filterCoupons(coupons, 'expired').map(item => item.id)).toEqual([
    'expired',
  ]);
});

test('marks only a usable coupon as used and returns local notice text', () => {
  const coupons = [
    createCoupon({ id: 'usable', title: '满 300 减 30' }),
    createCoupon({ id: 'used', statusText: '已使用' }),
  ];

  expect(createUsedCouponChanges(coupons, 'usable')).toEqual({
    coupons: [
      createCoupon({
        id: 'usable',
        title: '满 300 减 30',
        statusText: '已使用',
      }),
      createCoupon({ id: 'used', statusText: '已使用' }),
    ],
    noticeText: '优惠券已使用：满 300 减 30',
  });
});

test('does not change missing, used or expired coupons', () => {
  const coupons = [
    createCoupon({ id: 'used', statusText: '已使用' }),
    createCoupon({ id: 'expired', statusText: '已过期' }),
  ];

  expect(createUsedCouponChanges(coupons, 'missing')).toBeUndefined();
  expect(createUsedCouponChanges(coupons, 'used')).toBeUndefined();
  expect(createUsedCouponChanges(coupons, 'expired')).toBeUndefined();
});

test('creates order coupon usage changes for selecting and removing coupons', () => {
  const coupons = [
    createCoupon({ id: 'coupon-a', statusText: '可使用' }),
    createCoupon({ id: 'coupon-b', statusText: '已使用' }),
  ];

  expect(
    createOrderCouponUsageChanges(coupons, {
      orderId: 'HYLOCAL001',
      couponId: 'coupon-a',
    }),
  ).toEqual({
    coupons: [
      createCoupon({
        id: 'coupon-a',
        statusText: '已使用',
        validUntilText: '已用于订单 HYLOCAL001',
        sourceText: '本地发单使用',
      }),
      createCoupon({ id: 'coupon-b', statusText: '已使用' }),
    ],
  });

  expect(
    createOrderCouponUsageChanges(coupons, {
      orderId: 'HYLOCAL001',
      previousCouponId: 'coupon-b',
    }),
  ).toEqual({
    coupons: [
      createCoupon({ id: 'coupon-a', statusText: '可使用' }),
      createCoupon({
        id: 'coupon-b',
        statusText: '可使用',
        validUntilText: '已从订单 HYLOCAL001 取消使用',
        sourceText: '本地发单释放',
      }),
    ],
  });
});

test('maps platform coupon wallet into local coupon records', () => {
  expect(
    createLocalCouponsFromPlatformWallet({
      shipperId: 'shipper-1',
      summary: {
        usableCount: 1,
        lockedCount: 1,
        usedCount: 1,
        expiredCount: 1,
      },
      items: [
        {
          id: 'coupon-platform-usable',
          shipperId: 'shipper-1',
          title: '满 300 减 30',
          status: 'usable',
          conditionText: '发单满 300 元可用',
          discountCents: 3000,
          minOrderAmountCents: 30000,
          validFromIso: '2026-07-01T00:00:00.000Z',
          validUntilIso: '2026-07-31T15:59:59.000Z',
          sourceText: '平台活动发放',
          issuedAtIso: '2026-07-09T08:00:00.000Z',
        },
        {
          id: 'coupon-platform-locked',
          shipperId: 'shipper-1',
          title: '已锁定运输券',
          status: 'locked',
          conditionText: '订单满 800 元可用',
          discountCents: 8000,
          minOrderAmountCents: 80000,
          validFromIso: '2026-07-01T00:00:00.000Z',
          validUntilIso: '2026-07-31T15:59:59.000Z',
          sourceText: '平台锁定',
          issuedAtIso: '2026-07-09T08:00:00.000Z',
          lockedOrderNo: 'HY202607090008',
          lockedAtIso: '2026-07-09T09:00:00.000Z',
        },
        {
          id: 'coupon-platform-used',
          shipperId: 'shipper-1',
          title: '新客立减 20',
          status: 'used',
          conditionText: '首单发单可用',
          discountCents: 2000,
          minOrderAmountCents: 0,
          validFromIso: '2026-07-01T00:00:00.000Z',
          validUntilIso: '2026-07-31T15:59:59.000Z',
          sourceText: '新客礼包',
          issuedAtIso: '2026-07-09T08:00:00.000Z',
          usedOrderNo: 'HY202607090001',
        },
        {
          id: 'coupon-platform-expired',
          shipperId: 'shipper-1',
          title: '夜间运输券',
          status: 'expired',
          conditionText: '20:00-06:00 发单可用',
          discountCents: 1500,
          minOrderAmountCents: 10000,
          validFromIso: '2026-05-01T00:00:00.000Z',
          validUntilIso: '2026-05-31T15:59:59.000Z',
          sourceText: '夜间专享',
          issuedAtIso: '2026-07-09T08:00:00.000Z',
        },
      ],
    }),
  ).toEqual([
    createCoupon({
      id: 'coupon-platform-usable',
      title: '满 300 减 30',
      statusText: '可使用',
      conditionText: '发单满 300 元可用',
      validUntilText: '有效期至 2026-07-31',
      sourceText: '平台活动发放',
    }),
    createCoupon({
      id: 'coupon-platform-locked',
      title: '已锁定运输券',
      statusText: '已锁定',
      conditionText: '订单满 800 元可用',
      validUntilText: '已锁定订单 HY202607090008',
      sourceText: '平台锁定',
    }),
    createCoupon({
      id: 'coupon-platform-used',
      title: '新客立减 20',
      statusText: '已使用',
      conditionText: '首单发单可用',
      validUntilText: '已用于订单 HY202607090001',
      sourceText: '新客礼包',
    }),
    createCoupon({
      id: 'coupon-platform-expired',
      title: '夜间运输券',
      statusText: '已过期',
      conditionText: '20:00-06:00 发单可用',
      validUntilText: '有效期至 2026-05-31',
      sourceText: '夜间专享',
    }),
  ]);
});

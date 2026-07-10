import {
  InMemoryProfileCouponsRepository,
} from './profile-coupons.repository';
import { ProfileCouponsService } from './profile-coupons.service';

describe('ProfileCouponsService', () => {
  it('issues a usable coupon for a shipper from the admin first slice', async () => {
    const repository = new InMemoryProfileCouponsRepository();
    const service = new ProfileCouponsService(repository);

    const coupon = await service.issueCoupon('admin-1', {
      shipperId: 'shipper-1',
      title: '后台满 500 减 50',
      conditionText: '平台订单满 500 元可用',
      discountCents: 5000,
      minOrderAmountCents: 50000,
      validFromIso: '2026-07-09T00:00:00.000Z',
      validUntilIso: '2026-08-09T00:00:00.000Z',
    });

    expect(coupon).toMatchObject({
      id: expect.any(String),
      shipperId: 'shipper-1',
      title: '后台满 500 减 50',
      status: 'usable',
      sourceText: '后台手工发放',
      issuedAtIso: expect.any(String),
    });
    await expect(service.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 1,
        lockedCount: 0,
        usedCount: 0,
        expiredCount: 0,
      },
      items: [expect.objectContaining({ title: '后台满 500 减 50' })],
    });
  });

  it('returns the current shipper coupon wallet sorted by newest first', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [
        createCoupon({
          id: 'coupon-old',
          shipperId: 'shipper-1',
          title: '满 500 减 50',
          status: 'usable',
          issuedAtIso: '2026-07-08T08:00:00.000Z',
        }),
        createCoupon({
          id: 'coupon-other-shipper',
          shipperId: 'shipper-2',
          title: '别人的券',
          status: 'usable',
          issuedAtIso: '2026-07-09T10:00:00.000Z',
        }),
        createCoupon({
          id: 'coupon-new',
          shipperId: 'shipper-1',
          title: '满 300 减 30',
          status: 'used',
          issuedAtIso: '2026-07-09T09:00:00.000Z',
          usedOrderNo: 'HY202607090001',
          usedAtIso: '2026-07-09T09:20:00.000Z',
        }),
      ],
    });
    const service = new ProfileCouponsService(repository);

    await expect(service.listCoupons('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      summary: {
        usableCount: 1,
        lockedCount: 0,
        usedCount: 1,
        expiredCount: 0,
      },
      items: [
        expect.objectContaining({
          id: 'coupon-new',
          status: 'used',
          usedOrderNo: 'HY202607090001',
        }),
        expect.objectContaining({
          id: 'coupon-old',
          status: 'usable',
        }),
      ],
    });
  });

  it('returns an empty wallet for a shipper without platform coupons', async () => {
    const service = new ProfileCouponsService(
      new InMemoryProfileCouponsRepository(),
    );

    await expect(service.listCoupons('shipper-empty')).resolves.toEqual({
      shipperId: 'shipper-empty',
      summary: {
        usableCount: 0,
        lockedCount: 0,
        usedCount: 0,
        expiredCount: 0,
      },
      items: [],
    });
  });

  it('locks a usable coupon before order creation', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [createCoupon({ id: 'coupon-usable', shipperId: 'shipper-1' })],
    });
    const service = new ProfileCouponsService(repository);

    await service.lockCoupon('shipper-1', 'coupon-usable');

    await expect(service.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 0,
        lockedCount: 1,
        usedCount: 0,
        expiredCount: 0,
      },
      items: [
        expect.objectContaining({
          id: 'coupon-usable',
          status: 'locked',
          lockedAtIso: expect.any(String),
        }),
      ],
    });
  });

  it('binds a locked coupon to an order and clears lock metadata when released', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [createCoupon({ id: 'coupon-1', shipperId: 'shipper-1' })],
    });
    const service = new ProfileCouponsService(repository);

    await service.lockCoupon('shipper-1', 'coupon-1');
    await service.bindLockedCouponToOrder(
      'shipper-1',
      'coupon-1',
      'HY202607090001',
    );

    const lockedWallet = await service.listCoupons('shipper-1');
    expect(lockedWallet.items[0]).toMatchObject({
      id: 'coupon-1',
      status: 'locked',
      lockedOrderNo: 'HY202607090001',
      lockedAtIso: expect.any(String),
    });

    await service.releaseCoupon('shipper-1', 'coupon-1', 'HY202607090001');

    const releasedWallet = await service.listCoupons('shipper-1');
    expect(releasedWallet.items[0]).toMatchObject({
      id: 'coupon-1',
      status: 'usable',
    });
    expect(releasedWallet.items[0]).not.toHaveProperty('lockedOrderNo');
    expect(releasedWallet.items[0]).not.toHaveProperty('lockedAtIso');
  });

  it('rejects locking missing, used or expired coupons', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [
        createCoupon({
          id: 'coupon-used',
          shipperId: 'shipper-1',
          status: 'used',
        }),
        createCoupon({
          id: 'coupon-expired',
          shipperId: 'shipper-1',
          status: 'expired',
        }),
      ],
    });
    const service = new ProfileCouponsService(repository);

    await expect(
      service.lockCoupon('shipper-1', 'coupon-missing'),
    ).rejects.toMatchObject({
      code: 'PROFILE_COUPON_NOT_AVAILABLE',
      message: '优惠券不可用',
    });
    await expect(
      service.lockCoupon('shipper-1', 'coupon-used'),
    ).rejects.toMatchObject({
      code: 'PROFILE_COUPON_NOT_AVAILABLE',
      message: '优惠券不可用',
    });
    await expect(
      service.lockCoupon('shipper-1', 'coupon-expired'),
    ).rejects.toMatchObject({
      code: 'PROFILE_COUPON_NOT_AVAILABLE',
      message: '优惠券不可用',
    });
  });

  it('releases a locked coupon and redeems it for a completed order', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [createCoupon({ id: 'coupon-1', shipperId: 'shipper-1' })],
    });
    const service = new ProfileCouponsService(repository);

    await service.lockCoupon('shipper-1', 'coupon-1');
    await service.releaseCoupon('shipper-1', 'coupon-1');

    await expect(service.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 1,
        lockedCount: 0,
        usedCount: 0,
        expiredCount: 0,
      },
      items: [expect.objectContaining({ id: 'coupon-1', status: 'usable' })],
    });

    await service.lockCoupon('shipper-1', 'coupon-1');
    await service.bindLockedCouponToOrder(
      'shipper-1',
      'coupon-1',
      'HY202607090001',
    );
    await service.redeemCoupon('shipper-1', 'coupon-1', 'HY202607090001');

    await expect(service.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: {
        usableCount: 0,
        lockedCount: 0,
        usedCount: 1,
        expiredCount: 0,
      },
      items: [
        expect.objectContaining({
          id: 'coupon-1',
          status: 'used',
          usedOrderNo: 'HY202607090001',
          usedAtIso: expect.any(String),
        }),
      ],
    });
  });

  it('rejects redeeming a coupon locked by another order', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [createCoupon({ id: 'coupon-1', shipperId: 'shipper-1' })],
    });
    const service = new ProfileCouponsService(repository);

    await service.lockCoupon('shipper-1', 'coupon-1');
    await service.bindLockedCouponToOrder(
      'shipper-1',
      'coupon-1',
      'HY202607090001',
    );

    await expect(
      service.redeemCoupon('shipper-1', 'coupon-1', 'HY202607090002'),
    ).rejects.toMatchObject({
      code: 'PROFILE_COUPON_NOT_AVAILABLE',
      message: '优惠券不可用',
    });
  });
});

function createCoupon(
  overrides: Partial<{
    id: string;
    shipperId: string;
    title: string;
    status: 'usable' | 'locked' | 'used' | 'expired';
    conditionText: string;
    discountCents: number;
    minOrderAmountCents: number;
    validFromIso: string;
    validUntilIso: string;
    sourceText: string;
    issuedAtIso: string;
    lockedOrderNo: string;
    lockedAtIso: string;
    usedOrderNo: string;
    usedAtIso: string;
  }>,
) {
  return {
    id: 'coupon-1',
    shipperId: 'shipper-1',
    title: '满 300 减 30',
    status: 'usable' as const,
    conditionText: '发单满 300 元可用',
    discountCents: 3000,
    minOrderAmountCents: 30000,
    validFromIso: '2026-07-01T00:00:00.000Z',
    validUntilIso: '2026-07-31T15:59:59.000Z',
    sourceText: '平台活动发放',
    issuedAtIso: '2026-07-09T08:00:00.000Z',
    ...overrides,
  };
}

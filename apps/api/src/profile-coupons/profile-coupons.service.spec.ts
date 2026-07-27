import {
  InMemoryProfileCouponsRepository,
} from './profile-coupons.repository';
import { ProfileCouponsService } from './profile-coupons.service';
import { ApiErrorCode } from '../common/errors';

describe('ProfileCouponsService', () => {
  const singleIssueKey = '550e8400-e29b-41d4-a716-446655440000';
  const batchIssueKey = '550e8400-e29b-41d4-a716-446655440001';

  it('issues a usable coupon for a shipper from the admin first slice', async () => {
    const repository = new InMemoryProfileCouponsRepository();
    const service = new ProfileCouponsService(repository);

    const coupon = await service.issueCoupon('admin-1', singleIssueKey, {
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

  it('replays one committed coupon for concurrent and later identical requests', async () => {
    const now = new Date('2026-07-27T08:00:00.000Z');
    const repository = new InMemoryProfileCouponsRepository({ now: () => now });
    const service = new ProfileCouponsService(repository, () => now);
    const request = createIssueRequest();

    const [first, concurrentReplay] = await Promise.all([
      service.issueCoupon('admin-1', singleIssueKey, request),
      service.issueCoupon('admin-1', singleIssueKey, request),
    ]);
    const laterReplay = await service.issueCoupon(
      'admin-1',
      singleIssueKey,
      request,
    );

    expect(concurrentReplay).toEqual(first);
    expect(laterReplay).toEqual(first);
    await expect(service.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: { usableCount: 1 },
      items: [first],
    });
  });

  it('rejects a coupon issue key reused for a different normalized request', async () => {
    const repository = new InMemoryProfileCouponsRepository();
    const service = new ProfileCouponsService(repository);

    await service.issueCoupon('admin-1', singleIssueKey, createIssueRequest());

    await expect(
      service.issueCoupon('admin-1', singleIssueKey, createIssueRequest({
        title: '另一张补偿券',
      })),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED });
    await expect(service.listCoupons('shipper-1')).resolves.toMatchObject({
      summary: { usableCount: 1 },
    });
  });

  it('keeps expired coupon issue keys reserved', async () => {
    let now = new Date('2026-07-27T08:00:00.000Z');
    const repository = new InMemoryProfileCouponsRepository({ now: () => now });
    const service = new ProfileCouponsService(repository, () => now, 1);
    const request = createIssueRequest();

    await service.issueCoupon('admin-1', singleIssueKey, request);
    now = new Date('2026-07-27T08:00:01.000Z');

    await expect(
      service.issueCoupon('admin-1', singleIssueKey, request),
    ).rejects.toMatchObject({ code: ApiErrorCode.IDEMPOTENCY_KEY_EXPIRED });
  });

  it('issues the same coupon template to multiple shippers in one batch', async () => {
    const repository = new InMemoryProfileCouponsRepository();
    const service = new ProfileCouponsService(repository);

    const result = await service.batchIssueCoupons('admin-1', batchIssueKey, {
      shipperIds: ['shipper-1', 'shipper-2', 'shipper-3'],
      title: '后台批量满 300 减 30',
      conditionText: '平台订单满 300 元可用',
      discountCents: 3000,
      minOrderAmountCents: 30000,
      validFromIso: '2026-07-20T00:00:00.000Z',
      validUntilIso: '2026-08-20T00:00:00.000Z',
      sourceText: '运营批量补贴',
    });

    expect(result).toEqual({
      requestedCount: 3,
      issuedCount: 3,
      coupons: [
        expect.objectContaining({
          shipperId: 'shipper-1',
          title: '后台批量满 300 减 30',
          status: 'usable',
          sourceText: '运营批量补贴',
        }),
        expect.objectContaining({
          shipperId: 'shipper-2',
          title: '后台批量满 300 减 30',
          status: 'usable',
          sourceText: '运营批量补贴',
        }),
        expect.objectContaining({
          shipperId: 'shipper-3',
          title: '后台批量满 300 减 30',
          status: 'usable',
          sourceText: '运营批量补贴',
        }),
      ],
    });
    await expect(service.listCoupons('shipper-2')).resolves.toMatchObject({
      summary: {
        usableCount: 1,
        lockedCount: 0,
        usedCount: 0,
        expiredCount: 0,
      },
      items: [
        expect.objectContaining({
          title: '后台批量满 300 减 30',
          sourceText: '运营批量补贴',
        }),
      ],
    });
  });

  it('replays a batch for the same recipient set regardless of input order', async () => {
    const repository = new InMemoryProfileCouponsRepository();
    const service = new ProfileCouponsService(repository);
    const request = {
      shipperIds: ['shipper-2', 'shipper-1', 'shipper-2'],
      title: '批量补偿券',
      conditionText: '平台订单满 100 元可用',
      discountCents: 1000,
      minOrderAmountCents: 10000,
      validFromIso: '2026-07-27T00:00:00.000Z',
      validUntilIso: '2026-08-27T00:00:00.000Z',
    };

    const first = await service.batchIssueCoupons(
      'admin-1',
      batchIssueKey,
      request,
    );
    const replay = await service.batchIssueCoupons(
      'admin-1',
      batchIssueKey,
      { ...request, shipperIds: ['shipper-1', 'shipper-2'] },
    );

    expect(replay).toEqual(first);
    expect(first.coupons.map(coupon => coupon.shipperId)).toEqual([
      'shipper-1',
      'shipper-2',
    ]);
    await expect(repository.listAllCoupons()).resolves.toHaveLength(2);
  });

  it('builds an admin coupon report with source breakdown and top shippers', async () => {
    const repository = new InMemoryProfileCouponsRepository({
      coupons: [
        createCoupon({
          id: 'coupon-used-1',
          shipperId: 'shipper-1',
          status: 'used',
          discountCents: 3000,
          sourceText: '活动发放',
          issuedAtIso: '2026-07-20T09:00:00.000Z',
          usedOrderNo: 'HY202607200001',
          usedAtIso: '2026-07-20T09:10:00.000Z',
        }),
        createCoupon({
          id: 'coupon-usable-1',
          shipperId: 'shipper-1',
          status: 'usable',
          discountCents: 5000,
          sourceText: '后台手工发放',
          issuedAtIso: '2026-07-20T10:00:00.000Z',
        }),
        createCoupon({
          id: 'coupon-expired-1',
          shipperId: 'shipper-1',
          status: 'expired',
          discountCents: 1000,
          sourceText: '后台手工发放',
          issuedAtIso: '2026-07-20T11:00:00.000Z',
        }),
        createCoupon({
          id: 'coupon-locked-1',
          shipperId: 'shipper-2',
          status: 'locked',
          discountCents: 2000,
          sourceText: '运营补贴',
          issuedAtIso: '2026-07-20T08:00:00.000Z',
          lockedOrderNo: 'HY202607200010',
          lockedAtIso: '2026-07-20T08:30:00.000Z',
        }),
        createCoupon({
          id: 'coupon-used-2',
          shipperId: 'shipper-2',
          status: 'used',
          discountCents: 4000,
          sourceText: '运营补贴',
          issuedAtIso: '2026-07-20T12:00:00.000Z',
          usedOrderNo: 'HY202607200011',
          usedAtIso: '2026-07-20T12:30:00.000Z',
        }),
        createCoupon({
          id: 'coupon-usable-2',
          shipperId: 'shipper-3',
          status: 'usable',
          discountCents: 6000,
          sourceText: '邀新补贴',
          issuedAtIso: '2026-07-20T13:00:00.000Z',
        }),
      ],
    });
    const service = new ProfileCouponsService(repository);

    await expect(
      service.getAdminCouponReport({
        topShippersLimit: 2,
      }),
    ).resolves.toEqual({
      generatedAtIso: expect.any(String),
      summary: {
        totalCount: 6,
        usableCount: 2,
        lockedCount: 1,
        usedCount: 2,
        expiredCount: 1,
        totalDiscountCents: 21000,
        redeemedDiscountCents: 7000,
      },
      sourceBreakdown: [
        {
          sourceText: '运营补贴',
          totalCount: 2,
          usedCount: 1,
          redeemedDiscountCents: 4000,
        },
        {
          sourceText: '后台手工发放',
          totalCount: 2,
          usedCount: 0,
          redeemedDiscountCents: 0,
        },
        {
          sourceText: '活动发放',
          totalCount: 1,
          usedCount: 1,
          redeemedDiscountCents: 3000,
        },
        {
          sourceText: '邀新补贴',
          totalCount: 1,
          usedCount: 0,
          redeemedDiscountCents: 0,
        },
      ],
      topShippers: [
        {
          shipperId: 'shipper-1',
          totalCount: 3,
          usableCount: 1,
          lockedCount: 0,
          usedCount: 1,
          expiredCount: 1,
          totalDiscountCents: 9000,
          redeemedDiscountCents: 3000,
          latestIssuedAtIso: '2026-07-20T11:00:00.000Z',
        },
        {
          shipperId: 'shipper-2',
          totalCount: 2,
          usableCount: 0,
          lockedCount: 1,
          usedCount: 1,
          expiredCount: 0,
          totalDiscountCents: 6000,
          redeemedDiscountCents: 4000,
          latestIssuedAtIso: '2026-07-20T12:00:00.000Z',
        },
      ],
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

function createIssueRequest(
  overrides: Partial<{
    shipperId: string;
    title: string;
    conditionText: string;
    discountCents: number;
    minOrderAmountCents: number;
    validFromIso: string;
    validUntilIso: string;
    sourceText: string;
  }> = {},
) {
  return {
    shipperId: 'shipper-1',
    title: '后台满 500 减 50',
    conditionText: '平台订单满 500 元可用',
    discountCents: 5000,
    minOrderAmountCents: 50000,
    validFromIso: '2026-07-27T00:00:00.000Z',
    validUntilIso: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

import {
  parseAdminShipperCouponReportQuery,
  parseBatchIssueShipperCouponsRequest,
  parseIssueShipperCouponRequest,
} from './profile-coupons.validation';

describe('profile coupons validation', () => {
  it('parses an admin coupon issue request', () => {
    expect(
      parseIssueShipperCouponRequest({
        shipperId: ' shipper-1 ',
        title: ' 后台满 500 减 50 ',
        conditionText: ' 平台订单满 500 元可用 ',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: ' 2026-07-09T00:00:00.000Z ',
        validUntilIso: ' 2026-08-09T00:00:00.000Z ',
        sourceText: ' 运营补偿 ',
      }),
    ).toEqual({
      shipperId: 'shipper-1',
      title: '后台满 500 减 50',
      conditionText: '平台订单满 500 元可用',
      discountCents: 5000,
      minOrderAmountCents: 50000,
      validFromIso: '2026-07-09T00:00:00.000Z',
      validUntilIso: '2026-08-09T00:00:00.000Z',
      sourceText: '运营补偿',
    });
  });

  it('rejects coupon issue requests whose validity window is reversed', () => {
    expect(() =>
      parseIssueShipperCouponRequest({
        shipperId: 'shipper-1',
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-08-09T00:00:00.000Z',
        validUntilIso: '2026-07-09T00:00:00.000Z',
      }),
    ).toThrow('优惠券失效时间必须晚于生效时间');
  });

  it('parses a batch coupon issue request and deduplicates shipper ids', () => {
    expect(
      parseBatchIssueShipperCouponsRequest({
        shipperIds: [' shipper-1 ', 'shipper-2', 'shipper-1', ' shipper-3 '],
        title: ' 批量满 300 减 30 ',
        conditionText: ' 平台订单满 300 元可用 ',
        discountCents: 3000,
        minOrderAmountCents: 30000,
        validFromIso: ' 2026-07-20T00:00:00.000Z ',
        validUntilIso: ' 2026-08-20T00:00:00.000Z ',
        sourceText: ' 运营批量补贴 ',
      }),
    ).toEqual({
      shipperIds: ['shipper-1', 'shipper-2', 'shipper-3'],
      title: '批量满 300 减 30',
      conditionText: '平台订单满 300 元可用',
      discountCents: 3000,
      minOrderAmountCents: 30000,
      validFromIso: '2026-07-20T00:00:00.000Z',
      validUntilIso: '2026-08-20T00:00:00.000Z',
      sourceText: '运营批量补贴',
    });
  });

  it('rejects batch coupon issue requests without shipper ids', () => {
    expect(() =>
      parseBatchIssueShipperCouponsRequest({
        shipperIds: [],
        title: '批量满 300 减 30',
        conditionText: '平台订单满 300 元可用',
        discountCents: 3000,
        minOrderAmountCents: 30000,
        validFromIso: '2026-07-20T00:00:00.000Z',
        validUntilIso: '2026-08-20T00:00:00.000Z',
      }),
    ).toThrow('至少要指定一个货主');
  });

  it('parses an admin coupon report query and defaults top shipper limit', () => {
    expect(
      parseAdminShipperCouponReportQuery({
        topShippersLimit: '8',
      }),
    ).toEqual({
      topShippersLimit: 8,
    });

    expect(parseAdminShipperCouponReportQuery({})).toEqual({
      topShippersLimit: 5,
    });
  });

  it('rejects invalid admin coupon report queries', () => {
    for (const query of [
      { topShippersLimit: 0 },
      { topShippersLimit: 21 },
      { topShippersLimit: '1.2' },
      { topShippersLimit: 'nope' },
    ]) {
      expect(() => parseAdminShipperCouponReportQuery(query)).toThrow();
    }
  });
});

import { parseIssueShipperCouponRequest } from './profile-coupons.validation';

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
});

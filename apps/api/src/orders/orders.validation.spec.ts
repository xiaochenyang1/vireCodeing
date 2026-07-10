import {
  parseAdvanceShipperOrderStatusRequest,
  parseCreateShipperOrderRequest,
  parseReportShipperOrderExceptionRequest,
  parseSubmitShipperOrderChangeRequest,
  parseSubmitShipperOrderEvaluationRequest,
  parseListShipperOrdersQuery,
  parseAdminOrderAttachmentAuditListQuery,
} from './orders.validation';

describe('orders validation', () => {
  it('normalizes a fixed price shipper order request', () => {
    expect(
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: ' 2.5 吨 ',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        vehicleLengthText: '4.2 米',
        cargoPhotoFileIds: [' file-cargo-1 ', 'file-cargo-1'],
        needTailboard: true,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
      }),
    ).toMatchObject({
      weightText: '2.5 吨',
      pricingMode: 'fixed',
      priceCents: 76000,
      pickupPhone: '13900139001',
      cargoPhotoFileIds: ['file-cargo-1'],
      cargoPhotoCount: 1,
    });
  });

  it('rejects a fixed price order without price cents', () => {
    expect(() =>
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        paymentMethod: 'cod',
      }),
    ).toThrow('一口价订单必须传入价格');
  });

  it('rejects a couponed fixed price order with inconsistent payable amount', () => {
    expect(() =>
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        couponId: 'coupon-300-30',
        couponTitle: '满 300 减 30',
        couponDiscountCents: 3000,
        payablePriceCents: 74000,
      }),
    ).toThrow('实付金额必须等于原价减优惠金额');
  });

  it('rejects a fixed price order with incomplete coupon pricing fields', () => {
    expect(() =>
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        couponId: 'coupon-300-30',
        couponTitle: '满 300 减 30',
      }),
    ).toThrow('优惠券金额字段必须同时传入');
  });

  it('rejects a negotiable order with fixed price coupon amounts', () => {
    expect(() =>
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区科技园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'negotiable',
        priceCents: 76000,
        paymentMethod: 'cod',
        couponId: 'coupon-300-30',
        couponTitle: '满 300 减 30',
        couponDiscountCents: 3000,
        payablePriceCents: 73000,
      }),
    ).toThrow('司机报价订单不能传入一口价或优惠金额');
  });

  it('parses list query defaults', () => {
    expect(parseListShipperOrdersQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      status: undefined,
    });
  });

  it('parses list search and created time range query', () => {
    expect(
      parseListShipperOrdersQuery({
        keyword: ' 南山 ',
        createdFromIso: '2026-07-01T00:00:00.000Z',
        createdToIso: '2026-07-03T00:00:00.000Z',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      status: undefined,
      keyword: '南山',
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-03T00:00:00.000Z',
    });
  });

  it('rejects a reversed or empty created time range query', () => {
    expect(() =>
      parseListShipperOrdersQuery({
        createdFromIso: '2026-07-03T00:00:00.000Z',
        createdToIso: '2026-07-03T00:00:00.000Z',
      }),
    ).toThrow('开始时间必须早于结束时间');

    expect(() =>
      parseListShipperOrdersQuery({
        createdFromIso: '2026-07-04T00:00:00.000Z',
        createdToIso: '2026-07-03T00:00:00.000Z',
      }),
    ).toThrow('开始时间必须早于结束时间');
  });

  it('parses list status collection query', () => {
    expect(
      parseListShipperOrdersQuery({
        statuses: 'loading,transporting',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      status: undefined,
      statuses: ['loading', 'transporting'],
      keyword: undefined,
      createdFromIso: undefined,
      createdToIso: undefined,
    });
  });

  it('parses admin order attachment audit status and shipper query', () => {
    expect(
      parseAdminOrderAttachmentAuditListQuery({
        status: ' loading ',
        shipperId: ' shipper-2 ',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      status: 'loading',
      shipperId: 'shipper-2',
      keyword: undefined,
      createdFromIso: undefined,
      createdToIso: undefined,
      hasMissingFiles: undefined,
    });
  });

  it('normalizes list status collection query with spaces duplicates and empty parts', () => {
    expect(
      parseListShipperOrdersQuery({
        statuses: ' loading, transporting,loading, ',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      status: undefined,
      statuses: ['loading', 'transporting'],
      keyword: undefined,
      createdFromIso: undefined,
      createdToIso: undefined,
    });
  });

  it('rejects mixed single and collection status list query', () => {
    expect(() =>
      parseListShipperOrdersQuery({
        status: 'waiting',
        statuses: 'loading,transporting',
      }),
    ).toThrow('状态筛选只能传入 status 或 statuses 之一');
  });

  it('parses an order status advance request', () => {
    expect(
      parseAdvanceShipperOrderStatusRequest({
        nextStatus: 'loading',
      }),
    ).toEqual({
      nextStatus: 'loading',
    });
  });

  it('rejects completing an order through the status advance request', () => {
    expect(() =>
      parseAdvanceShipperOrderStatusRequest({
        nextStatus: 'completed',
      }),
    ).toThrow();
  });

  it('parses an order exception report request', () => {
    expect(
      parseReportShipperOrderExceptionRequest({
        typeLabel: ' 司机延误 ',
        description: ' 司机反馈高速拥堵，预计晚到 40 分钟 ',
        photoCount: 2,
        photoFileIds: [' file-exception-1 ', 'file-exception-1'],
      }),
    ).toEqual({
      typeLabel: '司机延误',
      description: '司机反馈高速拥堵，预计晚到 40 分钟',
      photoCount: 2,
      photoFileIds: ['file-exception-1'],
    });
  });

  it('rejects a short order exception report description', () => {
    expect(() =>
      parseReportShipperOrderExceptionRequest({
        typeLabel: '司机延误',
        description: '太短',
      }),
    ).toThrow('请至少填写 6 个字的异常说明');
  });

  it('parses a shipper order evaluation request', () => {
    expect(
      parseSubmitShipperOrderEvaluationRequest({
        rating: 5,
        tags: [' 准时送达 ', '服务好'],
        content: ' 司机服务细致，整体运输体验很好 ',
        anonymous: true,
        photoCount: 1,
        photoFileIds: [' file-evaluation-1 '],
      }),
    ).toEqual({
      rating: 5,
      tags: ['准时送达', '服务好'],
      content: '司机服务细致，整体运输体验很好',
      anonymous: true,
      photoCount: 1,
      photoFileIds: ['file-evaluation-1'],
    });
  });

  it('rejects an order evaluation without tags', () => {
    expect(() =>
      parseSubmitShipperOrderEvaluationRequest({
        rating: 5,
        tags: [],
        content: '司机服务细致，整体运输体验很好',
      }),
    ).toThrow('请选择至少一个评价标签');
  });

  it('parses a shipper order change request', () => {
    expect(
      parseSubmitShipperOrderChangeRequest({
        description: ' 请把卸货地址改到南山门店二期，装货时间顺延 1 小时 ',
      }),
    ).toEqual({
      description: '请把卸货地址改到南山门店二期，装货时间顺延 1 小时',
    });
  });

  it('rejects an empty shipper order change request', () => {
    expect(() =>
      parseSubmitShipperOrderChangeRequest({
        description: ' ',
      }),
    ).toThrow('修改说明不能为空');
  });
});

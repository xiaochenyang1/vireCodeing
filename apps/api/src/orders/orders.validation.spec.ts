import {
  parseBatchCancelAdminOrdersRequest,
  parseAdminOrderFilters,
  parseAdminOrderReportQuery,
  parseAdvanceShipperOrderStatusRequest,
  parseCancelShipperOrderRequest,
  parseCompleteShipperOrderRequest,
  parseCreateShipperOrderRequest,
  parseReportShipperOrderExceptionRequest,
  parseSubmitShipperOrderChangeRequest,
  parseSubmitShipperOrderEvaluationRequest,
  parseListShipperOrdersQuery,
  parseAdminOrderAttachmentAuditListQuery,
  parseUpdateShipperOrderRequest,
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

  it('rejects online payment before a negotiable order has an agreed amount', () => {
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
        pickupTimeIso: '2026-07-16T02:00:00.000Z',
        pricingMode: 'negotiable',
        paymentMethod: 'online',
      }),
    ).toThrow('在线支付订单必须先确定最终金额');
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

  it('parses admin order export filters without pagination', () => {
    expect(
      parseAdminOrderFilters({
        keyword: ' 南山门店 ',
        statuses: 'loading,transporting',
        createdFromIso: '2026-07-01T00:00:00.000Z',
        createdToIso: '2026-07-31T00:00:00.000Z',
      }),
    ).toEqual({
      keyword: '南山门店',
      status: undefined,
      statuses: ['loading', 'transporting'],
      createdFromIso: '2026-07-01T00:00:00.000Z',
      createdToIso: '2026-07-31T00:00:00.000Z',
    });
  });

  it('parses admin order report query defaults', () => {
    expect(parseAdminOrderReportQuery({})).toEqual({
      status: undefined,
      statuses: undefined,
      keyword: undefined,
      createdFromIso: undefined,
      createdToIso: undefined,
      topShippersLimit: 5,
    });
  });

  it('rejects mixed single and collection status filters for admin order report query', () => {
    expect(() =>
      parseAdminOrderReportQuery({
        status: 'waiting',
        statuses: 'loading,transporting',
      }),
    ).toThrow('状态筛选只能传入 status 或 statuses 之一');
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
        nextStatus: 'transporting',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      }),
    ).toEqual({
      nextStatus: 'transporting',
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
    });
  });

  it('rejects completing an order through the status advance request', () => {
    expect(() =>
      parseAdvanceShipperOrderStatusRequest({
        nextStatus: 'completed',
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      }),
    ).toThrow();
  });

  it('requires a concurrency baseline for shipper mutation requests', () => {
    expect(() =>
      parseCancelShipperOrderRequest({
        reasonText: '计划有变',
      }),
    ).toThrow();

    expect(() =>
      parseUpdateShipperOrderRequest({
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
      }),
    ).toThrow();

    expect(
      parseCompleteShipperOrderRequest({
        baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
      }),
    ).toEqual({
      baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
    });

    expect(() =>
      parseCompleteShipperOrderRequest({
        baseUpdatedAtIso: '2026-07-12 08:00:00',
      }),
    ).toThrow('订单版本时间无效');
  });

  it('parses admin batch cancel requests', () => {
    expect(
      parseBatchCancelAdminOrdersRequest({
        items: [
          {
            orderId: ' order-1 ',
            baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
          },
          {
            orderId: 'order-2',
            baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
          },
        ],
        reasonText: ' 后台取消 ',
        description: '  运营按筛选结果批量清理 waiting 单  ',
      }),
    ).toEqual({
      items: [
        {
          orderId: 'order-1',
          baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
        },
        {
          orderId: 'order-2',
          baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
        },
      ],
      reasonText: '后台取消',
      description: '运营按筛选结果批量清理 waiting 单',
    });
  });

  it('rejects invalid admin batch cancel requests', () => {
    expect(() =>
      parseBatchCancelAdminOrdersRequest({
        items: [],
        reasonText: '后台取消',
      }),
    ).toThrow('至少选择 1 笔订单');

    expect(() =>
      parseBatchCancelAdminOrdersRequest({
        items: [
          {
            orderId: 'order-1',
            baseUpdatedAtIso: '2026-07-12T08:00:00.000Z',
          },
          {
            orderId: ' order-1 ',
            baseUpdatedAtIso: '2026-07-12T08:05:00.000Z',
          },
        ],
        reasonText: '后台取消',
      }),
    ).toThrow('批量取消订单 ID 不能重复');
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

  it('parses a list status collection passed as an array', () => {
    expect(
      parseListShipperOrdersQuery({
        statuses: ['loading', 'transporting', 'loading'],
      }),
    ).toMatchObject({
      statuses: ['loading', 'transporting'],
    });
  });

  it('rejects a create order whose pickup and delivery address are identical', () => {
    expect(() =>
      parseCreateShipperOrderRequest({
        cargoType: 'build',
        weightText: '2.5 吨',
        quantityText: '12 箱',
        pickupAddress: '宝安区福永物流园',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '宝安区福永物流园',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
      }),
    ).toThrow('装货地址和卸货地址不能相同');
  });

  it('rejects an admin attachment audit query with a reversed time range', () => {
    expect(() =>
      parseAdminOrderAttachmentAuditListQuery({
        createdFromIso: '2026-07-08T00:00:00.000Z',
        createdToIso: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow('开始时间必须早于结束时间');
  });

  it('rejects an admin attachment audit query with a non-boolean hasMissingFiles', () => {
    expect(() =>
      parseAdminOrderAttachmentAuditListQuery({
        hasMissingFiles: 'maybe',
      }),
    ).toThrow();
  });
});

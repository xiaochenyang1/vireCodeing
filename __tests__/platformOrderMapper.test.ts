import { mapPlatformOrderToRecentOrder } from '../src/services/platformOrderMapper';
import type { PlatformShipperOrder } from '../src/services/platformOrderApi';

type PlatformOrderEvent = NonNullable<PlatformShipperOrder['events']>[number];

function baseOrder(
  overrides: Partial<PlatformShipperOrder> = {},
): PlatformShipperOrder {
  return {
    id: 'order-1',
    orderNo: 'HY202607010001',
    shipperId: 'shipper-1',
    status: 'waiting',
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
    createdAtIso: '2026-07-01T08:00:00.000Z',
    updatedAtIso: '2026-07-01T08:00:00.000Z',
    ...overrides,
  } as PlatformShipperOrder;
}

function event(overrides: Partial<PlatformOrderEvent>): PlatformOrderEvent {
  return {
    id: 'e1',
    eventType: 'driver_quote_submitted',
    createdAtIso: '2026-07-01T09:00:00.000Z',
    ...overrides,
  } as PlatformOrderEvent;
}

describe('platform order mapper', () => {
  it('maps a platform order to current RecentOrder model', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-1',
        orderNo: 'HY202607010001',
        shipperId: 'shipper-1',
        status: 'waiting',
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
        needTailboard: true,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'HY202607010001',
      platformOrderId: 'order-1',
      status: 'waiting',
      from: '宝安区福永物流园',
      to: '南山区科技园',
      cargoType: '建材',
      vehicleRequirement: '中型货车',
      priceText: '￥760',
      pickupTimeIso: '2026-07-02T02:00:00.000Z',
      pickupTimeText: '2026-07-02 10:00',
      syncState: {
        status: 'synced',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      },
    });
  });

  it('maps server payment facts without deriving them from the order status', () => {
    const platformOrder = {
      ...baseOrder({ paymentMethod: 'online', status: 'completed' }),
      paymentStatus: 'refunded' as const,
      assignedDriverId: 'driver-1',
      paymentSettledAtIso: '2026-07-03T08:00:00.000Z',
      refundedAtIso: '2026-07-04T08:00:00.000Z',
    };

    expect(mapPlatformOrderToRecentOrder(platformOrder)).toMatchObject({
      paymentMethod: 'online',
      paymentStatus: 'refunded',
      assignedDriverId: 'driver-1',
      paymentSettledAtIso: '2026-07-03T08:00:00.000Z',
      refundedAtIso: '2026-07-04T08:00:00.000Z',
    });
  });

  it('maps latest exception case snapshots with compensation decisions', () => {
    const platformOrder = {
      ...baseOrder({ status: 'transporting' }),
      latestExceptionCase: {
        id: 'case-1',
        caseNo: 'YC202607180003',
        sourceEventId: 'event-1',
        sourceRole: 'driver' as const,
        status: 'resolved' as const,
        resolutionText: '客服判定货主线下赔付司机。',
        resolvedAtIso: '2026-07-18T08:20:00.000Z',
        compensationStatus: 'offline_completed' as const,
        compensationTargetRole: 'driver' as const,
        compensationAmountCents: 8800,
        compensationUpdatedAtIso: '2026-07-18T08:25:00.000Z',
        createdAtIso: '2026-07-18T08:00:00.000Z',
        updatedAtIso: '2026-07-18T08:25:00.000Z',
      },
    };

    expect(mapPlatformOrderToRecentOrder(platformOrder)).toMatchObject({
      latestExceptionCase: {
        caseNo: 'YC202607180003',
        status: 'resolved',
        resolutionText: '客服判定货主线下赔付司机。',
        compensationStatus: 'offline_completed',
        compensationTargetRole: 'driver',
        compensationAmountCents: 8800,
        compensationUpdatedAtIso: '2026-07-18T08:25:00.000Z',
      },
    });
  });

  it('maps platform coupon pricing to payable and original price display fields', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-coupon-1',
        orderNo: 'HY202607010002',
        shipperId: 'shipper-1',
        status: 'waiting',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'van',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'online',
        couponId: 'coupon-platform-30',
        couponTitle: '满 300 减 30',
        couponDiscountCents: 3000,
        payablePriceCents: 73000,
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      }),
    ).toMatchObject({
      priceText: '￥730',
      originalPriceText: '￥760',
      couponId: 'coupon-platform-30',
      couponTitleText: '满 300 减 30',
      couponDiscountText: '-￥30',
      payablePriceText: '￥730',
      paymentMethodText: '在线支付',
    });
  });

  it('maps platform cargo photo file ids to local cargo attachment refs', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-cargo-file',
        orderNo: 'HY202607010007',
        shipperId: 'shipper-1',
        status: 'waiting',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        cargoPhotoCount: 2,
        cargoPhotoFileIds: ['file-cargo-1', 'file-cargo-2'],
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      }),
    ).toMatchObject({
      cargoPhotoCount: 2,
      cargoPhotoFiles: [
        {
          fileId: 'file-cargo-1',
          fileName: '平台货物图片 1',
          purpose: 'cargo',
          status: 'uploaded',
        },
        {
          fileId: 'file-cargo-2',
          fileName: '平台货物图片 2',
          purpose: 'cargo',
          status: 'uploaded',
        },
      ],
    });
  });

  it('ignores stale coupon pricing fields on negotiable platform orders', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-negotiable-stale-coupon',
        orderNo: 'HY202607010003',
        shipperId: 'shipper-1',
        status: 'waiting',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'negotiable',
        paymentMethod: 'cod',
        couponId: 'coupon-platform-30',
        couponTitle: '满 300 减 30',
        couponDiscountCents: 3000,
        payablePriceCents: 73000,
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
      }),
    ).toMatchObject({
      priceText: '司机报价',
      originalPriceText: undefined,
      couponId: undefined,
      couponTitleText: undefined,
      couponDiscountText: undefined,
      payablePriceText: undefined,
    });
  });

  it('maps platform driver quote events to local driver quote cards', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-driver-quote',
        orderNo: 'HY202607010004',
        shipperId: 'shipper-1',
        status: 'waiting',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'negotiable',
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:00:00.000Z',
        events: [
          {
            id: 'event-driver-quote',
            actorUserId: 'driver-1',
            eventType: 'driver_quote_submitted',
            noteText: JSON.stringify({
              quoteCents: 88000,
              arrivalText: '45 分钟到达',
              noteText: '可带尾板',
              driverSnapshot: {
                driverName: '李师傅',
                driverPhone: '13900139009',
                vehicleType: 'box',
                vehicleLengthText: '4.2 米',
                plateNumber: '粤B12345',
                completedOrderCount: 12,
              },
            }),
            createdAtIso: '2026-07-01T08:05:00.000Z',
          },
        ],
      }),
    ).toMatchObject({
      driverQuotes: [
        {
          driverId: 'driver-1',
          driverName: '李师傅',
          driverPhone: '13900139009',
          ratingText: '已认证',
          vehicleText: '4.2 米 厢式货车',
          plateNumber: '粤B12345',
          completedOrdersText: '12 单',
          quoteText: '￥880',
          arrivalText: '45 分钟到达',
          noteText: '可带尾板',
        },
      ],
    });
  });

  it('maps accepted driver snapshot to driver info and negotiated price text', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-driver-accepted',
        orderNo: 'HY202607010008',
        shipperId: 'shipper-1',
        status: 'loading',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'negotiable',
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:20:00.000Z',
        events: [
          {
            id: 'event-driver-quote',
            actorUserId: 'driver-1',
            eventType: 'driver_quote_submitted',
            noteText: JSON.stringify({
              quoteCents: 88000,
              arrivalText: '45 分钟到达',
              noteText: '可带尾板',
              driverSnapshot: {
                driverName: '李师傅',
                driverPhone: '13900139009',
                vehicleType: 'box',
                vehicleLengthText: '4.2 米',
                plateNumber: '粤B12345',
                completedOrderCount: 12,
              },
            }),
            createdAtIso: '2026-07-01T08:05:00.000Z',
          },
          {
            id: 'event-driver-accepted',
            actorUserId: 'driver-1',
            eventType: 'driver_accepted',
            noteText: JSON.stringify({
              noteText: '马上联系货主',
              driverSnapshot: {
                driverName: '李师傅',
                driverPhone: '13900139009',
                vehicleType: 'box',
                vehicleLengthText: '4.2 米',
                plateNumber: '粤B12345',
                completedOrderCount: 12,
              },
            }),
            createdAtIso: '2026-07-01T08:10:00.000Z',
          },
        ],
      }),
    ).toMatchObject({
      priceText: '￥880',
      driverInfo: {
        driverId: 'driver-1',
        driverName: '李师傅',
        driverPhone: '13900139009',
        ratingText: '已认证',
        vehicleText: '4.2 米 厢式货车',
        plateNumber: '粤B12345',
        completedOrdersText: '12 单',
      },
    });
  });

  it('maps platform exception events to local exception cards with attachment refs', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-exception',
        orderNo: 'HY202607010005',
        shipperId: 'shipper-1',
        status: 'transporting',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:15:00.000Z',
        events: [
          {
            id: 'event-exception',
            eventType: 'exception_reported',
            noteText: '司机延误：司机反馈高速拥堵，预计晚到 40 分钟；图片凭证 2 张',
            attachmentFileIds: ['file-exception-1', 'file-exception-2'],
            createdAtIso: '2026-07-01T08:15:00.000Z',
          },
        ],
      }),
    ).toMatchObject({
      exceptionReport: {
        typeLabel: '司机延误',
        description: '司机反馈高速拥堵，预计晚到 40 分钟',
        statusText: '待客服跟进',
        photoCount: 2,
        photoFiles: [
          {
            fileId: 'file-exception-1',
            fileName: '平台异常图片 1',
            purpose: 'exception',
            status: 'uploaded',
          },
          {
            fileId: 'file-exception-2',
            fileName: '平台异常图片 2',
            purpose: 'exception',
            status: 'uploaded',
          },
        ],
      },
    });
  });

  it('maps platform evaluation events to local evaluation cards with attachment refs', () => {
    expect(
      mapPlatformOrderToRecentOrder({
        id: 'order-evaluation',
        orderNo: 'HY202607010006',
        shipperId: 'shipper-1',
        status: 'completed',
        cargoType: 'digital',
        weightText: '1.5 吨',
        quantityText: '8 箱',
        pickupAddress: '宝安区平台仓',
        pickupContact: '赵经理',
        pickupPhone: '13900139001',
        deliveryAddress: '南山区平台门店',
        deliveryContact: '钱店长',
        deliveryPhone: '13900139002',
        vehicleRequirement: 'medium',
        needTailboard: false,
        needTarp: false,
        pickupTimeIso: '2026-07-02T02:00:00.000Z',
        pricingMode: 'fixed',
        priceCents: 76000,
        paymentMethod: 'cod',
        createdAtIso: '2026-07-01T08:00:00.000Z',
        updatedAtIso: '2026-07-01T08:20:00.000Z',
        events: [
          {
            id: 'event-evaluation',
            eventType: 'evaluation_submitted',
            noteText:
              '5 星：准时、服务好；匿名评价；图片凭证 1 张；司机服务细致，整体运输体验很好',
            attachmentFileIds: ['file-evaluation-1'],
            createdAtIso: '2026-07-01T08:20:00.000Z',
          },
        ],
      }),
    ).toMatchObject({
      evaluation: {
        rating: 5,
        tags: ['准时', '服务好'],
        content: '司机服务细致，整体运输体验很好',
        anonymous: true,
        photoCount: 1,
        photoFiles: [
          {
            fileId: 'file-evaluation-1',
            fileName: '平台评价图片 1',
            purpose: 'evaluation',
            status: 'uploaded',
          },
        ],
      },
    });
  });

  it('drops driver quotes whose note payload is malformed or invalid', () => {
    const order = baseOrder({
      pricingMode: 'negotiable',
      priceCents: undefined,
      events: [
        event({ id: 'q1', actorUserId: 'd1', noteText: 'not-json' }),
        event({
          id: 'q2',
          actorUserId: 'd2',
          noteText: JSON.stringify({ quoteCents: '800', arrivalText: '20 分钟' }),
        }),
        event({ id: 'q3', actorUserId: 'd3', noteText: undefined }),
      ],
    });

    expect(mapPlatformOrderToRecentOrder(order).driverQuotes).toBeUndefined();
  });

  it('keeps only the valid driver quote and fills the missing note default', () => {
    const order = baseOrder({
      pricingMode: 'negotiable',
      priceCents: undefined,
      events: [
        event({ id: 'bad', actorUserId: 'd1', noteText: '{' }),
        event({
          id: 'good',
          actorUserId: 'd2',
          noteText: JSON.stringify({ quoteCents: 88000, arrivalText: '30 分钟' }),
        }),
      ],
    });

    const quotes = mapPlatformOrderToRecentOrder(order).driverQuotes;
    expect(quotes).toHaveLength(1);
    expect(quotes?.[0]).toMatchObject({
      driverId: 'd2',
      quoteText: '￥880',
      arrivalText: '30 分钟',
      noteText: '司机未填写报价备注',
    });
  });

  it('picks the latest driver quote snapshot when a driver quotes twice', () => {
    const order = baseOrder({
      status: 'loading',
      pricingMode: 'negotiable',
      priceCents: undefined,
      events: [
        event({
          id: 'q-early',
          actorUserId: 'd1',
          createdAtIso: '2026-07-01T09:00:00.000Z',
          noteText: JSON.stringify({
            quoteCents: 70000,
            arrivalText: '早',
            driverSnapshot: { driverName: '旧名', plateNumber: '辽A0001' },
          }),
        }),
        event({
          id: 'q-late',
          actorUserId: 'd1',
          createdAtIso: '2026-07-01T10:00:00.000Z',
          noteText: JSON.stringify({
            quoteCents: 90000,
            arrivalText: '晚',
            driverSnapshot: { driverName: '新名', plateNumber: '辽A9999' },
          }),
        }),
        event({
          id: 'accept',
          eventType: 'driver_accepted',
          actorUserId: 'd1',
          createdAtIso: '2026-07-01T11:00:00.000Z',
        }),
      ],
    });

    const mapped = mapPlatformOrderToRecentOrder(order);
    expect(mapped.priceText).toBe('￥900');
    expect(mapped.driverInfo).toMatchObject({
      driverId: 'd1',
      driverName: '新名',
      plateNumber: '辽A9999',
    });
  });

  it('ignores exception events without a proper "：" separator or empty parts', () => {
    expect(
      mapPlatformOrderToRecentOrder(
        baseOrder({
          status: 'transporting',
          events: [
            event({
              id: 'ex',
              eventType: 'exception_reported',
              noteText: '没有分隔符',
            }),
          ],
        }),
      ).exceptionReport,
    ).toBeUndefined();

    expect(
      mapPlatformOrderToRecentOrder(
        baseOrder({
          status: 'transporting',
          events: [
            event({
              id: 'ex2',
              eventType: 'exception_reported',
              noteText: '：只有描述',
            }),
          ],
        }),
      ).exceptionReport,
    ).toBeUndefined();
  });

  it('parses an exception report with a trailing photo count', () => {
    const report = mapPlatformOrderToRecentOrder(
      baseOrder({
        status: 'transporting',
        events: [
          event({
            id: 'ex3',
            eventType: 'exception_reported',
            noteText: '货损：外包装破损；图片凭证 2 张',
          }),
        ],
      }),
    ).exceptionReport;

    expect(report).toMatchObject({
      typeLabel: '货损',
      description: '外包装破损',
      photoCount: 2,
      statusText: '待客服跟进',
    });
  });

  it('ignores evaluation events without a valid rating or tags', () => {
    expect(
      mapPlatformOrderToRecentOrder(
        baseOrder({
          status: 'completed',
          events: [
            event({
              id: 'ev',
              eventType: 'evaluation_submitted',
              noteText: '无评分格式；内容',
            }),
          ],
        }),
      ).evaluation,
    ).toBeUndefined();

    expect(
      mapPlatformOrderToRecentOrder(
        baseOrder({
          status: 'completed',
          events: [
            event({
              id: 'ev2',
              eventType: 'evaluation_submitted',
              noteText: '5 星：；内容',
            }),
          ],
        }),
      ).evaluation,
    ).toBeUndefined();
  });

  it('parses an anonymous evaluation with tags and photo count', () => {
    const evaluation = mapPlatformOrderToRecentOrder(
      baseOrder({
        status: 'completed',
        events: [
          event({
            id: 'ev3',
            eventType: 'evaluation_submitted',
            noteText: '5 星：准时、专业；匿名评价；图片凭证 1 张；送达很及时',
          }),
        ],
      }),
    ).evaluation;

    expect(evaluation).toMatchObject({
      rating: 5,
      tags: ['准时', '专业'],
      anonymous: true,
      photoCount: 1,
      content: '送达很及时',
    });
  });

  it('falls back to a placeholder driver when the accepted snapshot is empty', () => {
    const mapped = mapPlatformOrderToRecentOrder(
      baseOrder({
        status: 'loading',
        events: [
          event({
            id: 'accept',
            eventType: 'driver_accepted',
            actorUserId: 'd7',
            noteText: JSON.stringify({ driverSnapshot: { driverName: '   ' } }),
          }),
        ],
      }),
    );

    expect(mapped.driverInfo).toMatchObject({
      driverId: 'd7',
      driverName: '平台司机 d7',
      ratingText: '平台已接单',
      plateNumber: '车牌待补充',
      completedOrdersText: '0 单',
    });
  });

  it('omits pickup time text when the pickup time is missing or unparseable', () => {
    expect(
      mapPlatformOrderToRecentOrder(baseOrder({ pickupTimeIso: undefined }))
        .pickupTimeText,
    ).toBeUndefined();

    expect(
      mapPlatformOrderToRecentOrder(baseOrder({ pickupTimeIso: 'not-a-date' }))
        .pickupTimeText,
    ).toBeUndefined();
  });

  it('formats non-integer yuan amounts with two decimals', () => {
    expect(
      mapPlatformOrderToRecentOrder(baseOrder({ priceCents: 76050 })).priceText,
    ).toBe('￥760.50');
  });

  it('keeps a photo-count-only description as-is when no "；" prefix precedes it', () => {
    // The strip regex requires a "；" before "图片凭证 N 张"; without it the
    // description is kept verbatim, so a report is still produced.
    expect(
      mapPlatformOrderToRecentOrder(
        baseOrder({
          status: 'transporting',
          events: [
            event({
              id: 'ex-only-photo',
              eventType: 'exception_reported',
              noteText: '货损：图片凭证 2 张',
            }),
          ],
        }),
      ).exceptionReport,
    ).toMatchObject({
      typeLabel: '货损',
      description: '图片凭证 2 张',
      photoCount: 2,
    });
  });

  it('drops an exception whose description becomes empty after stripping photos', () => {
    expect(
      mapPlatformOrderToRecentOrder(
        baseOrder({
          status: 'transporting',
          events: [
            event({
              id: 'ex-empty',
              eventType: 'exception_reported',
              noteText: '货损：；图片凭证 2 张',
            }),
          ],
        }),
      ).exceptionReport,
    ).toBeUndefined();
  });

  it('uses the latest event when multiple same-type events exist', () => {
    const report = mapPlatformOrderToRecentOrder(
      baseOrder({
        status: 'transporting',
        events: [
          event({
            id: 'ex-old',
            eventType: 'exception_reported',
            createdAtIso: '2026-07-01T09:00:00.000Z',
            noteText: '货损：旧描述',
          }),
          event({
            id: 'ex-new',
            eventType: 'exception_reported',
            createdAtIso: '2026-07-01T10:00:00.000Z',
            noteText: '延误：新描述',
          }),
        ],
      }),
    ).exceptionReport;

    expect(report).toMatchObject({ typeLabel: '延误', description: '新描述' });
  });

  it('handles accepted events whose note payload is a JSON array', () => {
    const mapped = mapPlatformOrderToRecentOrder(
      baseOrder({
        status: 'loading',
        events: [
          event({
            id: 'q',
            actorUserId: 'd9',
            noteText: JSON.stringify({
              quoteCents: 66000,
              arrivalText: '20 分钟',
              driverSnapshot: { driverName: '孙师傅', plateNumber: '辽A6666' },
            }),
          }),
          event({
            id: 'accept',
            eventType: 'driver_accepted',
            actorUserId: 'd9',
            createdAtIso: '2026-07-01T11:00:00.000Z',
            noteText: '[]',
          }),
        ],
      }),
    );

    // Accepted payload has no snapshot → falls back to the driver's quote snapshot.
    expect(mapped.driverInfo).toMatchObject({
      driverId: 'd9',
      driverName: '孙师傅',
      plateNumber: '辽A6666',
    });
  });

  it('handles accepted events whose note is plain non-JSON text', () => {
    const mapped = mapPlatformOrderToRecentOrder(
      baseOrder({
        status: 'loading',
        events: [
          event({
            id: 'accept',
            eventType: 'driver_accepted',
            actorUserId: 'd10',
            noteText: '手动接单',
          }),
        ],
      }),
    );

    expect(mapped.driverInfo).toMatchObject({
      driverId: 'd10',
      driverName: '平台司机 d10',
    });
  });
});

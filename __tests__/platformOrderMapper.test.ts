import { mapPlatformOrderToRecentOrder } from '../src/services/platformOrderMapper';

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
});

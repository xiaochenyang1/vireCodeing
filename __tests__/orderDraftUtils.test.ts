import {
  calculateLocalCouponAdjustment,
  createAddCargoPhotoVoucherChange,
  createDraftCouponState,
  createDraftConfirmationDisplay,
  createDraftChangeSnapshot,
  createDraftFormState,
  createDraftInitialFormState,
  createDraftPreviewState,
  createDraftPublishInput,
  createRemoveLatestCargoPhotoVoucherChange,
  getSaveDraftNotice,
  getDraftPublishValidationNotice,
  toggleDraftValueAddedService,
  validateDraftOrderInput,
} from '../src/utils/orderDraft';
import type {
  DraftOrderFormState,
  DraftOrderValidationInput,
} from '../src/utils/orderDraft';
import {
  paymentMethodOptions,
  valueAddedServiceOptions,
  vehicleLengthRequirementOptions,
  vehicleRequirementOptions,
} from '../src/data/mockData';

const now = new Date(2026, 5, 30, 8, 0).getTime();

function createValidDraftInput(
  override: Partial<DraftOrderValidationInput> = {},
): DraftOrderValidationInput {
  return {
    weightText: '2 吨',
    volumeText: '12',
    quantityText: '20 件',
    cargoDescription: '标准托盘货',
    pickupAddress: '沈阳市和平区胜利南街 1 号',
    pickupNoteText: '西门装货',
    pickupContact: '张三',
    pickupPhone: '13800138000',
    deliveryAddress: '大连市甘井子区中华西路 88 号',
    deliveryNoteText: '到库联系',
    deliveryContact: '李四',
    deliveryPhone: '13900139000',
    pickupTimeText: '今天 10:30',
    expectedDeliveryTimeText: '尽快送达',
    valueAddedServiceIds: [],
    insuredValueText: '',
    pricingMode: 'fixed',
    priceText: '500',
    ...override,
  };
}

function createTestDraftFormState(
  override: Partial<DraftOrderFormState> = {},
): DraftOrderFormState {
  return {
    cargoType: 'build',
    weightText: ' 2 吨 ',
    volumeText: ' 12 ',
    quantityText: ' 20 件 ',
    cargoDescription: '  标准托盘货  ',
    cargoPhotoCount: 2,
    pickupAddress: ' 沈阳市和平区胜利南街 1 号 ',
    pickupNoteText: ' 西门装货 ',
    pickupContact: ' 张三 ',
    pickupPhone: ' 13800138000 ',
    deliveryAddress: ' 大连市甘井子区中华西路 88 号 ',
    deliveryNoteText: ' 到库联系 ',
    deliveryContact: ' 李四 ',
    deliveryPhone: ' 13900139000 ',
    vehicleRequirement: 'medium',
    vehicleLengthRequirement: '4m',
    needTailboard: true,
    needTarp: false,
    pickupTimeText: ' 今天 10:30 ',
    expectedDeliveryTimeText: ' 尽快送达 ',
    valueAddedServiceIds: ['loading', 'insurance'],
    loadingWorkerCount: 3,
    insuredValueText: '￥12000',
    pricingMode: 'fixed',
    priceText: ' 500 ',
    paymentMethod: 'online',
    selectedCouponId: 'coupon-300-30',
    couponAdjustment: {
      couponId: 'coupon-300-30',
      couponTitleText: '满 300 减 30',
      couponDiscountText: '-￥30',
      payablePriceText: '￥470',
    },
    editingOrderId: 'HY20260630001',
    noticeText: '从历史订单复制',
    reorderSourceOrderId: 'HY20260621001',
    ...override,
  };
}

test('calculates local coupon adjustment when fixed price satisfies threshold', () => {
  expect(
    calculateLocalCouponAdjustment(
      {
        id: 'coupon-300-30',
        title: '满 300 减 30',
        conditionText: '满 300 元可用',
      },
      '￥350.5',
    ),
  ).toEqual({
    couponId: 'coupon-300-30',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥320.50',
  });
});

test('does not calculate local coupon adjustment below threshold', () => {
  expect(
    calculateLocalCouponAdjustment(
      {
        id: 'coupon-300-30',
        title: '满 300 减 30',
        conditionText: '满 300 元可用',
      },
      '299.99',
    ),
  ).toBeUndefined();
});

test('creates draft coupon state only for fixed price usable selections', () => {
  const usableCoupons = [
    {
      id: 'coupon-300-30',
      title: '满 300 减 30',
      conditionText: '满 300 元可用',
    },
    {
      id: 'coupon-500-80',
      title: '满 500 减 80',
      conditionText: '满 500 元可用',
    },
  ];

  expect(
    createDraftCouponState({
      pricingMode: 'fixed',
      selectedCouponId: 'coupon-300-30',
      usableCoupons,
      priceText: '350',
    }),
  ).toEqual({
    selectedCoupon: usableCoupons[0],
    couponAdjustment: {
      couponId: 'coupon-300-30',
      couponTitleText: '满 300 减 30',
      couponDiscountText: '-￥30',
      payablePriceText: '￥320',
    },
  });
  expect(
    createDraftCouponState({
      pricingMode: 'fixed',
      selectedCouponId: 'coupon-500-80',
      usableCoupons,
      priceText: '350',
    }),
  ).toEqual({
    selectedCoupon: usableCoupons[1],
    couponAdjustment: undefined,
  });
  expect(
    createDraftCouponState({
      pricingMode: 'fixed',
      selectedCouponId: 'missing-coupon',
      usableCoupons,
      priceText: '350',
    }),
  ).toEqual({
    selectedCoupon: undefined,
    couponAdjustment: undefined,
  });
  expect(
    createDraftCouponState({
      pricingMode: 'negotiable',
      selectedCouponId: 'coupon-300-30',
      usableCoupons,
      priceText: '350',
    }),
  ).toEqual({
    selectedCoupon: undefined,
    couponAdjustment: undefined,
  });
});

test('creates initial draft form state from defaults and prefill values', () => {
  expect(createDraftInitialFormState()).toEqual({
    cargoType: 'build',
    weightText: '',
    volumeText: '',
    quantityText: '',
    cargoDescription: '',
    cargoPhotoCount: 0,
    cargoPhotoFiles: [],
    pickupAddress: '',
    pickupNoteText: '',
    pickupContact: '',
    pickupPhone: '',
    deliveryAddress: '',
    deliveryNoteText: '',
    deliveryContact: '',
    deliveryPhone: '',
    vehicleRequirement: 'medium',
    vehicleLengthRequirement: 'unlimited',
    needTailboard: false,
    needTarp: false,
    pickupTimeText: '',
    expectedDeliveryTimeText: '',
    valueAddedServiceIds: [],
    loadingWorkerCount: 1,
    insuredValueText: '',
    pricingMode: 'fixed',
    priceText: '',
    paymentMethod: 'cod',
    selectedCouponId: undefined,
    editingOrderId: undefined,
    noticeText: undefined,
    reorderSourceOrderId: undefined,
  });

  const prefillServiceIds: DraftOrderFormState['valueAddedServiceIds'] = [
    'loading',
    'insurance',
  ];
  const prefillCargoPhotoFiles: NonNullable<
    DraftOrderFormState['cargoPhotoFiles']
  > = [
    {
      fileId: 'file-cargo-1',
      fileName: '货物图片凭证1.png',
      purpose: 'cargo',
      status: 'uploaded',
      publicUrl: 'https://cdn.example.com/file-cargo-1.png',
    },
  ];
  const initialState = createDraftInitialFormState({
    cargoType: 'food',
    weightText: '5 吨',
    volumeText: '18',
    quantityText: '60 箱',
    cargoDescription: '冷链食品',
    cargoPhotoCount: 2,
    cargoPhotoFiles: prefillCargoPhotoFiles,
    pickupAddress: '沈阳冷库',
    pickupNoteText: '二号门',
    pickupContact: '王五',
    pickupPhone: '13800138000',
    deliveryAddress: '大连门店',
    deliveryNoteText: '卸货月台',
    deliveryContact: '赵六',
    deliveryPhone: '13900139000',
    vehicleRequirement: 'box',
    vehicleLengthRequirement: '6m',
    needTailboard: true,
    needTarp: true,
    pickupTimeText: '今天 11:00',
    expectedDeliveryTimeText: '明天 10:00',
    valueAddedServiceIds: prefillServiceIds,
    loadingWorkerCount: 4,
    insuredValueText: '￥12000',
    pricingMode: 'fixed',
    priceText: '¥860',
    paymentMethod: 'online',
    couponId: 'coupon-500-80',
    editingOrderId: 'HY20260630001',
    noticeText: '正在修改订单：HY20260630001',
    reorderSourceOrderId: 'HY20260621001',
  });

  expect(initialState).toEqual({
    cargoType: 'food',
    weightText: '5 吨',
    volumeText: '18',
    quantityText: '60 箱',
    cargoDescription: '冷链食品',
    cargoPhotoCount: 2,
    cargoPhotoFiles: [
      {
        fileId: 'file-cargo-1',
        fileName: '货物图片凭证1.png',
        purpose: 'cargo',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-cargo-1.png',
      },
    ],
    pickupAddress: '沈阳冷库',
    pickupNoteText: '二号门',
    pickupContact: '王五',
    pickupPhone: '13800138000',
    deliveryAddress: '大连门店',
    deliveryNoteText: '卸货月台',
    deliveryContact: '赵六',
    deliveryPhone: '13900139000',
    vehicleRequirement: 'box',
    vehicleLengthRequirement: '6m',
    needTailboard: true,
    needTarp: true,
    pickupTimeText: '今天 11:00',
    expectedDeliveryTimeText: '明天 10:00',
    valueAddedServiceIds: ['loading', 'insurance'],
    loadingWorkerCount: 4,
    insuredValueText: '12000',
    pricingMode: 'fixed',
    priceText: '860',
    paymentMethod: 'online',
    selectedCouponId: 'coupon-500-80',
    editingOrderId: 'HY20260630001',
    noticeText: '正在修改订单：HY20260630001',
    reorderSourceOrderId: 'HY20260621001',
  });
  expect(initialState.valueAddedServiceIds).not.toBe(prefillServiceIds);
  expect(initialState.cargoPhotoFiles).not.toBe(prefillCargoPhotoFiles);
});

test('creates current draft form state with coupon and source metadata', () => {
  const valueAddedServiceIds: DraftOrderFormState['valueAddedServiceIds'] = [
    'loading',
  ];
  const draftFormState = createDraftFormState({
    ...createDraftInitialFormState({
      cargoType: 'food',
      weightText: '5 吨',
      valueAddedServiceIds,
      couponId: 'coupon-500-80',
      editingOrderId: 'HY20260630001',
      noticeText: '正在修改订单：HY20260630001',
      reorderSourceOrderId: 'HY20260621001',
    }),
    cargoDescription: '冷链食品',
    couponAdjustment: {
      couponId: 'coupon-500-80',
      couponTitleText: '满 500 减 80',
      couponDiscountText: '-￥80',
      payablePriceText: '￥420',
    },
  });

  expect(draftFormState).toMatchObject({
    cargoType: 'food',
    weightText: '5 吨',
    cargoDescription: '冷链食品',
    selectedCouponId: 'coupon-500-80',
    couponAdjustment: {
      couponId: 'coupon-500-80',
      couponTitleText: '满 500 减 80',
      couponDiscountText: '-￥80',
      payablePriceText: '￥420',
    },
    editingOrderId: 'HY20260630001',
    noticeText: '正在修改订单：HY20260630001',
    reorderSourceOrderId: 'HY20260621001',
  });
  expect(draftFormState.valueAddedServiceIds).toEqual(['loading']);
  expect(draftFormState.valueAddedServiceIds).not.toBe(valueAddedServiceIds);
});

test('returns first draft validation notice for missing required fields', () => {
  expect(
    validateDraftOrderInput(createValidDraftInput({ weightText: '' }), {
      now,
    }),
  ).toBe('请填写货物重量后再发布');
});

test('rejects pickup time outside local half-hour publish window', () => {
  expect(
    validateDraftOrderInput(
      createValidDraftInput({ pickupTimeText: '今天 09:45' }),
      { now },
    ),
  ).toBe('装货时间需在当前时间 2 小时后、7 天内，并按半小时填写');
});

test('rejects selected coupon when fixed price does not meet threshold', () => {
  expect(
    validateDraftOrderInput(createValidDraftInput({ priceText: '200' }), {
      now,
      selectedCoupon: {
        id: 'coupon-300-30',
        title: '满 300 减 30',
        conditionText: '满 300 元可用',
      },
      couponAdjustment: undefined,
    }),
  ).toBe('当前一口价未满足优惠券使用门槛');
});

test('accepts valid draft input', () => {
  expect(
    validateDraftOrderInput(createValidDraftInput(), {
      now,
    }),
  ).toBeUndefined();
});

test('returns draft publish validation notice from the full form state', () => {
  expect(
    getDraftPublishValidationNotice(
      createTestDraftFormState({
        pickupAddress: '同一个地址',
        deliveryAddress: '同一个地址',
      }),
      { now },
    ),
  ).toBe('装货地址和卸货地址不能相同');

  expect(
    getDraftPublishValidationNotice(
      createTestDraftFormState({
        priceText: '200',
        couponAdjustment: undefined,
      }),
      {
        now,
        selectedCoupon: {
          id: 'coupon-300-30',
          title: '满 300 减 30',
          conditionText: '满 300 元可用',
        },
      },
    ),
  ).toBe('当前一口价未满足优惠券使用门槛');

  expect(getDraftPublishValidationNotice(createTestDraftFormState(), { now }))
    .toBeUndefined();
});

test('creates blocked draft preview state from validation notice', () => {
  expect(
    createDraftPreviewState(
      createTestDraftFormState({
        pickupAddress: '同一个地址',
        deliveryAddress: '同一个地址',
      }),
      { now },
    ),
  ).toEqual({
    isConfirming: false,
    notice: '装货地址和卸货地址不能相同',
  });
});

test('creates confirming draft preview state for a valid draft', () => {
  expect(createDraftPreviewState(createTestDraftFormState(), { now })).toEqual({
    isConfirming: true,
    notice: '',
  });
});

test('creates a draft change snapshot with in-progress values and coupon metadata', () => {
  expect(createDraftChangeSnapshot(createTestDraftFormState())).toEqual({
    cargoType: 'build',
    weightText: ' 2 吨 ',
    volumeText: ' 12 ',
    quantityText: ' 20 件 ',
    cargoDescription: '  标准托盘货  ',
    cargoPhotoCount: 2,
    pickupAddress: ' 沈阳市和平区胜利南街 1 号 ',
    pickupNoteText: ' 西门装货 ',
    pickupContact: ' 张三 ',
    pickupPhone: ' 13800138000 ',
    deliveryAddress: ' 大连市甘井子区中华西路 88 号 ',
    deliveryNoteText: ' 到库联系 ',
    deliveryContact: ' 李四 ',
    deliveryPhone: ' 13900139000 ',
    vehicleRequirement: 'medium',
    vehicleLengthRequirement: '4m',
    needTailboard: true,
    needTarp: false,
    pickupTimeText: ' 今天 10:30 ',
    expectedDeliveryTimeText: ' 尽快送达 ',
    valueAddedServiceIds: ['loading', 'insurance'],
    loadingWorkerCount: 3,
    insuredValueText: '￥12000',
    pricingMode: 'fixed',
    priceText: ' 500 ',
    paymentMethod: 'online',
    couponId: 'coupon-300-30',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥470',
    editingOrderId: 'HY20260630001',
    noticeText: '从历史订单复制',
    reorderSourceOrderId: 'HY20260621001',
  });
});

test('creates a trimmed publish input and only keeps active service details', () => {
  expect(
    createDraftPublishInput(
      createTestDraftFormState({
        valueAddedServiceIds: ['loading'],
        insuredValueText: '￥12000',
      }),
    ),
  ).toEqual({
    cargoType: 'build',
    weightText: '2 吨',
    volumeText: '12',
    quantityText: '20 件',
    cargoDescription: '标准托盘货',
    cargoPhotoCount: 2,
    pickupAddress: '沈阳市和平区胜利南街 1 号',
    pickupNoteText: '西门装货',
    pickupContact: '张三',
    pickupPhone: '13800138000',
    deliveryAddress: '大连市甘井子区中华西路 88 号',
    deliveryNoteText: '到库联系',
    deliveryContact: '李四',
    deliveryPhone: '13900139000',
    vehicleRequirement: 'medium',
    vehicleLengthRequirement: '4m',
    needTailboard: true,
    needTarp: false,
    pickupTimeText: '今天 10:30',
    expectedDeliveryTimeText: '尽快送达',
    valueAddedServiceIds: ['loading'],
    loadingWorkerCount: 3,
    insuredValueText: undefined,
    pricingMode: 'fixed',
    priceText: '500',
    paymentMethod: 'online',
    couponId: 'coupon-300-30',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥470',
    reorderSourceOrderId: 'HY20260621001',
  });
});

test('returns save-draft notice from current weight input', () => {
  expect(getSaveDraftNotice('   ')).toBe('请输入货物重量后再保存草稿');
  expect(getSaveDraftNotice('2 吨')).toBe(
    '草稿已保存，返回首页后再次发单会自动恢复。',
  );
});

test('creates cargo photo voucher count changes with local limit notices', () => {
  expect(createAddCargoPhotoVoucherChange(5)).toEqual({
    cargoPhotoCount: 6,
    notice: '',
  });
  expect(createAddCargoPhotoVoucherChange(6)).toEqual({
    cargoPhotoCount: 6,
    notice: '最多添加 6 张货物图片凭证',
  });
  expect(createRemoveLatestCargoPhotoVoucherChange(2)).toEqual({
    cargoPhotoCount: 1,
    notice: '已移除最新货物图片凭证，本地不会删除真实文件。',
  });
  expect(createRemoveLatestCargoPhotoVoucherChange(0)).toEqual({
    cargoPhotoCount: 0,
    notice: '已移除最新货物图片凭证，本地不会删除真实文件。',
  });
});

test('toggles draft value-added service ids without mutating the original list', () => {
  const serviceIds = ['loading'] as DraftOrderFormState['valueAddedServiceIds'];

  expect(toggleDraftValueAddedService(serviceIds, 'insurance')).toEqual([
    'loading',
    'insurance',
  ]);
  expect(toggleDraftValueAddedService(serviceIds, 'loading')).toEqual([]);
  expect(serviceIds).toEqual(['loading']);
});

test('creates draft confirmation display text from current selections', () => {
  expect(
    createDraftConfirmationDisplay(createTestDraftFormState(), {
      vehicleRequirementOptions,
      vehicleLengthRequirementOptions,
      valueAddedServiceOptions,
      paymentMethodOptions,
    }),
  ).toEqual({
    selectedVehicleRequirementText: '中型货车 · 4米 · 需要尾板',
    selectedServiceLabels: [
      '装卸协助（3 人）',
      '保价运输（货值 ￥12000）',
    ],
    previewPriceText: '￥500',
    selectedPaymentMethodLabel: '在线支付',
  });
});

test('creates negotiable draft confirmation defaults when options are missing', () => {
  expect(
    createDraftConfirmationDisplay(
      createTestDraftFormState({
        pricingMode: 'negotiable',
        vehicleRequirement: 'flat',
        vehicleLengthRequirement: 'unlimited',
        needTailboard: false,
        needTarp: true,
        valueAddedServiceIds: ['protection'],
        paymentMethod: 'cod',
      }),
      {
        vehicleRequirementOptions: [],
        vehicleLengthRequirementOptions: [],
        valueAddedServiceOptions,
        paymentMethodOptions: [],
      },
    ),
  ).toEqual({
    selectedVehicleRequirementText: '不限车型 · 需要篷布',
    selectedServiceLabels: ['防震包装'],
    previewPriceText: '司机报价',
    selectedPaymentMethodLabel: '货到付款',
  });
});

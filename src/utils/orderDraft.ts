import type {
  DraftOrderInput,
  DraftOrderPrefill,
  FileAttachmentRef,
  PaymentMethod,
  ValueAddedServiceOption,
  VehicleLengthRequirementOption,
  VehicleRequirementOption,
} from '../types';
import {
  MAX_LOCAL_CARGO_PHOTO_COUNT,
  MAX_LOCAL_ADDRESS_NOTE_LENGTH,
  MAX_LOCAL_CARGO_DESCRIPTION_LENGTH,
  MAX_LOCAL_FIXED_PRICE,
  formatPriceText,
  hasPositiveNumber,
  isValidCargoVolume,
  isValidCargoWeight,
  isValidInsuredCargoValue,
  isValidLocalPickupTimeText,
  isValidPhone,
  isValidPickupTimeText,
  isValidPrice,
} from './order';
import type { CouponItem } from './profileLocalState';

export type LocalCoupon = Pick<CouponItem, 'id' | 'title' | 'conditionText'>;

export type LocalCouponAdjustment = {
  couponId: string;
  couponTitleText: string;
  couponDiscountText: string;
  payablePriceText: string;
};

export type DraftCouponStateInput = {
  pricingMode: DraftOrderInput['pricingMode'];
  selectedCouponId?: string;
  usableCoupons: LocalCoupon[];
  priceText: string;
};

export type DraftCouponState = {
  selectedCoupon?: LocalCoupon;
  couponAdjustment?: LocalCouponAdjustment;
};

export type DraftOrderValidationInput = Pick<
  DraftOrderInput,
  | 'weightText'
  | 'volumeText'
  | 'quantityText'
  | 'cargoDescription'
  | 'pickupAddress'
  | 'pickupNoteText'
  | 'pickupContact'
  | 'pickupPhone'
  | 'deliveryAddress'
  | 'deliveryNoteText'
  | 'deliveryContact'
  | 'deliveryPhone'
  | 'pickupTimeText'
  | 'expectedDeliveryTimeText'
  | 'valueAddedServiceIds'
  | 'insuredValueText'
  | 'pricingMode'
  | 'priceText'
>;

export type DraftOrderFormState = DraftOrderInput & {
  selectedCouponId?: string;
  couponAdjustment?: LocalCouponAdjustment;
  editingOrderId?: string;
  noticeText?: string;
};

export type DraftOrderInitialFormState = {
  cargoType: DraftOrderInput['cargoType'];
  weightText: string;
  volumeText: string;
  quantityText: string;
  cargoDescription: string;
  cargoPhotoCount: number;
  cargoPhotoFiles: FileAttachmentRef[];
  pickupAddress: string;
  pickupNoteText: string;
  pickupContact: string;
  pickupPhone: string;
  deliveryAddress: string;
  deliveryNoteText: string;
  deliveryContact: string;
  deliveryPhone: string;
  vehicleRequirement: DraftOrderInput['vehicleRequirement'];
  vehicleLengthRequirement: DraftOrderInput['vehicleLengthRequirement'];
  needTailboard: boolean;
  needTarp: boolean;
  pickupTimeText: string;
  expectedDeliveryTimeText: string;
  valueAddedServiceIds: DraftOrderInput['valueAddedServiceIds'];
  loadingWorkerCount: number;
  insuredValueText: string;
  pricingMode: DraftOrderInput['pricingMode'];
  priceText: string;
  paymentMethod: DraftOrderInput['paymentMethod'];
  selectedCouponId?: string;
  editingOrderId?: string;
  noticeText?: string;
  reorderSourceOrderId?: string;
};

export type CreateDraftFormStateInput = DraftOrderInitialFormState & {
  couponAdjustment?: LocalCouponAdjustment;
};

export type DraftCargoPhotoVoucherChange = {
  cargoPhotoCount: number;
  notice: string;
};

export type DraftConfirmationDisplayOptions = {
  vehicleRequirementOptions: VehicleRequirementOption[];
  vehicleLengthRequirementOptions: VehicleLengthRequirementOption[];
  valueAddedServiceOptions: ValueAddedServiceOption[];
  paymentMethodOptions: Array<{ id: PaymentMethod; label: string }>;
};

export type DraftConfirmationDisplay = {
  selectedVehicleRequirementText: string;
  selectedServiceLabels: string[];
  previewPriceText: string;
  selectedPaymentMethodLabel: string;
};

export type DraftValueAddedServiceEstimate = {
  lineTexts: string[];
  totalAmountText?: string;
  noticeText: string;
};

export type DraftPreviewState = {
  isConfirming: boolean;
  notice: string;
};

export type DraftPricingCapabilityCopy = {
  couponSectionTitle: string;
  couponNotice: string;
  fixedPricingEmptyCouponNotice: string;
  negotiableCouponNotice: string;
  paymentNotice: string;
};

export function getDraftPricingCapabilityCopy(
  usesPlatformOrderApi: boolean,
): DraftPricingCapabilityCopy {
  if (usesPlatformOrderApi) {
    return {
      couponSectionTitle: '优惠券',
      couponNotice:
        '固定价发单会同步优惠券选择和实付预估，实际核销以后端订单与支付状态为准。',
      fixedPricingEmptyCouponNotice: '暂无可用平台优惠券。',
      negotiableCouponNotice:
        '议价订单暂不使用优惠券，等待司机报价后再进入真实计价。',
      paymentNotice:
        '平台发单会同步支付方式选择；若选择在线支付，支付单会在发单后的订单页中发起。',
    };
  }

  return {
    couponSectionTitle: '优惠券',
    couponNotice:
      '本地演示会展示优惠券抵扣预估；切到平台模式后会随发单同步优惠券选择。',
    fixedPricingEmptyCouponNotice: '暂无可用本地优惠券。',
    negotiableCouponNotice:
      '议价订单暂不使用优惠券，等待司机报价后再接入真实计价。',
    paymentNotice:
      '当前会记录支付方式选择；切到平台模式后，在线支付会在发单后的订单页中发起。',
  };
}

export function calculateLocalCouponAdjustment(
  coupon: LocalCoupon | undefined,
  priceText: string,
): LocalCouponAdjustment | undefined {
  if (!coupon) {
    return undefined;
  }

  const priceValue = parseLocalAmount(priceText);
  const thresholdValue = parseLocalAmount(
    coupon.conditionText.match(/满\s*(\d+(?:\.\d+)?)/)?.[1] ?? '',
  );
  const discountValue = parseLocalAmount(
    coupon.title.match(/减\s*(\d+(?:\.\d+)?)/)?.[1] ?? '',
  );

  if (
    priceValue <= 0 ||
    discountValue <= 0 ||
    priceValue < thresholdValue
  ) {
    return undefined;
  }

  const payableValue = Math.max(priceValue - discountValue, 0);

  return {
    couponId: coupon.id,
    couponTitleText: coupon.title,
    couponDiscountText: `-${formatLocalCurrency(discountValue)}`,
    payablePriceText: formatLocalCurrency(payableValue),
  };
}

export function createDraftCouponState({
  pricingMode,
  selectedCouponId,
  usableCoupons,
  priceText,
}: DraftCouponStateInput): DraftCouponState {
  if (pricingMode !== 'fixed' || !selectedCouponId) {
    return {
      selectedCoupon: undefined,
      couponAdjustment: undefined,
    };
  }

  const selectedCoupon = usableCoupons.find(
    coupon => coupon.id === selectedCouponId,
  );

  return {
    selectedCoupon,
    couponAdjustment: calculateLocalCouponAdjustment(
      selectedCoupon,
      priceText,
    ),
  };
}

export function createDraftInitialFormState(
  prefill?: DraftOrderPrefill,
): DraftOrderInitialFormState {
  return {
    cargoType: prefill?.cargoType ?? 'build',
    weightText: prefill?.weightText ?? '',
    volumeText: prefill?.volumeText ?? '',
    quantityText: prefill?.quantityText ?? '',
    cargoDescription: prefill?.cargoDescription ?? '',
    cargoPhotoCount: prefill?.cargoPhotoCount ?? 0,
    cargoPhotoFiles: prefill?.cargoPhotoFiles
      ? [...prefill.cargoPhotoFiles]
      : [],
    pickupAddress: prefill?.pickupAddress ?? '',
    pickupNoteText: prefill?.pickupNoteText ?? '',
    pickupContact: prefill?.pickupContact ?? '',
    pickupPhone: prefill?.pickupPhone ?? '',
    deliveryAddress: prefill?.deliveryAddress ?? '',
    deliveryNoteText: prefill?.deliveryNoteText ?? '',
    deliveryContact: prefill?.deliveryContact ?? '',
    deliveryPhone: prefill?.deliveryPhone ?? '',
    vehicleRequirement: prefill?.vehicleRequirement ?? 'medium',
    vehicleLengthRequirement: prefill?.vehicleLengthRequirement ?? 'unlimited',
    needTailboard: prefill?.needTailboard ?? false,
    needTarp: prefill?.needTarp ?? false,
    pickupTimeText: prefill?.pickupTimeText ?? '',
    expectedDeliveryTimeText: prefill?.expectedDeliveryTimeText ?? '',
    valueAddedServiceIds: [...(prefill?.valueAddedServiceIds ?? [])],
    loadingWorkerCount: prefill?.loadingWorkerCount ?? 1,
    insuredValueText: stripCurrencyPrefix(prefill?.insuredValueText ?? ''),
    pricingMode: prefill?.pricingMode ?? 'fixed',
    priceText: stripCurrencyPrefix(prefill?.priceText ?? ''),
    paymentMethod: prefill?.paymentMethod ?? 'cod',
    selectedCouponId: prefill?.couponId,
    editingOrderId: prefill?.editingOrderId,
    noticeText: prefill?.noticeText,
    reorderSourceOrderId: prefill?.reorderSourceOrderId,
  };
}

export function createDraftFormState(
  input: CreateDraftFormStateInput,
): DraftOrderFormState {
  return {
    ...input,
    valueAddedServiceIds: [...input.valueAddedServiceIds],
  };
}

export function validateDraftOrderInput(
  input: DraftOrderValidationInput,
  {
    now,
    selectedCoupon,
    couponAdjustment,
  }: {
    now: number;
    selectedCoupon?: LocalCoupon;
    couponAdjustment?: LocalCouponAdjustment;
  },
) {
  const requiredFields: Array<[string, string]> = [
    [input.weightText, '货物重量'],
    [input.quantityText, '货物数量'],
    [input.pickupAddress, '装货地址'],
    [input.pickupContact, '装货联系人'],
    [input.pickupPhone, '装货联系电话'],
    [input.deliveryAddress, '卸货地址'],
    [input.deliveryContact, '卸货联系人'],
    [input.deliveryPhone, '卸货联系电话'],
    [input.pickupTimeText, '装货时间'],
  ];

  const missingField = requiredFields.find(([value]) => !value.trim());

  if (missingField) {
    return `请填写${missingField[1]}后再发布`;
  }

  if (!hasPositiveNumber(input.weightText)) {
    return '请输入有效的货物重量';
  }

  if (!isValidCargoWeight(input.weightText)) {
    return '货物重量需在 0.1 到 50 吨之间';
  }

  if (input.volumeText?.trim() && !isValidCargoVolume(input.volumeText)) {
    return '货物体积需在 0.1 到 100 立方米之间';
  }

  if (!hasPositiveNumber(input.quantityText)) {
    return '请输入有效的货物数量';
  }

  if (
    input.cargoDescription.trim().length >
    MAX_LOCAL_CARGO_DESCRIPTION_LENGTH
  ) {
    return `货物描述最多 ${MAX_LOCAL_CARGO_DESCRIPTION_LENGTH} 字`;
  }

  if (
    (input.pickupNoteText ?? '').trim().length > MAX_LOCAL_ADDRESS_NOTE_LENGTH
  ) {
    return `装货备注最多 ${MAX_LOCAL_ADDRESS_NOTE_LENGTH} 字`;
  }

  if (
    (input.deliveryNoteText ?? '').trim().length >
    MAX_LOCAL_ADDRESS_NOTE_LENGTH
  ) {
    return `卸货备注最多 ${MAX_LOCAL_ADDRESS_NOTE_LENGTH} 字`;
  }

  if (input.pickupAddress.trim() === input.deliveryAddress.trim()) {
    return '装货地址和卸货地址不能相同';
  }

  if (!isValidPhone(input.pickupPhone)) {
    return '请输入正确的装货联系电话';
  }

  if (!isValidPhone(input.deliveryPhone)) {
    return '请输入正确的卸货联系电话';
  }

  if (!isValidPickupTimeText(input.pickupTimeText)) {
    return '请输入明确的装货时间';
  }

  if (!isValidLocalPickupTimeText(input.pickupTimeText, now)) {
    return '装货时间需在当前时间 2 小时后、7 天内，并按半小时填写';
  }

  const expectedDeliveryTimeText = input.expectedDeliveryTimeText?.trim() ?? '';

  if (
    expectedDeliveryTimeText &&
    expectedDeliveryTimeText !== '尽快送达' &&
    !isValidPickupTimeText(expectedDeliveryTimeText)
  ) {
    return '期望送达时间请填写明确时间，或选择尽快送达';
  }

  if (
    input.valueAddedServiceIds.includes('insurance') &&
    !isValidInsuredCargoValue(input.insuredValueText ?? '')
  ) {
    return '请填写有效的保价货值';
  }

  if (input.pricingMode === 'fixed' && !isValidPrice(input.priceText)) {
    return `一口价金额需在 1 到 ${MAX_LOCAL_FIXED_PRICE} 元之间`;
  }

  if (selectedCoupon && !couponAdjustment) {
    return '当前一口价未满足优惠券使用门槛';
  }

  return undefined;
}

export function getDraftPublishValidationNotice(
  draftState: DraftOrderFormState,
  {
    now,
    selectedCoupon,
  }: {
    now: number;
    selectedCoupon?: LocalCoupon;
  },
) {
  return validateDraftOrderInput(
    {
      weightText: draftState.weightText,
      volumeText: draftState.volumeText,
      quantityText: draftState.quantityText,
      cargoDescription: draftState.cargoDescription,
      pickupAddress: draftState.pickupAddress,
      pickupNoteText: draftState.pickupNoteText,
      pickupContact: draftState.pickupContact,
      pickupPhone: draftState.pickupPhone,
      deliveryAddress: draftState.deliveryAddress,
      deliveryNoteText: draftState.deliveryNoteText,
      deliveryContact: draftState.deliveryContact,
      deliveryPhone: draftState.deliveryPhone,
      pickupTimeText: draftState.pickupTimeText,
      expectedDeliveryTimeText: draftState.expectedDeliveryTimeText,
      valueAddedServiceIds: draftState.valueAddedServiceIds,
      insuredValueText: draftState.insuredValueText,
      pricingMode: draftState.pricingMode,
      priceText: draftState.priceText,
    },
    {
      now,
      selectedCoupon,
      couponAdjustment: draftState.couponAdjustment,
    },
  );
}

export function createDraftPreviewState(
  draftState: DraftOrderFormState,
  options: {
    now: number;
    selectedCoupon?: LocalCoupon;
  },
): DraftPreviewState {
  const validationNotice = getDraftPublishValidationNotice(
    draftState,
    options,
  );

  if (validationNotice) {
    return {
      isConfirming: false,
      notice: validationNotice,
    };
  }

  return {
    isConfirming: true,
    notice: '',
  };
}

export function createDraftChangeSnapshot(
  draftState: DraftOrderFormState,
): DraftOrderPrefill {
  return {
    cargoType: draftState.cargoType,
    weightText: draftState.weightText,
    volumeText: draftState.volumeText,
    quantityText: draftState.quantityText,
    cargoDescription: draftState.cargoDescription,
    cargoPhotoCount: draftState.cargoPhotoCount,
    pickupAddress: draftState.pickupAddress,
    pickupNoteText: draftState.pickupNoteText,
    pickupContact: draftState.pickupContact,
    pickupPhone: draftState.pickupPhone,
    deliveryAddress: draftState.deliveryAddress,
    deliveryNoteText: draftState.deliveryNoteText,
    deliveryContact: draftState.deliveryContact,
    deliveryPhone: draftState.deliveryPhone,
    vehicleRequirement: draftState.vehicleRequirement,
    vehicleLengthRequirement: draftState.vehicleLengthRequirement,
    needTailboard: draftState.needTailboard,
    needTarp: draftState.needTarp,
    pickupTimeText: draftState.pickupTimeText,
    expectedDeliveryTimeText: draftState.expectedDeliveryTimeText,
    valueAddedServiceIds: draftState.valueAddedServiceIds,
    loadingWorkerCount: draftState.loadingWorkerCount,
    insuredValueText: draftState.insuredValueText,
    pricingMode: draftState.pricingMode,
    priceText: draftState.priceText,
    paymentMethod: draftState.paymentMethod,
    couponId: draftState.couponAdjustment
      ? draftState.selectedCouponId
      : undefined,
    couponTitleText: draftState.couponAdjustment?.couponTitleText,
    couponDiscountText: draftState.couponAdjustment?.couponDiscountText,
    payablePriceText: draftState.couponAdjustment?.payablePriceText,
    editingOrderId: draftState.editingOrderId,
    noticeText: draftState.noticeText,
    reorderSourceOrderId: draftState.reorderSourceOrderId,
  };
}

export function createDraftPublishInput(
  draftState: DraftOrderFormState,
): DraftOrderInput {
  return {
    cargoType: draftState.cargoType,
    weightText: draftState.weightText.trim(),
    volumeText: draftState.volumeText?.trim(),
    quantityText: draftState.quantityText.trim(),
    cargoDescription: draftState.cargoDescription.trim(),
    cargoPhotoCount: draftState.cargoPhotoCount,
    ...(draftState.cargoPhotoFiles?.length
      ? { cargoPhotoFiles: draftState.cargoPhotoFiles }
      : {}),
    pickupAddress: draftState.pickupAddress.trim(),
    pickupNoteText: draftState.pickupNoteText?.trim(),
    pickupContact: draftState.pickupContact.trim(),
    pickupPhone: draftState.pickupPhone.trim(),
    deliveryAddress: draftState.deliveryAddress.trim(),
    deliveryNoteText: draftState.deliveryNoteText?.trim(),
    deliveryContact: draftState.deliveryContact.trim(),
    deliveryPhone: draftState.deliveryPhone.trim(),
    vehicleRequirement: draftState.vehicleRequirement,
    vehicleLengthRequirement: draftState.vehicleLengthRequirement,
    needTailboard: draftState.needTailboard,
    needTarp: draftState.needTarp,
    pickupTimeText: draftState.pickupTimeText.trim(),
    expectedDeliveryTimeText: draftState.expectedDeliveryTimeText?.trim(),
    valueAddedServiceIds: draftState.valueAddedServiceIds,
    loadingWorkerCount: draftState.valueAddedServiceIds.includes('loading')
      ? draftState.loadingWorkerCount
      : undefined,
    insuredValueText: draftState.valueAddedServiceIds.includes('insurance')
      ? draftState.insuredValueText?.trim().replace(/^[￥¥]/, '')
      : undefined,
    pricingMode: draftState.pricingMode,
    priceText: draftState.priceText.trim(),
    paymentMethod: draftState.paymentMethod,
    couponId: draftState.couponAdjustment
      ? draftState.selectedCouponId
      : undefined,
    couponTitleText: draftState.couponAdjustment?.couponTitleText,
    couponDiscountText: draftState.couponAdjustment?.couponDiscountText,
    payablePriceText: draftState.couponAdjustment?.payablePriceText,
    reorderSourceOrderId: draftState.reorderSourceOrderId,
  };
}

export function getSaveDraftNotice(weightText: string) {
  if (!weightText.trim()) {
    return '请输入货物重量后再保存草稿';
  }

  return '草稿已保存，返回首页后再次发单会自动恢复。';
}

export function createAddCargoPhotoVoucherChange(
  currentCount: number,
): DraftCargoPhotoVoucherChange {
  if (currentCount >= MAX_LOCAL_CARGO_PHOTO_COUNT) {
    return {
      cargoPhotoCount: currentCount,
      notice: `最多添加 ${MAX_LOCAL_CARGO_PHOTO_COUNT} 张货物图片凭证`,
    };
  }

  return {
    cargoPhotoCount: Math.min(currentCount + 1, MAX_LOCAL_CARGO_PHOTO_COUNT),
    notice: '',
  };
}

export function createRemoveLatestCargoPhotoVoucherChange(
  currentCount: number,
): DraftCargoPhotoVoucherChange {
  return {
    cargoPhotoCount: Math.max(currentCount - 1, 0),
    notice: '已移除最新货物图片凭证，本地不会删除真实文件。',
  };
}

export function toggleDraftValueAddedService(
  serviceIds: ValueAddedServiceOption['id'][],
  serviceId: ValueAddedServiceOption['id'],
) {
  return serviceIds.includes(serviceId)
    ? serviceIds.filter(currentId => currentId !== serviceId)
    : [...serviceIds, serviceId];
}

export function createDraftConfirmationDisplay(
  draftState: DraftOrderFormState,
  options: DraftConfirmationDisplayOptions,
): DraftConfirmationDisplay {
  const selectedVehicleLabel =
    options.vehicleRequirementOptions.find(
      option => option.id === draftState.vehicleRequirement,
    )?.label ?? '不限车型';
  const selectedVehicleLengthLabel =
    options.vehicleLengthRequirementOptions.find(
      option => option.id === draftState.vehicleLengthRequirement,
    )?.label ?? '不限';
  const selectedVehicleExtraLabels = [
    draftState.needTailboard ? '需要尾板' : '',
    draftState.needTarp ? '需要篷布' : '',
  ].filter(Boolean);
  const selectedVehicleRequirementText = [
    selectedVehicleLabel,
    draftState.vehicleLengthRequirement === 'unlimited'
      ? ''
      : selectedVehicleLengthLabel,
    ...selectedVehicleExtraLabels,
  ]
    .filter(Boolean)
    .join(' · ');
  const selectedServiceLabels = options.valueAddedServiceOptions
    .filter(option => draftState.valueAddedServiceIds.includes(option.id))
    .map(option => getDraftSelectedServiceLabel(option, draftState));
  const previewPriceText =
    draftState.pricingMode === 'fixed'
      ? formatPriceText(draftState.priceText)
      : '司机报价';
  const selectedPaymentMethodLabel =
    options.paymentMethodOptions.find(
      option => option.id === draftState.paymentMethod,
    )?.label ?? '货到付款';

  return {
    selectedVehicleRequirementText,
    selectedServiceLabels,
    previewPriceText,
    selectedPaymentMethodLabel,
  };
}

export function createLocalValueAddedServiceEstimate(
  draftState: Pick<
    DraftOrderFormState,
    'valueAddedServiceIds' | 'loadingWorkerCount' | 'insuredValueText'
  >,
): DraftValueAddedServiceEstimate | undefined {
  if (draftState.valueAddedServiceIds.length === 0) {
    return undefined;
  }

  const lineTexts: string[] = [];
  const feeItems: number[] = [];
  let hasPendingEstimate = false;

  draftState.valueAddedServiceIds.forEach(serviceId => {
    if (serviceId === 'loading') {
      const workerCount = Math.max(1, draftState.loadingWorkerCount || 1);
      const amountValue = workerCount * 40;

      lineTexts.push(
        `装卸协助：${formatLocalCurrency(amountValue)}（${workerCount} 人 × ￥40/人）`,
      );
      feeItems.push(amountValue);
      return;
    }

    if (serviceId === 'insurance') {
      const insuredValueText = draftState.insuredValueText?.trim() ?? '';

      if (!isValidInsuredCargoValue(insuredValueText)) {
        lineTexts.push('保价运输：待填写货值后生成预估');
        hasPendingEstimate = true;
        return;
      }

      const insuredValue = parseLocalAmount(insuredValueText);
      const amountValue = Math.max(
        Number((insuredValue * 0.003).toFixed(2)),
        12,
      );

      lineTexts.push(
        `保价运输：${formatLocalCurrency(amountValue)}（货值 × 0.3%，最低 ￥12）`,
      );
      feeItems.push(amountValue);
      return;
    }

    if (serviceId === 'protection') {
      lineTexts.push('防震包装：￥30（固定附加费）');
      feeItems.push(30);
    }
  });

  return {
    lineTexts,
    ...(hasPendingEstimate
      ? {}
      : {
          totalAmountText: formatLocalCurrency(
            feeItems.reduce((total, value) => total + value, 0),
          ),
        }),
    noticeText: hasPendingEstimate
      ? '补全保价货值后会生成完整附加费预估；当前不会自动叠加到一口价。'
      : '本地参考附加费不会自动叠加到一口价，请按实际需求自行计入报价。',
  };
}

function parseLocalAmount(value: string) {
  const normalized = value.trim().replace(/[^\d.]/g, '');
  const amountValue = Number(normalized);

  return Number.isFinite(amountValue) ? amountValue : 0;
}

function stripCurrencyPrefix(value: string) {
  return value.replace(/^[￥¥]/, '');
}

function formatLocalCurrency(value: number) {
  const amountText = Number.isInteger(value) ? String(value) : value.toFixed(2);

  return `￥${amountText}`;
}

function getDraftSelectedServiceLabel(
  option: ValueAddedServiceOption,
  draftState: DraftOrderFormState,
) {
  if (option.id === 'loading') {
    return `${option.label}（${draftState.loadingWorkerCount} 人）`;
  }

  if (option.id === 'insurance' && draftState.insuredValueText?.trim()) {
    return `${option.label}（货值 ${formatPriceText(
      draftState.insuredValueText.trim().replace(/^[￥¥]/, ''),
    )}）`;
  }

  return option.label;
}

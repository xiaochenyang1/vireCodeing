import {
  cargoTypeOptions,
  vehicleRequirementOptions,
} from '../data/mockData';
import type { DraftOrderInput, RecentOrder } from '../types';
import type { PlatformCreateShipperOrderRequest } from '../services/platformOrderApi';

/**
 * 平台订单请求构造器与相关纯 helper。
 *
 * 这些函数原先挂在 App.tsx 底部，无 React 依赖、无副作用，只负责把本地
 * 草稿/运行态订单翻译成后端发单 schema。抽出来单独放，既能独立单测，也让
 * App.tsx 只保留状态编排逻辑。
 */

export function createPlatformCreateOrderRequest(
  draftOrder: DraftOrderInput,
  localOrder: RecentOrder,
): PlatformCreateShipperOrderRequest {
  const pricingFields = createPlatformPricingFields({
    pricingMode: draftOrder.pricingMode,
    priceText: draftOrder.priceText,
    couponId: draftOrder.couponId,
    couponTitleText: draftOrder.couponTitleText,
    couponDiscountText: draftOrder.couponDiscountText,
    payablePriceText: draftOrder.payablePriceText,
  });

  return {
    cargoType: draftOrder.cargoType,
    weightText: draftOrder.weightText,
    volumeText: optionalText(draftOrder.volumeText),
    quantityText: draftOrder.quantityText,
    cargoDescription: optionalText(draftOrder.cargoDescription),
    cargoPhotoCount: draftOrder.cargoPhotoCount,
    ...createPlatformCargoPhotoFileIdFields(draftOrder.cargoPhotoFiles),
    pickupAddress: draftOrder.pickupAddress,
    pickupNoteText: optionalText(draftOrder.pickupNoteText),
    pickupContact: draftOrder.pickupContact,
    pickupPhone: draftOrder.pickupPhone,
    deliveryAddress: draftOrder.deliveryAddress,
    deliveryNoteText: optionalText(draftOrder.deliveryNoteText),
    deliveryContact: draftOrder.deliveryContact,
    deliveryPhone: draftOrder.deliveryPhone,
    vehicleRequirement: draftOrder.vehicleRequirement,
    vehicleLengthText: localOrder.vehicleLengthText,
    needTailboard: draftOrder.needTailboard,
    needTarp: draftOrder.needTarp,
    pickupTimeIso: localOrder.pickupTimeIso ?? new Date().toISOString(),
    expectedDeliveryTimeText: optionalText(draftOrder.expectedDeliveryTimeText),
    valueAddedServicesText: localOrder.valueAddedServicesText,
    pricingMode: draftOrder.pricingMode,
    ...pricingFields,
    paymentMethod: draftOrder.paymentMethod,
  };
}

export function createPlatformCreateOrderRequestFromRecentOrder(
  order: RecentOrder,
): PlatformCreateShipperOrderRequest {
  const pricingMode = order.priceText === '司机报价' ? 'negotiable' : 'fixed';
  const pricingFields = createPlatformPricingFields({
    pricingMode,
    priceText: order.originalPriceText ?? order.priceText,
    couponId: order.couponId,
    couponTitleText: order.couponTitleText,
    couponDiscountText: order.couponDiscountText,
    payablePriceText: order.payablePriceText,
  });

  return {
    cargoType: getPlatformCargoTypeId(order.cargoType),
    weightText: order.weightText,
    volumeText: optionalText(order.volumeText),
    quantityText: order.quantityText ?? '1 件',
    cargoDescription: optionalText(order.cargoDescription),
    cargoPhotoCount: order.cargoPhotoCount,
    ...createPlatformCargoPhotoFileIdFields(order.cargoPhotoFiles),
    pickupAddress: order.from,
    pickupNoteText: optionalText(order.pickupNoteText),
    pickupContact: order.pickupContact ?? '',
    pickupPhone: order.pickupPhone ?? '',
    deliveryAddress: order.to,
    deliveryNoteText: optionalText(order.deliveryNoteText),
    deliveryContact: order.deliveryContact ?? '',
    deliveryPhone: order.deliveryPhone ?? '',
    vehicleRequirement: getPlatformVehicleRequirementId(
      order.vehicleRequirement,
    ),
    vehicleLengthText: optionalText(order.vehicleLengthText),
    needTailboard: Boolean(
      order.vehicleExtraRequirementsText?.includes('需要尾板'),
    ),
    needTarp: Boolean(order.vehicleExtraRequirementsText?.includes('需要篷布')),
    pickupTimeIso:
      order.pickupTimeIso ?? order.createdAtIso ?? new Date().toISOString(),
    expectedDeliveryTimeText: optionalText(order.expectedDeliveryTimeText),
    valueAddedServicesText: optionalText(order.valueAddedServicesText),
    pricingMode,
    ...pricingFields,
    paymentMethod: order.paymentMethodText === '在线支付' ? 'online' : 'cod',
  };
}

export function createPlatformPricingFields({
  pricingMode,
  priceText,
  couponId,
  couponTitleText,
  couponDiscountText,
  payablePriceText,
}: {
  pricingMode: DraftOrderInput['pricingMode'];
  priceText?: string;
  couponId?: string;
  couponTitleText?: string;
  couponDiscountText?: string;
  payablePriceText?: string;
}): Pick<
  PlatformCreateShipperOrderRequest,
  | 'priceCents'
  | 'couponId'
  | 'couponTitle'
  | 'couponDiscountCents'
  | 'payablePriceCents'
> {
  if (pricingMode !== 'fixed') {
    return {};
  }

  const couponDiscountCents = parseMoneyCents(couponDiscountText);
  const payablePriceCents = parseMoneyCents(payablePriceText);
  const couponTitle = optionalText(couponTitleText);
  const activeCouponId = optionalText(couponId);
  const couponFields =
    activeCouponId &&
    couponTitle &&
    couponDiscountCents !== undefined &&
    payablePriceCents !== undefined
      ? {
          couponId: activeCouponId,
          couponTitle,
          couponDiscountCents,
          payablePriceCents,
        }
      : {};

  return {
    priceCents: parseMoneyCents(priceText),
    ...couponFields,
  };
}

export function createPlatformExceptionReportRequest(
  exceptionReport: NonNullable<RecentOrder['exceptionReport']>,
) {
  return {
    typeLabel: exceptionReport.typeLabel,
    description: exceptionReport.description,
    ...(exceptionReport.photoCount && exceptionReport.photoCount > 0
      ? { photoCount: exceptionReport.photoCount }
      : {}),
    ...createPlatformPhotoFileIdFields(exceptionReport.photoFiles),
  };
}

export function createPlatformChangeRequest(
  modificationRequest: NonNullable<RecentOrder['modificationRequest']>,
) {
  return {
    description: modificationRequest.description,
  };
}

export function createPlatformEvaluationRequest(
  evaluation: NonNullable<RecentOrder['evaluation']>,
) {
  return {
    rating: evaluation.rating,
    tags: evaluation.tags,
    content: evaluation.content,
    anonymous: Boolean(evaluation.anonymous),
    ...(evaluation.photoCount && evaluation.photoCount > 0
      ? { photoCount: evaluation.photoCount }
      : {}),
    ...createPlatformPhotoFileIdFields(evaluation.photoFiles),
  };
}

export function createPlatformCargoPhotoFileIdFields(
  cargoPhotoFiles:
    | DraftOrderInput['cargoPhotoFiles']
    | RecentOrder['cargoPhotoFiles'],
) {
  const cargoPhotoFileIds = normalizeUploadedAttachmentFileIds(cargoPhotoFiles);

  return cargoPhotoFileIds.length > 0 ? { cargoPhotoFileIds } : {};
}

export function createPlatformPhotoFileIdFields(
  photoFiles:
    | NonNullable<RecentOrder['exceptionReport']>['photoFiles']
    | NonNullable<RecentOrder['evaluation']>['photoFiles'],
) {
  const photoFileIds = normalizeUploadedAttachmentFileIds(photoFiles);

  return photoFileIds.length > 0 ? { photoFileIds } : {};
}

export function normalizeUploadedAttachmentFileIds(
  files:
    | DraftOrderInput['cargoPhotoFiles']
    | RecentOrder['cargoPhotoFiles']
    | NonNullable<RecentOrder['exceptionReport']>['photoFiles']
    | NonNullable<RecentOrder['evaluation']>['photoFiles'],
) {
  return Array.from(
    new Set(
      (files ?? [])
        .filter(file => file.status === 'uploaded')
        .map(file => file.fileId.trim())
        .filter(Boolean),
    ),
  );
}

export function parseMoneyCents(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/^[+-]?[￥¥]/, '').replace(/,/g, '');
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return Math.round(Math.abs(amount) * 100);
}

export function optionalText(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function getPlatformCargoTypeId(cargoTypeText: string) {
  return (
    cargoTypeOptions.find(option => option.label === cargoTypeText)?.id ??
    cargoTypeText
  );
}

export function getPlatformVehicleRequirementId(vehicleRequirementText: string) {
  return (
    vehicleRequirementOptions.find(
      option => option.label === vehicleRequirementText,
    )?.id ?? vehicleRequirementText
  );
}

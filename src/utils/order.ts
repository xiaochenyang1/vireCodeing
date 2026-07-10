import {
  cargoTypeOptions,
  orderStatusSummaries,
  paymentMethodOptions,
  valueAddedServiceOptions,
  vehicleLengthRequirementOptions,
  vehicleRequirementOptions,
} from '../data/mockData';
import type {
  CargoTypeOption,
  DraftOrderInput,
  DraftOrderPrefill,
  OrderSyncOperation,
  OrderSyncState,
  PaymentMethod,
  RecentOrder,
  ValueAddedServiceOption,
  VehicleLengthRequirementOption,
  VehicleRequirementOption,
} from '../types';

export const MAX_LOCAL_FIXED_PRICE = 50000;
export const MIN_LOCAL_CARGO_WEIGHT = 0.1;
export const MAX_LOCAL_CARGO_WEIGHT = 50;
export const MIN_LOCAL_CARGO_VOLUME = 0.1;
export const MAX_LOCAL_CARGO_VOLUME = 100;
export const MAX_LOCAL_CARGO_DESCRIPTION_LENGTH = 200;
export const MAX_LOCAL_CARGO_PHOTO_COUNT = 6;
export const MAX_LOCAL_ADDRESS_NOTE_LENGTH = 50;
const MIN_PICKUP_TIME_OFFSET_MS = 2 * 60 * 60 * 1000;
const MAX_PICKUP_TIME_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

export function createPendingOrderSyncState(
  message = '本地订单已保存，等待真实后端 API 接入后同步。',
  operation: OrderSyncOperation = 'local',
  now = Date.now(),
): OrderSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'pending',
    operation,
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      createOrderSyncQueueItem(
        '待同步',
        '真实订单 API 未接入，本地先记录待同步订单。',
        updatedAtIso,
      ),
    ],
  };
}

export function createSyncedOrderSyncState(
  message = '本地状态已记录，等待真实 API 接入。',
  operation: OrderSyncOperation = 'local',
  now = Date.now(),
): OrderSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'synced',
    operation,
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [],
  };
}

export function createFailedOrderSyncState(
  message = '订单同步失败，等待本地重试。',
  operation: OrderSyncOperation = 'local',
  now = Date.now(),
): OrderSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'failed',
    operation,
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      createOrderSyncQueueItem(
        '同步失败',
        '真实订单 API 未接入，本地仅记录失败队列。',
        updatedAtIso,
      ),
    ],
  };
}

function createOrderSyncQueueItem(
  statusText: string,
  noteText: string,
  updatedAtIso: string,
): NonNullable<OrderSyncState['queueItems']>[number] {
  return {
    id: 'order-local-change',
    titleText: '订单变更',
    statusText,
    updatedAtText: '刚刚',
    updatedAtIso,
    noteText,
  };
}

export function getOrderStatusSummaries(orders: RecentOrder[]) {
  return orderStatusSummaries.map(summary => {
    const count = orders.filter(order => {
      if (summary.status === 'waiting') {
        return order.status === 'waiting';
      }

      if (summary.status === 'transporting') {
        return order.status === 'loading' || order.status === 'transporting';
      }

      if (summary.status === 'confirming') {
        return order.status === 'confirming';
      }

      return order.status === 'completed';
    }).length;

    return {
      ...summary,
      count,
    };
  });
}

export function createLocalOrder(
  draftOrder: DraftOrderInput,
  currentOrders: RecentOrder[],
  now = Date.now(),
): RecentOrder {
  const fixedPriceText = formatDraftOrderPriceText(draftOrder);
  const couponFields = createOrderCouponFields(draftOrder);
  const changedAtIso = new Date(now).toISOString();

  return {
    id: createLocalOrderId(currentOrders),
    status: 'waiting',
    from: draftOrder.pickupAddress,
    to: draftOrder.deliveryAddress,
    cargoType: getCargoTypeLabel(draftOrder.cargoType),
    weightText: draftOrder.weightText,
    volumeText: draftOrder.volumeText,
    quantityText: draftOrder.quantityText,
    cargoDescription: draftOrder.cargoDescription,
    cargoPhotoCount: draftOrder.cargoPhotoCount,
    ...(draftOrder.cargoPhotoFiles?.length
      ? { cargoPhotoFiles: draftOrder.cargoPhotoFiles }
      : {}),
    vehicleRequirement: getVehicleRequirementLabel(
      draftOrder.vehicleRequirement,
    ),
    vehicleLengthText: getVehicleLengthRequirementText(
      draftOrder.vehicleLengthRequirement,
    ),
    vehicleExtraRequirementsText: getVehicleExtraRequirementsText(draftOrder),
    priceText: fixedPriceText,
    ...couponFields,
    paymentMethodText: getPaymentMethodLabel(draftOrder.paymentMethod),
    createdAtIso: changedAtIso,
    updatedAtIso: changedAtIso,
    updatedAtText: '刚刚发布',
    pickupContact: draftOrder.pickupContact,
    pickupPhone: draftOrder.pickupPhone,
    pickupNoteText: draftOrder.pickupNoteText,
    deliveryContact: draftOrder.deliveryContact,
    deliveryPhone: draftOrder.deliveryPhone,
    deliveryNoteText: draftOrder.deliveryNoteText,
    pickupTimeIso: formatPickupTimeIso(draftOrder.pickupTimeText, now),
    pickupTimeText: draftOrder.pickupTimeText,
    expectedDeliveryTimeText: draftOrder.expectedDeliveryTimeText,
    valueAddedServicesText: getValueAddedServiceText(draftOrder),
    ...(draftOrder.reorderSourceOrderId
      ? {
          reorderSource: {
            orderId: draftOrder.reorderSourceOrderId,
            copiedAtText: '刚刚复制',
            noteText: '从历史订单重新下单',
          },
        }
      : {}),
    syncState: createPendingOrderSyncState(
      '本地订单已保存，等待真实后端 API 接入后同步。',
      'create',
      now,
    ),
  };
}

export function createOrderUpdateFromDraft(
  draftOrder: DraftOrderInput,
  now = Date.now(),
): Partial<RecentOrder> {
  const fixedPriceText = formatDraftOrderPriceText(draftOrder);
  const couponFields = createOrderCouponFields(draftOrder);

  return {
    from: draftOrder.pickupAddress,
    to: draftOrder.deliveryAddress,
    cargoType: getCargoTypeLabel(draftOrder.cargoType),
    weightText: draftOrder.weightText,
    volumeText: draftOrder.volumeText,
    quantityText: draftOrder.quantityText,
    cargoDescription: draftOrder.cargoDescription,
    cargoPhotoCount: draftOrder.cargoPhotoCount,
    cargoPhotoFiles: draftOrder.cargoPhotoFiles,
    vehicleRequirement: getVehicleRequirementLabel(
      draftOrder.vehicleRequirement,
    ),
    vehicleLengthText: getVehicleLengthRequirementText(
      draftOrder.vehicleLengthRequirement,
    ),
    vehicleExtraRequirementsText: getVehicleExtraRequirementsText(draftOrder),
    priceText: fixedPriceText,
    ...couponFields,
    paymentMethodText: getPaymentMethodLabel(draftOrder.paymentMethod),
    updatedAtIso: new Date(now).toISOString(),
    updatedAtText: '订单已修改 · 刚刚',
    pickupContact: draftOrder.pickupContact,
    pickupPhone: draftOrder.pickupPhone,
    pickupNoteText: draftOrder.pickupNoteText,
    deliveryContact: draftOrder.deliveryContact,
    deliveryPhone: draftOrder.deliveryPhone,
    deliveryNoteText: draftOrder.deliveryNoteText,
    pickupTimeIso: formatPickupTimeIso(draftOrder.pickupTimeText, now),
    pickupTimeText: draftOrder.pickupTimeText,
    expectedDeliveryTimeText: draftOrder.expectedDeliveryTimeText,
    valueAddedServicesText: getValueAddedServiceText(draftOrder),
    syncState: createPendingOrderSyncState(
      '订单修改已保存在本地，等待真实后端 API 接入后同步。',
      'update',
      now,
    ),
  };
}

export function createPrefillFromOrder(
  order: RecentOrder,
  now?: number,
): DraftOrderPrefill {
  const pickupTimeText = order.pickupTimeText ?? '';
  const canKeepPickupTime = now
    ? isValidLocalPickupTimeText(pickupTimeText, now)
    : isValidPickupTimeText(pickupTimeText);
  const pricingMode = order.priceText === '司机报价' ? 'negotiable' : 'fixed';

  return {
    cargoType: getCargoTypeId(order.cargoType),
    weightText: order.weightText,
    volumeText: order.volumeText ?? '',
    quantityText: order.quantityText ?? '1 件',
    cargoDescription: order.cargoDescription ?? '',
    cargoPhotoCount: order.cargoPhotoCount,
    cargoPhotoFiles: order.cargoPhotoFiles,
    pickupAddress: order.from,
    pickupNoteText: order.pickupNoteText ?? '',
    pickupContact: order.pickupContact ?? '',
    pickupPhone: order.pickupPhone ?? '',
    deliveryAddress: order.to,
    deliveryNoteText: order.deliveryNoteText ?? '',
    deliveryContact: order.deliveryContact ?? '',
    deliveryPhone: order.deliveryPhone ?? '',
    vehicleRequirement: getVehicleRequirementId(order.vehicleRequirement),
    vehicleLengthRequirement: getVehicleLengthRequirementId(
      order.vehicleLengthText,
    ),
    needTailboard: Boolean(
      order.vehicleExtraRequirementsText?.includes('需要尾板'),
    ),
    needTarp: Boolean(order.vehicleExtraRequirementsText?.includes('需要篷布')),
    pickupTimeText: canKeepPickupTime ? pickupTimeText : '明天 09:30',
    expectedDeliveryTimeText: order.expectedDeliveryTimeText ?? '',
    valueAddedServiceIds: getValueAddedServiceIds(
      order.valueAddedServicesText ?? '',
    ),
    loadingWorkerCount: getLoadingWorkerCount(order.valueAddedServicesText ?? ''),
    insuredValueText: getInsuredValueText(order.valueAddedServicesText ?? ''),
    pricingMode,
    priceText:
      pricingMode === 'negotiable'
        ? ''
        : (order.originalPriceText ?? order.priceText).replace(/^[￥¥]/, ''),
    paymentMethod: getPaymentMethodId(order.paymentMethodText ?? ''),
    noticeText: `已带入历史订单：${order.id}`,
    reorderSourceOrderId: order.id,
  };
}

function formatDraftOrderPriceText(draftOrder: DraftOrderInput) {
  if (draftOrder.pricingMode !== 'fixed') {
    return '司机报价';
  }

  return draftOrder.payablePriceText ?? formatPriceText(draftOrder.priceText);
}

function createOrderCouponFields(
  draftOrder: DraftOrderInput,
): Pick<
  RecentOrder,
  | 'couponId'
  | 'originalPriceText'
  | 'couponTitleText'
  | 'couponDiscountText'
  | 'payablePriceText'
> {
  const hasCompleteCoupon =
    draftOrder.pricingMode === 'fixed' &&
    draftOrder.couponId &&
    draftOrder.couponTitleText &&
    draftOrder.couponDiscountText &&
    draftOrder.payablePriceText;

  if (!hasCompleteCoupon) {
    return {
      couponId: undefined,
      originalPriceText: undefined,
      couponTitleText: undefined,
      couponDiscountText: undefined,
      payablePriceText: undefined,
    };
  }

  return {
    couponId: draftOrder.couponId,
    originalPriceText: formatPriceText(draftOrder.priceText),
    couponTitleText: draftOrder.couponTitleText,
    couponDiscountText: draftOrder.couponDiscountText,
    payablePriceText: draftOrder.payablePriceText,
  };
}

function createLocalOrderId(currentOrders: RecentOrder[]) {
  const localIndexes = currentOrders
    .map(order => order.id.match(/^HYLOCAL(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(value => Number(value));
  const nextIndex = localIndexes.length > 0 ? Math.max(...localIndexes) + 1 : 1;

  return `HYLOCAL${String(nextIndex).padStart(3, '0')}`;
}

function getCargoTypeLabel(cargoType: CargoTypeOption['id']) {
  return (
    cargoTypeOptions.find(option => option.id === cargoType)?.label ?? '其他'
  );
}

function getCargoTypeId(label: string): CargoTypeOption['id'] {
  return cargoTypeOptions.find(option => option.label === label)?.id ?? 'other';
}

function getVehicleRequirementLabel(
  vehicleRequirement: VehicleRequirementOption['id'],
) {
  return (
    vehicleRequirementOptions.find(option => option.id === vehicleRequirement)
      ?.label ?? '不限车型'
  );
}

function getVehicleRequirementId(label: string): VehicleRequirementOption['id'] {
  return (
    vehicleRequirementOptions.find(option => option.label === label)?.id ??
    'medium'
  );
}

function getVehicleLengthRequirementText(
  vehicleLengthRequirement: VehicleLengthRequirementOption['id'],
) {
  if (vehicleLengthRequirement === 'unlimited') {
    return undefined;
  }

  return vehicleLengthRequirementOptions.find(
    option => option.id === vehicleLengthRequirement,
  )?.label;
}

function getVehicleLengthRequirementId(
  label?: string,
): VehicleLengthRequirementOption['id'] {
  return (
    vehicleLengthRequirementOptions.find(option => option.label === label)?.id ??
    'unlimited'
  );
}

function getVehicleExtraRequirementsText(
  draftOrder: Pick<DraftOrderInput, 'needTailboard' | 'needTarp'>,
) {
  return [
    draftOrder.needTailboard ? '需要尾板' : '',
    draftOrder.needTarp ? '需要篷布' : '',
  ]
    .filter(Boolean)
    .join('、');
}

export function formatVehicleRequirementText(
  order: Pick<
    RecentOrder,
    'vehicleRequirement' | 'vehicleLengthText' | 'vehicleExtraRequirementsText'
  >,
) {
  const vehicleExtraRequirements = (order.vehicleExtraRequirementsText ?? '')
    .split('、')
    .filter(Boolean);

  return [
    order.vehicleRequirement,
    order.vehicleLengthText ?? '',
    ...vehicleExtraRequirements,
  ]
    .filter(Boolean)
    .join(' · ');
}

function getValueAddedServiceText(
  draftOrder: Pick<
    DraftOrderInput,
    'valueAddedServiceIds' | 'loadingWorkerCount' | 'insuredValueText'
  >,
) {
  return draftOrder.valueAddedServiceIds
    .map(serviceId => {
      const label = valueAddedServiceOptions.find(
        option => option.id === serviceId,
      )?.label;

      if (serviceId === 'loading' && draftOrder.loadingWorkerCount) {
        return `${label}（${draftOrder.loadingWorkerCount} 人）`;
      }

      if (serviceId === 'insurance' && draftOrder.insuredValueText) {
        return `${label}（货值 ${formatPriceText(draftOrder.insuredValueText)}）`;
      }

      return label;
    })
    .filter((label): label is string => Boolean(label))
    .join('、');
}

function getValueAddedServiceIds(value: string): ValueAddedServiceOption['id'][] {
  return valueAddedServiceOptions
    .filter(option => value.includes(option.label))
    .map(option => option.id);
}

function getLoadingWorkerCount(value: string) {
  const matchedCount = value.match(/装卸协助（([1-5]) 人）/);

  return matchedCount ? Number(matchedCount[1]) : undefined;
}

function getInsuredValueText(value: string) {
  return value.match(/保价运输（货值 [￥¥]?([^）]+)）/)?.[1] ?? '';
}

function getPaymentMethodLabel(paymentMethod: PaymentMethod) {
  return (
    paymentMethodOptions.find(option => option.id === paymentMethod)?.label ??
    '货到付款'
  );
}

function getPaymentMethodId(label: string): PaymentMethod {
  return paymentMethodOptions.find(option => option.label === label)?.id ?? 'cod';
}

export function isValidPhone(phone: string) {
  return /^1\d{10}$/.test(phone.trim());
}

export function isValidCode(code: string) {
  return /^\d{6}$/.test(code.trim());
}

export function isStrongPassword(password: string) {
  const trimmed = password.trim();

  return trimmed.length >= 6 && /[A-Za-z]/.test(trimmed) && /\d/.test(trimmed);
}

export function isValidPrice(price: string) {
  const normalized = price.trim();
  const priceValue = Number(normalized);

  return (
    /^\d+(\.\d{1,2})?$/.test(normalized) &&
    priceValue > 0 &&
    priceValue <= MAX_LOCAL_FIXED_PRICE
  );
}

export function isValidInsuredCargoValue(value: string) {
  const normalized = value.trim().replace(/^[￥¥]/, '');
  const insuredValue = Number(normalized);

  return /^\d+(\.\d{1,2})?$/.test(normalized) && insuredValue > 0;
}

export function isValidPickupTimeText(value: string) {
  const normalized = value.trim();
  const timePattern = '(?:[01]?\\d|2[0-3]):[0-5]\\d';
  const relativeDatePattern = new RegExp(
    `^(今天|明天|后天).+${timePattern}$`,
  );
  const exactDatePattern = new RegExp(
    `^\\d{4}-\\d{2}-\\d{2}\\s+${timePattern}$`,
  );

  return (
    relativeDatePattern.test(normalized) || exactDatePattern.test(normalized)
  );
}

export function isValidLocalPickupTimeText(value: string, now: number) {
  const pickupTime = parsePickupTimeText(value, now);

  if (!pickupTime) {
    return false;
  }

  const pickupTimeValue = pickupTime.getTime();

  return (
    pickupTime.getMinutes() % 30 === 0 &&
    pickupTimeValue >= now + MIN_PICKUP_TIME_OFFSET_MS &&
    pickupTimeValue <= now + MAX_PICKUP_TIME_OFFSET_MS
  );
}

function parsePickupTimeText(value: string, now: number) {
  const normalized = value.trim();
  const relativeMatched = normalized.match(
    /^(今天|明天|后天).*?((?:[01]?\d|2[0-3]):[0-5]\d)$/,
  );

  if (relativeMatched) {
    const dayOffset =
      relativeMatched[1] === '明天' ? 1 : relativeMatched[1] === '后天' ? 2 : 0;
    const [hourText, minuteText] = relativeMatched[2].split(':');
    const nowDate = new Date(now);

    return new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate() + dayOffset,
      Number(hourText),
      Number(minuteText),
    );
  }

  const exactMatched = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+((?:[01]?\d|2[0-3]):[0-5]\d)$/,
  );

  if (!exactMatched) {
    return undefined;
  }

  const year = Number(exactMatched[1]);
  const month = Number(exactMatched[2]);
  const day = Number(exactMatched[3]);
  const [hourText, minuteText] = exactMatched[4].split(':');
  const parsed = new Date(
    year,
    month - 1,
    day,
    Number(hourText),
    Number(minuteText),
  );

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

function formatPickupTimeIso(value: string, now: number) {
  return parsePickupTimeText(value, now)?.toISOString();
}

export function hasPositiveNumber(value: string) {
  const matchedNumber = value.trim().match(/\d+(\.\d+)?/);

  return Boolean(matchedNumber && Number(matchedNumber[0]) > 0);
}

export function isValidCargoWeight(value: string) {
  const normalized = value.trim();
  const matchedNumber = normalized.match(/\d+(\.\d+)?/);

  if (!matchedNumber) {
    return false;
  }

  const weightValue = Number(matchedNumber[0]);
  const weightInTons = /kg|公斤|千克/i.test(normalized)
    ? weightValue / 1000
    : weightValue;

  return (
    weightInTons >= MIN_LOCAL_CARGO_WEIGHT &&
    weightInTons <= MAX_LOCAL_CARGO_WEIGHT
  );
}

export function isValidCargoVolume(value: string) {
  const matchedNumber = value.trim().match(/\d+(\.\d+)?/);

  if (!matchedNumber) {
    return false;
  }

  const volumeValue = Number(matchedNumber[0]);

  return (
    volumeValue >= MIN_LOCAL_CARGO_VOLUME &&
    volumeValue <= MAX_LOCAL_CARGO_VOLUME
  );
}

export function formatPriceText(price: string) {
  const normalized = price.trim().replace(/^[￥¥]/, '');

  return `￥${normalized}`;
}

export function maskPhone(phone: string) {
  const trimmed = phone.trim();
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

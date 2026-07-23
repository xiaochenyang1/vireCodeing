import { cargoTypeOptions, vehicleRequirementOptions } from '../data/mockData';
import type { RecentOrder } from '../types';
import type { PlatformShipperOrder } from './platformOrderApi';

const SHANGHAI_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

export function mapPlatformOrderToRecentOrder(
  order: PlatformShipperOrder,
): RecentOrder {
  const isFixedPrice = order.pricingMode === 'fixed';
  const acceptedDriverInfo = createAcceptedDriverInfoFromPlatformEvents(order);
  const fixedPriceText =
    isFixedPrice && order.priceCents
      ? formatCents(order.priceCents)
      : undefined;
  const negotiatedAcceptedPriceText = isFixedPrice
    ? undefined
    : getAcceptedDriverQuoteText(order);
  const payablePriceText =
    !isFixedPrice || order.payablePriceCents === undefined
      ? undefined
      : formatCents(order.payablePriceCents);
  const couponId = isFixedPrice ? order.couponId : undefined;
  const couponTitleText = isFixedPrice ? order.couponTitle : undefined;
  const couponDiscountText =
    isFixedPrice && order.couponDiscountCents !== undefined
      ? `-${formatCents(order.couponDiscountCents)}`
      : undefined;
  const cargoPhotoFiles = createPlatformAttachmentRefs(
    order.cargoPhotoFileIds,
    'cargo',
    '平台货物图片',
  );
  const exceptionReport = createExceptionReportFromPlatformEvents(order);
  const evaluation = createEvaluationFromPlatformEvents(order);
  const shipperEvaluation = createShipperEvaluationFromPlatformEvents(order);
  const latestExceptionCase = createLatestExceptionCaseFromPlatformOrder(order);

  return {
    id: order.orderNo,
    platformOrderId: order.id,
    status: order.status,
    from: order.pickupAddress,
    to: order.deliveryAddress,
    cargoType: getCargoTypeText(order.cargoType),
    weightText: order.weightText,
    volumeText: order.volumeText,
    quantityText: order.quantityText,
    cargoDescription: order.cargoDescription,
    cargoPhotoCount: order.cargoPhotoCount,
    ...(cargoPhotoFiles.length > 0 ? { cargoPhotoFiles } : {}),
    vehicleRequirement: getVehicleRequirementText(order.vehicleRequirement),
    vehicleLengthText: order.vehicleLengthText,
    vehicleExtraRequirementsText: [
      order.needTailboard ? '需要尾板' : '',
      order.needTarp ? '需要篷布' : '',
    ]
      .filter(Boolean)
      .join('、'),
    priceText:
      payablePriceText ??
      fixedPriceText ??
      negotiatedAcceptedPriceText ??
      '司机报价',
    couponId,
    originalPriceText: payablePriceText ? fixedPriceText : undefined,
    couponTitleText,
    couponDiscountText,
    payablePriceText,
    paymentMethod: order.paymentMethod,
    paymentMethodText: order.paymentMethod === 'online' ? '在线支付' : '货到付款',
    paymentStatus: order.paymentStatus,
    assignedDriverId: order.assignedDriverId,
    paymentSettledAtIso: order.paymentSettledAtIso,
    refundedAtIso: order.refundedAtIso,
    createdAtIso: order.createdAtIso,
    updatedAtIso: order.updatedAtIso,
    updatedAtText: '平台已同步',
    pickupContact: order.pickupContact,
    pickupPhone: order.pickupPhone,
    pickupNoteText: order.pickupNoteText,
    deliveryContact: order.deliveryContact,
    deliveryPhone: order.deliveryPhone,
    deliveryNoteText: order.deliveryNoteText,
    pickupTimeIso: order.pickupTimeIso,
    pickupTimeText: formatPlatformPickupTime(order.pickupTimeIso),
    expectedDeliveryTimeText: order.expectedDeliveryTimeText,
    valueAddedServicesText: order.valueAddedServicesText,
    ...(acceptedDriverInfo ? { driverInfo: acceptedDriverInfo } : {}),
    driverQuotes: createDriverQuotesFromPlatformEvents(order),
    ...(exceptionReport ? { exceptionReport } : {}),
    ...(evaluation ? { evaluation } : {}),
    ...(shipperEvaluation ? { shipperEvaluation } : {}),
    ...(latestExceptionCase ? { latestExceptionCase } : {}),
    syncState: {
      status: 'synced',
      message: '订单已从平台 API 同步。',
      updatedAtText: '刚刚',
      updatedAtIso: order.updatedAtIso,
      queueItems: [],
    },
  };
}

type PlatformOrderEvent = NonNullable<PlatformShipperOrder['events']>[number];
type PlatformDriverEventSnapshot = {
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  vehicleLengthText?: string;
  plateNumber?: string;
  completedOrderCount?: number;
};

type ParsedDriverQuoteEvent = {
  quoteCents: number;
  arrivalText: string;
  noteText?: string;
  driverSnapshot?: PlatformDriverEventSnapshot;
};

type ParsedDriverAcceptedEvent = {
  noteText?: string;
  driverSnapshot?: PlatformDriverEventSnapshot;
};

function createDriverQuotesFromPlatformEvents(order: PlatformShipperOrder) {
  const driverQuotes = order.events
    ?.filter(event => event.eventType === 'driver_quote_submitted')
    .map(event => {
      const quote = parseDriverQuoteEvent(event.noteText);

      if (!quote) {
        return undefined;
      }

      const driverId = event.actorUserId ?? 'unknown-driver';
      const driverInfo = createDriverInfoFromSnapshot(
        driverId,
        quote.driverSnapshot,
        '平台报价',
      );

      return {
        ...driverInfo,
        quoteText: formatCents(quote.quoteCents),
        arrivalText: quote.arrivalText,
        noteText: quote.noteText ?? '司机未填写报价备注',
      };
    })
    .filter(
      (driverQuote): driverQuote is NonNullable<typeof driverQuote> =>
        Boolean(driverQuote),
    );

  return driverQuotes?.length ? driverQuotes : undefined;
}

function createAcceptedDriverInfoFromPlatformEvents(order: PlatformShipperOrder) {
  const acceptedEvent = findLatestPlatformEvent(order, 'driver_accepted');

  if (!acceptedEvent?.actorUserId) {
    return undefined;
  }

  const acceptedEventPayload = parseDriverAcceptedEvent(acceptedEvent.noteText);
  const driverSnapshot =
    acceptedEventPayload.driverSnapshot ??
    findDriverQuoteSnapshotForDriver(order, acceptedEvent.actorUserId);

  return createDriverInfoFromSnapshot(
    acceptedEvent.actorUserId,
    driverSnapshot,
    '平台已接单',
  );
}

function getAcceptedDriverQuoteText(order: PlatformShipperOrder) {
  const acceptedEvent = findLatestPlatformEvent(order, 'driver_accepted');

  if (!acceptedEvent?.actorUserId) {
    return undefined;
  }

  const driverQuote = findLatestDriverQuoteEventForDriver(
    order,
    acceptedEvent.actorUserId,
  );
  const quotePayload = parseDriverQuoteEvent(driverQuote?.noteText);

  return quotePayload ? formatCents(quotePayload.quoteCents) : undefined;
}

function findDriverQuoteSnapshotForDriver(
  order: PlatformShipperOrder,
  driverId: string,
) {
  const driverQuote = findLatestDriverQuoteEventForDriver(order, driverId);
  const quotePayload = parseDriverQuoteEvent(driverQuote?.noteText);

  return quotePayload?.driverSnapshot;
}

function findLatestDriverQuoteEventForDriver(
  order: PlatformShipperOrder,
  driverId: string,
) {
  return order.events
    ?.filter(
      event =>
        event.actorUserId === driverId &&
        event.eventType === 'driver_quote_submitted',
    )
    .reduce<PlatformOrderEvent | undefined>((latestEvent, event) => {
      if (!latestEvent) {
        return event;
      }

      return event.createdAtIso > latestEvent.createdAtIso
        ? event
        : latestEvent;
    }, undefined);
}

function createExceptionReportFromPlatformEvents(order: PlatformShipperOrder) {
  const event = findLatestPlatformEvent(order, 'exception_reported');

  if (!event?.noteText) {
    return undefined;
  }

  const separatorIndex = event.noteText.indexOf('：');

  if (separatorIndex <= 0) {
    return undefined;
  }

  const typeLabel = event.noteText.slice(0, separatorIndex).trim();
  let description = event.noteText.slice(separatorIndex + 1).trim();
  const photoCountFromNote = getTrailingPhotoCount(description);

  if (photoCountFromNote !== undefined) {
    description = description.replace(/；图片凭证 \d+ 张$/, '').trim();
  }

  if (!typeLabel || !description) {
    return undefined;
  }

  const photoFiles = createPlatformAttachmentRefs(
    event.attachmentFileIds,
    'exception',
    '平台异常图片',
  );
  const photoCount = photoFiles.length || photoCountFromNote;

  return {
    typeLabel,
    description,
    statusText: '待客服跟进',
    ...(photoCount ? { photoCount } : {}),
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function createLatestExceptionCaseFromPlatformOrder(order: PlatformShipperOrder) {
  if (!order.latestExceptionCase) {
    return undefined;
  }

  return {
    ...order.latestExceptionCase,
  };
}

function createEvaluationFromPlatformEvents(order: PlatformShipperOrder) {
  const event = findLatestPlatformEvent(order, 'evaluation_submitted');

  if (!event?.noteText) {
    return undefined;
  }

  const noteParts = event.noteText.split('；');
  const ratingAndTagsText = noteParts.shift()?.trim();
  const content = noteParts.pop()?.trim();
  const ratingMatch = ratingAndTagsText?.match(/^([1-5]) 星：(.*)$/);

  if (!ratingMatch || !content) {
    return undefined;
  }

  const tags = ratingMatch[2]
    .split('、')
    .map(tag => tag.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    return undefined;
  }

  const photoFiles = createPlatformAttachmentRefs(
    event.attachmentFileIds,
    'evaluation',
    '平台评价图片',
  );
  const photoCountFromNote = noteParts
    .map(getTrailingPhotoCount)
    .find((count): count is number => count !== undefined);
  const photoCount = photoFiles.length || photoCountFromNote;

  return {
    rating: Number(ratingMatch[1]),
    tags,
    content,
    anonymous: noteParts.includes('匿名评价'),
    ...(photoCount ? { photoCount } : {}),
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function createShipperEvaluationFromPlatformEvents(
  order: PlatformShipperOrder,
): { rating: number; tags: string[]; content: string; anonymous?: boolean } | undefined {
  const event = findLatestPlatformEvent(order, 'shipper_evaluation_submitted');

  if (!event?.noteText) {
    return undefined;
  }

  const noteParts = event.noteText.split('；');
  const ratingAndTagsText = noteParts.shift()?.trim();
  const content = noteParts.pop()?.trim();
  const ratingMatch = ratingAndTagsText?.match(/^([1-5]) 星：(.*)$/);

  if (!ratingMatch || !content) {
    return undefined;
  }

  const tags = ratingMatch[2]
    .split('、')
    .map(tag => tag.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    return undefined;
  }

  return {
    rating: Number(ratingMatch[1]),
    tags,
    content,
    anonymous: noteParts.includes('匿名评价'),
  };
}

function findLatestPlatformEvent(
  order: PlatformShipperOrder,
  eventType: string,
) {
  return order.events
    ?.filter(event => event.eventType === eventType)
    .reduce<PlatformOrderEvent | undefined>((latestEvent, event) => {
      if (!latestEvent) {
        return event;
      }

      return event.createdAtIso > latestEvent.createdAtIso
        ? event
        : latestEvent;
    }, undefined);
}

function createPlatformAttachmentRefs(
  attachmentFileIds: string[] | undefined,
  purpose: 'cargo' | 'exception' | 'evaluation',
  fileNamePrefix: string,
) {
  return (attachmentFileIds ?? [])
    .map(fileId => fileId.trim())
    .filter(Boolean)
    .map((fileId, index) => ({
      fileId,
      fileName: `${fileNamePrefix} ${index + 1}`,
      purpose,
      status: 'uploaded' as const,
    }));
}

function getTrailingPhotoCount(value: string) {
  const match = value.match(/图片凭证 (\d+) 张$/);

  if (!match) {
    return undefined;
  }

  const photoCount = Number(match[1]);

  return Number.isInteger(photoCount) && photoCount > 0
    ? photoCount
    : undefined;
}

function parseDriverQuoteEvent(
  noteText?: string,
): ParsedDriverQuoteEvent | undefined {
  if (!noteText) {
    return undefined;
  }

  try {
    const payload = JSON.parse(noteText) as {
      quoteCents?: unknown;
      arrivalText?: unknown;
      noteText?: unknown;
      driverSnapshot?: unknown;
    };

    if (
      typeof payload.quoteCents !== 'number' ||
      typeof payload.arrivalText !== 'string'
    ) {
      return undefined;
    }

    return {
      quoteCents: payload.quoteCents,
      arrivalText: payload.arrivalText,
      noteText:
        typeof payload.noteText === 'string' ? payload.noteText : undefined,
      driverSnapshot: parseDriverEventSnapshot(payload.driverSnapshot),
    };
  } catch {
    return undefined;
  }
}

function parseDriverAcceptedEvent(noteText?: string): ParsedDriverAcceptedEvent {
  if (!noteText) {
    return {};
  }

  try {
    const payload = JSON.parse(noteText) as {
      noteText?: unknown;
      driverSnapshot?: unknown;
    };

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return { noteText };
    }

    return {
      noteText: typeof payload.noteText === 'string' ? payload.noteText : undefined,
      driverSnapshot: parseDriverEventSnapshot(payload.driverSnapshot),
    };
  } catch {
    return { noteText: noteText.trim() || undefined };
  }
}

function parseDriverEventSnapshot(
  input: unknown,
): PlatformDriverEventSnapshot | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  const snapshot = input as {
    driverName?: unknown;
    driverPhone?: unknown;
    vehicleType?: unknown;
    vehicleLengthText?: unknown;
    plateNumber?: unknown;
    completedOrderCount?: unknown;
  };
  const driverName =
    typeof snapshot.driverName === 'string' ? snapshot.driverName.trim() : '';
  const driverPhone =
    typeof snapshot.driverPhone === 'string'
      ? snapshot.driverPhone.trim()
      : '';
  const vehicleType =
    typeof snapshot.vehicleType === 'string'
      ? snapshot.vehicleType.trim()
      : '';
  const vehicleLengthText =
    typeof snapshot.vehicleLengthText === 'string'
      ? snapshot.vehicleLengthText.trim()
      : '';
  const plateNumber =
    typeof snapshot.plateNumber === 'string'
      ? snapshot.plateNumber.trim()
      : '';
  const completedOrderCount =
    typeof snapshot.completedOrderCount === 'number' &&
    Number.isInteger(snapshot.completedOrderCount) &&
    snapshot.completedOrderCount >= 0
      ? snapshot.completedOrderCount
      : undefined;

  if (
    !driverName &&
    !driverPhone &&
    !vehicleType &&
    !vehicleLengthText &&
    !plateNumber &&
    completedOrderCount === undefined
  ) {
    return undefined;
  }

  return {
    ...(driverName ? { driverName } : {}),
    ...(driverPhone ? { driverPhone } : {}),
    ...(vehicleType ? { vehicleType } : {}),
    ...(vehicleLengthText ? { vehicleLengthText } : {}),
    ...(plateNumber ? { plateNumber } : {}),
    ...(completedOrderCount === undefined ? {} : { completedOrderCount }),
  };
}

function createDriverInfoFromSnapshot(
  driverId: string,
  snapshot: PlatformDriverEventSnapshot | undefined,
  fallbackRatingText: string,
) {
  const completedOrderCount = normalizeCompletedOrderCount(
    snapshot?.completedOrderCount,
  );

  return {
    driverId,
    driverName: snapshot?.driverName || `平台司机 ${driverId}`,
    driverPhone: snapshot?.driverPhone ?? '',
    ratingText: snapshot ? '已认证' : fallbackRatingText,
    vehicleText: formatDriverVehicleText(snapshot) ?? '车辆信息待补充',
    plateNumber: snapshot?.plateNumber ?? '车牌待补充',
    completedOrdersText: `${completedOrderCount} 单`,
  };
}

function formatDriverVehicleText(snapshot: PlatformDriverEventSnapshot | undefined) {
  if (!snapshot) {
    return undefined;
  }

  const vehicleTypeText = snapshot.vehicleType
    ? getVehicleRequirementText(snapshot.vehicleType)
    : undefined;

  if (snapshot.vehicleLengthText && vehicleTypeText) {
    return `${snapshot.vehicleLengthText} ${vehicleTypeText}`;
  }

  return snapshot.vehicleLengthText ?? vehicleTypeText;
}

function normalizeCompletedOrderCount(value: number | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function formatCents(cents: number) {
  const yuan = cents / 100;

  return `￥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function getCargoTypeText(cargoType: string) {
  return cargoTypeOptions.find(option => option.id === cargoType)?.label ?? cargoType;
}

function getVehicleRequirementText(vehicleRequirement: string) {
  return (
    vehicleRequirementOptions.find(option => option.id === vehicleRequirement)
      ?.label ?? vehicleRequirement
  );
}

function formatPlatformPickupTime(pickupTimeIso?: string) {
  if (!pickupTimeIso) {
    return undefined;
  }

  const pickupTime = new Date(pickupTimeIso);

  if (Number.isNaN(pickupTime.getTime())) {
    return undefined;
  }

  const shanghaiTime = new Date(pickupTime.getTime() + SHANGHAI_TIME_OFFSET_MS);
  const dateText = [
    shanghaiTime.getUTCFullYear(),
    padTimePart(shanghaiTime.getUTCMonth() + 1),
    padTimePart(shanghaiTime.getUTCDate()),
  ].join('-');
  const timeText = [
    padTimePart(shanghaiTime.getUTCHours()),
    padTimePart(shanghaiTime.getUTCMinutes()),
  ].join(':');

  return `${dateText} ${timeText}`;
}

function padTimePart(value: number) {
  return String(value).padStart(2, '0');
}

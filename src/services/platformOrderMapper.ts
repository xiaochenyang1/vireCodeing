import { cargoTypeOptions, vehicleRequirementOptions } from '../data/mockData';
import type { RecentOrder, RecentOrderStatus } from '../types';
import { formatPlatformIsoMinute } from '../utils/dateTime';
import {
  createCancellationRecord,
  sortDriverQuotesByQuotedTimeDesc,
} from '../utils/orderDetail';
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
  const cancellation = createCancellationFromPlatformEvents(order);
  const exceptionReport = createExceptionReportFromPlatformEvents(order);
  const modificationRequest =
    createModificationRequestFromPlatformEvents(order);
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
    ...(typeof order.exposureBonusCents === 'number' &&
    order.exposureBonusCents > 0
      ? { bonusText: formatCents(order.exposureBonusCents) }
      : {}),
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
    ...(cancellation ? { cancellation } : {}),
    ...(exceptionReport ? { exceptionReport } : {}),
    ...(modificationRequest ? { modificationRequest } : {}),
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
type PlatformLatestExceptionCase = NonNullable<
  PlatformShipperOrder['latestExceptionCase']
>;
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

type ParsedPlatformChangeRequestReviewEvent = {
  reviewResultText?: string;
  costImpactText?: string;
  refundText?: string;
  driverNoticeText?: string;
  adjustedPayablePriceCents?: number;
  previousPayablePriceCents?: number;
  fundDispositionSummaryText?: string;
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
        quotedAtIso: event.createdAtIso,
        quotedAtText: formatPlatformIsoMinute(event.createdAtIso),
      };
    })
    .filter(
      (driverQuote): driverQuote is NonNullable<typeof driverQuote> =>
        Boolean(driverQuote),
    );

  return driverQuotes?.length
    ? sortDriverQuotesByQuotedTimeDesc(driverQuotes)
    : undefined;
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

  return {
    ...createDriverInfoFromSnapshot(
      acceptedEvent.actorUserId,
      driverSnapshot,
      '平台已接单',
    ),
    acceptedAtIso: acceptedEvent.createdAtIso,
    acceptedAtText: formatPlatformIsoMinute(acceptedEvent.createdAtIso),
  };
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

function createModificationRequestFromPlatformEvents(
  order: PlatformShipperOrder,
) {
  const requestEvent = findLatestPlatformEvent(order, 'change_requested');
  if (!requestEvent?.noteText?.trim()) {
    return undefined;
  }
  const submittedAtIso = requestEvent.createdAtIso;
  const submittedAtText = formatPlatformIsoMinute(submittedAtIso);

  const reviewEvent = (order.events ?? [])
    .filter(
      event =>
        (event.eventType === 'change_request_approved' ||
          event.eventType === 'change_request_rejected') &&
        event.createdAtIso >= requestEvent.createdAtIso,
    )
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso))[0];

  if (!reviewEvent) {
    return {
      description: requestEvent.noteText.trim(),
      statusText: '待客服确认',
      submittedAtIso,
      submittedAtText,
      impactText:
        '司机已接单，当前订单已进入平台修改申请流程，客服将确认司机通知、费用和退款影响。',
      costImpactText: '待平台重新核算费用，当前订单金额暂不变更。',
      refundText: '支付资金暂不变更，平台审核通过后再同步差额。',
      driverNoticeText: '已生成平台修改确认通知，等待客服确认后同步。',
    };
  }

  const approved = reviewEvent.eventType === 'change_request_approved';
  const parsedReview = parsePlatformChangeRequestReviewEvent(reviewEvent.noteText);

  return {
    description: requestEvent.noteText.trim(),
    statusText: approved ? '客服已通过' : '客服已驳回',
    submittedAtIso,
    submittedAtText,
    reviewedAtIso: reviewEvent.createdAtIso,
    reviewedAtText: formatPlatformIsoMinute(reviewEvent.createdAtIso),
    impactText: approved
      ? '平台客服已确认修改申请，后续费用与司机通知以平台结果为准。'
      : '平台客服已驳回修改申请，订单继续按原内容执行。',
    costImpactText:
      parsedReview.costImpactText ||
      (approved
        ? '平台已确认费用影响，当前订单金额如需调整将另行同步。'
        : '修改申请已驳回，订单金额保持不变。'),
    refundText:
      parsedReview.refundText ||
      (approved
        ? '如涉及差额，将按平台结算结果处理。'
        : '修改申请已驳回，支付资金不做变更。'),
    driverNoticeText:
      parsedReview.driverNoticeText ||
      (approved
        ? '已通知司机按修改后要求执行。'
        : '已通知司机继续按原订单执行。'),
    reviewResultText:
      parsedReview.reviewResultText ||
      (approved ? '平台客服已通过修改申请' : '平台客服已驳回修改申请'),
    ...(parsedReview.adjustedPayablePriceCents !== undefined
      ? { adjustedPayablePriceCents: parsedReview.adjustedPayablePriceCents }
      : {}),
    ...(parsedReview.previousPayablePriceCents !== undefined
      ? { previousPayablePriceCents: parsedReview.previousPayablePriceCents }
      : {}),
    ...(parsedReview.fundDispositionSummaryText
      ? { fundDispositionSummaryText: parsedReview.fundDispositionSummaryText }
      : {}),
  };
}

function createCancellationFromPlatformEvents(order: PlatformShipperOrder) {
  if (order.status !== 'cancelled') {
    return undefined;
  }

  const cancelEvent = findLatestPlatformEvent(order, 'cancelled');
  const parsedCancellation = parsePlatformCancellationNote(cancelEvent?.noteText);

  if (!cancelEvent || !parsedCancellation) {
    return undefined;
  }

  return createCancellationRecord(
    parsedCancellation,
    resolveStatusBeforePlatformCancellation(order, cancelEvent.createdAtIso),
    true,
    order.payablePriceCents ?? order.priceCents,
    cancelEvent.createdAtIso,
  );
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
  const submittedAtIso = event.createdAtIso;
  const matchingExceptionCase =
    order.latestExceptionCase?.sourceEventId === event.id
      ? order.latestExceptionCase
      : undefined;
  const resolvedAtIso = matchingExceptionCase?.resolvedAtIso;

  return {
    typeLabel,
    description,
    statusText: getExceptionReportStatusText(matchingExceptionCase?.status),
    submittedAtIso,
    submittedAtText: formatPlatformIsoMinute(submittedAtIso),
    ...(resolvedAtIso
      ? {
          resolvedAtIso,
          resolvedAtText: formatPlatformIsoMinute(resolvedAtIso),
        }
      : {}),
    ...(photoCount ? { photoCount } : {}),
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function getExceptionReportStatusText(
  status: PlatformLatestExceptionCase['status'] | undefined,
) {
  switch (status) {
    case 'processing':
      return '处理中';
    case 'resolved':
    case 'closed':
      return '已处理';
    default:
      return '待客服跟进';
  }
}

function parsePlatformCancellationNote(noteText?: string) {
  const value = noteText?.trim();

  if (!value) {
    return undefined;
  }

  const separatorIndex = value.indexOf('：');

  if (separatorIndex <= 0) {
    return {
      reasonText: value,
      description: '',
    };
  }

  return {
    reasonText: value.slice(0, separatorIndex).trim(),
    description: value.slice(separatorIndex + 1).trim(),
  };
}

function resolveStatusBeforePlatformCancellation(
  order: PlatformShipperOrder,
  cancelledAtIso: string,
): RecentOrderStatus {
  const events = (order.events ?? [])
    .filter(event => event.createdAtIso < cancelledAtIso)
    .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
  let status: RecentOrderStatus = 'waiting';

  events.forEach(event => {
    if (event.eventType === 'driver_accepted' && status === 'waiting') {
      status = 'loading';
      return;
    }

    if (event.eventType !== 'status_changed') {
      return;
    }

    const nextStatus = parsePlatformAdvancedStatus(event.noteText);

    if (nextStatus) {
      status = nextStatus;
    }
  });

  return status;
}

function parsePlatformAdvancedStatus(noteText?: string) {
  switch (noteText?.trim()) {
    case '订单进入运输中':
      return 'transporting' as const;
    case '订单进入待确认':
      return 'confirming' as const;
    default:
      return undefined;
  }
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

  const parsedEvaluation = parsePlatformEvaluationNote(event?.noteText);

  if (!event?.noteText || !parsedEvaluation) {
    return undefined;
  }

  const photoFiles = createPlatformAttachmentRefs(
    event.attachmentFileIds,
    'evaluation',
    '平台评价图片',
  );
  const photoCount = photoFiles.length || parsedEvaluation.photoCount;
  const submittedAtIso = event.createdAtIso;

  return {
    rating: parsedEvaluation.rating,
    tags: parsedEvaluation.tags,
    content: parsedEvaluation.content,
    anonymous: parsedEvaluation.anonymous,
    submittedAtIso,
    submittedAtText: formatPlatformIsoMinute(submittedAtIso),
    ...(photoCount ? { photoCount } : {}),
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function createShipperEvaluationFromPlatformEvents(
  order: PlatformShipperOrder,
):
  | {
      rating: number;
      tags: string[];
      content: string;
      anonymous?: boolean;
      submittedAtText?: string;
      submittedAtIso?: string;
      photoCount?: number;
      photoFiles?: ReturnType<typeof createPlatformAttachmentRefs>;
    }
  | undefined {
  const event = findLatestPlatformEvent(order, 'shipper_evaluation_submitted');

  const parsedEvaluation = parsePlatformEvaluationNote(event?.noteText);

  if (!event?.noteText || !parsedEvaluation) {
    return undefined;
  }

  const photoFiles = createPlatformAttachmentRefs(
    event.attachmentFileIds,
    'evaluation',
    '司机评价图片',
  );
  const photoCount = photoFiles.length || parsedEvaluation.photoCount;
  const submittedAtIso = event.createdAtIso;

  return {
    rating: parsedEvaluation.rating,
    tags: parsedEvaluation.tags,
    content: parsedEvaluation.content,
    anonymous: parsedEvaluation.anonymous,
    submittedAtIso,
    submittedAtText: formatPlatformIsoMinute(submittedAtIso),
    ...(photoCount ? { photoCount } : {}),
    ...(photoFiles.length > 0 ? { photoFiles } : {}),
  };
}

function parsePlatformEvaluationNote(noteText?: string) {
  if (!noteText) {
    return undefined;
  }

  const noteParts = noteText.split('；');
  const ratingAndTagsText = noteParts.shift()?.trim();
  const ratingMatch = ratingAndTagsText?.match(/^([1-5]) 星：(.*)$/);

  if (!ratingMatch) {
    return undefined;
  }

  const tags = ratingMatch[2]
    .split('、')
    .map(tag => tag.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    return undefined;
  }

  const evaluationInfoMatch = noteParts[0]
    ?.trim()
    .match(/^评价信息：(匿名|实名)$/);

  if (evaluationInfoMatch) {
    noteParts.shift();
    const photoCountMatch = noteParts[0]?.trim().match(/^图片凭证 (\d+) 张$/);
    const photoCount = photoCountMatch ? Number(photoCountMatch[1]) : 0;

    if (photoCountMatch) {
      noteParts.shift();
    }

    const versionedContent = noteParts.join('；').trim();
    const contentPrefix = '评价正文：';

    if (!versionedContent.startsWith(contentPrefix)) {
      return undefined;
    }

    const content = versionedContent.slice(contentPrefix.length).trim();

    if (!content) {
      return undefined;
    }

    return {
      rating: Number(ratingMatch[1]),
      tags,
      content,
      anonymous: evaluationInfoMatch[1] === '匿名',
      photoCount,
    };
  }

  let anonymous = false;
  let photoCount = 0;

  while (noteParts.length > 0) {
    const currentPart = noteParts[0].trim();
    const photoCountMatch = currentPart.match(/^图片凭证 (\d+) 张$/);

    if (currentPart === '匿名评价') {
      anonymous = true;
      noteParts.shift();
      continue;
    }

    if (photoCountMatch) {
      photoCount = Number(photoCountMatch[1]);
      noteParts.shift();
      continue;
    }

    break;
  }

  const content = noteParts.join('；').trim();

  if (!content) {
    return undefined;
  }

  return {
    rating: Number(ratingMatch[1]),
    tags,
    content,
    anonymous,
    photoCount,
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

function parsePlatformChangeRequestReviewEvent(
  noteText?: string,
): ParsedPlatformChangeRequestReviewEvent {
  if (!noteText) {
    return {};
  }

  try {
    const payload = JSON.parse(noteText) as {
      reviewResultText?: unknown;
      costImpactText?: unknown;
      refundText?: unknown;
      driverNoticeText?: unknown;
      adjustedPayablePriceCents?: unknown;
      previousPayablePriceCents?: unknown;
      fundDisposition?: unknown;
    };

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return { reviewResultText: noteText.trim() || undefined };
    }

    const reviewResultText =
      typeof payload.reviewResultText === 'string'
        ? payload.reviewResultText.trim()
        : '';
    const costImpactText =
      typeof payload.costImpactText === 'string'
        ? payload.costImpactText.trim()
        : '';
    const refundText =
      typeof payload.refundText === 'string' ? payload.refundText.trim() : '';
    const driverNoticeText =
      typeof payload.driverNoticeText === 'string'
        ? payload.driverNoticeText.trim()
        : '';
    const adjustedPayablePriceCents =
      typeof payload.adjustedPayablePriceCents === 'number' &&
      Number.isInteger(payload.adjustedPayablePriceCents)
        ? payload.adjustedPayablePriceCents
        : undefined;
    const previousPayablePriceCents =
      typeof payload.previousPayablePriceCents === 'number' &&
      Number.isInteger(payload.previousPayablePriceCents)
        ? payload.previousPayablePriceCents
        : undefined;
    const fundDispositionSummaryText =
      payload.fundDisposition &&
      typeof payload.fundDisposition === 'object' &&
      !Array.isArray(payload.fundDisposition) &&
      typeof (payload.fundDisposition as { summaryText?: unknown }).summaryText ===
        'string'
        ? (
            payload.fundDisposition as { summaryText: string }
          ).summaryText.trim()
        : '';

    return {
      ...(reviewResultText ? { reviewResultText } : {}),
      ...(costImpactText ? { costImpactText } : {}),
      ...(refundText ? { refundText } : {}),
      ...(driverNoticeText ? { driverNoticeText } : {}),
      ...(adjustedPayablePriceCents !== undefined
        ? { adjustedPayablePriceCents }
        : {}),
      ...(previousPayablePriceCents !== undefined
        ? { previousPayablePriceCents }
        : {}),
      ...(fundDispositionSummaryText
        ? { fundDispositionSummaryText }
        : {}),
    };
  } catch {
    return { reviewResultText: noteText.trim() || undefined };
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

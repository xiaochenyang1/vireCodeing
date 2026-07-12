import {
  PlatformApiError,
  platformGet,
  platformPost,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformShipperOrderStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

const PLATFORM_SHIPPER_ORDER_STATUSES: PlatformShipperOrderStatus[] = [
  'waiting',
  'loading',
  'transporting',
  'confirming',
  'completed',
  'cancelled',
];

const PLATFORM_SHIPPER_ORDER_ADVANCE_STATUSES: PlatformAdvanceShipperOrderStatusRequest['nextStatus'][] = [
  'loading',
  'transporting',
  'confirming',
];

const PLATFORM_ORDER_PHONE_PATTERN = /^1[3-9]\d{9}$/;

export type PlatformCreateShipperOrderRequest = {
  cargoType: string;
  weightText: string;
  volumeText?: string;
  quantityText: string;
  cargoDescription?: string;
  cargoPhotoCount?: number;
  cargoPhotoFileIds?: string[];
  pickupAddress: string;
  pickupNoteText?: string;
  pickupContact: string;
  pickupPhone: string;
  deliveryAddress: string;
  deliveryNoteText?: string;
  deliveryContact: string;
  deliveryPhone: string;
  vehicleRequirement: string;
  vehicleLengthText?: string;
  needTailboard: boolean;
  needTarp: boolean;
  pickupTimeIso: string;
  expectedDeliveryTimeText?: string;
  valueAddedServicesText?: string;
  pricingMode: 'fixed' | 'negotiable';
  priceCents?: number;
  paymentMethod: 'cod' | 'online';
  couponId?: string;
  couponTitle?: string;
  couponDiscountCents?: number;
  payablePriceCents?: number;
};

export type PlatformCancelShipperOrderRequest = {
  reasonText: string;
  description?: string;
};

export type PlatformAdvanceShipperOrderStatusRequest = {
  nextStatus: Extract<
    PlatformShipperOrderStatus,
    'loading' | 'transporting' | 'confirming'
  >;
};

export type PlatformReportShipperOrderExceptionRequest = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFileIds?: string[];
};

export type PlatformSubmitShipperOrderChangeRequest = {
  description: string;
};

export type PlatformSubmitShipperOrderEvaluationRequest = {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
  photoCount?: number;
  photoFileIds?: string[];
};

export type PlatformShipperOrder = PlatformCreateShipperOrderRequest & {
  id: string;
  orderNo: string;
  shipperId: string;
  status: PlatformShipperOrderStatus;
  createdAtIso: string;
  updatedAtIso: string;
  events?: Array<{
    id: string;
    actorUserId?: string;
    eventType: string;
    noteText?: string;
    attachmentFileIds?: string[];
    createdAtIso: string;
  }>;
};

export type PlatformOrderExceptionCaseStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'closed';

export type PlatformOrderExceptionCaseSourceRole = 'shipper' | 'driver';

export type PlatformOrderExceptionCaseAction = {
  id: string;
  adminUserId: string;
  fromStatus: PlatformOrderExceptionCaseStatus;
  toStatus: PlatformOrderExceptionCaseStatus;
  content: string;
  createdAtIso: string;
};

export type PlatformOrderExceptionCase = {
  id: string;
  caseNo: string;
  orderId: string;
  orderNo: string;
  sourceEventId: string;
  reporterUserId: string;
  sourceRole: PlatformOrderExceptionCaseSourceRole;
  typeLabel: string;
  description: string;
  attachmentFileIds: string[];
  status: PlatformOrderExceptionCaseStatus;
  resolutionText?: string;
  resolvedAtIso?: string;
  closedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
  actions: PlatformOrderExceptionCaseAction[];
};

export type PlatformOrderExceptionCaseListResult = {
  items: PlatformOrderExceptionCase[];
  total: number;
};

export type PlatformOrderListResult = {
  items: PlatformShipperOrder[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformListShipperOrdersQuery = {
  status?: PlatformShipperOrderStatus;
  statuses?: PlatformShipperOrderStatus[];
  keyword?: string;
  createdFromIso?: string;
  createdToIso?: string;
  page?: number;
  pageSize?: number;
};

export function createPlatformOrderApi(config: PlatformApiConfig) {
  return {
    createOrder(request: PlatformCreateShipperOrderRequest) {
      const normalizedRequest = normalizeCreateOrderRequest(request);

      return platformPost<
        PlatformCreateShipperOrderRequest,
        PlatformShipperOrder
      >(config, '/shipper/orders', normalizedRequest);
    },
    async listOrders(query: PlatformListShipperOrdersQuery = {}) {
      assertValidListOrdersQuery(query);

      return platformGet<PlatformOrderListResult>(
        config,
        createListOrdersPath(query),
      );
    },
    async getOrder(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformShipperOrder>(
        config,
        `/shipper/orders/${normalizedOrderId}`,
      );
    },
    async listExceptionCases(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformOrderExceptionCaseListResult>(
        config,
        `/shipper/orders/${normalizedOrderId}/exception-cases`,
      );
    },
    async updateOrder(
      orderId: string,
      request: PlatformCreateShipperOrderRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeCreateOrderRequest(request);

      return platformPut<
        PlatformCreateShipperOrderRequest,
        PlatformShipperOrder
      >(config, `/shipper/orders/${normalizedOrderId}`, normalizedRequest);
    },
    async cancelOrder(
      orderId: string,
      request: PlatformCancelShipperOrderRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeCancelOrderRequest(request);

      return platformPost<
        PlatformCancelShipperOrderRequest,
        PlatformShipperOrder
      >(config, `/shipper/orders/${normalizedOrderId}/cancel`, normalizedRequest);
    },
    async completeOrder(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformPost<undefined, PlatformShipperOrder>(
        config,
        `/shipper/orders/${normalizedOrderId}/complete`,
        undefined,
      );
    },
    async advanceOrderStatus(
      orderId: string,
      request: PlatformAdvanceShipperOrderStatusRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      assertValidAdvanceOrderStatusRequest(request);

      return platformPost<
        PlatformAdvanceShipperOrderStatusRequest,
        PlatformShipperOrder
      >(config, `/shipper/orders/${normalizedOrderId}/status`, request);
    },
    async reportException(
      orderId: string,
      request: PlatformReportShipperOrderExceptionRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeReportExceptionRequest(request);

      return platformPost<
        PlatformReportShipperOrderExceptionRequest,
        PlatformShipperOrder
      >(config, `/shipper/orders/${normalizedOrderId}/exception`, normalizedRequest);
    },
    async submitChangeRequest(
      orderId: string,
      request: PlatformSubmitShipperOrderChangeRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeSubmitChangeRequest(request);

      return platformPost<
        PlatformSubmitShipperOrderChangeRequest,
        PlatformShipperOrder
      >(
        config,
        `/shipper/orders/${normalizedOrderId}/change-request`,
        normalizedRequest,
      );
    },
    async submitEvaluation(
      orderId: string,
      request: PlatformSubmitShipperOrderEvaluationRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeSubmitEvaluationRequest(request);

      return platformPost<
        PlatformSubmitShipperOrderEvaluationRequest,
        PlatformShipperOrder
      >(config, `/shipper/orders/${normalizedOrderId}/evaluation`, normalizedRequest);
    },
  };
}

function normalizeOrderId(orderId: string) {
  const orderIdInput = orderId as unknown;

  if (typeof orderIdInput !== 'string') {
    throw new PlatformApiError(
      'Platform order id must be a string',
      'PLATFORM_ORDER_ID_INVALID',
      0,
    );
  }

  const normalizedOrderId = orderIdInput.trim();

  if (!normalizedOrderId) {
    throw new PlatformApiError(
      'Platform order id is required',
      'PLATFORM_ORDER_ID_INVALID',
      0,
    );
  }

  return normalizedOrderId;
}

function normalizeCreateOrderRequest(
  request: PlatformCreateShipperOrderRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidOrderRequest('Platform order request must be an object');
  }

  const cargoType = normalizeRequiredOrderString(request.cargoType, 'cargoType');
  const weightText = normalizeRequiredOrderString(request.weightText, 'weightText');
  const volumeText = normalizeOptionalOrderTrimmedString(
    request.volumeText,
    'volumeText',
  );
  const quantityText = normalizeRequiredOrderString(
    request.quantityText,
    'quantityText',
  );
  const cargoDescription = normalizeOptionalOrderString(
    request.cargoDescription,
    'cargoDescription',
    200,
  );
  const cargoPhotoCount = normalizeOptionalOrderInteger(
    request.cargoPhotoCount,
    'cargoPhotoCount',
    0,
    6,
  );
  const cargoPhotoFileIds = normalizeOptionalOrderFileIds(
    request.cargoPhotoFileIds,
    'PLATFORM_ORDER_REQUEST_INVALID',
  );
  const pickupAddress = normalizeRequiredOrderString(
    request.pickupAddress,
    'pickupAddress',
  );
  const pickupNoteText = normalizeOptionalOrderString(
    request.pickupNoteText,
    'pickupNoteText',
    50,
  );
  const pickupContact = normalizeRequiredOrderString(
    request.pickupContact,
    'pickupContact',
  );
  const pickupPhone = normalizeOrderPhone(request.pickupPhone, 'pickupPhone');
  const deliveryAddress = normalizeRequiredOrderString(
    request.deliveryAddress,
    'deliveryAddress',
  );
  const deliveryNoteText = normalizeOptionalOrderString(
    request.deliveryNoteText,
    'deliveryNoteText',
    50,
  );
  const deliveryContact = normalizeRequiredOrderString(
    request.deliveryContact,
    'deliveryContact',
  );
  const deliveryPhone = normalizeOrderPhone(
    request.deliveryPhone,
    'deliveryPhone',
  );
  const vehicleRequirement = normalizeRequiredOrderString(
    request.vehicleRequirement,
    'vehicleRequirement',
  );
  const vehicleLengthText = normalizeOptionalOrderTrimmedString(
    request.vehicleLengthText,
    'vehicleLengthText',
  );
  const needTailboard = normalizeOrderBoolean(
    request.needTailboard,
    'needTailboard',
  );
  const needTarp = normalizeOrderBoolean(request.needTarp, 'needTarp');
  const pickupTimeIso = normalizeOrderDateTime(
    request.pickupTimeIso,
    'pickupTimeIso',
  );
  const expectedDeliveryTimeText = normalizeOptionalOrderTrimmedString(
    request.expectedDeliveryTimeText,
    'expectedDeliveryTimeText',
  );
  const valueAddedServicesText = normalizeOptionalOrderTrimmedString(
    request.valueAddedServicesText,
    'valueAddedServicesText',
  );
  const pricingMode = normalizeOrderEnum(
    request.pricingMode,
    'pricingMode',
    ['fixed', 'negotiable'],
  );
  const priceCents = normalizeOptionalOrderInteger(
    request.priceCents,
    'priceCents',
    1,
  );
  const paymentMethod = normalizeOrderEnum(
    request.paymentMethod,
    'paymentMethod',
    ['cod', 'online'],
  );
  const couponId = normalizeOptionalOrderTrimmedString(
    request.couponId,
    'couponId',
  );
  const couponTitle = normalizeOptionalOrderTrimmedString(
    request.couponTitle,
    'couponTitle',
  );
  const couponDiscountCents = normalizeOptionalOrderInteger(
    request.couponDiscountCents,
    'couponDiscountCents',
    0,
  );
  const payablePriceCents = normalizeOptionalOrderInteger(
    request.payablePriceCents,
    'payablePriceCents',
    0,
  );

  if (pickupAddress === deliveryAddress) {
    throwInvalidOrderRequest('Platform order pickup and delivery addresses differ');
  }

  if (pricingMode === 'fixed' && priceCents === undefined) {
    throwInvalidOrderRequest('Platform fixed price order requires priceCents');
  }

  const couponFields = [
    couponId,
    couponTitle,
    couponDiscountCents,
    payablePriceCents,
  ];

  if (
    pricingMode === 'negotiable' &&
    (priceCents !== undefined ||
      couponFields.some(couponField => couponField !== undefined))
  ) {
    throwInvalidOrderRequest('Platform negotiable order cannot include prices');
  }

  if (
    pricingMode === 'fixed' &&
    couponFields.some(couponField => couponField !== undefined) &&
    couponFields.some(couponField => couponField === undefined)
  ) {
    throwInvalidOrderRequest('Platform order coupon fields must be complete');
  }

  if (
    pricingMode === 'fixed' &&
    priceCents !== undefined &&
    couponDiscountCents !== undefined &&
    payablePriceCents !== undefined &&
    payablePriceCents !== priceCents - couponDiscountCents
  ) {
    throwInvalidOrderRequest('Platform order payable price is invalid');
  }

  const normalizedRequest: PlatformCreateShipperOrderRequest = {
    cargoType,
    weightText,
    ...(volumeText !== undefined ? { volumeText } : {}),
    quantityText,
    ...(cargoDescription !== undefined ? { cargoDescription } : {}),
    ...(cargoPhotoFileIds !== undefined
      ? {
          cargoPhotoCount: cargoPhotoFileIds.length,
          cargoPhotoFileIds,
        }
      : cargoPhotoCount !== undefined
        ? { cargoPhotoCount }
        : {}),
    pickupAddress,
    ...(pickupNoteText !== undefined ? { pickupNoteText } : {}),
    pickupContact,
    pickupPhone,
    deliveryAddress,
    ...(deliveryNoteText !== undefined ? { deliveryNoteText } : {}),
    deliveryContact,
    deliveryPhone,
    vehicleRequirement,
    ...(vehicleLengthText !== undefined ? { vehicleLengthText } : {}),
    needTailboard,
    needTarp,
    pickupTimeIso,
    ...(expectedDeliveryTimeText !== undefined
      ? { expectedDeliveryTimeText }
      : {}),
    ...(valueAddedServicesText !== undefined
      ? { valueAddedServicesText }
      : {}),
    pricingMode,
    ...(priceCents !== undefined ? { priceCents } : {}),
    paymentMethod,
    ...(couponId !== undefined ? { couponId } : {}),
    ...(couponTitle !== undefined ? { couponTitle } : {}),
    ...(couponDiscountCents !== undefined ? { couponDiscountCents } : {}),
    ...(payablePriceCents !== undefined ? { payablePriceCents } : {}),
  };

  return normalizedRequest;
}

function normalizeRequiredOrderString(value: unknown, fieldName: string) {
  if (typeof value !== 'string') {
    throwInvalidOrderRequest(`Platform order ${fieldName} must be a string`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throwInvalidOrderRequest(`Platform order ${fieldName} is required`);
  }

  return normalizedValue;
}

function normalizeOptionalOrderString(
  value: unknown,
  fieldName: string,
  maxLength: number,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidOrderRequest(`Platform order ${fieldName} must be a string`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > maxLength) {
    throwInvalidOrderRequest(`Platform order ${fieldName} is invalid`);
  }

  return normalizedValue;
}

function normalizeOptionalOrderTrimmedString(
  value: unknown,
  fieldName: string,
) {
  const normalizedValue = normalizeOptionalOrderString(value, fieldName, Infinity);

  return normalizedValue ? normalizedValue : undefined;
}

function normalizeOptionalOrderInteger(
  value: unknown,
  fieldName: string,
  minValue: number,
  maxValue = Infinity,
) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minValue ||
    value > maxValue
  ) {
    throwInvalidOrderRequest(`Platform order ${fieldName} is invalid`);
  }

  return value;
}

function normalizeOrderPhone(value: unknown, fieldName: string) {
  const normalizedValue = normalizeRequiredOrderString(value, fieldName);

  if (!PLATFORM_ORDER_PHONE_PATTERN.test(normalizedValue)) {
    throwInvalidOrderRequest(`Platform order ${fieldName} is invalid`);
  }

  return normalizedValue;
}

function normalizeOrderBoolean(value: unknown, fieldName: string) {
  if (typeof value !== 'boolean') {
    throwInvalidOrderRequest(`Platform order ${fieldName} must be a boolean`);
  }

  return value;
}

function normalizeOrderDateTime(value: unknown, fieldName: string) {
  const normalizedValue = normalizeRequiredOrderString(value, fieldName);

  if (Number.isNaN(Date.parse(normalizedValue))) {
    throwInvalidOrderRequest(`Platform order ${fieldName} is invalid`);
  }

  return normalizedValue;
}

function normalizeOrderEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: T[],
) {
  if (!allowedValues.includes(value as T)) {
    throwInvalidOrderRequest(`Platform order ${fieldName} is invalid`);
  }

  return value as T;
}

function throwInvalidOrderRequest(message: string): never {
  throw new PlatformApiError(message, 'PLATFORM_ORDER_REQUEST_INVALID', 0);
}

function normalizeCancelOrderRequest(
  request: PlatformCancelShipperOrderRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order cancel request must be an object',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  const reasonTextInput = request.reasonText as unknown;

  if (typeof reasonTextInput !== 'string') {
    throw new PlatformApiError(
      'Platform order cancel reason must be a string',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  const reasonText = reasonTextInput.trim();

  if (!reasonText || reasonText.length > 50) {
    throw new PlatformApiError(
      'Platform order cancel reason is invalid',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  const descriptionInput = request.description as unknown;

  if (
    descriptionInput !== undefined &&
    typeof descriptionInput !== 'string'
  ) {
    throw new PlatformApiError(
      'Platform order cancel description must be a string',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  const description = descriptionInput?.trim();

  if (description && description.length > 200) {
    throw new PlatformApiError(
      'Platform order cancel description is invalid',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  return description ? { reasonText, description } : { reasonText };
}

function assertValidAdvanceOrderStatusRequest(
  request: PlatformAdvanceShipperOrderStatusRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order status request must be an object',
      'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
      0,
    );
  }

  if (
    !PLATFORM_SHIPPER_ORDER_ADVANCE_STATUSES.includes(request.nextStatus)
  ) {
    throw new PlatformApiError(
      'Platform order status request nextStatus is invalid',
      'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
      0,
    );
  }
}

function normalizeReportExceptionRequest(
  request: PlatformReportShipperOrderExceptionRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order exception request must be an object',
      'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
      0,
    );
  }

  const typeLabelInput = request.typeLabel as unknown;

  if (typeof typeLabelInput !== 'string') {
    throw new PlatformApiError(
      'Platform order exception typeLabel must be a string',
      'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
      0,
    );
  }

  const typeLabel = typeLabelInput.trim();

  if (!typeLabel || typeLabel.length > 30) {
    throw new PlatformApiError(
      'Platform order exception typeLabel is invalid',
      'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
      0,
    );
  }

  const descriptionInput = request.description as unknown;

  if (typeof descriptionInput !== 'string') {
    throw new PlatformApiError(
      'Platform order exception description must be a string',
      'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
      0,
    );
  }

  const description = descriptionInput.trim();

  if (description.length < 6 || description.length > 200) {
    throw new PlatformApiError(
      'Platform order exception description is invalid',
      'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
      0,
    );
  }

  const photoCount = request.photoCount as unknown;

  if (
    photoCount !== undefined &&
    (typeof photoCount !== 'number' ||
      !Number.isInteger(photoCount) ||
      photoCount < 0 ||
      photoCount > 6)
  ) {
    throw new PlatformApiError(
      'Platform order exception photoCount is invalid',
      'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
      0,
    );
  }
  const photoFileIds = normalizeOptionalOrderFileIds(
    request.photoFileIds,
    'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID',
  );

  return {
    typeLabel,
    description,
    ...(photoCount === undefined ? {} : { photoCount }),
    ...(photoFileIds === undefined ? {} : { photoFileIds }),
  };
}

function normalizeSubmitChangeRequest(
  request: PlatformSubmitShipperOrderChangeRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order change request must be an object',
      'PLATFORM_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  const descriptionInput = request.description as unknown;

  if (typeof descriptionInput !== 'string') {
    throw new PlatformApiError(
      'Platform order change request description must be a string',
      'PLATFORM_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  const description = descriptionInput.trim();

  if (!description || description.length > 200) {
    throw new PlatformApiError(
      'Platform order change request description is invalid',
      'PLATFORM_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  return { description };
}

function normalizeSubmitEvaluationRequest(
  request: PlatformSubmitShipperOrderEvaluationRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order evaluation request must be an object',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }

  if (
    typeof request.rating !== 'number' ||
    !Number.isInteger(request.rating) ||
    request.rating < 1 ||
    request.rating > 5
  ) {
    throw new PlatformApiError(
      'Platform order evaluation rating is invalid',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }

  const tagsInput = request.tags as unknown;

  if (!Array.isArray(tagsInput) || tagsInput.length < 1 || tagsInput.length > 6) {
    throw new PlatformApiError(
      'Platform order evaluation tags are invalid',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }

  const tags = tagsInput.map(tag => {
    if (typeof tag !== 'string') {
      throw new PlatformApiError(
        'Platform order evaluation tags must be strings',
        'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
        0,
      );
    }

    const normalizedTag = tag.trim();

    if (!normalizedTag) {
      throw new PlatformApiError(
        'Platform order evaluation tags are invalid',
        'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
        0,
      );
    }

    return normalizedTag;
  });

  const contentInput = request.content as unknown;

  if (typeof contentInput !== 'string') {
    throw new PlatformApiError(
      'Platform order evaluation content must be a string',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }

  const content = contentInput.trim();

  if (content.length < 6 || content.length > 200) {
    throw new PlatformApiError(
      'Platform order evaluation content is invalid',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }

  const anonymous = request.anonymous as unknown;

  if (anonymous !== undefined && typeof anonymous !== 'boolean') {
    throw new PlatformApiError(
      'Platform order evaluation anonymous must be a boolean',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }

  const photoCount = request.photoCount as unknown;

  if (
    photoCount !== undefined &&
    (typeof photoCount !== 'number' ||
      !Number.isInteger(photoCount) ||
      photoCount < 0 ||
      photoCount > 6)
  ) {
    throw new PlatformApiError(
      'Platform order evaluation photoCount is invalid',
      'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
      0,
    );
  }
  const photoFileIds = normalizeOptionalOrderFileIds(
    request.photoFileIds,
    'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
  );

  return {
    rating: request.rating,
    tags: Array.from(new Set(tags)),
    content,
    ...(anonymous === undefined ? {} : { anonymous }),
    ...(photoCount === undefined ? {} : { photoCount }),
    ...(photoFileIds === undefined ? {} : { photoFileIds }),
  };
}

function normalizeOptionalOrderFileIds(
  value: unknown,
  errorCode:
    | 'PLATFORM_ORDER_REQUEST_INVALID'
    | 'PLATFORM_ORDER_EXCEPTION_REQUEST_INVALID'
    | 'PLATFORM_ORDER_EVALUATION_REQUEST_INVALID',
) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 6) {
    throw new PlatformApiError(
      'Platform order photoFileIds are invalid',
      errorCode,
      0,
    );
  }

  const normalizedFileIds = value.map(fileId => {
    if (typeof fileId !== 'string') {
      throw new PlatformApiError(
        'Platform order photoFileIds must be strings',
        errorCode,
        0,
      );
    }

    const normalizedFileId = fileId.trim();

    if (!normalizedFileId || normalizedFileId.length > 120) {
      throw new PlatformApiError(
        'Platform order photoFileIds are invalid',
        errorCode,
        0,
      );
    }

    return normalizedFileId;
  });

  return Array.from(new Set(normalizedFileIds));
}

function assertValidListOrdersQuery(query: PlatformListShipperOrdersQuery) {
  const queryInput = query as unknown;

  if (
    queryInput === null ||
    typeof queryInput !== 'object' ||
    Array.isArray(queryInput)
  ) {
    throw new PlatformApiError(
      'Platform order list query must be an object',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (
    query.status !== undefined &&
    !isPlatformShipperOrderStatus(query.status)
  ) {
    throw new PlatformApiError(
      'Platform order list status is invalid',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (query.statuses !== undefined && !Array.isArray(query.statuses)) {
    throw new PlatformApiError(
      'Platform order list statuses must be an array',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (query.statuses?.some(status => !isPlatformShipperOrderStatus(status))) {
    throw new PlatformApiError(
      'Platform order list statuses include an invalid status',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (query.status && query.statuses?.length) {
    throw new PlatformApiError(
      'Platform order list query cannot include both status and statuses',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  const keywordInput = query.keyword as unknown;

  if (keywordInput !== undefined && typeof keywordInput !== 'string') {
    throw new PlatformApiError(
      'Platform order list keyword must be a string',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  const keyword = normalizeListOrdersKeyword(query.keyword);

  if (keyword && keyword.length > 100) {
    throw new PlatformApiError(
      'Platform order list keyword must be 100 characters or fewer',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  const createdFromInput = query.createdFromIso as unknown;
  const createdToInput = query.createdToIso as unknown;

  if (
    createdFromInput !== undefined &&
    typeof createdFromInput !== 'string'
  ) {
    throw new PlatformApiError(
      'Platform order list created time query must be strings',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (createdToInput !== undefined && typeof createdToInput !== 'string') {
    throw new PlatformApiError(
      'Platform order list created time query must be strings',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (
    query.page !== undefined &&
    (!Number.isInteger(query.page) || query.page < 1)
  ) {
    throw new PlatformApiError(
      'Platform order list page must be a positive integer',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (
    query.pageSize !== undefined &&
    (!Number.isInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 50)
  ) {
    throw new PlatformApiError(
      'Platform order list pageSize must be an integer from 1 to 50',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  const createdFromTime =
    normalizeListOrdersDateTime(query.createdFromIso);
  const createdToTime =
    normalizeListOrdersDateTime(query.createdToIso);

  if (
    Number.isNaN(createdFromTime?.time) ||
    Number.isNaN(createdToTime?.time)
  ) {
    throw new PlatformApiError(
      'Platform order list created time query must be parseable',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }

  if (
    createdFromTime !== undefined &&
    createdToTime !== undefined &&
    createdFromTime.time >= createdToTime.time
  ) {
    throw new PlatformApiError(
      'Platform order list createdFromIso must be earlier than createdToIso',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }
}

function isPlatformShipperOrderStatus(
  value: unknown,
): value is PlatformShipperOrderStatus {
  return PLATFORM_SHIPPER_ORDER_STATUSES.includes(
    value as PlatformShipperOrderStatus,
  );
}

function normalizeListOrdersKeyword(keyword: string | undefined) {
  const trimmedKeyword = keyword?.trim();

  return trimmedKeyword ? trimmedKeyword : undefined;
}

function normalizeListOrdersStatuses(
  statuses: PlatformShipperOrderStatus[] | undefined,
) {
  return statuses ? Array.from(new Set(statuses)) : undefined;
}

function normalizeListOrdersDateTime(dateTimeIso: string | undefined) {
  const value = dateTimeIso?.trim();

  return value ? { value, time: Date.parse(value) } : undefined;
}

function createListOrdersPath(query: PlatformListShipperOrdersQuery) {
  const searchParams = new URLSearchParams();
  const keyword = normalizeListOrdersKeyword(query.keyword);
  const statuses = normalizeListOrdersStatuses(query.statuses);
  const createdFromTime = normalizeListOrdersDateTime(query.createdFromIso);
  const createdToTime = normalizeListOrdersDateTime(query.createdToIso);

  if (query.status) {
    searchParams.set('status', query.status);
  }

  if (statuses?.length) {
    searchParams.set('statuses', statuses.join(','));
  }

  if (keyword) {
    searchParams.set('keyword', keyword);
  }

  if (createdFromTime) {
    searchParams.set('createdFromIso', createdFromTime.value);
  }

  if (createdToTime) {
    searchParams.set('createdToIso', createdToTime.value);
  }

  if (query.page !== undefined) {
    searchParams.set('page', String(query.page));
  }

  if (query.pageSize !== undefined) {
    searchParams.set('pageSize', String(query.pageSize));
  }

  const queryString = searchParams.toString();

  return queryString ? `/shipper/orders?${queryString}` : '/shipper/orders';
}

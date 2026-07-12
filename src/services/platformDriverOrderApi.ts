import {
  PlatformApiError,
  platformGet,
  platformPost,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';
import type {
  PlatformOrderExceptionCaseListResult,
  PlatformShipperOrder,
  PlatformShipperOrderStatus,
} from './platformOrderApi';

export type PlatformDriverOrderHallQuery = {
  page?: number;
  pageSize?: number;
};

export type PlatformDriverOrderHallResult = {
  items: PlatformShipperOrder[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformDriverExecutingOrderStatus = Extract<
  PlatformShipperOrderStatus,
  'loading' | 'transporting' | 'confirming'
>;

export type PlatformDriverMyOrdersQuery = {
  statuses?: PlatformDriverExecutingOrderStatus[];
  page?: number;
  pageSize?: number;
};

export type PlatformDriverWithdrawalsQuery = {
  page?: number;
  pageSize?: number;
};

export type PlatformDriverQuoteOrderRequest = {
  quoteCents: number;
  arrivalText: string;
  noteText?: string;
};

export type PlatformDriverAcceptOrderRequest = {
  noteText?: string;
};

export type PlatformDriverAdvanceOrderStatusRequest = {
  nextStatus: Extract<
    PlatformDriverExecutingOrderStatus,
    'transporting' | 'confirming'
  >;
  receiptPhotoFileIds?: string[];
};

export type PlatformDriverReplyEvaluationRequest = {
  content: string;
};

export type PlatformDriverReportExceptionRequest = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFileIds?: string[];
};

export type PlatformDriverEvaluateShipperRequest = {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
};

export type PlatformDriverIncomeRecord = {
  orderId: string;
  orderNo: string;
  completedAtIso: string;
  routeText: string;
  vehicleType: string;
  grossAmountCents: number;
  platformFeeCents: number;
  netIncomeCents: number;
};

export type PlatformDriverIncomeSummary = {
  todayIncomeCents: number;
  weekIncomeCents: number;
  monthIncomeCents: number;
  historyIncomeCents: number;
  pendingSettlementCents: number;
  availableWithdrawalCents: number;
  reviewingWithdrawalCents: number;
  completedOrderCount: number;
};

export type PlatformDriverIncomeOverview = {
  driverId: string;
  summary: PlatformDriverIncomeSummary;
  records: PlatformDriverIncomeRecord[];
};

export type PlatformCreateDriverWithdrawalRequest = {
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
};

export type PlatformDriverWithdrawalStatus = 'reviewing' | 'paid' | 'rejected';

export type PlatformDriverWithdrawalRecord = {
  id: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  status: PlatformDriverWithdrawalStatus;
  rejectionReason?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformDriverWithdrawalsResult = {
  items: PlatformDriverWithdrawalRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformSaveDriverAcceptanceSettingsRequest = {
  isOnline: boolean;
  maxDistanceKm: number;
  vehicleTypePreferences: string[];
};

export type PlatformDriverAcceptanceSettings =
  PlatformSaveDriverAcceptanceSettingsRequest & {
    driverId: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

const DRIVER_EXECUTING_ORDER_STATUSES: PlatformDriverExecutingOrderStatus[] = [
  'loading',
  'transporting',
  'confirming',
];

const DRIVER_ADVANCE_ORDER_STATUSES: PlatformDriverAdvanceOrderStatusRequest['nextStatus'][] = [
  'transporting',
  'confirming',
];

export function createPlatformDriverOrderApi(config: PlatformApiConfig) {
  return {
    async listOrderHall(query: PlatformDriverOrderHallQuery = {}) {
      return platformGet<PlatformDriverOrderHallResult>(
        config,
        createOrderHallPath(query),
      );
    },
    async listMyOrders(query: PlatformDriverMyOrdersQuery = {}) {
      return platformGet<PlatformDriverOrderHallResult>(
        config,
        createMyOrdersPath(query),
      );
    },
    getIncomeOverview() {
      return platformGet<PlatformDriverIncomeOverview>(config, '/driver/income');
    },
    async listWithdrawals(query: PlatformDriverWithdrawalsQuery = {}) {
      return platformGet<PlatformDriverWithdrawalsResult>(
        config,
        createWithdrawalsPath(query),
      );
    },
    async createWithdrawal(request: PlatformCreateDriverWithdrawalRequest) {
      return platformPost<
        PlatformCreateDriverWithdrawalRequest,
        PlatformDriverWithdrawalRecord
      >(
        config,
        '/driver/withdrawals',
        normalizeDriverWithdrawalRequest(request),
      );
    },
    getAcceptanceSettings() {
      return platformGet<PlatformDriverAcceptanceSettings>(
        config,
        '/driver/settings/acceptance',
      );
    },
    async saveAcceptanceSettings(
      request: PlatformSaveDriverAcceptanceSettingsRequest,
    ) {
      return platformPut<
        PlatformSaveDriverAcceptanceSettingsRequest,
        PlatformDriverAcceptanceSettings
      >(
        config,
        '/driver/settings/acceptance',
        normalizeDriverAcceptanceSettingsRequest(request),
      );
    },
    async getOrder(orderId: string) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);

      return platformGet<PlatformShipperOrder>(
        config,
        `/driver/orders/${normalizedOrderId}`,
      );
    },
    async listExceptionCases(orderId: string) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);

      return platformGet<PlatformOrderExceptionCaseListResult>(
        config,
        `/driver/orders/${normalizedOrderId}/exception-cases`,
      );
    },
    async quoteOrder(orderId: string, request: PlatformDriverQuoteOrderRequest) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);
      const normalizedRequest = normalizeDriverQuoteOrderRequest(request);

      return platformPost<
        PlatformDriverQuoteOrderRequest,
        PlatformShipperOrder
      >(
        config,
        `/driver/orders/${normalizedOrderId}/quote`,
        normalizedRequest,
      );
    },
    async acceptOrder(
      orderId: string,
      request: PlatformDriverAcceptOrderRequest = {},
    ) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);
      const normalizedRequest = normalizeDriverAcceptOrderRequest(request);

      return platformPost<
        PlatformDriverAcceptOrderRequest,
        PlatformShipperOrder
      >(
        config,
        `/driver/orders/${normalizedOrderId}/accept`,
        normalizedRequest,
      );
    },
    async advanceOrderStatus(
      orderId: string,
      request: PlatformDriverAdvanceOrderStatusRequest,
    ) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);
      const normalizedRequest = normalizeDriverAdvanceOrderStatusRequest(request);

      return platformPost<
        PlatformDriverAdvanceOrderStatusRequest,
        PlatformShipperOrder
      >(
        config,
        `/driver/orders/${normalizedOrderId}/status`,
        normalizedRequest,
      );
    },
    async replyToEvaluation(
      orderId: string,
      request: PlatformDriverReplyEvaluationRequest,
    ) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);
      const normalizedRequest = normalizeDriverReplyEvaluationRequest(request);

      return platformPost<
        PlatformDriverReplyEvaluationRequest,
        PlatformShipperOrder
      >(
        config,
        `/driver/orders/${normalizedOrderId}/evaluation-reply`,
        normalizedRequest,
      );
    },
    async reportException(
      orderId: string,
      request: PlatformDriverReportExceptionRequest,
    ) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);
      const normalizedRequest = normalizeDriverReportExceptionRequest(request);

      return platformPost<
        PlatformDriverReportExceptionRequest,
        PlatformShipperOrder
      >(
        config,
        `/driver/orders/${normalizedOrderId}/exception`,
        normalizedRequest,
      );
    },
    async evaluateShipper(
      orderId: string,
      request: PlatformDriverEvaluateShipperRequest,
    ) {
      const normalizedOrderId = normalizeDriverOrderId(orderId);
      const normalizedRequest = normalizeDriverEvaluateShipperRequest(request);

      return platformPost<
        PlatformDriverEvaluateShipperRequest,
        PlatformShipperOrder
      >(
        config,
        `/driver/orders/${normalizedOrderId}/shipper-evaluation`,
        normalizedRequest,
      );
    },
  };
}

function createOrderHallPath(query: PlatformDriverOrderHallQuery) {
  const searchParams = new URLSearchParams();

  if (query.page !== undefined) {
    assertPositiveInteger(query.page, 'page');
    searchParams.set('page', String(query.page));
  }

  if (query.pageSize !== undefined) {
    assertPositiveInteger(query.pageSize, 'pageSize');

    if (query.pageSize > 50) {
      throw new PlatformApiError(
        'Platform driver pageSize is invalid',
        'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
        0,
      );
    }

    searchParams.set('pageSize', String(query.pageSize));
  }

  const queryString = searchParams.toString();

  return queryString ? `/driver/order-hall?${queryString}` : '/driver/order-hall';
}

function createMyOrdersPath(query: PlatformDriverMyOrdersQuery) {
  const searchParams = new URLSearchParams();

  if (query.statuses !== undefined) {
    assertValidDriverExecutingStatuses(query.statuses);
    searchParams.set('statuses', query.statuses.join(','));
  }

  if (query.page !== undefined) {
    assertPositiveInteger(query.page, 'page');
    searchParams.set('page', String(query.page));
  }

  if (query.pageSize !== undefined) {
    assertPositiveInteger(query.pageSize, 'pageSize');

    if (query.pageSize > 50) {
      throw new PlatformApiError(
        'Platform driver pageSize is invalid',
        'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
        0,
      );
    }

    searchParams.set('pageSize', String(query.pageSize));
  }

  const queryString = searchParams.toString();

  return queryString ? `/driver/orders?${queryString}` : '/driver/orders';
}

function createWithdrawalsPath(query: PlatformDriverWithdrawalsQuery) {
  const searchParams = new URLSearchParams();

  if (query.page !== undefined) {
    assertPositiveInteger(query.page, 'page', 'PLATFORM_DRIVER_WITHDRAWALS_QUERY_INVALID');
    searchParams.set('page', String(query.page));
  }

  if (query.pageSize !== undefined) {
    assertPositiveInteger(
      query.pageSize,
      'pageSize',
      'PLATFORM_DRIVER_WITHDRAWALS_QUERY_INVALID',
    );

    if (query.pageSize > 50) {
      throw new PlatformApiError(
        'Platform driver withdrawals pageSize is invalid',
        'PLATFORM_DRIVER_WITHDRAWALS_QUERY_INVALID',
        0,
      );
    }

    searchParams.set('pageSize', String(query.pageSize));
  }

  const queryString = searchParams.toString();

  return queryString ? `/driver/withdrawals?${queryString}` : '/driver/withdrawals';
}

function normalizeDriverOrderId(orderId: string) {
  const orderIdInput = orderId as unknown;

  if (typeof orderIdInput !== 'string') {
    throw new PlatformApiError(
      'Platform driver order id must be a string',
      'PLATFORM_DRIVER_ORDER_ID_INVALID',
      0,
    );
  }

  const normalizedOrderId = orderIdInput.trim();

  if (!normalizedOrderId) {
    throw new PlatformApiError(
      'Platform driver order id is required',
      'PLATFORM_DRIVER_ORDER_ID_INVALID',
      0,
    );
  }

  return normalizedOrderId;
}

function normalizeDriverQuoteOrderRequest(
  request: PlatformDriverQuoteOrderRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidQuoteRequest('Platform driver quote request must be an object');
  }

  if (
    typeof request.quoteCents !== 'number' ||
    !Number.isInteger(request.quoteCents) ||
    request.quoteCents <= 0
  ) {
    throwInvalidQuoteRequest('Platform driver quoteCents is invalid');
  }

  const arrivalText = normalizeRequiredDriverString(
    request.arrivalText,
    'arrivalText',
    'PLATFORM_DRIVER_ORDER_QUOTE_INVALID',
    50,
  );
  const noteText = normalizeOptionalDriverString(
    request.noteText,
    'noteText',
    'PLATFORM_DRIVER_ORDER_QUOTE_INVALID',
    200,
  );

  return {
    quoteCents: request.quoteCents,
    arrivalText,
    ...(noteText === undefined ? {} : { noteText }),
  };
}

function normalizeDriverAcceptOrderRequest(
  request: PlatformDriverAcceptOrderRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform driver accept request must be an object',
      'PLATFORM_DRIVER_ORDER_ACCEPT_INVALID',
      0,
    );
  }

  const noteText = normalizeOptionalDriverString(
    request.noteText,
    'noteText',
    'PLATFORM_DRIVER_ORDER_ACCEPT_INVALID',
    200,
  );

  return noteText === undefined ? {} : { noteText };
}

function normalizeDriverAdvanceOrderStatusRequest(
  request: PlatformDriverAdvanceOrderStatusRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidStatusRequest('Platform driver status request must be an object');
  }

  if (!DRIVER_ADVANCE_ORDER_STATUSES.includes(request.nextStatus)) {
    throwInvalidStatusRequest('Platform driver nextStatus is invalid');
  }

  const receiptPhotoFileIds = normalizeOptionalDriverFileIds(
    request.receiptPhotoFileIds,
    'PLATFORM_DRIVER_ORDER_STATUS_INVALID',
  );

  return {
    nextStatus: request.nextStatus,
    ...(receiptPhotoFileIds === undefined ? {} : { receiptPhotoFileIds }),
  };
}

function normalizeDriverReplyEvaluationRequest(
  request: PlatformDriverReplyEvaluationRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidEvaluationReplyRequest(
      'Platform driver evaluation reply request must be an object',
    );
  }

  const content = normalizeRequiredDriverString(
    request.content,
    'content',
    'PLATFORM_DRIVER_EVALUATION_REPLY_INVALID',
    200,
  );

  return { content };
}

function normalizeDriverReportExceptionRequest(
  request: PlatformDriverReportExceptionRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidExceptionRequest(
      'Platform driver exception request must be an object',
    );
  }

  const typeLabel = normalizeRequiredDriverString(
    request.typeLabel,
    'typeLabel',
    'PLATFORM_DRIVER_ORDER_EXCEPTION_INVALID',
    30,
  );
  const description = normalizeRequiredDriverString(
    request.description,
    'description',
    'PLATFORM_DRIVER_ORDER_EXCEPTION_INVALID',
    200,
  );

  if (description.length < 6) {
    throwInvalidExceptionRequest(
      'Platform driver exception description is too short',
    );
  }

  if (
    request.photoCount !== undefined &&
    (typeof request.photoCount !== 'number' ||
      !Number.isInteger(request.photoCount) ||
      request.photoCount < 0 ||
      request.photoCount > 6)
  ) {
    throwInvalidExceptionRequest('Platform driver exception photoCount is invalid');
  }

  const photoFileIds = normalizeOptionalExceptionPhotoFileIds(
    request.photoFileIds,
  );

  return {
    typeLabel,
    description,
    ...(request.photoCount === undefined ? {} : { photoCount: request.photoCount }),
    ...(photoFileIds === undefined ? {} : { photoFileIds }),
  };
}

function normalizeDriverEvaluateShipperRequest(
  request: PlatformDriverEvaluateShipperRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidShipperEvaluationRequest(
      'Platform driver shipper evaluation request must be an object',
    );
  }

  if (
    typeof request.rating !== 'number' ||
    !Number.isInteger(request.rating) ||
    request.rating < 1 ||
    request.rating > 5
  ) {
    throwInvalidShipperEvaluationRequest(
      'Platform driver shipper evaluation rating is invalid',
    );
  }

  if (!Array.isArray(request.tags) || request.tags.length === 0 || request.tags.length > 6) {
    throwInvalidShipperEvaluationRequest(
      'Platform driver shipper evaluation tags are invalid',
    );
  }

  const tags = Array.from(
    new Set(
      request.tags.map(tag =>
        normalizeRequiredDriverString(
          tag,
          'tags',
          'PLATFORM_DRIVER_SHIPPER_EVALUATION_INVALID',
          40,
        ),
      ),
    ),
  );
  const content = normalizeRequiredDriverString(
    request.content,
    'content',
    'PLATFORM_DRIVER_SHIPPER_EVALUATION_INVALID',
    200,
  );

  if (content.length < 6) {
    throwInvalidShipperEvaluationRequest(
      'Platform driver shipper evaluation content is too short',
    );
  }

  if (request.anonymous !== undefined && typeof request.anonymous !== 'boolean') {
    throwInvalidShipperEvaluationRequest(
      'Platform driver shipper evaluation anonymous is invalid',
    );
  }

  return {
    rating: request.rating,
    tags,
    content,
    ...(request.anonymous === undefined ? {} : { anonymous: request.anonymous }),
  };
}

function normalizeDriverAcceptanceSettingsRequest(
  request: PlatformSaveDriverAcceptanceSettingsRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidAcceptanceSettingsRequest(
      'Platform driver acceptance settings request must be an object',
    );
  }

  if (typeof request.isOnline !== 'boolean') {
    throwInvalidAcceptanceSettingsRequest('Platform driver isOnline is invalid');
  }

  if (
    typeof request.maxDistanceKm !== 'number' ||
    !Number.isInteger(request.maxDistanceKm) ||
    request.maxDistanceKm < 1 ||
    request.maxDistanceKm > 500
  ) {
    throwInvalidAcceptanceSettingsRequest(
      'Platform driver maxDistanceKm is invalid',
    );
  }

  if (
    !Array.isArray(request.vehicleTypePreferences) ||
    request.vehicleTypePreferences.length > 10
  ) {
    throwInvalidAcceptanceSettingsRequest(
      'Platform driver vehicleTypePreferences are invalid',
    );
  }

  return {
    isOnline: request.isOnline,
    maxDistanceKm: request.maxDistanceKm,
    vehicleTypePreferences: Array.from(
      new Set(
        request.vehicleTypePreferences.map(vehicleType =>
          normalizeRequiredDriverString(
            vehicleType,
            'vehicleTypePreferences',
            'PLATFORM_DRIVER_ACCEPTANCE_SETTINGS_INVALID',
            40,
          ),
        ),
      ),
    ),
  };
}

function normalizeDriverWithdrawalRequest(
  request: PlatformCreateDriverWithdrawalRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throwInvalidWithdrawalRequest(
      'Platform driver withdrawal request must be an object',
    );
  }

  if (
    typeof request.amountCents !== 'number' ||
    !Number.isInteger(request.amountCents) ||
    request.amountCents < 100
  ) {
    throwInvalidWithdrawalRequest('Platform driver amountCents is invalid');
  }

  const bankAccountName = normalizeRequiredDriverString(
    request.bankAccountName,
    'bankAccountName',
    'PLATFORM_DRIVER_WITHDRAWAL_REQUEST_INVALID',
    30,
  );
  const bankName = normalizeRequiredDriverString(
    request.bankName,
    'bankName',
    'PLATFORM_DRIVER_WITHDRAWAL_REQUEST_INVALID',
    50,
  );
  const bankAccountNo = normalizeRequiredDriverString(
    request.bankAccountNo,
    'bankAccountNo',
    'PLATFORM_DRIVER_WITHDRAWAL_REQUEST_INVALID',
    40,
  ).replace(/\s+/g, '');

  if (bankAccountName.length < 2) {
    throwInvalidWithdrawalRequest(
      'Platform driver bankAccountName is invalid',
    );
  }

  if (bankName.length < 2) {
    throwInvalidWithdrawalRequest('Platform driver bankName is invalid');
  }

  if (!/^\d{10,30}$/.test(bankAccountNo)) {
    throwInvalidWithdrawalRequest('Platform driver bankAccountNo is invalid');
  }

  return {
    amountCents: request.amountCents,
    bankAccountName,
    bankName,
    bankAccountNo,
  };
}

function normalizeOptionalDriverFileIds(
  value: unknown,
  errorCode: 'PLATFORM_DRIVER_ORDER_STATUS_INVALID',
) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 6) {
    throw new PlatformApiError(
      'Platform driver receiptPhotoFileIds are invalid',
      errorCode,
      0,
    );
  }

  return Array.from(
    new Set(
      value.map(fileId => {
        if (typeof fileId !== 'string') {
          throw new PlatformApiError(
            'Platform driver receiptPhotoFileIds must be strings',
            errorCode,
            0,
          );
        }

        const normalizedFileId = fileId.trim();

        if (!normalizedFileId || normalizedFileId.length > 120) {
          throw new PlatformApiError(
            'Platform driver receiptPhotoFileIds are invalid',
            errorCode,
            0,
          );
        }

        return normalizedFileId;
      }),
    ),
  );
}

function normalizeOptionalExceptionPhotoFileIds(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 6) {
    throwInvalidExceptionRequest(
      'Platform driver exception photoFileIds are invalid',
    );
  }

  return Array.from(
    new Set(
      value.map(fileId => {
        if (typeof fileId !== 'string') {
          throwInvalidExceptionRequest(
            'Platform driver exception photoFileIds must be strings',
          );
        }

        const normalizedFileId = fileId.trim();

        if (!normalizedFileId || normalizedFileId.length > 120) {
          throwInvalidExceptionRequest(
            'Platform driver exception photoFileIds are invalid',
          );
        }

        return normalizedFileId;
      }),
    ),
  );
}

function assertValidDriverExecutingStatuses(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PlatformApiError(
      'Platform driver statuses are invalid',
      'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
      0,
    );
  }

  const uniqueStatuses = new Set(value);

  if (
    uniqueStatuses.size !== value.length ||
    !value.every(status => DRIVER_EXECUTING_ORDER_STATUSES.includes(status))
  ) {
    throw new PlatformApiError(
      'Platform driver statuses are invalid',
      'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
      0,
    );
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
  errorCode:
    | 'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID'
    | 'PLATFORM_DRIVER_WITHDRAWALS_QUERY_INVALID' =
    'PLATFORM_DRIVER_ORDER_HALL_QUERY_INVALID',
) {
  if (!Number.isInteger(value) || value < 1) {
    throw new PlatformApiError(
      `Platform driver ${fieldName} is invalid`,
      errorCode,
      0,
    );
  }
}

function normalizeRequiredDriverString(
  value: unknown,
  fieldName: string,
  errorCode: string,
  maxLength: number,
) {
  if (typeof value !== 'string') {
    throw new PlatformApiError(
      `Platform driver ${fieldName} must be a string`,
      errorCode,
      0,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue || normalizedValue.length > maxLength) {
    throw new PlatformApiError(
      `Platform driver ${fieldName} is invalid`,
      errorCode,
      0,
    );
  }

  return normalizedValue;
}

function normalizeOptionalDriverString(
  value: unknown,
  fieldName: string,
  errorCode: string,
  maxLength: number,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new PlatformApiError(
      `Platform driver ${fieldName} must be a string`,
      errorCode,
      0,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > maxLength) {
    throw new PlatformApiError(
      `Platform driver ${fieldName} is invalid`,
      errorCode,
      0,
    );
  }

  return normalizedValue ? normalizedValue : undefined;
}

function throwInvalidQuoteRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_ORDER_QUOTE_INVALID',
    0,
  );
}

function throwInvalidStatusRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_ORDER_STATUS_INVALID',
    0,
  );
}

function throwInvalidEvaluationReplyRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_EVALUATION_REPLY_INVALID',
    0,
  );
}

function throwInvalidExceptionRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_ORDER_EXCEPTION_INVALID',
    0,
  );
}

function throwInvalidShipperEvaluationRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_SHIPPER_EVALUATION_INVALID',
    0,
  );
}

function throwInvalidAcceptanceSettingsRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_ACCEPTANCE_SETTINGS_INVALID',
    0,
  );
}

function throwInvalidWithdrawalRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_DRIVER_WITHDRAWAL_REQUEST_INVALID',
    0,
  );
}

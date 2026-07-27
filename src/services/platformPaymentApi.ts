import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

const PLATFORM_PAYMENT_IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_FINANCE_REQUEST_INVALID = 'PLATFORM_ADMIN_FINANCE_REQUEST_INVALID';

export type PlatformPaymentChannel = 'wechat' | 'alipay';
export type PlatformProviderPaymentChannel =
  | 'sandbox'
  | PlatformPaymentChannel;

export type PlatformPaymentStatus =
  | 'pending'
  | 'processing'
  | 'escrowed'
  | 'settled'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed';

export type PlatformPaymentRecord = {
  id: string;
  paymentNo: string;
  orderId: string;
  orderNo: string;
  shipperId: string;
  channel: PlatformProviderPaymentChannel;
  amountCents: number;
  status: PlatformPaymentStatus;
  clientPayload?: Record<string, unknown> | string;
  providerTradeNo?: string;
  failureCode?: string;
  failureMessage?: string;
  expiresAtIso: string;
  paidAtIso?: string;
  settledAtIso?: string;
  refundedAtIso?: string;
  cancelledAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformPaymentSdkResult = {
  status: 'succeeded' | 'cancelled' | 'failed';
  message?: string;
};

export type PlatformPaymentSdk = {
  openPayment(
    channel: PlatformPaymentChannel,
    clientPayload: Record<string, unknown> | string,
  ): Promise<PlatformPaymentSdkResult>;
};

export type PlatformAdminFinanceListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  orderId?: string;
};

export type PlatformAdminFinancePage<TItem> = {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminFinanceAmountBreakdownItem = {
  status: string;
  count: number;
  amountCents: number;
};

export type PlatformAdminFinanceCountBreakdownItem = {
  status: string;
  count: number;
};

export type PlatformAdminFinanceSettlementSummary = {
  count: number;
  grossAmountCents: number;
  platformFeeCents: number;
  driverNetAmountCents: number;
};

export type PlatformAdminFinanceReport = {
  generatedAtIso: string;
  summary: {
    paymentCount: number;
    paymentAmountCents: number;
    refundCount: number;
    refundAmountCents: number;
    settlementCount: number;
    settlementGrossAmountCents: number;
    settlementPlatformFeeCents: number;
    settlementDriverNetAmountCents: number;
    pendingWithdrawalCount: number;
    pendingWithdrawalAmountCents: number;
    deadRefundOutboxCount: number;
  };
  paymentStatusBreakdown: PlatformAdminFinanceAmountBreakdownItem[];
  refundStatusBreakdown: PlatformAdminFinanceAmountBreakdownItem[];
  withdrawalStatusBreakdown: PlatformAdminFinanceAmountBreakdownItem[];
  refundOutboxStatusBreakdown: PlatformAdminFinanceCountBreakdownItem[];
  settlementSummary: PlatformAdminFinanceSettlementSummary;
};

export type PlatformAdminFinanceReconciliationSeverity =
  | 'warning'
  | 'error';

export type PlatformAdminFinanceReconciliationFinding = {
  code: string;
  severity: PlatformAdminFinanceReconciliationSeverity;
  entityType: string;
  entityId: string;
  amountCents?: number;
  message: string;
};

export type PlatformAdminFinanceReconciliationReport = {
  generatedAtIso: string;
  summary: {
    findingCount: number;
    errorCount: number;
    warningCount: number;
  };
  findings: PlatformAdminFinanceReconciliationFinding[];
};

export type PlatformAdminFinanceOutboxEventStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'dead';

export type PlatformAdminFinanceOutboxEvent = {
  id: string;
  refundId?: string;
  status: PlatformAdminFinanceOutboxEventStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformAdminRefundStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed';

export type PlatformAdminFinancePaymentRecord = {
  id: string;
  paymentNo: string;
  orderId: string;
  shipperId: string;
  channel: PlatformProviderPaymentChannel;
  amountCents: number;
  status: PlatformPaymentStatus;
  providerTradeNo?: string;
  failureCode?: string;
  failureMessage?: string;
  expiresAtIso: string;
  paidAtIso?: string;
  settledAtIso?: string;
  cancelledAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformAdminFinanceRefundRecord = {
  id: string;
  refundNo: string;
  paymentOrderId: string;
  orderId: string;
  shipperId: string;
  channel: PlatformProviderPaymentChannel;
  amountCents: number;
  reason: string;
  status: PlatformAdminRefundStatus;
  providerRefundNo?: string;
  failureCode?: string;
  failureMessage?: string;
  processingStartedAtIso?: string;
  succeededAtIso?: string;
  failedAtIso?: string;
  financialTransactionId?: string;
  outboxEvent?: PlatformAdminFinanceOutboxEvent;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformAdminFinanceSettlementRecord = {
  id: string;
  orderId: string;
  paymentOrderId?: string;
  driverId: string;
  grossAmountCents: number;
  platformFeeRateBps: number;
  platformFeeCents: number;
  driverNetAmountCents: number;
  financialTransactionId: string;
  settledAtIso: string;
  createdAtIso: string;
};

export type PlatformAdminFinanceLedgerTransactionType =
  | 'online_payment_escrow'
  | 'online_order_settlement'
  | 'offline_order_settlement'
  | 'online_refund'
  | 'driver_withdrawal'
  | 'order_compensation';

export type PlatformAdminFinanceLedgerAccountType =
  | 'gateway_clearing'
  | 'platform_escrow'
  | 'driver_payable'
  | 'platform_revenue'
  | 'offline_clearing';

export type PlatformAdminFinanceLedgerDirection = 'debit' | 'credit';

export type PlatformAdminFinanceLedgerEntry = {
  id: string;
  transactionId: string;
  sequence: number;
  accountType: PlatformAdminFinanceLedgerAccountType;
  accountUserId?: string;
  direction: PlatformAdminFinanceLedgerDirection;
  amountCents: number;
  createdAtIso: string;
};

export type PlatformAdminFinanceLedgerTransaction = {
  id: string;
  transactionNo: string;
  type: PlatformAdminFinanceLedgerTransactionType;
  referenceId: string;
  orderId?: string;
  paymentOrderId?: string;
  amountCents: number;
  occurredAtIso: string;
  createdAtIso: string;
  entries: PlatformAdminFinanceLedgerEntry[];
};

export type PlatformAdminFinanceWithdrawalStatus =
  | 'reviewing'
  | 'paid'
  | 'rejected';

export type PlatformAdminFinanceWithdrawalRecord = {
  id: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
  status: PlatformAdminFinanceWithdrawalStatus;
  version: number;
  rejectionReason?: string;
  processedByAdminId?: string;
  processedAtIso?: string;
  payoutChannel?: PlatformProviderPaymentChannel;
  providerPayoutNo?: string;
  payoutExecutedAtIso?: string;
  financialTransactionId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformAdminDriverWalletRecord = {
  driverId: string;
  availableCents: number;
  reservedCents: number;
  withdrawnCents: number;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformAdminFinanceAuditLogRecord = {
  id: string;
  actorAdminId: string;
  action: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  reason: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  createdAtIso: string;
};

export type PlatformAdminFinanceRetryRefundRequest = {
  expectedVersion: number;
  reason: string;
};

export type PlatformAdminFinanceRetryRefundResult = {
  kind: 'success';
  replayed: boolean;
  refund: PlatformAdminFinanceRefundRecord;
  outboxEvent: PlatformAdminFinanceOutboxEvent;
  auditLog: PlatformAdminFinanceAuditLogRecord;
};

export type PlatformAdminFinanceReviewWithdrawalRequest = {
  expectedVersion: number;
  reason: string;
};

export type PlatformAdminFinanceReviewWithdrawalResult = {
  kind: 'success';
  replayed: boolean;
  withdrawal: PlatformAdminFinanceWithdrawalRecord;
  wallet: PlatformAdminDriverWalletRecord;
  financialTransaction?: PlatformAdminFinanceLedgerTransaction;
  auditLog: PlatformAdminFinanceAuditLogRecord;
};

export type PlatformAdminFinanceBatchReviewWithdrawalAction =
  | 'approve'
  | 'reject';

export type PlatformAdminFinanceBatchReviewWithdrawalItem = {
  withdrawalId: string;
  expectedVersion: number;
};

export type PlatformAdminFinanceBatchReviewWithdrawalsRequest = {
  items: PlatformAdminFinanceBatchReviewWithdrawalItem[];
  action: PlatformAdminFinanceBatchReviewWithdrawalAction;
  reason: string;
};

export type PlatformAdminFinanceBatchReviewWithdrawalsResult = {
  kind: 'success';
  replayed: boolean;
  action: PlatformAdminFinanceBatchReviewWithdrawalAction;
  withdrawalIds: string[];
  updatedCount: number;
  items: Array<{
    withdrawal: PlatformAdminFinanceWithdrawalRecord;
    wallet: PlatformAdminDriverWalletRecord;
    financialTransaction?: PlatformAdminFinanceLedgerTransaction;
  }>;
};

export function createSandboxPlatformPaymentSdk(): PlatformPaymentSdk {
  return {
    async openPayment() {
      return { status: 'succeeded' };
    },
  };
}

export function createPlatformPaymentApi(config: PlatformApiConfig) {
  return {
    createPayment(
      orderId: string,
      request: { channel: PlatformPaymentChannel },
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedKey = normalizePaymentIdempotencyKey(idempotencyKey);
      const channel = normalizePaymentChannel(request.channel);

      return platformPost<
        { channel: PlatformPaymentChannel },
        { replayed: boolean; payment: PlatformPaymentRecord }
      >(
        config,
        `/shipper/orders/${encodeURIComponent(normalizedOrderId)}/payments`,
        { channel },
        { headers: { 'Idempotency-Key': normalizedKey } },
      );
    },

    getLatestPayment(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);
      return platformGet<PlatformPaymentRecord>(
        config,
        `/shipper/orders/${encodeURIComponent(normalizedOrderId)}/payments`,
      );
    },
    getAdminFinanceReport() {
      return platformGet<PlatformAdminFinanceReport>(
        config,
        '/admin/finance/report',
      );
    },
    getAdminFinanceReconciliation() {
      return platformGet<PlatformAdminFinanceReconciliationReport>(
        config,
        '/admin/finance/reconciliation',
      );
    },
    listAdminPayments(query: PlatformAdminFinanceListQuery = {}) {
      return platformGet<PlatformAdminFinancePage<PlatformAdminFinancePaymentRecord>>(
        config,
        `/admin/finance/payments?${new URLSearchParams(
          normalizeAdminFinanceListQuery(query),
        ).toString()}`,
      );
    },
    getAdminPayment(paymentId: string) {
      return platformGet<PlatformAdminFinancePaymentRecord>(
        config,
        `/admin/finance/payments/${encodeURIComponent(
          normalizeAdminFinanceRecordId(paymentId, 'payment id'),
        )}`,
      );
    },
    listAdminRefunds(query: PlatformAdminFinanceListQuery = {}) {
      return platformGet<PlatformAdminFinancePage<PlatformAdminFinanceRefundRecord>>(
        config,
        `/admin/finance/refunds?${new URLSearchParams(
          normalizeAdminFinanceListQuery(query),
        ).toString()}`,
      );
    },
    getAdminRefund(refundId: string) {
      return platformGet<PlatformAdminFinanceRefundRecord>(
        config,
        `/admin/finance/refunds/${encodeURIComponent(
          normalizeAdminFinanceRecordId(refundId, 'refund id'),
        )}`,
      );
    },
    retryAdminRefund(
      refundId: string,
      request: PlatformAdminFinanceRetryRefundRequest,
      idempotencyKey: string,
    ) {
      return platformPost<
        PlatformAdminFinanceRetryRefundRequest,
        PlatformAdminFinanceRetryRefundResult
      >(
        config,
        `/admin/finance/refunds/${encodeURIComponent(
          normalizeAdminFinanceRecordId(refundId, 'refund id'),
        )}/retry`,
        normalizeAdminFinanceWriteRequest(request),
        createAdminFinanceMutationRequestOptions(
          normalizeAdminFinanceIdempotencyKey(idempotencyKey),
        ),
      );
    },
    listAdminSettlements(query: PlatformAdminFinanceListQuery = {}) {
      return platformGet<
        PlatformAdminFinancePage<PlatformAdminFinanceSettlementRecord>
      >(
        config,
        `/admin/finance/settlements?${new URLSearchParams(
          normalizeAdminFinanceListQuery(query),
        ).toString()}`,
      );
    },
    getAdminSettlement(settlementId: string) {
      return platformGet<PlatformAdminFinanceSettlementRecord>(
        config,
        `/admin/finance/settlements/${encodeURIComponent(
          normalizeAdminFinanceRecordId(settlementId, 'settlement id'),
        )}`,
      );
    },
    getAdminLedgerTransaction(transactionId: string) {
      return platformGet<PlatformAdminFinanceLedgerTransaction>(
        config,
        `/admin/finance/ledger-transactions/${encodeURIComponent(
          normalizeAdminFinanceRecordId(transactionId, 'transaction id'),
        )}`,
      );
    },
    listAdminWithdrawals(query: PlatformAdminFinanceListQuery = {}) {
      return platformGet<
        PlatformAdminFinancePage<PlatformAdminFinanceWithdrawalRecord>
      >(
        config,
        `/admin/finance/withdrawals?${new URLSearchParams(
          normalizeAdminFinanceListQuery(query),
        ).toString()}`,
      );
    },
    getAdminWithdrawal(withdrawalId: string) {
      return platformGet<PlatformAdminFinanceWithdrawalRecord>(
        config,
        `/admin/finance/withdrawals/${encodeURIComponent(
          normalizeAdminFinanceRecordId(withdrawalId, 'withdrawal id'),
        )}`,
      );
    },
    approveAdminWithdrawal(
      withdrawalId: string,
      request: PlatformAdminFinanceReviewWithdrawalRequest,
      idempotencyKey: string,
    ) {
      return platformPost<
        PlatformAdminFinanceReviewWithdrawalRequest,
        PlatformAdminFinanceReviewWithdrawalResult
      >(
        config,
        `/admin/finance/withdrawals/${encodeURIComponent(
          normalizeAdminFinanceRecordId(withdrawalId, 'withdrawal id'),
        )}/approve`,
        normalizeAdminFinanceWriteRequest(request),
        createAdminFinanceMutationRequestOptions(
          normalizeAdminFinanceIdempotencyKey(idempotencyKey),
        ),
      );
    },
    rejectAdminWithdrawal(
      withdrawalId: string,
      request: PlatformAdminFinanceReviewWithdrawalRequest,
      idempotencyKey: string,
    ) {
      return platformPost<
        PlatformAdminFinanceReviewWithdrawalRequest,
        PlatformAdminFinanceReviewWithdrawalResult
      >(
        config,
        `/admin/finance/withdrawals/${encodeURIComponent(
          normalizeAdminFinanceRecordId(withdrawalId, 'withdrawal id'),
        )}/reject`,
        normalizeAdminFinanceWriteRequest(request),
        createAdminFinanceMutationRequestOptions(
          normalizeAdminFinanceIdempotencyKey(idempotencyKey),
        ),
      );
    },
    batchReviewAdminWithdrawals(
      request: PlatformAdminFinanceBatchReviewWithdrawalsRequest,
      idempotencyKey: string,
    ) {
      return platformPost<
        PlatformAdminFinanceBatchReviewWithdrawalsRequest,
        PlatformAdminFinanceBatchReviewWithdrawalsResult
      >(
        config,
        '/admin/finance/withdrawals/batch-review',
        normalizeAdminFinanceBatchReviewWithdrawalsRequest(request),
        createAdminFinanceMutationRequestOptions(
          normalizeAdminFinanceIdempotencyKey(idempotencyKey),
        ),
      );
    },
  };
}

function normalizeOrderId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlatformApiError(
      'Platform payment order id is invalid',
      'PLATFORM_PAYMENT_ORDER_INVALID',
      0,
    );
  }
  return value.trim();
}

function normalizePaymentChannel(value: unknown): PlatformPaymentChannel {
  if (value !== 'wechat' && value !== 'alipay') {
    throw new PlatformApiError(
      'Platform payment channel is invalid',
      'PLATFORM_PAYMENT_CHANNEL_INVALID',
      0,
    );
  }
  return value;
}

function normalizeAdminFinanceListQuery(query: PlatformAdminFinanceListQuery) {
  assertPlainObject(
    query,
    'Platform admin finance query must be an object',
  );

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidAdminFinanceRequest('Platform admin finance page is invalid');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throwInvalidAdminFinanceRequest(
      'Platform admin finance pageSize is invalid',
    );
  }

  const normalizedQuery: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
  };

  const status = normalizeOptionalString(
    query.status,
    50,
    'Platform admin finance status is invalid',
  );
  if (status) {
    normalizedQuery.status = status;
  }

  const orderId = normalizeOptionalString(
    query.orderId,
    100,
    'Platform admin finance orderId is invalid',
  );
  if (orderId) {
    normalizedQuery.orderId = orderId;
  }

  return normalizedQuery;
}

function normalizeAdminFinanceWriteRequest(
  request: PlatformAdminFinanceReviewWithdrawalRequest,
) {
  assertPlainObject(
    request,
    'Platform admin finance write request must be an object',
  );

  if (
    !Number.isInteger(request.expectedVersion) ||
    request.expectedVersion < 0
  ) {
    throwInvalidAdminFinanceRequest(
      'Platform admin finance expectedVersion is invalid',
    );
  }

  return {
    expectedVersion: request.expectedVersion,
    reason: normalizeRequiredString(
      request.reason,
      500,
      'Platform admin finance reason is invalid',
    ),
  };
}

function normalizeAdminFinanceBatchReviewWithdrawalsRequest(
  request: PlatformAdminFinanceBatchReviewWithdrawalsRequest,
): PlatformAdminFinanceBatchReviewWithdrawalsRequest {
  assertPlainObject(
    request,
    'Platform admin finance batch review request must be an object',
  );

  if (request.action !== 'approve' && request.action !== 'reject') {
    throwInvalidAdminFinanceRequest(
      'Platform admin finance action is invalid',
    );
  }

  if (!Array.isArray(request.items) || request.items.length === 0) {
    throwInvalidAdminFinanceRequest(
      'Platform admin finance batch review items are invalid',
    );
  }

  if (request.items.length > 50) {
    throwInvalidAdminFinanceRequest(
      'Platform admin finance batch review items are invalid',
    );
  }

  const withdrawalIds = new Set<string>();

  return {
    action: request.action,
    reason: normalizeRequiredString(
      request.reason,
      500,
      'Platform admin finance reason is invalid',
    ),
    items: request.items.map(item => {
      assertPlainObject(
        item,
        'Platform admin finance batch review item must be an object',
      );

      const withdrawalId = normalizeAdminFinanceRecordId(
        item.withdrawalId,
        'withdrawal id',
      );

      if (withdrawalIds.has(withdrawalId)) {
        throwInvalidAdminFinanceRequest(
          'Platform admin finance withdrawal ids must be unique',
        );
      }

      if (
        !Number.isInteger(item.expectedVersion) ||
        item.expectedVersion < 0
      ) {
        throwInvalidAdminFinanceRequest(
          'Platform admin finance expectedVersion is invalid',
        );
      }

      withdrawalIds.add(withdrawalId);

      return {
        withdrawalId,
        expectedVersion: item.expectedVersion,
      };
    }),
  };
}

function createAdminFinanceMutationRequestOptions(idempotencyKey: string) {
  return {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  };
}

function normalizeAdminFinanceRecordId(value: unknown, label: string) {
  return normalizeRequiredString(
    value,
    120,
    `Platform admin finance ${label} is invalid`,
  );
}

function normalizeUuidIdempotencyKey(
  value: unknown,
  message: string,
  errorCode: string,
) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (
    !normalized ||
    normalized.length > 64 ||
    !PLATFORM_PAYMENT_IDEMPOTENCY_KEY_PATTERN.test(normalized)
  ) {
    throw new PlatformApiError(message, errorCode, 0);
  }
  return normalized;
}

function normalizeAdminFinanceIdempotencyKey(value: unknown) {
  return normalizeUuidIdempotencyKey(
    value,
    'Platform admin finance Idempotency-Key is invalid',
    ADMIN_FINANCE_REQUEST_INVALID,
  );
}

function normalizeRequiredString(
  value: unknown,
  maxLength: number,
  message: string,
  minLength = 1,
) {
  if (typeof value !== 'string') {
    throwInvalidAdminFinanceRequest(message);
  }

  const normalizedValue = value.trim();

  if (
    normalizedValue.length < minLength ||
    normalizedValue.length > maxLength
  ) {
    throwInvalidAdminFinanceRequest(message);
  }

  return normalizedValue;
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidAdminFinanceRequest(message);
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue.length > maxLength) {
    throwInvalidAdminFinanceRequest(message);
  }

  return normalizedValue;
}

function assertPlainObject(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throwInvalidAdminFinanceRequest(message);
  }
}

function throwInvalidAdminFinanceRequest(message: string): never {
  throw new PlatformApiError(message, ADMIN_FINANCE_REQUEST_INVALID, 0);
}

function normalizePaymentIdempotencyKey(value: unknown) {
  return normalizeUuidIdempotencyKey(
    value,
    'Platform payment idempotency key is invalid',
    'PLATFORM_PAYMENT_KEY_INVALID',
  );
}

import type {
  FinancialAccountType,
  LedgerDirection,
  OrderPaymentStatus,
  PaymentOrderStatus,
  RefundStatus,
} from './payment-domain';
import type { PaymentProviderChannel } from './payment-provider';
import type { DriverWithdrawalRecord } from '../driver-orders/dto';

export type ClientPaymentChannel = 'wechat' | 'alipay';

export type CreatePaymentRequest = {
  channel: ClientPaymentChannel;
};

export type PaymentSourceOrderRecord = {
  id: string;
  orderNo: string;
  shipperId: string;
  status:
    | 'waiting'
    | 'loading'
    | 'transporting'
    | 'confirming'
    | 'completed'
    | 'cancelled';
  pricingMode: 'fixed' | 'negotiable';
  paymentMethod: 'cod' | 'online';
  paymentStatus: OrderPaymentStatus;
  priceCents?: number;
  payablePriceCents?: number;
  couponId?: string;
};

export type PaymentOrderRecord = {
  id: string;
  paymentNo: string;
  orderId: string;
  orderNo: string;
  shipperId: string;
  channel: PaymentProviderChannel;
  amountCents: number;
  status: PaymentOrderStatus;
  idempotencyKey: string;
  requestFingerprint: string;
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

export type FinancialLedgerEntryRecord = {
  id: string;
  transactionId: string;
  sequence: number;
  accountType: FinancialAccountType;
  accountUserId?: string;
  direction: LedgerDirection;
  amountCents: number;
  createdAtIso: string;
};

export type FinancialTransactionRecord = {
  id: string;
  transactionNo: string;
  type:
    | 'online_payment_escrow'
    | 'online_order_settlement'
    | 'offline_order_settlement'
    | 'online_refund'
    | 'driver_withdrawal'
    | 'order_compensation';
  referenceId: string;
  orderId?: string;
  paymentOrderId?: string;
  amountCents: number;
  occurredAtIso: string;
  createdAtIso: string;
  entries: FinancialLedgerEntryRecord[];
};

export type SettlementRecord = {
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

export type DriverWalletRecord = {
  driverId: string;
  availableCents: number;
  reservedCents: number;
  withdrawnCents: number;
  version: number;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ReviewedDriverWithdrawalRecord = DriverWithdrawalRecord & {
  version: number;
  processedByAdminId?: string;
  processedAtIso?: string;
  financialTransactionId?: string;
  payoutChannel?: string;
  providerPayoutNo?: string;
  payoutExecutedAtIso?: string;
};

export type FinancialAuditLogRecord = {
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

export type RefundRecord = {
  id: string;
  refundNo: string;
  paymentOrderId: string;
  orderId: string;
  shipperId: string;
  channel: PaymentProviderChannel;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  providerRefundNo?: string;
  failureCode?: string;
  failureMessage?: string;
  processingStartedAtIso?: string;
  succeededAtIso?: string;
  failedAtIso?: string;
  financialTransactionId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type FinancialOutboxEventRecord = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  refundId?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'dead';
  attemptCount: number;
  maxAttempts: number;
  availableAtIso: string;
  claimedAtIso?: string;
  leaseExpiresAtIso?: string;
  claimedBy?: string;
  processedAtIso?: string;
  lastError?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type AdminBatchReviewWithdrawalAction = 'approve' | 'reject';

export type AdminBatchReviewWithdrawalItem = {
  withdrawalId: string;
  expectedVersion: number;
};

export type BatchReviewAdminWithdrawalsRequest = {
  items: AdminBatchReviewWithdrawalItem[];
  action: AdminBatchReviewWithdrawalAction;
  reason: string;
};

export type BatchReviewedAdminWithdrawalItem = {
  withdrawal: ReviewedDriverWithdrawalRecord;
  wallet: DriverWalletRecord;
  financialTransaction?: FinancialTransactionRecord;
};

export type BatchReviewAdminWithdrawalsResult = {
  kind: 'success';
  replayed: boolean;
  action: AdminBatchReviewWithdrawalAction;
  withdrawalIds: string[];
  updatedCount: number;
  items: BatchReviewedAdminWithdrawalItem[];
};

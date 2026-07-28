import {
  PlatformApiError,
  type PlatformApiErrorBody,
  platformGet,
  platformPost,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';
import type { OrderPaymentStatus } from '../types';

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
  'transporting',
  'confirming',
];

const PLATFORM_ORDER_PHONE_PATTERN = /^1[3-9]\d{9}$/;
const PLATFORM_ORDER_IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_ORDER_DATE_TIME_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ADMIN_ORDER_EXCEPTION_REQUEST_INVALID =
  'PLATFORM_ADMIN_ORDER_EXCEPTION_REQUEST_INVALID';

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

type PlatformOrderMutationRequest = {
  baseUpdatedAtIso: string;
};

export type PlatformUpdateShipperOrderRequest =
  PlatformCreateShipperOrderRequest & PlatformOrderMutationRequest;

export type PlatformCancelShipperOrderRequest = PlatformOrderMutationRequest & {
  reasonText: string;
  description?: string;
};

export type PlatformAdvanceShipperOrderStatusRequest =
  PlatformOrderMutationRequest & {
  nextStatus: Extract<
    PlatformShipperOrderStatus,
    'transporting' | 'confirming'
  >;
};

export type PlatformAcceptShipperOrderQuoteRequest =
  PlatformOrderMutationRequest & {
    driverId: string;
  };

export type PlatformAddShipperOrderBonusRequest =
  PlatformOrderMutationRequest & {
    bonusCents: number;
  };

export type PlatformCompleteShipperOrderRequest = PlatformOrderMutationRequest;

export type PlatformReportShipperOrderExceptionRequest = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFileIds?: string[];
};

export type PlatformSubmitShipperOrderChangeRequest = {
  description: string;
};

export type PlatformAppealOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  reason: string;
};

export type PlatformSubmitShipperOrderEvaluationRequest = {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
  photoCount?: number;
  photoFileIds?: string[];
};

export type PlatformOrderExceptionCaseStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'closed';

export type PlatformOrderExceptionCaseSourceRole = 'shipper' | 'driver';
export type PlatformOrderExceptionCaseCompensationStatus =
  | 'not_required'
  | 'pending'
  | 'offline_completed'
  | 'executed';
export type PlatformOrderExceptionCaseCompensationTargetRole =
  PlatformOrderExceptionCaseSourceRole;
export type PlatformOrderExceptionCaseAppealStatus =
  | 'none'
  | 'requested'
  | 'rejected'
  | 'accepted';
export type PlatformOrderExceptionCaseAppealDecision = Extract<
  PlatformOrderExceptionCaseAppealStatus,
  'accepted' | 'rejected'
>;
export type PlatformOrderExceptionCaseClaimStatus =
  | 'claimed'
  | 'unclaimed';

export type PlatformOrderExceptionCaseSlaPolicyKey =
  'exception_case_default_v1';

export type PlatformOrderExceptionCaseSlaStage = 'acceptance' | 'resolution';

export type PlatformOrderExceptionCaseSlaStatus =
  | 'within_target'
  | 'overdue'
  | 'resolved_within_target'
  | 'resolved_overdue';

export type PlatformOrderExceptionCaseSlaSnapshot = {
  policyKey: PlatformOrderExceptionCaseSlaPolicyKey;
  stage: PlatformOrderExceptionCaseSlaStage;
  status: PlatformOrderExceptionCaseSlaStatus;
  targetAtIso: string;
  remainingMinutes?: number;
  overdueMinutes?: number;
};

export type PlatformOrderLatestExceptionCase = {
  id: string;
  caseNo: string;
  sourceEventId: string;
  sourceRole: PlatformOrderExceptionCaseSourceRole;
  status: PlatformOrderExceptionCaseStatus;
  resolutionText?: string;
  resolvedAtIso?: string;
  compensationStatus?: PlatformOrderExceptionCaseCompensationStatus;
  compensationTargetRole?: PlatformOrderExceptionCaseCompensationTargetRole;
  compensationAmountCents?: number;
  compensationUpdatedAtIso?: string;
  compensationExecutedAtIso?: string;
  appealStatus?: PlatformOrderExceptionCaseAppealStatus;
  appealReason?: string;
  appealRequestedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PlatformShipperOrder = PlatformCreateShipperOrderRequest & {
  id: string;
  orderNo: string;
  shipperId: string;
  status: PlatformShipperOrderStatus;
  pickupDistanceMeters?: number;
  exposureBonusCents?: number;
  paymentStatus?: OrderPaymentStatus;
  assignedDriverId?: string;
  paymentSettledAtIso?: string;
  refundedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
  latestExceptionCase?: PlatformOrderLatestExceptionCase;
  events?: Array<{
    id: string;
    actorUserId?: string;
    eventType: string;
    noteText?: string;
    attachmentFileIds?: string[];
    createdAtIso: string;
  }>;
};

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
  compensationStatus?: PlatformOrderExceptionCaseCompensationStatus;
  compensationTargetRole?: PlatformOrderExceptionCaseCompensationTargetRole;
  compensationAmountCents?: number;
  compensationUpdatedAtIso?: string;
  compensationTransactionId?: string;
  compensationExecutedAtIso?: string;
  appealStatus: PlatformOrderExceptionCaseAppealStatus;
  appealReason?: string;
  appealRequestedAtIso?: string;
  claimedByAdminUserId?: string;
  claimedAtIso?: string;
  claimNote?: string;
  resolvedAtIso?: string;
  closedAtIso?: string;
  sla?: PlatformOrderExceptionCaseSlaSnapshot;
  createdAtIso: string;
  updatedAtIso: string;
  actions: PlatformOrderExceptionCaseAction[];
};

export type PlatformOrderExceptionCaseListResult = {
  items: PlatformOrderExceptionCase[];
  total: number;
};

export type PlatformOrderExceptionCaseOverdueEscalationSweepTrigger =
  | 'admin'
  | 'scheduler';

export type PlatformOrderExceptionCaseOverdueEscalationSweepResult = {
  trigger: PlatformOrderExceptionCaseOverdueEscalationSweepTrigger;
  triggeredAtIso: string;
  scannedCount: number;
  overdueCount: number;
  escalatedCount: number;
  skippedCount: number;
  conflictCount: number;
  escalatedCaseIds: string[];
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

export type PlatformAdminOrderFilters = Omit<
  PlatformListShipperOrdersQuery,
  'page' | 'pageSize'
>;

export type PlatformAdminOrderReportQuery = PlatformAdminOrderFilters & {
  topShippersLimit?: number;
};

export type PlatformAdminOrderSummary = {
  totalOrderCount: number;
  waitingOrderCount: number;
  activeOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  exceptionOrderCount: number;
};

export type PlatformAdminOrderReportStatusBreakdownItem = {
  status: PlatformShipperOrderStatus;
  orderCount: number;
  payablePriceTotalCents: number;
};

export type PlatformAdminOrderReportPaymentStatusBreakdownItem = {
  paymentStatus: OrderPaymentStatus;
  orderCount: number;
  payablePriceTotalCents: number;
};

export type PlatformAdminOrderReportPricingModeBreakdownItem = {
  pricingMode: PlatformCreateShipperOrderRequest['pricingMode'];
  orderCount: number;
  payablePriceTotalCents: number;
};

export type PlatformAdminOrderReportPaymentMethodBreakdownItem = {
  paymentMethod: PlatformCreateShipperOrderRequest['paymentMethod'];
  orderCount: number;
  payablePriceTotalCents: number;
};

export type PlatformAdminOrderReportTopShipperItem = {
  shipperId: string;
  orderCount: number;
  waitingOrderCount: number;
  activeOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  payablePriceTotalCents: number;
  latestOrderCreatedAtIso?: string;
};

export type PlatformAdminOrderReport = {
  generatedAtIso: string;
  filters: PlatformAdminOrderFilters;
  summary: PlatformAdminOrderSummary;
  statusBreakdown: PlatformAdminOrderReportStatusBreakdownItem[];
  paymentStatusBreakdown: PlatformAdminOrderReportPaymentStatusBreakdownItem[];
  pricingModeBreakdown: PlatformAdminOrderReportPricingModeBreakdownItem[];
  paymentMethodBreakdown: PlatformAdminOrderReportPaymentMethodBreakdownItem[];
  topShippers: PlatformAdminOrderReportTopShipperItem[];
};

export type PlatformAdminOrdersCsvExport = {
  filename: string;
  contentType: string;
  content: string;
};

export type PlatformAdminBatchCancelOrderItem = {
  orderId: string;
  baseUpdatedAtIso: string;
};

export type PlatformAdminBatchCancelOrdersRequest = {
  items: PlatformAdminBatchCancelOrderItem[];
  reasonText: string;
  description?: string;
};

export type PlatformAdminBatchCancelOrdersResult = {
  orderIds: string[];
  updatedCount: number;
  items: PlatformShipperOrder[];
};

export type PlatformAdminOrderAttachmentAuditListQuery =
  PlatformAdminOrderFilters & {
    shipperId?: string;
    hasMissingFiles?: boolean;
    page?: number;
    pageSize?: number;
  };

export type PlatformAdminOrderAttachmentAuditSummary = {
  orderId: string;
  orderNo: string;
  shipperId: string;
  status: PlatformShipperOrderStatus;
  createdAtIso: string;
  cargoFileCount: number;
  eventAttachmentFileCount: number;
  totalFileIdCount: number;
  resolvedFileCount: number;
  missingFileIds: string[];
  hasMissingFiles: boolean;
};

export type PlatformListAdminOrderAttachmentAuditsResult = {
  items: PlatformAdminOrderAttachmentAuditSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminOrderAttachmentFileRecord = {
  id: string;
  ownerUserId: string;
  purpose: string;
  contentType: string;
  byteSize: number;
  objectKey: string;
  publicUrl?: string;
  etag?: string;
  versionId?: string;
  status: string;
  createdAtIso: string;
  previewUrl?: string;
  previewExpiresAtIso?: string;
};

export type PlatformAdminOrderAttachmentFileGroup = {
  fileIds: string[];
  files: PlatformAdminOrderAttachmentFileRecord[];
  missingFileIds: string[];
};

export type PlatformAdminOrderAttachmentAuditEvent = {
  eventId: string;
  eventType: string;
  noteText?: string;
  createdAtIso: string;
  attachmentFileIds: string[];
  files: PlatformAdminOrderAttachmentFileRecord[];
  missingFileIds: string[];
};

export type PlatformAdminOrderAttachmentAudit = {
  orderId: string;
  orderNo: string;
  shipperId: string;
  cargo: PlatformAdminOrderAttachmentFileGroup;
  events: PlatformAdminOrderAttachmentAuditEvent[];
};

export type PlatformAdminOrderChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export type PlatformOrderChangeRequestFundDisposition = {
  kind:
    | 'none'
    | 'cod_price_snapshot_only'
    | 'online_topup_queued'
    | 'online_topup_pending_manual'
    | 'online_partial_refund_queued'
    | 'online_partial_refund_pending_manual'
    | 'online_price_unchanged'
    | 'online_not_escrowed';
  deltaCents: number;
  summaryText: string;
  requiresManualFollowUp: boolean;
  refundId?: string;
  refundNo?: string;
  outboxEventId?: string;
  paymentId?: string;
  paymentNo?: string;
};

export type PlatformOrderChangeRequestReviewSnapshot = {
  reviewResultText?: string;
  costImpactText?: string;
  refundText?: string;
  driverNoticeText?: string;
  adjustedPayablePriceCents?: number;
  previousPayablePriceCents?: number;
  fundDisposition?: PlatformOrderChangeRequestFundDisposition;
};

export type PlatformListAdminOrderChangeRequestsQuery = {
  status?: PlatformAdminOrderChangeRequestStatus;
  page?: number;
  pageSize?: number;
};

export type PlatformAdminOrderChangeRequestRecord = {
  orderId: string;
  orderNo: string;
  shipperId: string;
  status: PlatformAdminOrderChangeRequestStatus;
  description: string;
  reviewResultText?: string;
  costImpactText?: string;
  refundText?: string;
  driverNoticeText?: string;
  adjustedPayablePriceCents?: number;
  previousPayablePriceCents?: number;
  fundDisposition?: PlatformOrderChangeRequestFundDisposition;
  currentPayablePriceCents?: number;
  requestedAtIso: string;
  reviewedAtIso?: string;
  assignedDriverId?: string;
  orderStatus: PlatformShipperOrderStatus;
};

export type PlatformListAdminOrderChangeRequestsResult = {
  items: PlatformAdminOrderChangeRequestRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminOrderChangeRequestReviewEventType =
  | 'change_requested'
  | 'change_request_approved'
  | 'change_request_rejected';

export type PlatformAdminOrderChangeRequestReviewEventStage =
  | 'requested'
  | 'approved'
  | 'rejected';

export type PlatformAdminOrderChangeRequestReviewEvent = {
  eventId: string;
  actorUserId?: string;
  eventType: PlatformAdminOrderChangeRequestReviewEventType;
  stage: PlatformAdminOrderChangeRequestReviewEventStage;
  noteText?: string;
  costImpactText?: string;
  refundText?: string;
  driverNoticeText?: string;
  createdAtIso: string;
};

export type PlatformReviewAdminOrderChangeRequest =
  PlatformOrderChangeRequestReviewSnapshot & {
  decision: 'approved' | 'rejected';
};

export type PlatformListAdminOrderExceptionCasesQuery = {
  status?: PlatformOrderExceptionCaseStatus;
  sourceRole?: PlatformOrderExceptionCaseSourceRole;
  compensationStatus?: PlatformOrderExceptionCaseCompensationStatus;
  appealStatus?: PlatformOrderExceptionCaseAppealStatus;
  slaStatus?: PlatformOrderExceptionCaseSlaStatus;
  claimStatus?: PlatformOrderExceptionCaseClaimStatus;
  claimedByAdminUserId?: string;
  keyword?: string;
  createdFromIso?: string;
  createdToIso?: string;
  page?: number;
  pageSize?: number;
};

export type PlatformAdminOrderExceptionCaseListResult = {
  items: PlatformOrderExceptionCase[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminUpdateOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  content: string;
};

export type PlatformAdminClaimOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  content?: string;
};

export type PlatformAdminResolveOrderExceptionCaseRequest =
  PlatformAdminUpdateOrderExceptionCaseRequest & {
    compensationStatus: Extract<
      PlatformOrderExceptionCaseCompensationStatus,
      'not_required' | 'pending' | 'offline_completed'
    >;
    appealDecision?: PlatformOrderExceptionCaseAppealDecision;
    compensationTargetRole?: PlatformOrderExceptionCaseCompensationTargetRole;
    compensationAmountCents?: number;
  };

export type PlatformAdminExecuteOrderExceptionCaseCompensationRequest = {
  baseUpdatedAtIso: string;
  idempotencyKey: string;
  content: string;
};

export function createPlatformOrderApi(config: PlatformApiConfig) {
  return {
    createOrder(
      request: PlatformCreateShipperOrderRequest,
      idempotencyKey: string,
    ) {
      const normalizedRequest = normalizeCreateOrderRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_REQUEST_INVALID',
      );

      return platformPost<
        PlatformCreateShipperOrderRequest,
        PlatformShipperOrder
      >(
        config,
        '/shipper/orders',
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async listOrders(query: PlatformListShipperOrdersQuery = {}) {
      assertValidListOrdersQuery(query);

      return platformGet<PlatformOrderListResult>(
        config,
        createListOrdersPath(query),
      );
    },
    async listAdminOrders(query: PlatformListShipperOrdersQuery = {}) {
      assertValidListOrdersQuery(query);

      return platformGet<PlatformOrderListResult>(
        config,
        createAdminListOrdersPath(query),
      );
    },
    async getAdminOrderReport(query: PlatformAdminOrderReportQuery = {}) {
      assertValidAdminOrderReportQuery(query);

      return platformGet<PlatformAdminOrderReport>(
        config,
        createAdminOrderReportPath(query),
      );
    },
    async exportAdminOrdersCsv(query: PlatformAdminOrderFilters = {}) {
      assertValidAdminOrderFiltersQuery(query);
      return platformGetText(
        config,
        createAdminOrdersExportPath(query),
      );
    },
    async getOrder(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformShipperOrder>(
        config,
        `/shipper/orders/${normalizedOrderId}`,
      );
    },
    async getAdminOrder(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformShipperOrder>(
        config,
        `/admin/orders/${normalizedOrderId}`,
      );
    },
    async listAdminOrderAttachmentAudits(
      query: PlatformAdminOrderAttachmentAuditListQuery = {},
    ) {
      assertValidAdminOrderAttachmentAuditListQuery(query);

      return platformGet<PlatformListAdminOrderAttachmentAuditsResult>(
        config,
        createAdminOrderAttachmentAuditListPath(query),
      );
    },
    async getAdminOrderAttachmentAudit(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformAdminOrderAttachmentAudit>(
        config,
        `/admin/orders/${normalizedOrderId}/attachments`,
      );
    },
    async listAdminOrderChangeRequests(
      query: PlatformListAdminOrderChangeRequestsQuery = {},
    ) {
      return platformGet<PlatformListAdminOrderChangeRequestsResult>(
        config,
        createAdminOrderChangeRequestsPath(
          normalizeAdminOrderChangeRequestsQuery(query),
        ),
      );
    },
    async listAdminOrderChangeRequestReviewEvents(orderId: string) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformGet<PlatformAdminOrderChangeRequestReviewEvent[]>(
        config,
        `/admin/orders/${normalizedOrderId}/change-request/review-events`,
      );
    },
    async reviewAdminOrderChangeRequest(
      orderId: string,
      request: PlatformReviewAdminOrderChangeRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);

      return platformPost<
        PlatformReviewAdminOrderChangeRequest,
        PlatformShipperOrder
      >(
        config,
        `/admin/orders/${normalizedOrderId}/change-request/review`,
        normalizeAdminOrderChangeRequestReviewRequest(request),
      );
    },
    async listAdminOrderExceptionCases(
      query: PlatformListAdminOrderExceptionCasesQuery = {},
    ) {
      return platformGet<PlatformAdminOrderExceptionCaseListResult>(
        config,
        createAdminOrderExceptionCasesPath(
          normalizeAdminOrderExceptionCasesQuery(query),
        ),
      );
    },
    runAdminOrderExceptionCaseOverdueEscalationSweep() {
      return platformPost<
        Record<string, never>,
        PlatformOrderExceptionCaseOverdueEscalationSweepResult
      >(config, '/admin/order-exception-cases/overdue-escalations/sweep', {});
    },
    async getAdminOrderExceptionCase(caseId: string) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformGet<PlatformOrderExceptionCase>(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(normalizedCaseId)}`,
      );
    },
    async processAdminOrderExceptionCase(
      caseId: string,
      request: PlatformAdminUpdateOrderExceptionCaseRequest,
    ) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformPost<
        PlatformAdminUpdateOrderExceptionCaseRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/process`,
        normalizeAdminOrderExceptionCaseUpdateRequest(request),
      );
    },
    async claimAdminOrderExceptionCase(
      caseId: string,
      request: PlatformAdminClaimOrderExceptionCaseRequest,
    ) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformPost<
        PlatformAdminClaimOrderExceptionCaseRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/claim`,
        normalizeAdminOrderExceptionCaseClaimRequest(request),
      );
    },
    async unclaimAdminOrderExceptionCase(
      caseId: string,
      request: PlatformAdminClaimOrderExceptionCaseRequest,
    ) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformPost<
        PlatformAdminClaimOrderExceptionCaseRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/unclaim`,
        normalizeAdminOrderExceptionCaseClaimRequest(request),
      );
    },
    async resolveAdminOrderExceptionCase(
      caseId: string,
      request: PlatformAdminResolveOrderExceptionCaseRequest,
    ) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformPost<
        PlatformAdminResolveOrderExceptionCaseRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/resolve`,
        normalizeAdminOrderExceptionCaseResolveRequest(request),
      );
    },
    async closeAdminOrderExceptionCase(
      caseId: string,
      request: PlatformAdminUpdateOrderExceptionCaseRequest,
    ) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformPost<
        PlatformAdminUpdateOrderExceptionCaseRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/close`,
        normalizeAdminOrderExceptionCaseUpdateRequest(request),
      );
    },
    async executeAdminOrderExceptionCaseCompensation(
      caseId: string,
      request: PlatformAdminExecuteOrderExceptionCaseCompensationRequest,
    ) {
      const normalizedCaseId = normalizeExceptionCaseId(caseId);

      return platformPost<
        PlatformAdminExecuteOrderExceptionCaseCompensationRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/admin/order-exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/compensation/execute`,
        normalizeAdminOrderExceptionCaseCompensationExecutionRequest(request),
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
      request: PlatformUpdateShipperOrderRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeUpdateOrderRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_REQUEST_INVALID',
      );

      return platformPut<
        PlatformUpdateShipperOrderRequest,
        PlatformShipperOrder
      >(
        config,
        `/shipper/orders/${normalizedOrderId}`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async cancelOrder(
      orderId: string,
      request: PlatformCancelShipperOrderRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeCancelOrderRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      );

      return platformPost<
        PlatformCancelShipperOrderRequest,
        PlatformShipperOrder
      >(
        config,
        `/shipper/orders/${normalizedOrderId}/cancel`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async cancelAdminOrder(
      orderId: string,
      request: PlatformCancelShipperOrderRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeCancelOrderRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      );

      return platformPost<
        PlatformCancelShipperOrderRequest,
        PlatformShipperOrder
      >(
        config,
        `/admin/orders/${normalizedOrderId}/cancel`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async batchCancelAdminOrders(
      request: PlatformAdminBatchCancelOrdersRequest,
      idempotencyKey: string,
    ) {
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      );

      return platformPost<
        PlatformAdminBatchCancelOrdersRequest,
        PlatformAdminBatchCancelOrdersResult
      >(
        config,
        '/admin/orders/batch-cancel',
        normalizeAdminBatchCancelOrdersRequest(request),
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async completeOrder(
      orderId: string,
      request: PlatformCompleteShipperOrderRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeCompleteOrderRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_COMPLETE_REQUEST_INVALID',
      );

      return platformPost<PlatformCompleteShipperOrderRequest, PlatformShipperOrder>(
        config,
        `/shipper/orders/${normalizedOrderId}/complete`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async advanceOrderStatus(
      orderId: string,
      request: PlatformAdvanceShipperOrderStatusRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeAdvanceOrderStatusRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
      );

      return platformPost<
        PlatformAdvanceShipperOrderStatusRequest,
        PlatformShipperOrder
      >(
        config,
        `/shipper/orders/${normalizedOrderId}/status`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async acceptQuote(
      orderId: string,
      request: PlatformAcceptShipperOrderQuoteRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeAcceptQuoteRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID',
      );

      return platformPost<
        PlatformAcceptShipperOrderQuoteRequest,
        PlatformShipperOrder
      >(
        config,
        `/shipper/orders/${normalizedOrderId}/accept-quote`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
    },
    async addBonus(
      orderId: string,
      request: PlatformAddShipperOrderBonusRequest,
      idempotencyKey: string,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedRequest = normalizeAddBonusRequest(request);
      const normalizedIdempotencyKey = normalizeOrderMutationIdempotencyKey(
        idempotencyKey,
        'PLATFORM_ORDER_BONUS_REQUEST_INVALID',
      );

      return platformPost<
        PlatformAddShipperOrderBonusRequest,
        PlatformShipperOrder
      >(
        config,
        `/shipper/orders/${normalizedOrderId}/bonus`,
        normalizedRequest,
        createOrderMutationRequestOptions(normalizedIdempotencyKey),
      );
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
    async appealExceptionCase(
      orderId: string,
      caseId: string,
      request: PlatformAppealOrderExceptionCaseRequest,
    ) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedCaseId = normalizeExceptionCaseId(caseId);
      const normalizedRequest = normalizeAppealExceptionCaseRequest(request);

      return platformPost<
        PlatformAppealOrderExceptionCaseRequest,
        PlatformOrderExceptionCase
      >(
        config,
        `/shipper/orders/${normalizedOrderId}/exception-cases/${normalizedCaseId}/appeal`,
        normalizedRequest,
      );
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

function normalizeUpdateOrderRequest(
  request: PlatformUpdateShipperOrderRequest,
) {
  const normalizedRequest = normalizeCreateOrderRequest(request);
  const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
    request.baseUpdatedAtIso,
    'PLATFORM_ORDER_REQUEST_INVALID',
  );

  return {
    ...normalizedRequest,
    baseUpdatedAtIso,
  };
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

  const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
    request.baseUpdatedAtIso,
    'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
  );
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

  return description
    ? { baseUpdatedAtIso, reasonText, description }
    : { baseUpdatedAtIso, reasonText };
}

function normalizeAdminBatchCancelOrdersRequest(
  request: PlatformAdminBatchCancelOrdersRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform admin batch cancel request must be an object',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  if (!Array.isArray(request.items) || request.items.length === 0) {
    throw new PlatformApiError(
      'Platform admin batch cancel items are invalid',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  if (request.items.length > 50) {
    throw new PlatformApiError(
      'Platform admin batch cancel items are invalid',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
      0,
    );
  }

  const orderIds = new Set<string>();
  const items = request.items.map(item => {
    const itemInput = item as unknown;

    if (
      itemInput === null ||
      typeof itemInput !== 'object' ||
      Array.isArray(itemInput)
    ) {
      throw new PlatformApiError(
        'Platform admin batch cancel item must be an object',
        'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
        0,
      );
    }

    const orderId = normalizeRequiredTrimmedString(
      item.orderId,
      120,
      'Platform admin batch cancel orderId is invalid',
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
    );
    const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
      item.baseUpdatedAtIso,
      'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
    );

    if (orderIds.has(orderId)) {
      throw new PlatformApiError(
        'Platform admin batch cancel order ids must be unique',
        'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
        0,
      );
    }

    orderIds.add(orderId);

    return {
      orderId,
      baseUpdatedAtIso,
    };
  });

  const reasonText = normalizeRequiredTrimmedString(
    request.reasonText,
    50,
    'Platform admin batch cancel reason is invalid',
    'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
  );
  const description = normalizeOptionalTrimmedString(
    request.description,
    200,
    'Platform admin batch cancel description is invalid',
    'PLATFORM_ORDER_CANCEL_REQUEST_INVALID',
  );

  return description
    ? { items, reasonText, description }
    : { items, reasonText };
}

function normalizeAcceptQuoteRequest(
  request: PlatformAcceptShipperOrderQuoteRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order accept-quote request must be an object',
      'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID',
      0,
    );
  }

  const driverIdInput = request.driverId as unknown;
  if (typeof driverIdInput !== 'string') {
    throw new PlatformApiError(
      'Platform order accept-quote driverId must be a string',
      'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID',
      0,
    );
  }

  const driverId = driverIdInput.trim();
  if (!driverId || driverId.length > 120) {
    throw new PlatformApiError(
      'Platform order accept-quote driverId is invalid',
      'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID',
      0,
    );
  }

  const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
    request.baseUpdatedAtIso,
    'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID',
  );

  return {
    baseUpdatedAtIso,
    driverId,
  };
}

function normalizeAddBonusRequest(
  request: PlatformAddShipperOrderBonusRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order bonus request must be an object',
      'PLATFORM_ORDER_BONUS_REQUEST_INVALID',
      0,
    );
  }

  const bonusCentsInput = request.bonusCents as unknown;
  if (
    typeof bonusCentsInput !== 'number' ||
    !Number.isInteger(bonusCentsInput) ||
    bonusCentsInput < 100 ||
    bonusCentsInput > 500_000
  ) {
    throw new PlatformApiError(
      'Platform order bonusCents is invalid',
      'PLATFORM_ORDER_BONUS_REQUEST_INVALID',
      0,
    );
  }

  const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
    request.baseUpdatedAtIso,
    'PLATFORM_ORDER_BONUS_REQUEST_INVALID',
  );

  return {
    baseUpdatedAtIso,
    bonusCents: bonusCentsInput,
  };
}

function normalizeAdvanceOrderStatusRequest(
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

  const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
    request.baseUpdatedAtIso,
    'PLATFORM_ORDER_STATUS_REQUEST_INVALID',
  );

  return {
    baseUpdatedAtIso,
    nextStatus: request.nextStatus,
  };
}

function normalizeCompleteOrderRequest(
  request: PlatformCompleteShipperOrderRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order complete request must be an object',
      'PLATFORM_ORDER_COMPLETE_REQUEST_INVALID',
      0,
    );
  }

  return {
    baseUpdatedAtIso: normalizeOrderMutationBaseUpdatedAtIso(
      request.baseUpdatedAtIso,
      'PLATFORM_ORDER_COMPLETE_REQUEST_INVALID',
    ),
  };
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

function normalizeExceptionCaseId(caseId: string) {
  const caseIdInput = caseId as unknown;

  if (typeof caseIdInput !== 'string') {
    throw new PlatformApiError(
      'Platform exception case id must be a string',
      'PLATFORM_ORDER_EXCEPTION_CASE_ID_INVALID',
      0,
    );
  }

  const normalizedCaseId = caseIdInput.trim();

  if (!normalizedCaseId) {
    throw new PlatformApiError(
      'Platform exception case id is required',
      'PLATFORM_ORDER_EXCEPTION_CASE_ID_INVALID',
      0,
    );
  }

  return normalizedCaseId;
}

function normalizeAppealExceptionCaseRequest(
  request: PlatformAppealOrderExceptionCaseRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform order exception appeal request must be an object',
      'PLATFORM_ORDER_EXCEPTION_APPEAL_REQUEST_INVALID',
      0,
    );
  }

  const baseUpdatedAtIso = normalizeOrderMutationBaseUpdatedAtIso(
    request.baseUpdatedAtIso,
    'PLATFORM_ORDER_EXCEPTION_APPEAL_REQUEST_INVALID',
  );
  const reasonInput = request.reason as unknown;

  if (typeof reasonInput !== 'string') {
    throw new PlatformApiError(
      'Platform order exception appeal reason must be a string',
      'PLATFORM_ORDER_EXCEPTION_APPEAL_REQUEST_INVALID',
      0,
    );
  }

  const reason = reasonInput.trim();

  if (reason.length < 6 || reason.length > 500) {
    throw new PlatformApiError(
      'Platform order exception appeal reason is invalid',
      'PLATFORM_ORDER_EXCEPTION_APPEAL_REQUEST_INVALID',
      0,
    );
  }

  return { baseUpdatedAtIso, reason };
}

function normalizeAdminOrderExceptionCasesQuery(
  query: PlatformListAdminOrderExceptionCasesQuery,
) {
  const queryInput = query as unknown;

  if (
    queryInput === null ||
    typeof queryInput !== 'object' ||
    Array.isArray(queryInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order exception query must be an object',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  const status = normalizeOptionalTrimmedString(
    query.status,
    20,
    'Platform admin order exception status is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );
  const sourceRole = normalizeOptionalTrimmedString(
    query.sourceRole,
    20,
    'Platform admin order exception sourceRole is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );
  const compensationStatus = normalizeOptionalTrimmedString(
    query.compensationStatus,
    20,
    'Platform admin order exception compensationStatus is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as PlatformOrderExceptionCaseCompensationStatus | undefined;
  const appealStatus = normalizeOptionalTrimmedString(
    query.appealStatus,
    20,
    'Platform admin order exception appealStatus is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as PlatformOrderExceptionCaseAppealStatus | undefined;
  const slaStatus = normalizeOptionalTrimmedString(
    query.slaStatus,
    30,
    'Platform admin order exception slaStatus is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as PlatformOrderExceptionCaseSlaStatus | undefined;
  const claimStatus = normalizeOptionalTrimmedString(
    query.claimStatus,
    20,
    'Platform admin order exception claimStatus is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as PlatformOrderExceptionCaseClaimStatus | undefined;
  const claimedByAdminUserId = normalizeOptionalTrimmedString(
    query.claimedByAdminUserId,
    120,
    'Platform admin order exception claimedByAdminUserId is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );
  const keyword = normalizeOptionalTrimmedString(
    query.keyword,
    80,
    'Platform admin order exception keyword is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );
  const createdFromIso = normalizeOptionalTrimmedString(
    query.createdFromIso,
    40,
    'Platform admin order exception createdFromIso is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );
  const createdToIso = normalizeOptionalTrimmedString(
    query.createdToIso,
    40,
    'Platform admin order exception createdToIso is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (
    status !== undefined &&
    status !== 'pending' &&
    status !== 'processing' &&
    status !== 'resolved' &&
    status !== 'closed'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception status is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    sourceRole !== undefined &&
    sourceRole !== 'shipper' &&
    sourceRole !== 'driver'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception sourceRole is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    compensationStatus !== undefined &&
    compensationStatus !== 'not_required' &&
    compensationStatus !== 'pending' &&
    compensationStatus !== 'offline_completed' &&
    compensationStatus !== 'executed'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception compensationStatus is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    appealStatus !== undefined &&
    appealStatus !== 'none' &&
    appealStatus !== 'requested' &&
    appealStatus !== 'rejected' &&
    appealStatus !== 'accepted'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception appealStatus is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    slaStatus !== undefined &&
    slaStatus !== 'within_target' &&
    slaStatus !== 'overdue' &&
    slaStatus !== 'resolved_within_target' &&
    slaStatus !== 'resolved_overdue'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception slaStatus is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    claimStatus !== undefined &&
    claimStatus !== 'claimed' &&
    claimStatus !== 'unclaimed'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception claimStatus is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new PlatformApiError(
      'Platform admin order exception page is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new PlatformApiError(
      'Platform admin order exception pageSize is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    (createdFromIso !== undefined && Number.isNaN(Date.parse(createdFromIso))) ||
    (createdToIso !== undefined && Number.isNaN(Date.parse(createdToIso)))
  ) {
    throw new PlatformApiError(
      'Platform admin order exception created time query is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    createdFromIso !== undefined &&
    createdToIso !== undefined &&
    Date.parse(createdFromIso) >= Date.parse(createdToIso)
  ) {
    throw new PlatformApiError(
      'Platform admin order exception createdFromIso must be earlier than createdToIso',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  return {
    ...(status ? { status } : {}),
    ...(sourceRole ? { sourceRole } : {}),
    ...(compensationStatus ? { compensationStatus } : {}),
    ...(appealStatus ? { appealStatus } : {}),
    ...(slaStatus ? { slaStatus } : {}),
    ...(claimStatus ? { claimStatus } : {}),
    ...(claimedByAdminUserId ? { claimedByAdminUserId } : {}),
    ...(keyword ? { keyword } : {}),
    ...(createdFromIso ? { createdFromIso } : {}),
    ...(createdToIso ? { createdToIso } : {}),
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminOrderExceptionCaseBaseUpdatedAtIso(value: unknown) {
  const normalizedValue = normalizeRequiredTrimmedString(
    value,
    40,
    'Platform admin order exception baseUpdatedAtIso is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );

  if (
    !PLATFORM_ORDER_DATE_TIME_WITH_OFFSET_PATTERN.test(normalizedValue) ||
    Number.isNaN(Date.parse(normalizedValue))
  ) {
    throw new PlatformApiError(
      'Platform admin order exception baseUpdatedAtIso is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  return normalizedValue;
}

function normalizeAdminOrderExceptionCaseUpdateRequest(
  request: PlatformAdminUpdateOrderExceptionCaseRequest,
): PlatformAdminUpdateOrderExceptionCaseRequest {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order exception update request must be an object',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  return {
    baseUpdatedAtIso: normalizeAdminOrderExceptionCaseBaseUpdatedAtIso(
      request.baseUpdatedAtIso,
    ),
    content: normalizeRequiredTrimmedString(
      request.content,
      500,
      'Platform admin order exception content is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      6,
    ),
  };
}

function normalizeAdminOrderExceptionCaseClaimRequest(
  request: PlatformAdminClaimOrderExceptionCaseRequest,
): PlatformAdminClaimOrderExceptionCaseRequest {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order exception claim request must be an object',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  const normalizedContent = normalizeOptionalTrimmedString(
    request.content,
    200,
    'Platform admin order exception claim content is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  );

  return {
    baseUpdatedAtIso: normalizeAdminOrderExceptionCaseBaseUpdatedAtIso(
      request.baseUpdatedAtIso,
    ),
    ...(normalizedContent ? { content: normalizedContent } : {}),
  };
}

function normalizeAdminOrderExceptionCaseResolveRequest(
  request: PlatformAdminResolveOrderExceptionCaseRequest,
): PlatformAdminResolveOrderExceptionCaseRequest {
  const normalizedUpdateRequest =
    normalizeAdminOrderExceptionCaseUpdateRequest(request);
  const compensationStatus = normalizeRequiredTrimmedString(
    request.compensationStatus,
    20,
    'Platform admin order exception compensationStatus is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as PlatformAdminResolveOrderExceptionCaseRequest['compensationStatus'];
  const appealDecision = normalizeOptionalTrimmedString(
    request.appealDecision,
    20,
    'Platform admin order exception appealDecision is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as PlatformOrderExceptionCaseAppealDecision | undefined;
  const compensationTargetRole = normalizeOptionalTrimmedString(
    request.compensationTargetRole,
    20,
    'Platform admin order exception compensationTargetRole is invalid',
    ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
  ) as
    | PlatformOrderExceptionCaseCompensationTargetRole
    | undefined;
  const compensationAmountCents = request.compensationAmountCents;

  if (
    compensationStatus !== 'not_required' &&
    compensationStatus !== 'pending' &&
    compensationStatus !== 'offline_completed'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception compensationStatus is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    appealDecision !== undefined &&
    appealDecision !== 'accepted' &&
    appealDecision !== 'rejected'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception appealDecision is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    compensationTargetRole !== undefined &&
    compensationTargetRole !== 'shipper' &&
    compensationTargetRole !== 'driver'
  ) {
    throw new PlatformApiError(
      'Platform admin order exception compensationTargetRole is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (compensationStatus === 'not_required') {
    if (
      compensationTargetRole !== undefined ||
      compensationAmountCents !== undefined
    ) {
      throw new PlatformApiError(
        'Platform admin order exception compensation payload is invalid',
        ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
        0,
      );
    }

    return {
      ...normalizedUpdateRequest,
      compensationStatus,
      ...(appealDecision ? { appealDecision } : {}),
    };
  }

  if (!compensationTargetRole) {
    throw new PlatformApiError(
      'Platform admin order exception compensationTargetRole is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  if (
    !Number.isInteger(compensationAmountCents) ||
    Number(compensationAmountCents) <= 0 ||
    Number(compensationAmountCents) > 100000000
  ) {
    throw new PlatformApiError(
      'Platform admin order exception compensationAmountCents is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  return {
    ...normalizedUpdateRequest,
    compensationStatus,
    ...(appealDecision ? { appealDecision } : {}),
    compensationTargetRole,
    compensationAmountCents: Number(compensationAmountCents),
  };
}

function normalizeAdminOrderExceptionCaseCompensationExecutionRequest(
  request: PlatformAdminExecuteOrderExceptionCaseCompensationRequest,
): PlatformAdminExecuteOrderExceptionCaseCompensationRequest {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order exception compensation execution request must be an object',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      0,
    );
  }

  return {
    baseUpdatedAtIso: normalizeAdminOrderExceptionCaseBaseUpdatedAtIso(
      request.baseUpdatedAtIso,
    ),
    idempotencyKey: normalizeRequiredTrimmedString(
      request.idempotencyKey,
      200,
      'Platform admin order exception compensation idempotencyKey is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      8,
    ),
    content: normalizeRequiredTrimmedString(
      request.content,
      500,
      'Platform admin order exception compensation content is invalid',
      ADMIN_ORDER_EXCEPTION_REQUEST_INVALID,
      6,
    ),
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

function createOrderMutationRequestOptions(idempotencyKey: string) {
  return {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  };
}

function normalizeOrderMutationIdempotencyKey(
  value: unknown,
  errorCode:
    | 'PLATFORM_ORDER_REQUEST_INVALID'
    | 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID'
    | 'PLATFORM_ORDER_COMPLETE_REQUEST_INVALID'
    | 'PLATFORM_ORDER_STATUS_REQUEST_INVALID'
    | 'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID'
    | 'PLATFORM_ORDER_BONUS_REQUEST_INVALID',
) {
  if (typeof value !== 'string') {
    throw new PlatformApiError(
      'Platform order Idempotency-Key is invalid',
      errorCode,
      0,
    );
  }

  const normalizedValue = value.trim();

  if (
    !normalizedValue ||
    normalizedValue.length > 64 ||
    !PLATFORM_ORDER_IDEMPOTENCY_KEY_PATTERN.test(normalizedValue)
  ) {
    throw new PlatformApiError(
      'Platform order Idempotency-Key is invalid',
      errorCode,
      0,
    );
  }

  return normalizedValue;
}

function normalizeOrderMutationBaseUpdatedAtIso(
  value: unknown,
  errorCode:
    | 'PLATFORM_ORDER_REQUEST_INVALID'
    | 'PLATFORM_ORDER_CANCEL_REQUEST_INVALID'
    | 'PLATFORM_ORDER_COMPLETE_REQUEST_INVALID'
    | 'PLATFORM_ORDER_STATUS_REQUEST_INVALID'
    | 'PLATFORM_ORDER_ACCEPT_QUOTE_REQUEST_INVALID'
    | 'PLATFORM_ORDER_BONUS_REQUEST_INVALID'
    | 'PLATFORM_ORDER_EXCEPTION_APPEAL_REQUEST_INVALID',
) {
  if (typeof value !== 'string') {
    throw new PlatformApiError(
      'Platform order baseUpdatedAtIso is invalid',
      errorCode,
      0,
    );
  }

  const normalizedValue = value.trim();

  if (
    !normalizedValue ||
    !PLATFORM_ORDER_DATE_TIME_WITH_OFFSET_PATTERN.test(normalizedValue) ||
    Number.isNaN(Date.parse(normalizedValue))
  ) {
    throw new PlatformApiError(
      'Platform order baseUpdatedAtIso is invalid',
      errorCode,
      0,
    );
  }

  return normalizedValue;
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

function assertValidAdminOrderFiltersQuery(query: PlatformAdminOrderFilters) {
  assertValidListOrdersQuery(query);
}

function assertValidAdminOrderReportQuery(query: PlatformAdminOrderReportQuery) {
  assertValidAdminOrderFiltersQuery(query);

  if (
    query.topShippersLimit !== undefined &&
    (!Number.isInteger(query.topShippersLimit) ||
      query.topShippersLimit < 1 ||
      query.topShippersLimit > 20)
  ) {
    throw new PlatformApiError(
      'Platform admin order report topShippersLimit must be an integer from 1 to 20',
      'PLATFORM_ORDER_LIST_QUERY_INVALID',
      0,
    );
  }
}

function assertValidAdminOrderAttachmentAuditListQuery(
  query: PlatformAdminOrderAttachmentAuditListQuery,
) {
  const queryInput = query as unknown;

  if (
    queryInput === null ||
    typeof queryInput !== 'object' ||
    Array.isArray(queryInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order attachment query must be an object',
      'PLATFORM_ADMIN_ORDER_ATTACHMENT_REQUEST_INVALID',
      0,
    );
  }

  assertValidListOrdersQuery(query);

  if (
    query.shipperId !== undefined &&
    (typeof query.shipperId !== 'string' ||
      query.shipperId.trim().length > 120)
  ) {
    throw new PlatformApiError(
      'Platform admin order attachment shipperId is invalid',
      'PLATFORM_ADMIN_ORDER_ATTACHMENT_REQUEST_INVALID',
      0,
    );
  }

  if (
    query.hasMissingFiles !== undefined &&
    typeof query.hasMissingFiles !== 'boolean'
  ) {
    throw new PlatformApiError(
      'Platform admin order attachment hasMissingFiles is invalid',
      'PLATFORM_ADMIN_ORDER_ATTACHMENT_REQUEST_INVALID',
      0,
    );
  }
}

function normalizeAdminOrderChangeRequestsQuery(
  query: PlatformListAdminOrderChangeRequestsQuery,
) {
  const queryInput = query as unknown;

  if (
    queryInput === null ||
    typeof queryInput !== 'object' ||
    Array.isArray(queryInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order change request query must be an object',
      'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  const status = query.status ?? 'pending';
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (
    status !== 'pending' &&
    status !== 'approved' &&
    status !== 'rejected'
  ) {
    throw new PlatformApiError(
      'Platform admin order change request status is invalid',
      'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new PlatformApiError(
      'Platform admin order change request page is invalid',
      'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new PlatformApiError(
      'Platform admin order change request pageSize is invalid',
      'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  return {
    status,
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminOrderChangeRequestReviewRequest(
  request: PlatformReviewAdminOrderChangeRequest,
) {
  const requestInput = request as unknown;

  if (
    requestInput === null ||
    typeof requestInput !== 'object' ||
    Array.isArray(requestInput)
  ) {
    throw new PlatformApiError(
      'Platform admin order change request review body must be an object',
      'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  if (request.decision !== 'approved' && request.decision !== 'rejected') {
    throw new PlatformApiError(
      'Platform admin order change request decision is invalid',
      'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
      0,
    );
  }

  const reviewResultText = normalizeOptionalTrimmedString(
    request.reviewResultText,
    200,
    'Platform admin order change request reviewResultText is invalid',
    'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
  );
  const costImpactText = normalizeOptionalTrimmedString(
    request.costImpactText,
    200,
    'Platform admin order change request costImpactText is invalid',
    'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
  );
  const refundText = normalizeOptionalTrimmedString(
    request.refundText,
    200,
    'Platform admin order change request refundText is invalid',
    'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
  );
  const driverNoticeText = normalizeOptionalTrimmedString(
    request.driverNoticeText,
    200,
    'Platform admin order change request driverNoticeText is invalid',
    'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
  );
  const adjustedPayablePriceCentsInput = (
    request as PlatformReviewAdminOrderChangeRequest
  ).adjustedPayablePriceCents;
  let adjustedPayablePriceCents: number | undefined;
  if (adjustedPayablePriceCentsInput !== undefined) {
    if (
      typeof adjustedPayablePriceCentsInput !== 'number' ||
      !Number.isInteger(adjustedPayablePriceCentsInput) ||
      adjustedPayablePriceCentsInput < 100 ||
      adjustedPayablePriceCentsInput > 10_000_000
    ) {
      throw new PlatformApiError(
        'Platform admin order change request adjustedPayablePriceCents is invalid',
        'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
        0,
      );
    }
    if (request.decision === 'rejected') {
      throw new PlatformApiError(
        'Platform admin order change request cannot adjust price when rejected',
        'PLATFORM_ADMIN_ORDER_CHANGE_REQUEST_INVALID',
        0,
      );
    }
    adjustedPayablePriceCents = adjustedPayablePriceCentsInput;
  }

  return {
    decision: request.decision,
    ...(reviewResultText ? { reviewResultText } : {}),
    ...(costImpactText ? { costImpactText } : {}),
    ...(refundText ? { refundText } : {}),
    ...(driverNoticeText ? { driverNoticeText } : {}),
    ...(adjustedPayablePriceCents !== undefined
      ? { adjustedPayablePriceCents }
      : {}),
  };
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

function createOrderListSearchParams(
  query: PlatformAdminOrderFilters & {
    page?: number;
    pageSize?: number;
  },
) {
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

  return searchParams;
}

function createListOrdersPath(query: PlatformListShipperOrdersQuery) {
  const searchParams = createOrderListSearchParams(query);
  const queryString = searchParams.toString();

  return queryString ? `/shipper/orders?${queryString}` : '/shipper/orders';
}

function createAdminListOrdersPath(query: PlatformListShipperOrdersQuery) {
  const queryString = createOrderListSearchParams(query).toString();

  return queryString ? `/admin/orders?${queryString}` : '/admin/orders';
}

function createAdminOrderReportPath(query: PlatformAdminOrderReportQuery) {
  const searchParams = createOrderListSearchParams(query);

  if (query.topShippersLimit !== undefined) {
    searchParams.set('topShippersLimit', String(query.topShippersLimit));
  }

  const queryString = searchParams.toString();

  return queryString
    ? `/admin/orders/report?${queryString}`
    : '/admin/orders/report';
}

function createAdminOrdersExportPath(query: PlatformAdminOrderFilters) {
  const queryString = createOrderListSearchParams(query).toString();

  return queryString
    ? `/admin/orders/export?${queryString}`
    : '/admin/orders/export';
}

function createAdminOrderAttachmentAuditListPath(
  query: PlatformAdminOrderAttachmentAuditListQuery,
) {
  const searchParams = createOrderListSearchParams(query);
  const shipperId = normalizeOptionalTrimmedString(
    query.shipperId,
    120,
    'Platform admin order attachment shipperId is invalid',
    'PLATFORM_ADMIN_ORDER_ATTACHMENT_REQUEST_INVALID',
  );

  if (shipperId) {
    searchParams.set('shipperId', shipperId);
  }

  if (query.hasMissingFiles !== undefined) {
    searchParams.set('hasMissingFiles', String(query.hasMissingFiles));
  }

  const queryString = searchParams.toString();

  return queryString
    ? `/admin/orders/attachments?${queryString}`
    : '/admin/orders/attachments';
}

function createAdminOrderChangeRequestsPath(
  query: ReturnType<typeof normalizeAdminOrderChangeRequestsQuery>,
) {
  const queryString = new URLSearchParams(query).toString();

  return `/admin/orders/change-requests?${queryString}`;
}

function createAdminOrderExceptionCasesPath(
  query: ReturnType<typeof normalizeAdminOrderExceptionCasesQuery>,
) {
  const queryString = new URLSearchParams(query).toString();

  return `/admin/order-exception-cases?${queryString}`;
}

function normalizeRequiredTrimmedString(
  value: unknown,
  maxLength: number,
  message: string,
  errorCode: string,
  minLength = 1,
) {
  if (typeof value !== 'string') {
    throw new PlatformApiError(message, errorCode, 0);
  }

  const normalizedValue = value.trim();

  if (
    normalizedValue.length < minLength ||
    normalizedValue.length > maxLength
  ) {
    throw new PlatformApiError(message, errorCode, 0);
  }

  return normalizedValue;
}

function normalizeOptionalTrimmedString(
  value: unknown,
  maxLength: number,
  message: string,
  errorCode: string,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new PlatformApiError(message, errorCode, 0);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue.length > maxLength) {
    throw new PlatformApiError(message, errorCode, 0);
  }

  return normalizedValue;
}

async function platformGetText(
  config: PlatformApiConfig,
  path: string,
): Promise<PlatformAdminOrdersCsvExport> {
  const accessToken = config.getAccessToken?.();
  const requestId = config.getRequestId?.();

  if (!accessToken) {
    throw new PlatformApiError(
      'Platform API access token is missing',
      'AUTH_ACCESS_TOKEN_MISSING',
      0,
    );
  }

  let response: Response;

  try {
    response = await fetch(createPlatformRequestUrl(config.baseUrl, path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
    });
  } catch {
    throw new PlatformApiError(
      'Platform API network request failed',
      'NETWORK_ERROR',
      0,
    );
  }

  if (!response.ok) {
    throw await createTextResponseApiError(response);
  }

  let content: string;

  try {
    content = await response.text();
  } catch {
    throw new PlatformApiError(
      'Platform API response is invalid',
      'PLATFORM_RESPONSE_INVALID',
      response.status,
    );
  }

  return {
    filename: extractDownloadFilename(
      response.headers.get('content-disposition'),
    ),
    contentType:
      response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
    content,
  };
}

async function createTextResponseApiError(response: Response) {
  try {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as PlatformApiErrorBody) : undefined;

    if (payload?.code && payload.message) {
      return new PlatformApiError(
        payload.message,
        payload.code,
        response.status,
        payload.requestId,
      );
    }
  } catch {
    // Fall through to the generic error below.
  }

  return new PlatformApiError(
    `Platform API request failed: ${response.status}`,
    'HTTP_ERROR',
    response.status,
  );
}

function createPlatformRequestUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function extractDownloadFilename(contentDisposition: string | null) {
  const matched = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '');

  return matched ? matched[1] : 'admin-orders.csv';
}

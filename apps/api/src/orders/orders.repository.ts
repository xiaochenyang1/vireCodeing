import { randomUUID } from 'crypto';
import type {
  AdminBatchCancelOrderItem,
  AdminOrderChangeRequestRecord,
  AdvanceShipperOrderStatusRequest,
  BatchCancelAdminOrdersRequest,
  BatchCancelAdminOrdersResult,
  CancelShipperOrderRequest,
  CreateShipperOrderRequest,
  AdminOrderAttachmentAuditListQuery,
  ListAdminOrderChangeRequestsQuery,
  ListAdminOrderChangeRequestsResult,
  ListShipperOrdersQuery,
  ReportShipperOrderExceptionRequest,
  ReviewShipperOrderChangeRequest,
  ShipperOrderEventRecord,
  ShipperOrderRecord,
  SubmitShipperOrderChangeRequest,
  SubmitShipperOrderEvaluationRequest,
} from './dto';
import type {
  DriverAcceptOrderEventPayload,
  DriverAdvanceOrderStatusRequest,
  DriverEvaluateShipperRequest,
  DriverMyOrdersQuery,
  DriverOrderHallQuery,
  DriverQuoteOrderEventPayload,
  DriverReplyEvaluationRequest,
  DriverReportExceptionRequest,
} from '../driver-orders/dto';
import type {
  OrderExceptionCaseListQuery,
  ResolveOrderExceptionCaseRequest,
  OrderExceptionCaseRecord,
  OrderExceptionCaseSourceRole,
  OrderExceptionCaseStatus,
  UpdateOrderExceptionCaseRequest,
} from '../order-exception-cases/dto';
import {
  ADMIN_ORDER_BATCH_CANCEL_IDEMPOTENCY_OPERATION,
  type OrderMutationOperation,
} from './order-mutation-idempotency';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ShipperCouponRecord } from '../profile-coupons/dto';
import {
  InMemoryProfileCouponsStore,
  mapPrismaCoupon,
  type PrismaShipperCouponRecord,
} from '../profile-coupons/profile-coupons.repository';
import {
  assertCurrentOrderCouponOwnership,
  resolveCurrentOrderCouponPricing,
  resolveReservableCouponPricing,
  type CanonicalOrderCouponPricing,
} from './order-coupon-transition';
import {
  assertLedgerBalanced,
  assertOrderCanEnterDriverHall,
  assertOrderCanCompleteFinancially,
  createDriverCompensationEntries,
  createOfflineSettlementEntries,
  createInitialOrderPaymentStatus,
  createOnlineSettlementEntries,
  createSettlementBreakdown,
  createShipperCompensationEntries,
  resolveCancellationPaymentStatus,
  resolveCancellationPenaltyCents,
} from '../payments/payment-domain';
import { InMemoryFinancialStore } from '../payments/in-memory-financial.store';
import type {
  FinancialTransactionRecord,
  PaymentOrderRecord,
  SettlementRecord,
} from '../payments/dto';
import { haversineDistanceMeters } from '../maps/map-provider';

const DEFAULT_PLATFORM_FEE_RATE_BPS = 500;

export type ExecuteOrderCreateInput = {
  actorUserId: string;
  operation: 'shipper_create';
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAtIso: string;
  input: CreateShipperOrderRequest;
};

export type ResolveExistingOrderCreateInput = Pick<
  ExecuteOrderCreateInput,
  'actorUserId' | 'operation' | 'idempotencyKey' | 'requestFingerprint'
>;

export type ExecuteOrderCreateResult =
  | {
      kind: 'success';
      order: ShipperOrderRecord;
      replayed: boolean;
    }
  | {
      kind: 'key-reused';
    }
  | {
      kind: 'key-expired';
    };

export type ShipperAcceptQuoteMutationInput = {
  driverId: string;
  quoteCents: number;
  arrivalText: string;
  noteText?: string;
  driverSnapshot?: DriverQuoteOrderEventPayload['driverSnapshot'];
};

export type OrderMutationCommand =
  | {
      type: 'shipper_update';
      input: CreateShipperOrderRequest;
    }
  | {
      type: 'shipper_cancel';
      input: Omit<CancelShipperOrderRequest, 'baseUpdatedAtIso'>;
    }
  | {
      type: 'shipper_status';
      input: Pick<AdvanceShipperOrderStatusRequest, 'nextStatus'>;
    }
  | {
      type: 'shipper_complete';
    }
  | {
      type: 'shipper_accept_quote';
      input: ShipperAcceptQuoteMutationInput;
    }
  | {
      type: 'shipper_add_bonus';
      input: {
        bonusCents: number;
      };
    }
  | {
      type: 'driver_accept';
      input: DriverAcceptOrderEventPayload;
    }
  | {
      type: 'driver_status';
      input: Omit<DriverAdvanceOrderStatusRequest, 'baseUpdatedAtIso'>;
    };

export type ExecuteOrderMutationInput = {
  actorUserId: string;
  orderId: string;
  operation: OrderMutationOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  baseUpdatedAtIso: string;
  expiresAtIso: string;
  mutation: OrderMutationCommand;
};

export type ResolveExistingOrderMutationInput = Pick<
  ExecuteOrderMutationInput,
  | 'actorUserId'
  | 'orderId'
  | 'operation'
  | 'idempotencyKey'
  | 'requestFingerprint'
>;

export type ExecuteOrderMutationResult =
  | {
      kind: 'success';
      order: ShipperOrderRecord;
      replayed: boolean;
    }
  | {
      kind: 'conflict';
    }
  | {
      kind: 'key-reused';
    }
  | {
      kind: 'key-expired';
    }
  | {
      kind: 'state-invalid';
    }
  | {
      kind: 'not-found';
    };

export type BatchCancelAdminOrdersIdempotencyOperation =
  typeof ADMIN_ORDER_BATCH_CANCEL_IDEMPOTENCY_OPERATION;

export type StoredOrderIdempotencyOperation =
  | 'shipper_create'
  | OrderMutationOperation
  | BatchCancelAdminOrdersIdempotencyOperation;

export type ExecuteAdminBatchCancelInput = {
  actorUserId: string;
  operation: BatchCancelAdminOrdersIdempotencyOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAtIso: string;
  input: BatchCancelAdminOrdersRequest;
};

export type ResolveExistingAdminBatchCancelInput = Pick<
  ExecuteAdminBatchCancelInput,
  'actorUserId' | 'operation' | 'idempotencyKey' | 'requestFingerprint'
>;

export type ExecuteExceptionCaseCompensationInput = {
  caseId: string;
  adminUserId: string;
  baseUpdatedAtIso: string;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  content: string;
};

export type ExecuteExceptionCaseCompensationResult =
  | {
      kind: 'success';
      replayed: boolean;
      exceptionCase: OrderExceptionCaseRecord;
    }
  | { kind: 'not-found' }
  | { kind: 'conflict' }
  | { kind: 'key-reused' }
  | { kind: 'not-executable' }
  | { kind: 'already-executed' }
  | { kind: 'target-missing' };

export type AppealExceptionCaseInput = {
  caseId: string;
  orderId: string;
  actorUserId: string;
  actorRole: OrderExceptionCaseSourceRole;
  baseUpdatedAtIso: string;
  reason: string;
};

export type AppealExceptionCaseResult =
  | {
      kind: 'success';
      exceptionCase: OrderExceptionCaseRecord;
    }
  | { kind: 'not-found' }
  | { kind: 'conflict' }
  | { kind: 'not-allowed' };

export interface OrdersRepository {
  executeIdempotentOrderCreate(
    input: ExecuteOrderCreateInput,
  ): Promise<ExecuteOrderCreateResult>;
  resolveExistingOrderCreate(
    input: ResolveExistingOrderCreateInput,
  ): Promise<ExecuteOrderCreateResult | undefined>;
  listOrders(
    shipperId: string,
    query: ListShipperOrdersQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  listAdminOrders(
    query: ListShipperOrdersQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  listAdminOrdersForAttachmentAudit(
    query: AdminOrderAttachmentAuditListQuery,
  ): Promise<ShipperOrderRecord[]>;
  findOrderById(orderId: string): Promise<ShipperOrderRecord | undefined>;
  listOrderExceptionCases(
    orderId: string,
  ): Promise<{ items: OrderExceptionCaseRecord[]; total: number }>;
  listAdminOrderExceptionCases(
    query: OrderExceptionCaseListQuery,
  ): Promise<{ items: OrderExceptionCaseRecord[]; total: number }>;
  findOrderExceptionCaseById(
    caseId: string,
  ): Promise<OrderExceptionCaseRecord | undefined>;
  transitionOrderExceptionCase(
    caseId: string,
    adminUserId: string,
    expectedStatus: OrderExceptionCaseStatus,
    nextStatus: OrderExceptionCaseStatus,
    input: UpdateOrderExceptionCaseRequest | ResolveOrderExceptionCaseRequest,
  ): Promise<
    OrderExceptionCaseRecord | 'conflict' | 'state-invalid' | undefined
  >;
  executeExceptionCaseCompensation(
    input: ExecuteExceptionCaseCompensationInput,
  ): Promise<ExecuteExceptionCaseCompensationResult>;
  appealExceptionCase(
    input: AppealExceptionCaseInput,
  ): Promise<AppealExceptionCaseResult>;
  executeIdempotentOrderMutation(
    input: ExecuteOrderMutationInput,
  ): Promise<ExecuteOrderMutationResult>;
  resolveExistingOrderMutation(
    input: ResolveExistingOrderMutationInput,
  ): Promise<ExecuteOrderMutationResult | undefined>;
  executeIdempotentAdminBatchCancel(
    input: ExecuteAdminBatchCancelInput,
  ): Promise<BatchCancelAdminOrdersResult>;
  resolveExistingAdminBatchCancel(
    input: ResolveExistingAdminBatchCancelInput,
  ): Promise<BatchCancelAdminOrdersResult | undefined>;
  updateOrder(
    orderId: string,
    actorUserId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord>;
  cancelOrder(
    orderId: string,
    actorUserId: string,
    input: Omit<CancelShipperOrderRequest, 'baseUpdatedAtIso'>,
  ): Promise<ShipperOrderRecord>;
  completeOrder(
    orderId: string,
    actorUserId: string,
  ): Promise<ShipperOrderRecord>;
  advanceOrderStatus(
    orderId: string,
    actorUserId: string,
    input: Omit<AdvanceShipperOrderStatusRequest, 'baseUpdatedAtIso'>,
  ): Promise<ShipperOrderRecord>;
  reportOrderException(
    orderId: string,
    actorUserId: string,
    input: ReportShipperOrderExceptionRequest,
  ): Promise<ShipperOrderRecord>;
  submitOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderChangeRequest,
  ): Promise<ShipperOrderRecord>;
  listAdminOrderChangeRequests(
    query: ListAdminOrderChangeRequestsQuery,
  ): Promise<ListAdminOrderChangeRequestsResult>;
  reviewOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: ReviewShipperOrderChangeRequest,
  ): Promise<ShipperOrderRecord>;
  submitOrderEvaluation(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ): Promise<ShipperOrderRecord>;
  listDriverOrderHall(
    query: DriverOrderHallQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  submitDriverQuote(
    orderId: string,
    driverId: string,
    input: DriverQuoteOrderEventPayload,
  ): Promise<ShipperOrderRecord>;
  acceptDriverOrder(
    orderId: string,
    driverId: string,
    input: DriverAcceptOrderEventPayload,
  ): Promise<ShipperOrderRecord>;
  listDriverAcceptedOrders(
    driverId: string,
    query: DriverMyOrdersQuery,
  ): Promise<{ items: ShipperOrderRecord[]; total: number }>;
  listDriverCompletedOrders(driverId: string): Promise<ShipperOrderRecord[]>;
  listDriverPendingSettlementOrders(
    driverId: string,
  ): Promise<ShipperOrderRecord[]>;
  findDriverAcceptedOrder(
    driverId: string,
    orderId: string,
  ): Promise<ShipperOrderRecord | undefined>;
  advanceDriverOrderStatus(
    orderId: string,
    driverId: string,
    input: Omit<DriverAdvanceOrderStatusRequest, 'baseUpdatedAtIso'>,
  ): Promise<ShipperOrderRecord>;
  replyToOrderEvaluation(
    orderId: string,
    driverId: string,
    input: DriverReplyEvaluationRequest,
  ): Promise<ShipperOrderRecord>;
  reportDriverOrderException(
    orderId: string,
    driverId: string,
    input: DriverReportExceptionRequest,
  ): Promise<ShipperOrderRecord>;
  evaluateShipper(
    orderId: string,
    driverId: string,
    input: DriverEvaluateShipperRequest,
  ): Promise<ShipperOrderRecord>;
}

type InMemoryOrderIdempotencyRecord = {
  actorUserId: string;
  orderId: string;
  operation: StoredOrderIdempotencyOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  responseSnapshot: unknown;
  createdAtIso: string;
  expiresAtIso: string;
};

export class InMemoryOrdersRepository implements OrdersRepository {
  private readonly orders: ShipperOrderRecord[] = [];
  private readonly exceptionCases: OrderExceptionCaseRecord[] = [];
  private readonly orderIdempotencyRecords: InMemoryOrderIdempotencyRecord[] =
    [];
  private nextOrderSequence = 1;

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly couponStore = new InMemoryProfileCouponsStore(),
    private readonly financialStore = new InMemoryFinancialStore(),
    private readonly platformFeeRateBps = DEFAULT_PLATFORM_FEE_RATE_BPS,
  ) {}

  async executeIdempotentOrderCreate(
    input: ExecuteOrderCreateInput,
  ): Promise<ExecuteOrderCreateResult> {
    const existingRecord = this.findInMemoryIdempotencyRecord(input);
    const now = this.now();

    if (existingRecord) {
      return mapExistingInMemoryOrderCreateRecord(existingRecord, input, now);
    }

    const stagedOrders = structuredClone(this.orders);
    const stagedRecords = structuredClone(this.orderIdempotencyRecords);
    const stagedCoupons = this.couponStore.clone();
    const sequence = this.allocateNextOrderSequence();
    const order = createInMemoryOrderRecord(
      input.actorUserId,
      input.input,
      now,
      sequence,
    );

    reserveInMemoryOrderCoupon(
      stagedCoupons,
      input.actorUserId,
      input.input,
      order.orderNo,
      now,
    );
    stagedOrders.push(order);
    stagedRecords.push({
      actorUserId: input.actorUserId,
      orderId: order.id,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot: cloneOrderRecord(order),
      createdAtIso: now.toISOString(),
      expiresAtIso: input.expiresAtIso,
    });

    this.orders.splice(0, this.orders.length, ...stagedOrders);
    this.orderIdempotencyRecords.splice(
      0,
      this.orderIdempotencyRecords.length,
      ...stagedRecords,
    );
    this.couponStore.replace(stagedCoupons);

    return {
      kind: 'success',
      order: cloneOrderRecord(order),
      replayed: false,
    };
  }

  async resolveExistingOrderCreate(
    input: ResolveExistingOrderCreateInput,
  ): Promise<ExecuteOrderCreateResult | undefined> {
    const existingRecord = this.findInMemoryIdempotencyRecord(input);

    return existingRecord
      ? mapExistingInMemoryOrderCreateRecord(
          existingRecord,
          input,
          this.now(),
        )
      : undefined;
  }

  async seedOrderForTest(
    shipperId: string,
    input: CreateShipperOrderRequest,
  ): Promise<ShipperOrderRecord> {
    const order = createInMemoryOrderRecord(
      shipperId,
      input,
      this.now(),
      this.allocateNextOrderSequence(),
    );

    this.orders.push(order);

    return order;
  }

  private allocateNextOrderSequence() {
    return this.nextOrderSequence++;
  }

  private findInMemoryIdempotencyRecord(
    input: {
      actorUserId: string;
      operation: StoredOrderIdempotencyOperation;
      idempotencyKey: string;
    },
  ) {
    return this.orderIdempotencyRecords.find(
      record =>
        record.actorUserId === input.actorUserId &&
        record.operation === input.operation &&
        record.idempotencyKey === input.idempotencyKey,
    );
  }

  async listOrders(shipperId: string, query: ListShipperOrdersQuery) {
    const matchedOrders = this.orders.filter(order => {
      return (
        order.shipperId === shipperId &&
        isOrderMatchedByStatus(order, query) &&
        isOrderInCreatedRange(order, query) &&
        isOrderMatchedByKeyword(order, query.keyword)
      );
    });
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedOrders.slice(startIndex, startIndex + query.pageSize),
      total: matchedOrders.length,
    };
  }

  async listAdminOrders(query: ListShipperOrdersQuery) {
    const matchedOrders = this.orders.filter(order => {
      return (
        isOrderMatchedByStatus(order, query) &&
        isOrderInCreatedRange(order, query) &&
        isOrderMatchedByKeyword(order, query.keyword)
      );
    });
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedOrders.slice(startIndex, startIndex + query.pageSize),
      total: matchedOrders.length,
    };
  }

  async listAdminOrdersForAttachmentAudit(
    query: AdminOrderAttachmentAuditListQuery,
  ) {
    return this.orders.filter(order => {
      return (
        isOrderInCreatedRange(order, query) &&
        isOrderMatchedByKeyword(order, query.keyword)
      );
    });
  }

  async findOrderById(orderId: string) {
    return this.orders.find(order => order.id === orderId);
  }

  async listOrderExceptionCases(orderId: string) {
    const items = this.exceptionCases
      .filter(exceptionCase => exceptionCase.orderId === orderId)
      .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));

    return { items, total: items.length };
  }

  async listAdminOrderExceptionCases(query: OrderExceptionCaseListQuery) {
    const matched = this.exceptionCases.filter(exceptionCase => {
      const searchable = `${exceptionCase.caseNo} ${exceptionCase.orderNo}`.toLocaleLowerCase();
      const keyword = query.keyword?.toLocaleLowerCase();

      return (
        (!query.status || exceptionCase.status === query.status) &&
        (!query.sourceRole || exceptionCase.sourceRole === query.sourceRole) &&
        (!keyword || searchable.includes(keyword)) &&
        (!query.createdFromIso || exceptionCase.createdAtIso >= query.createdFromIso) &&
        (!query.createdToIso || exceptionCase.createdAtIso < query.createdToIso)
      );
    });
    const start = (query.page - 1) * query.pageSize;

    return {
      items: matched.slice(start, start + query.pageSize),
      total: matched.length,
    };
  }

  async findOrderExceptionCaseById(caseId: string) {
    return this.exceptionCases.find(exceptionCase => exceptionCase.id === caseId);
  }

  async transitionOrderExceptionCase(
    caseId: string,
    adminUserId: string,
    expectedStatus: OrderExceptionCaseStatus,
    nextStatus: OrderExceptionCaseStatus,
    input: UpdateOrderExceptionCaseRequest | ResolveOrderExceptionCaseRequest,
  ) {
    const exceptionCase = this.exceptionCases.find(item => item.id === caseId);

    if (!exceptionCase) {
      return undefined;
    }

    if (exceptionCase.status !== expectedStatus) {
      return 'state-invalid' as const;
    }

    if (exceptionCase.updatedAtIso !== input.baseUpdatedAtIso) {
      return 'conflict' as const;
    }

    const updatedAtIso = createNextUpdatedAtIso(
      exceptionCase.updatedAtIso,
      this.now(),
    );
    exceptionCase.actions.push({
      id: `exception-action-${exceptionCase.actions.length + 1}`,
      adminUserId,
      fromStatus: expectedStatus,
      toStatus: nextStatus,
      content: input.content,
      createdAtIso: updatedAtIso,
    });
    exceptionCase.status = nextStatus;
    exceptionCase.updatedAtIso = updatedAtIso;

    if (nextStatus === 'resolved') {
      exceptionCase.resolutionText = input.content;
      exceptionCase.resolvedAtIso = updatedAtIso;
      if ('compensationStatus' in input) {
        exceptionCase.compensationStatus = input.compensationStatus;
        exceptionCase.compensationTargetRole = input.compensationTargetRole;
        exceptionCase.compensationAmountCents = input.compensationAmountCents;
        exceptionCase.compensationUpdatedAtIso = updatedAtIso;
      }
    }

    if (nextStatus === 'closed') {
      exceptionCase.closedAtIso = updatedAtIso;
    }

    const order = this.orders.find(currentOrder => currentOrder.id === exceptionCase.orderId);
    if (order) {
      order.latestExceptionCase = createExceptionCaseSummary(exceptionCase);
    }

    return exceptionCase;
  }

  async executeExceptionCaseCompensation(
    input: ExecuteExceptionCaseCompensationInput,
  ): Promise<ExecuteExceptionCaseCompensationResult> {
    const action = 'exception_compensation.execute';
    const existingAuditLog = this.financialStore.findFinancialAuditLog(
      input.adminUserId,
      action,
      input.idempotencyKey,
    );

    if (existingAuditLog) {
      if (
        existingAuditLog.requestFingerprint !== input.requestFingerprint ||
        existingAuditLog.entityId !== input.caseId
      ) {
        return { kind: 'key-reused' };
      }

      const replayed = this.exceptionCases.find(
        item => item.id === input.caseId,
      );

      return replayed
        ? {
            kind: 'success',
            replayed: true,
            exceptionCase: structuredClone(replayed),
          }
        : { kind: 'not-found' };
    }

    const exceptionCase = this.exceptionCases.find(
      item => item.id === input.caseId,
    );

    if (!exceptionCase) {
      return { kind: 'not-found' };
    }

    if (
      exceptionCase.compensationStatus === 'executed' ||
      exceptionCase.compensationTransactionId !== undefined
    ) {
      return { kind: 'already-executed' };
    }

    if (
      exceptionCase.status !== 'resolved' ||
      exceptionCase.compensationStatus !== 'pending' ||
      exceptionCase.compensationTargetRole === undefined ||
      exceptionCase.compensationAmountCents === undefined
    ) {
      return { kind: 'not-executable' };
    }

    if (exceptionCase.updatedAtIso !== input.baseUpdatedAtIso) {
      return { kind: 'conflict' };
    }

    const order = this.orders.find(
      currentOrder => currentOrder.id === exceptionCase.orderId,
    );

    if (!order) {
      return { kind: 'not-found' };
    }

    const targetUserId = resolveCompensationTargetUserId(
      order,
      exceptionCase.compensationTargetRole,
    );

    if (!targetUserId) {
      return { kind: 'target-missing' };
    }

    const amountCents = exceptionCase.compensationAmountCents;
    const now = this.now();
    const nowIso = now.toISOString();
    const entryDrafts =
      exceptionCase.compensationTargetRole === 'driver'
        ? createDriverCompensationEntries(amountCents, targetUserId)
        : createShipperCompensationEntries(amountCents, targetUserId);
    assertLedgerBalanced(entryDrafts);

    const transactionId = randomUUID();
    const transaction: FinancialTransactionRecord = {
      id: transactionId,
      transactionNo: `FT-${transactionId}`,
      type: 'order_compensation',
      referenceId: exceptionCase.id,
      orderId: exceptionCase.orderId,
      amountCents,
      occurredAtIso: nowIso,
      createdAtIso: nowIso,
      entries: entryDrafts.map((entry, sequence) => ({
        id: randomUUID(),
        transactionId,
        sequence,
        accountType: entry.accountType,
        ...(entry.accountUserId ? { accountUserId: entry.accountUserId } : {}),
        direction: entry.direction,
        amountCents: entry.amountCents,
        createdAtIso: nowIso,
      })),
    };
    const persistedTransaction =
      this.financialStore.createFinancialTransaction(transaction);

    if (persistedTransaction.id !== transactionId) {
      // A compensation transaction for this case already exists.
      return { kind: 'already-executed' };
    }

    if (exceptionCase.compensationTargetRole === 'driver') {
      this.financialStore.creditDriverWallet(targetUserId, amountCents, now);
    }

    const beforeSnapshot = structuredClone(exceptionCase);
    const updatedAtIso = createNextUpdatedAtIso(
      exceptionCase.updatedAtIso,
      now,
    );
    exceptionCase.compensationStatus = 'executed';
    exceptionCase.compensationTransactionId = transactionId;
    exceptionCase.compensationExecutedAtIso = nowIso;
    exceptionCase.compensationUpdatedAtIso = updatedAtIso;
    exceptionCase.updatedAtIso = updatedAtIso;

    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: input.adminUserId,
      eventType: 'exception_compensation_executed',
      noteText: createExceptionCompensationNote(
        exceptionCase.compensationTargetRole,
        amountCents,
      ),
      createdAtIso: nowIso,
    });
    order.latestExceptionCase = createExceptionCaseSummary(exceptionCase);

    this.financialStore.createFinancialAuditLog({
      id: randomUUID(),
      actorAdminId: input.adminUserId,
      action,
      entityType: 'order_exception_case',
      entityId: exceptionCase.id,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      requestId: input.requestId,
      reason: input.content,
      beforeState: { exceptionCase: beforeSnapshot },
      afterState: {
        exceptionCase: structuredClone(exceptionCase),
        financialTransactionId: transactionId,
      },
      createdAtIso: nowIso,
    });

    return {
      kind: 'success',
      replayed: false,
      exceptionCase: structuredClone(exceptionCase),
    };
  }

  async appealExceptionCase(
    input: AppealExceptionCaseInput,
  ): Promise<AppealExceptionCaseResult> {
    const exceptionCase = this.exceptionCases.find(
      item => item.id === input.caseId && item.orderId === input.orderId,
    );

    if (!exceptionCase) {
      return { kind: 'not-found' };
    }

    const order = this.orders.find(
      currentOrder => currentOrder.id === input.orderId,
    );

    if (!order || !isAppealActorRelated(order, input)) {
      return { kind: 'not-found' };
    }

    if (
      exceptionCase.status !== 'resolved' ||
      exceptionCase.compensationStatus === 'executed' ||
      exceptionCase.appealStatus === 'requested'
    ) {
      return { kind: 'not-allowed' };
    }

    if (exceptionCase.updatedAtIso !== input.baseUpdatedAtIso) {
      return { kind: 'conflict' };
    }

    const now = this.now();
    const nowIso = now.toISOString();
    const updatedAtIso = createNextUpdatedAtIso(
      exceptionCase.updatedAtIso,
      now,
    );
    exceptionCase.actions.push({
      id: `exception-action-${exceptionCase.actions.length + 1}`,
      adminUserId: input.actorUserId,
      fromStatus: 'resolved',
      toStatus: 'processing',
      content: input.reason,
      createdAtIso: updatedAtIso,
    });
    exceptionCase.status = 'processing';
    exceptionCase.appealStatus = 'requested';
    exceptionCase.appealReason = input.reason;
    exceptionCase.appealRequestedAtIso = updatedAtIso;
    exceptionCase.updatedAtIso = updatedAtIso;

    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: input.actorUserId,
      eventType: 'exception_appeal_requested',
      noteText: `${input.actorRole === 'driver' ? '司机' : '货主'}申诉：${input.reason}`,
      createdAtIso: nowIso,
    });
    order.latestExceptionCase = createExceptionCaseSummary(exceptionCase);

    return {
      kind: 'success',
      exceptionCase: structuredClone(exceptionCase),
    };
  }

  async executeIdempotentOrderMutation(
    input: ExecuteOrderMutationInput,
  ): Promise<ExecuteOrderMutationResult> {
    const now = this.now();
    const existingRecord = this.orderIdempotencyRecords.find(
      record =>
        record.actorUserId === input.actorUserId &&
        record.operation === input.operation &&
        record.idempotencyKey === input.idempotencyKey,
    );

    if (existingRecord) {
      return mapExistingInMemoryOrderIdempotencyRecord(
        existingRecord,
        input,
        now,
      );
    }

    const stagedOrders = structuredClone(this.orders);
    const stagedRecords = structuredClone(this.orderIdempotencyRecords);
    const stagedCoupons = this.couponStore.clone();
    const stagedFinancialStore = this.financialStore.clone();
    const orderIndex = stagedOrders.findIndex(
      order => order.id === input.orderId,
    );

    if (orderIndex < 0) {
      return { kind: 'not-found' };
    }

    const currentOrder = stagedOrders[orderIndex];

    if (currentOrder.updatedAtIso !== input.baseUpdatedAtIso) {
      return { kind: 'conflict' };
    }

    if (input.mutation.type === 'driver_accept') {
      assertOrderCanEnterDriverHall(currentOrder);
    }

    if (!isOrderMutationAllowed(currentOrder, input)) {
      return { kind: 'state-invalid' };
    }

    const updatedAtIso = createNextUpdatedAtIso(
      currentOrder.updatedAtIso,
      now,
    );
    const nextOrder = cloneOrderRecord(currentOrder);
    const couponPricing = applyInMemoryOrderCouponMutation(
      stagedCoupons,
      stagedOrders,
      currentOrder,
      input,
      now,
    );

    applyInMemoryOrderFinancialMutation(
      stagedFinancialStore,
      currentOrder,
      nextOrder,
      input,
      now,
      this.platformFeeRateBps,
    );

    applyInMemoryOrderMutation(
      nextOrder,
      input,
      updatedAtIso,
      stagedOrders.length,
      couponPricing,
    );

    stagedOrders[orderIndex] = nextOrder;
    stagedRecords.push({
      actorUserId: input.actorUserId,
      orderId: input.orderId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot: cloneOrderRecord(nextOrder),
      createdAtIso: now.toISOString(),
      expiresAtIso: input.expiresAtIso,
    });

    this.orders.splice(0, this.orders.length, ...stagedOrders);
    this.orderIdempotencyRecords.splice(
      0,
      this.orderIdempotencyRecords.length,
      ...stagedRecords,
    );
    this.couponStore.replace(stagedCoupons);
    this.financialStore.replace(stagedFinancialStore);

    return {
      kind: 'success',
      order: cloneOrderRecord(nextOrder),
      replayed: false,
    };
  }

  async resolveExistingOrderMutation(
    input: ResolveExistingOrderMutationInput,
  ): Promise<ExecuteOrderMutationResult | undefined> {
    const existingRecord = this.orderIdempotencyRecords.find(
      record =>
        record.actorUserId === input.actorUserId &&
        record.operation === input.operation &&
        record.idempotencyKey === input.idempotencyKey,
    );

    return existingRecord
      ? mapExistingInMemoryOrderIdempotencyRecord(
          existingRecord,
          input,
          this.now(),
        )
      : undefined;
  }

  async executeIdempotentAdminBatchCancel(
    input: ExecuteAdminBatchCancelInput,
  ): Promise<BatchCancelAdminOrdersResult> {
    const now = this.now();
    const existingRecord = this.findInMemoryIdempotencyRecord(input);

    if (existingRecord) {
      return mapExistingInMemoryAdminBatchCancelRecord(
        existingRecord,
        input,
        now,
      );
    }

    const stagedOrders = structuredClone(this.orders);
    const stagedRecords = structuredClone(this.orderIdempotencyRecords);
    const stagedCoupons = this.couponStore.clone();
    const stagedFinancialStore = this.financialStore.clone();
    const updatedOrders: ShipperOrderRecord[] = [];

    for (const item of input.input.items) {
      const orderIndex = stagedOrders.findIndex(order => order.id === item.orderId);

      if (orderIndex < 0) {
        throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
      }

      const currentOrder = stagedOrders[orderIndex];

      if (currentOrder.updatedAtIso !== item.baseUpdatedAtIso) {
        throw new BusinessError(
          ApiErrorCode.ORDER_CONFLICT,
          '订单已被其他操作更新',
        );
      }

      if (currentOrder.status !== 'waiting') {
        throw new BusinessError(
          ApiErrorCode.ORDER_STATE_INVALID,
          '当前订单状态不允许批量取消',
        );
      }

      const mutationInput = createAdminBatchCancelOrderMutationInput(
        input.actorUserId,
        item,
        input,
      );
      const updatedAtIso = createNextUpdatedAtIso(
        currentOrder.updatedAtIso,
        now,
      );
      const nextOrder = cloneOrderRecord(currentOrder);
      const couponPricing = applyInMemoryOrderCouponMutation(
        stagedCoupons,
        stagedOrders,
        currentOrder,
        mutationInput,
        now,
      );

      applyInMemoryOrderFinancialMutation(
        stagedFinancialStore,
        currentOrder,
        nextOrder,
        mutationInput,
        now,
        this.platformFeeRateBps,
      );
      applyInMemoryOrderMutation(
        nextOrder,
        mutationInput,
        updatedAtIso,
        stagedOrders.length,
        couponPricing,
      );

      stagedOrders[orderIndex] = nextOrder;
      updatedOrders.push(cloneOrderRecord(nextOrder));
    }

    const responseSnapshot = createBatchCancelAdminOrdersResult(
      input.input.items,
      updatedOrders,
    );

    stagedRecords.push({
      actorUserId: input.actorUserId,
      orderId: input.input.items[0].orderId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      responseSnapshot: cloneJsonValue(responseSnapshot),
      createdAtIso: now.toISOString(),
      expiresAtIso: input.expiresAtIso,
    });

    this.orders.splice(0, this.orders.length, ...stagedOrders);
    this.orderIdempotencyRecords.splice(
      0,
      this.orderIdempotencyRecords.length,
      ...stagedRecords,
    );
    this.couponStore.replace(stagedCoupons);
    this.financialStore.replace(stagedFinancialStore);

    return responseSnapshot;
  }

  async resolveExistingAdminBatchCancel(
    input: ResolveExistingAdminBatchCancelInput,
  ): Promise<BatchCancelAdminOrdersResult | undefined> {
    const existingRecord = this.findInMemoryIdempotencyRecord(input);

    return existingRecord
      ? mapExistingInMemoryAdminBatchCancelRecord(
          existingRecord,
          input,
          this.now(),
        )
      : undefined;
  }

  async updateOrder(
    orderId: string,
    _actorUserId: string,
    input: CreateShipperOrderRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    Object.assign(order, input, {
      cargoPhotoCount: getOrderCargoPhotoCount(input),
      paymentStatus: createInitialOrderPaymentStatus(
        input.paymentMethod,
        input.pricingMode,
      ),
      updatedAtIso: nowIso,
    });
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'updated',
      noteText: '货主修改订单',
      attachmentFileIds: input.cargoPhotoFileIds,
      createdAtIso: nowIso,
    });

    return order;
  }

  async cancelOrder(
    orderId: string,
    _actorUserId: string,
    input: Omit<CancelShipperOrderRequest, 'baseUpdatedAtIso'>,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = 'cancelled';
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'cancelled',
      noteText: createOrderCancellationNote(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async completeOrder(orderId: string, _actorUserId: string) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = 'completed';
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'completed',
      noteText: '货主确认送达',
      createdAtIso: nowIso,
    });

    return order;
  }

  async advanceOrderStatus(
    orderId: string,
    _actorUserId: string,
    input: Omit<AdvanceShipperOrderStatusRequest, 'baseUpdatedAtIso'>,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = input.nextStatus;
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'status_changed',
      noteText: createOrderStatusAdvanceNote(input.nextStatus),
      createdAtIso: nowIso,
    });

    return order;
  }

  async reportOrderException(
    orderId: string,
    actorUserId: string,
    input: ReportShipperOrderExceptionRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    const event: ShipperOrderEventRecord = {
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId,
      eventType: 'exception_reported',
      noteText: createOrderExceptionNote(input),
      attachmentFileIds: input.photoFileIds,
      createdAtIso: nowIso,
    };
    const exceptionCase = createInMemoryExceptionCase({
      sequence: this.exceptionCases.length + 1,
      order,
      event,
      reporterUserId: actorUserId,
      sourceRole: 'shipper',
      input,
      nowIso,
    });

    order.updatedAtIso = nowIso;
    order.events.push(event);
    this.exceptionCases.push(exceptionCase);
    order.latestExceptionCase = createExceptionCaseSummary(exceptionCase);

    return order;
  }

  async submitOrderChangeRequest(
    orderId: string,
    _actorUserId: string,
    input: SubmitShipperOrderChangeRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'change_requested',
      noteText: input.description,
      createdAtIso: nowIso,
    });

    return order;
  }

  async listAdminOrderChangeRequests(
    query: ListAdminOrderChangeRequestsQuery,
  ): Promise<ListAdminOrderChangeRequestsResult> {
    const items = this.orders
      .map(order => createAdminOrderChangeRequestRecord(order))
      .filter(
        (record): record is AdminOrderChangeRequestRecord =>
          Boolean(record) && record!.status === query.status,
      )
      .sort((left, right) =>
        right.requestedAtIso.localeCompare(left.requestedAtIso),
      );
    const start = (query.page - 1) * query.pageSize;

    return {
      items: items.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }

  async reviewOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: ReviewShipperOrderChangeRequest,
  ): Promise<ShipperOrderRecord> {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);
    if (!order) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const latestRequest = findLatestOrderChangeRequest(order);
    if (!latestRequest || latestRequest.status !== 'pending') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单没有待审核的修改申请',
      );
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId,
      eventType:
        input.decision === 'approved'
          ? 'change_request_approved'
          : 'change_request_rejected',
      noteText: createOrderChangeReviewNote(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async submitOrderEvaluation(
    orderId: string,
    _actorUserId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      eventType: 'evaluation_submitted',
      noteText: createOrderEvaluationNote(input),
      attachmentFileIds: input.photoFileIds,
      createdAtIso: nowIso,
    });

    return order;
  }

  async listDriverOrderHall(query: DriverOrderHallQuery) {
    const matchedOrders = this.orders.filter(
      order => order.status === 'waiting' && isOrderReadyForDriverHall(order),
    );
    const filteredOrders = applyDriverOrderHallFilters(matchedOrders, query);
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: filteredOrders.slice(startIndex, startIndex + query.pageSize),
      total: filteredOrders.length,
    };
  }

  async submitDriverQuote(
    orderId: string,
    driverId: string,
    input: DriverQuoteOrderEventPayload,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    assertOrderCanEnterDriverHall(order);

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_quote_submitted',
      noteText: JSON.stringify(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async acceptDriverOrder(
    orderId: string,
    driverId: string,
    input: DriverAcceptOrderEventPayload,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    assertOrderCanEnterDriverHall(order);

    const nowIso = this.now().toISOString();
    order.status = 'loading';
    order.assignedDriverId = driverId;
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_accepted',
      noteText: serializeDriverAcceptOrderEventPayload(input),
      createdAtIso: nowIso,
    });

    return order;
  }

  async listDriverAcceptedOrders(driverId: string, query: DriverMyOrdersQuery) {
    const matchedOrders = this.orders.filter(
      order =>
        query.statuses.includes(
          order.status as DriverMyOrdersQuery['statuses'][number],
        ) && isOrderAcceptedByDriver(order, driverId),
    );
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: matchedOrders.slice(startIndex, startIndex + query.pageSize),
      total: matchedOrders.length,
    };
  }

  async listDriverCompletedOrders(driverId: string) {
    return this.orders
      .filter(
        order => order.status === 'completed' && isOrderAcceptedByDriver(order, driverId),
      )
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  async listDriverPendingSettlementOrders(driverId: string) {
    return this.orders
      .filter(
        order =>
          ['loading', 'transporting', 'confirming'].includes(order.status) &&
          isOrderAcceptedByDriver(order, driverId),
      )
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  async findDriverAcceptedOrder(driverId: string, orderId: string) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    return order && isOrderAcceptedByDriver(order, driverId) ? order : undefined;
  }

  async advanceDriverOrderStatus(
    orderId: string,
    driverId: string,
    input: Omit<DriverAdvanceOrderStatusRequest, 'baseUpdatedAtIso'>,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.status = input.nextStatus;
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_status_changed',
      noteText: createDriverStatusAdvanceNote(input.nextStatus),
      attachmentFileIds: input.receiptPhotoFileIds ?? [],
      createdAtIso: nowIso,
    });

    return order;
  }

  async replyToOrderEvaluation(
    orderId: string,
    driverId: string,
    input: DriverReplyEvaluationRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'evaluation_replied',
      noteText: input.content,
      createdAtIso: nowIso,
    });

    return order;
  }

  async reportDriverOrderException(
    orderId: string,
    driverId: string,
    input: DriverReportExceptionRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    const event: ShipperOrderEventRecord = {
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'driver_exception_reported',
      noteText: createOrderExceptionNote(input),
      attachmentFileIds: input.photoFileIds,
      createdAtIso: nowIso,
    };
    const exceptionCase = createInMemoryExceptionCase({
      sequence: this.exceptionCases.length + 1,
      order,
      event,
      reporterUserId: driverId,
      sourceRole: 'driver',
      input,
      nowIso,
    });

    order.updatedAtIso = nowIso;
    order.events.push(event);
    this.exceptionCases.push(exceptionCase);
    order.latestExceptionCase = createExceptionCaseSummary(exceptionCase);

    return order;
  }

  async evaluateShipper(
    orderId: string,
    driverId: string,
    input: DriverEvaluateShipperRequest,
  ) {
    const order = this.orders.find(currentOrder => currentOrder.id === orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const nowIso = this.now().toISOString();
    order.updatedAtIso = nowIso;
    order.events.push({
      id: `event-${this.orders.length}-${order.events.length + 1}`,
      actorUserId: driverId,
      eventType: 'shipper_evaluation_submitted',
      noteText: createOrderEvaluationNote(input),
      attachmentFileIds: input.photoFileIds ?? [],
      createdAtIso: nowIso,
    });

    return order;
  }
}

function createInMemoryOrderRecord(
  shipperId: string,
  input: CreateShipperOrderRequest,
  now: Date,
  sequence: number,
): ShipperOrderRecord {
  const nowIso = now.toISOString();

  return {
    ...input,
    cargoPhotoCount: getOrderCargoPhotoCount(input),
    id: `order-${sequence}`,
    orderNo: `HY${formatOrderDate(now)}${String(sequence).padStart(10, '0')}`,
    shipperId,
    status: 'waiting',
    exposureBonusCents: 0,
    paymentStatus: createInitialOrderPaymentStatus(
      input.paymentMethod,
      input.pricingMode,
    ),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    events: [
      {
        id: `event-${sequence}`,
        actorUserId: shipperId,
        eventType: 'created',
        noteText: '货主发布订单',
        attachmentFileIds: input.cargoPhotoFileIds,
        createdAtIso: nowIso,
      },
    ],
  };
}

function reserveInMemoryOrderCoupon(
  coupons: ShipperCouponRecord[],
  shipperId: string,
  input: CreateShipperOrderRequest,
  orderNo: string,
  now: Date,
) {
  if (!input.couponId) {
    return;
  }

  const coupon = coupons.find(
    item => item.id === input.couponId && item.shipperId === shipperId,
  );

  if (!coupon) {
    throw new BusinessError(
      ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
      '优惠券不可用',
    );
  }

  const pricing = resolveReservableCouponPricing(
    coupon,
    createCouponPricingInput(shipperId, input),
    now,
  );

  coupon.status = 'locked';
  coupon.lockedOrderNo = orderNo;
  coupon.lockedAtIso = now.toISOString();
  delete coupon.usedOrderNo;
  delete coupon.usedAtIso;

  return pricing;
}

function createCouponPricingInput(
  shipperId: string,
  input: CreateShipperOrderRequest,
) {
  return {
    shipperId,
    priceCents: input.priceCents,
    couponTitle: input.couponTitle,
    couponDiscountCents: input.couponDiscountCents,
    payablePriceCents: input.payablePriceCents,
  };
}

const optionalOrderInputKeys = [
  'volumeText',
  'cargoDescription',
  'cargoPhotoFileIds',
  'pickupNoteText',
  'deliveryNoteText',
  'vehicleLengthText',
  'expectedDeliveryTimeText',
  'valueAddedServicesText',
  'priceCents',
  'couponId',
  'couponTitle',
  'couponDiscountCents',
  'payablePriceCents',
] as const satisfies ReadonlyArray<keyof CreateShipperOrderRequest>;

function applyOrderInputToInMemoryOrder(
  order: ShipperOrderRecord,
  input: CreateShipperOrderRequest,
  couponPricing?: CanonicalOrderCouponPricing,
) {
  Object.assign(order, input, {
    cargoPhotoCount: getOrderCargoPhotoCount(input),
    paymentStatus: createInitialOrderPaymentStatus(
      input.paymentMethod,
      input.pricingMode,
    ),
  });

  for (const key of optionalOrderInputKeys) {
    if (input[key] === undefined) {
      delete order[key];
    }
  }

  if (couponPricing) {
    Object.assign(order, couponPricing);
  }
}

function mapExistingInMemoryOrderCreateRecord(
  record: InMemoryOrderIdempotencyRecord,
  input: ResolveExistingOrderCreateInput,
  now: Date,
): ExecuteOrderCreateResult {
  if (record.requestFingerprint !== input.requestFingerprint) {
    return { kind: 'key-reused' };
  }

  if (Date.parse(record.expiresAtIso) <= now.getTime()) {
    return { kind: 'key-expired' };
  }

  return {
    kind: 'success',
    order: cloneOrderRecord(record.responseSnapshot as ShipperOrderRecord),
    replayed: true,
  };
}

function mapExistingInMemoryOrderIdempotencyRecord(
  record: InMemoryOrderIdempotencyRecord,
  input: ResolveExistingOrderMutationInput,
  now: Date,
): ExecuteOrderMutationResult {
  return mapExistingOrderIdempotencyRecord(
    {
      requestFingerprint: record.requestFingerprint,
      responseSnapshot: record.responseSnapshot as ShipperOrderRecord,
      expiresAtIso: record.expiresAtIso,
    },
    input,
    now,
  );
}

function isOrderMutationAllowed(
  order: ShipperOrderRecord,
  input: ExecuteOrderMutationInput,
) {
  switch (input.mutation.type) {
    case 'shipper_update':
      return order.status === 'waiting';
    case 'shipper_cancel':
      return order.status !== 'completed' && order.status !== 'cancelled';
    case 'shipper_status':
      return canAdvanceOrderStatus(order.status, input.mutation.input.nextStatus);
    case 'shipper_complete':
      return order.status === 'confirming';
    case 'shipper_accept_quote':
      return (
        order.status === 'waiting' &&
        order.pricingMode === 'negotiable' &&
        !order.assignedDriverId
      );
    case 'shipper_add_bonus':
      return order.status === 'waiting';
    case 'driver_accept':
      return order.status === 'waiting';
    case 'driver_status':
      return canDriverAdvanceOrderStatus(
        order.status,
        input.mutation.input.nextStatus,
      );
    default:
      return false;
  }
}

function isOrderReadyForDriverHall(order: ShipperOrderRecord) {
  try {
    assertOrderCanEnterDriverHall(order);
    return true;
  } catch (error) {
    if (error instanceof BusinessError) {
      return false;
    }

    throw error;
  }
}

function applyInMemoryOrderCouponMutation(
  coupons: ShipperCouponRecord[],
  orders: ShipperOrderRecord[],
  currentOrder: ShipperOrderRecord,
  input: ExecuteOrderMutationInput,
  now: Date,
): CanonicalOrderCouponPricing | undefined {
  switch (input.mutation.type) {
    case 'shipper_update': {
      const currentCouponId = currentOrder.couponId;
      const nextCouponId = input.mutation.input.couponId;

      if (currentCouponId === nextCouponId) {
        if (!currentCouponId) {
          return undefined;
        }

        const currentCoupon = findRequiredInMemoryOrderCoupon(
          coupons,
          currentOrder.shipperId,
          currentCouponId,
        );
        assertCurrentOrderCouponOwnership(currentCoupon, currentOrder, {
          kind: 'keep-locked',
        });
        const pricing = resolveCurrentOrderCouponPricing(
          currentCoupon,
          createCouponPricingInput(
            currentOrder.shipperId,
            input.mutation.input,
          ),
        );

        if (currentCoupon.lockedOrderNo == null) {
          currentCoupon.lockedOrderNo = currentOrder.orderNo;
        }

        return pricing;
      }

      let nextPricing: CanonicalOrderCouponPricing | undefined;

      if (nextCouponId) {
        nextPricing = reserveInMemoryOrderCoupon(
          coupons,
          currentOrder.shipperId,
          input.mutation.input,
          currentOrder.orderNo,
          now,
        );
      }

      if (currentCouponId) {
        releaseInMemoryOrderCoupon(
          findRequiredInMemoryOrderCoupon(
            coupons,
            currentOrder.shipperId,
            currentCouponId,
          ),
          currentOrder,
        );
      }

      return nextPricing;
    }

    case 'shipper_cancel':
      if (currentOrder.couponId) {
        releaseInMemoryOrderCoupon(
          findRequiredInMemoryOrderCoupon(
            coupons,
            currentOrder.shipperId,
            currentOrder.couponId,
          ),
          currentOrder,
        );
      }
      return undefined;

    case 'shipper_complete':
      if (currentOrder.couponId) {
        redeemInMemoryOrderCoupon(
          findRequiredInMemoryOrderCoupon(
            coupons,
            currentOrder.shipperId,
            currentOrder.couponId,
          ),
          orders,
          currentOrder,
          now,
        );
      }
      return undefined;

    case 'shipper_status':
    case 'shipper_accept_quote':
    case 'shipper_add_bonus':
    case 'driver_accept':
    case 'driver_status':
      return undefined;
  }
}

function applyInMemoryOrderFinancialMutation(
  financialStore: InMemoryFinancialStore,
  currentOrder: ShipperOrderRecord,
  nextOrder: ShipperOrderRecord,
  input: ExecuteOrderMutationInput,
  now: Date,
  platformFeeRateBps: number,
) {
  if (input.mutation.type === 'shipper_complete') {
    applyInMemoryOrderSettlement(
      financialStore,
      currentOrder,
      nextOrder,
      now,
      platformFeeRateBps,
    );
    return;
  }

  if (input.mutation.type !== 'shipper_cancel') {
    return;
  }

  const nextPaymentStatus = resolveCancellationPaymentStatus(
    currentOrder.paymentStatus,
  );
  nextOrder.paymentStatus = nextPaymentStatus;

  if (currentOrder.paymentMethod !== 'online') {
    return;
  }

  const payment = financialStore.findLatestPaymentByOrderId(currentOrder.id);

  if (nextPaymentStatus === 'refund_pending') {
    if (!payment || payment.status !== 'escrowed') {
      throw new BusinessError(
        ApiErrorCode.REFUND_NOT_AVAILABLE,
        '已托管订单缺少可退款支付单',
      );
    }

    const refundPendingPayment = financialStore.updatePaymentOrder(
      payment.id,
      {
        status: 'refund_pending',
        updatedAtIso: now.toISOString(),
      },
    );

    if (!refundPendingPayment) {
      throw new BusinessError(
        ApiErrorCode.REFUND_NOT_AVAILABLE,
        '退款支付单状态更新失败',
      );
    }

    const penalty = resolveCancellationPenaltyForOrder(currentOrder);
    const refund = financialStore.createRefundForPayment(
      refundPendingPayment,
      createCancellationRefundReason(penalty.feeCents),
      now,
      penalty.refundableCents,
    );
    financialStore.createRefundOutboxEvent(refund, now);
    return;
  }

  if (!payment) {
    return;
  }

  if (payment.status === 'escrowed' || payment.status === 'refund_pending') {
    throw new BusinessError(
      ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
      '订单与支付单资金状态冲突',
    );
  }

  if (payment.status === 'pending' || payment.status === 'processing') {
    financialStore.updatePaymentOrder(payment.id, {
      status: 'cancelled',
      cancelledAtIso: now.toISOString(),
      updatedAtIso: now.toISOString(),
    });
  }
}

function resolveOrderSettlementAmountCents(order: ShipperOrderRecord) {
  const fixedAmountCents = order.payablePriceCents ?? order.priceCents;

  if (fixedAmountCents !== undefined) {
    return fixedAmountCents;
  }

  if (order.pricingMode !== 'negotiable' || !order.assignedDriverId) {
    return undefined;
  }

  const acceptedDriverQuote = [...order.events]
    .reverse()
    .find(
      event =>
        event.eventType === 'driver_quote_submitted' &&
        event.actorUserId === order.assignedDriverId,
    );

  if (!acceptedDriverQuote?.noteText) {
    return undefined;
  }

  try {
    const payload = JSON.parse(acceptedDriverQuote.noteText) as {
      quoteCents?: unknown;
    };

    return Number.isSafeInteger(payload.quoteCents) &&
      (payload.quoteCents as number) > 0
      ? (payload.quoteCents as number)
      : undefined;
  } catch {
    return undefined;
  }
}

function applyInMemoryOrderSettlement(
  financialStore: InMemoryFinancialStore,
  currentOrder: ShipperOrderRecord,
  nextOrder: ShipperOrderRecord,
  now: Date,
  platformFeeRateBps: number,
) {
  assertOrderCanCompleteFinancially(currentOrder);

  if (!currentOrder.assignedDriverId) {
    throw new BusinessError(
      ApiErrorCode.SETTLEMENT_DRIVER_MISSING,
      '订单缺少已接单司机，不能结算',
    );
  }

  const orderAmountCents = resolveOrderSettlementAmountCents(currentOrder);
  let grossAmountCents = orderAmountCents;
  let paymentOrderId: string | undefined;

  if (currentOrder.paymentMethod === 'online') {
    const payment = financialStore.findLatestPaymentByOrderId(currentOrder.id);

    if (!payment || payment.status !== 'escrowed') {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_REQUIRED,
        '在线订单缺少已托管支付单',
      );
    }

    if (
      orderAmountCents !== undefined &&
      orderAmountCents !== payment.amountCents
    ) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
        '订单金额与支付托管金额不一致',
      );
    }

    grossAmountCents = payment.amountCents;
    paymentOrderId = payment.id;
  }

  const breakdown = createSettlementBreakdown(
    grossAmountCents ?? 0,
    platformFeeRateBps,
  );
  const entryDrafts =
    currentOrder.paymentMethod === 'online'
      ? createOnlineSettlementEntries(
          breakdown,
          currentOrder.assignedDriverId,
        )
      : createOfflineSettlementEntries(
          breakdown,
          currentOrder.assignedDriverId,
        );
  assertLedgerBalanced(entryDrafts);
  const nowIso = now.toISOString();
  const transactionId = randomUUID();
  const transaction: FinancialTransactionRecord = {
    id: transactionId,
    transactionNo: `FT-${transactionId}`,
    type:
      currentOrder.paymentMethod === 'online'
        ? 'online_order_settlement'
        : 'offline_order_settlement',
    referenceId: currentOrder.id,
    orderId: currentOrder.id,
    ...(paymentOrderId ? { paymentOrderId } : {}),
    amountCents: breakdown.grossAmountCents,
    occurredAtIso: nowIso,
    createdAtIso: nowIso,
    entries: entryDrafts.map((entry, sequence) => ({
      id: randomUUID(),
      transactionId,
      sequence,
      accountType: entry.accountType,
      ...(entry.accountUserId
        ? { accountUserId: entry.accountUserId }
        : {}),
      direction: entry.direction,
      amountCents: entry.amountCents,
      createdAtIso: nowIso,
    })),
  };
  financialStore.createFinancialTransaction(transaction);
  const settlement: SettlementRecord = {
    id: randomUUID(),
    orderId: currentOrder.id,
    ...(paymentOrderId ? { paymentOrderId } : {}),
    driverId: currentOrder.assignedDriverId,
    ...breakdown,
    financialTransactionId: transactionId,
    settledAtIso: nowIso,
    createdAtIso: nowIso,
  };
  financialStore.createSettlement(settlement);
  financialStore.creditDriverWallet(
    currentOrder.assignedDriverId,
    breakdown.driverNetAmountCents,
    now,
  );

  if (paymentOrderId) {
    const payment = financialStore.updatePaymentOrder(paymentOrderId, {
      status: 'settled',
      settledAtIso: nowIso,
      updatedAtIso: nowIso,
    });

    if (!payment) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
        '支付单结算状态更新失败',
      );
    }
  }

  nextOrder.paymentStatus = 'settled';
  nextOrder.paymentSettledAtIso = nowIso;
}

function findRequiredInMemoryOrderCoupon(
  coupons: ShipperCouponRecord[],
  shipperId: string,
  couponId: string,
) {
  const coupon = coupons.find(
    item => item.id === couponId && item.shipperId === shipperId,
  );

  if (!coupon) {
    throwCouponNotAvailable();
  }

  return coupon;
}

function releaseInMemoryOrderCoupon(
  coupon: ShipperCouponRecord,
  currentOrder: ShipperOrderRecord,
) {
  assertCurrentOrderCouponOwnership(coupon, currentOrder, {
    kind: 'release-to-usable',
  });

  if (coupon.status === 'usable') {
    return;
  }

  coupon.status = 'usable';
  delete coupon.lockedOrderNo;
  delete coupon.lockedAtIso;
  delete coupon.usedOrderNo;
  delete coupon.usedAtIso;
}

function redeemInMemoryOrderCoupon(
  coupon: ShipperCouponRecord,
  orders: ShipperOrderRecord[],
  currentOrder: ShipperOrderRecord,
  now: Date,
) {
  const nonCancelledOwners =
    coupon.status === 'usable'
      ? orders.filter(
          order =>
            order.couponId === coupon.id && order.status !== 'cancelled',
        )
      : [];
  const uniqueNonCancelledOwnerOrderId =
    nonCancelledOwners.length === 1
      ? nonCancelledOwners[0].id
      : undefined;

  assertCurrentOrderCouponOwnership(coupon, currentOrder, {
    kind: 'redeem-to-used',
    uniqueNonCancelledOwnerOrderId,
  });

  if (coupon.status === 'used') {
    return;
  }

  coupon.status = 'used';
  delete coupon.lockedOrderNo;
  delete coupon.lockedAtIso;
  coupon.usedOrderNo = currentOrder.orderNo;
  coupon.usedAtIso = now.toISOString();
}

function applyInMemoryOrderMutation(
  order: ShipperOrderRecord,
  input: ExecuteOrderMutationInput,
  updatedAtIso: string,
  orderCount: number,
  couponPricing?: CanonicalOrderCouponPricing,
) {
  order.updatedAtIso = updatedAtIso;

  switch (input.mutation.type) {
    case 'shipper_update':
      applyOrderInputToInMemoryOrder(
        order,
        input.mutation.input,
        couponPricing,
      );
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'updated',
        noteText: '货主修改订单',
        attachmentFileIds: input.mutation.input.cargoPhotoFileIds,
        createdAtIso: updatedAtIso,
      });
      return;
    case 'shipper_cancel':
      order.status = 'cancelled';
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'cancelled',
        noteText: createOrderCancellationNote(input.mutation.input),
        createdAtIso: updatedAtIso,
      });
      return;
    case 'shipper_status':
      order.status = input.mutation.input.nextStatus;
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'status_changed',
        noteText: createOrderStatusAdvanceNote(input.mutation.input.nextStatus),
        createdAtIso: updatedAtIso,
      });
      return;
    case 'shipper_complete':
      order.status = 'completed';
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'completed',
        noteText: '货主确认送达',
        createdAtIso: updatedAtIso,
      });
      return;
    case 'shipper_accept_quote':
      order.status = 'loading';
      order.assignedDriverId = input.mutation.input.driverId;
      order.priceCents = input.mutation.input.quoteCents;
      order.payablePriceCents = input.mutation.input.quoteCents;
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.mutation.input.driverId,
        eventType: 'driver_accepted',
        noteText: serializeDriverAcceptOrderEventPayload({
          noteText: createShipperAcceptedQuoteNote(input.mutation.input),
          driverSnapshot: input.mutation.input.driverSnapshot,
        }),
        createdAtIso: updatedAtIso,
      });
      return;
    case 'shipper_add_bonus': {
      const nextBonusCents =
        (order.exposureBonusCents ?? 0) + input.mutation.input.bonusCents;
      order.exposureBonusCents = nextBonusCents;
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'bonus_added',
        noteText: createShipperBonusAddedNote(
          input.mutation.input.bonusCents,
          nextBonusCents,
        ),
        createdAtIso: updatedAtIso,
      });
      return;
    }
    case 'driver_accept':
      order.status = 'loading';
      order.assignedDriverId = input.actorUserId;
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'driver_accepted',
        noteText: serializeDriverAcceptOrderEventPayload(input.mutation.input),
        createdAtIso: updatedAtIso,
      });
      return;
    case 'driver_status':
      order.status = input.mutation.input.nextStatus;
      order.events.push({
        id: `event-${orderCount}-${order.events.length + 1}`,
        actorUserId: input.actorUserId,
        eventType: 'driver_status_changed',
        noteText: createDriverStatusAdvanceNote(input.mutation.input.nextStatus),
        attachmentFileIds: input.mutation.input.receiptPhotoFileIds ?? [],
        createdAtIso: updatedAtIso,
      });
      return;
  }
}

function cloneOrderRecord(order: ShipperOrderRecord): ShipperOrderRecord {
  return cloneJsonValue(order);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createBatchCancelAdminOrdersResult(
  items: AdminBatchCancelOrderItem[],
  orders: ShipperOrderRecord[],
): BatchCancelAdminOrdersResult {
  return {
    orderIds: items.map(item => item.orderId),
    updatedCount: orders.length,
    items: orders.map(order => cloneOrderRecord(order)),
  };
}

function createAdminBatchCancelOrderMutationInput(
  actorUserId: string,
  item: AdminBatchCancelOrderItem,
  input: Pick<
    ExecuteAdminBatchCancelInput,
    'idempotencyKey' | 'requestFingerprint' | 'expiresAtIso'
  > & {
    input: Pick<BatchCancelAdminOrdersRequest, 'reasonText' | 'description'>;
  },
): ExecuteOrderMutationInput {
  return {
    actorUserId,
    orderId: item.orderId,
    operation: 'shipper_cancel',
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    baseUpdatedAtIso: item.baseUpdatedAtIso,
    expiresAtIso: input.expiresAtIso,
    mutation: {
      type: 'shipper_cancel',
      input: {
        reasonText: input.input.reasonText,
        description: input.input.description,
      },
    },
  };
}

function mapExistingOrderIdempotencyRecord(
  record: {
    requestFingerprint: string;
    responseSnapshot: ShipperOrderRecord;
    expiresAtIso: string;
  },
  input: ResolveExistingOrderMutationInput,
  now: Date,
): ExecuteOrderMutationResult {
  if (record.requestFingerprint !== input.requestFingerprint) {
    return { kind: 'key-reused' };
  }

  if (Date.parse(record.expiresAtIso) <= now.getTime()) {
    return { kind: 'key-expired' };
  }

  return {
    kind: 'success',
    order: cloneOrderRecord(record.responseSnapshot),
    replayed: true,
  };
}

function mapExistingAdminBatchCancelRecord(
  record: {
    requestFingerprint: string;
    responseSnapshot: BatchCancelAdminOrdersResult;
    expiresAtIso: string;
  },
  input: ResolveExistingAdminBatchCancelInput,
  now: Date,
): BatchCancelAdminOrdersResult {
  if (record.requestFingerprint !== input.requestFingerprint) {
    throw new BusinessError(
      ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
      'Idempotency-Key 已被其他请求复用',
    );
  }

  if (Date.parse(record.expiresAtIso) <= now.getTime()) {
    throw new BusinessError(
      ApiErrorCode.IDEMPOTENCY_KEY_EXPIRED,
      'Idempotency-Key 已过期',
    );
  }

  return cloneJsonValue(record.responseSnapshot);
}

function mapExistingPrismaOrderIdempotencyRecord(
  record: PrismaOrderIdempotencyRecord,
  input: ResolveExistingOrderMutationInput,
  now: Date,
): ExecuteOrderMutationResult {
  return mapExistingOrderIdempotencyRecord(
    {
      requestFingerprint: record.requestFingerprint,
      responseSnapshot: cloneOrderRecord(
        record.responseSnapshot as ShipperOrderRecord,
      ),
      expiresAtIso: record.expiresAt.toISOString(),
    },
    input,
    now,
  );
}

function mapExistingInMemoryAdminBatchCancelRecord(
  record: InMemoryOrderIdempotencyRecord,
  input: ResolveExistingAdminBatchCancelInput,
  now: Date,
) {
  return mapExistingAdminBatchCancelRecord(
    {
      requestFingerprint: record.requestFingerprint,
      responseSnapshot: cloneJsonValue(
        record.responseSnapshot as BatchCancelAdminOrdersResult,
      ),
      expiresAtIso: record.expiresAtIso,
    },
    input,
    now,
  );
}

function mapExistingPrismaAdminBatchCancelRecord(
  record: PrismaOrderIdempotencyRecord,
  input: ResolveExistingAdminBatchCancelInput,
  now: Date,
) {
  return mapExistingAdminBatchCancelRecord(
    {
      requestFingerprint: record.requestFingerprint,
      responseSnapshot: cloneJsonValue(
        record.responseSnapshot as BatchCancelAdminOrdersResult,
      ),
      expiresAtIso: record.expiresAt.toISOString(),
    },
    input,
    now,
  );
}

function mapExistingPrismaOrderCreateRecord(
  record: PrismaOrderIdempotencyRecord,
  input: ResolveExistingOrderCreateInput,
  now: Date,
): ExecuteOrderCreateResult {
  return mapExistingInMemoryOrderCreateRecord(
    {
      actorUserId: record.actorUserId,
      orderId: record.orderId,
      operation: 'shipper_create',
      idempotencyKey: record.idempotencyKey,
      requestFingerprint: record.requestFingerprint,
      responseSnapshot: cloneOrderRecord(
        record.responseSnapshot as ShipperOrderRecord,
      ),
      createdAtIso: record.createdAt.toISOString(),
      expiresAtIso: record.expiresAt.toISOString(),
    },
    input,
    now,
  );
}

function createOrderIdempotencyRecordWhereUnique(
  input: {
    actorUserId: string;
    operation: StoredOrderIdempotencyOperation;
    idempotencyKey: string;
  },
) {
  return {
    OrderIdempotencyRecord_actor_operation_key_unique: {
      actorUserId: input.actorUserId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

async function createNextOrderNo(
  transaction: PrismaOrdersTransactionClient,
  now: Date,
) {
  const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('"Order_order_no_seq"') AS value
  `;
  const sequence = rows[0]?.value;

  if (sequence === undefined) {
    throw new Error('Order sequence did not return a value');
  }

  return `HY${formatOrderDate(now)}${String(sequence).padStart(10, '0')}`;
}

function createPrismaOrderCreateData(
  shipperId: string,
  input: CreateShipperOrderRequest,
  orderNo: string,
  couponPricing?: ReturnType<typeof resolveReservableCouponPricing>,
) {
  return {
    orderNo,
    shipperId,
    status: 'waiting',
    pricingMode: input.pricingMode,
    priceCents: input.priceCents,
    payablePriceCents:
      couponPricing?.payablePriceCents ?? input.payablePriceCents,
    paymentMethod: input.paymentMethod,
    paymentStatus: createInitialOrderPaymentStatus(
      input.paymentMethod,
      input.pricingMode,
    ),
    couponId: couponPricing?.couponId ?? input.couponId,
    couponTitle: couponPricing?.couponTitle ?? input.couponTitle,
    couponDiscountCents:
      couponPricing?.couponDiscountCents ?? input.couponDiscountCents,
    pickupTime: new Date(input.pickupTimeIso),
    expectedDeliveryText: input.expectedDeliveryTimeText,
    cargo: {
      create: {
        cargoType: input.cargoType,
        weightText: input.weightText,
        volumeText: input.volumeText,
        quantityText: input.quantityText,
        description: input.cargoDescription,
        cargoPhotoCount: getOrderCargoPhotoCount(input),
        cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
      },
    },
    locations: {
      create: [
        {
          type: 'pickup',
          address: input.pickupAddress,
          contactName: input.pickupContact,
          contactPhone: input.pickupPhone,
          noteText: input.pickupNoteText,
          ...createLocationCoordinateWrite(
            input.pickupLatitude,
            input.pickupLongitude,
            input.pickupGeocodeStatus,
          ),
        },
        {
          type: 'delivery',
          address: input.deliveryAddress,
          contactName: input.deliveryContact,
          contactPhone: input.deliveryPhone,
          noteText: input.deliveryNoteText,
          ...createLocationCoordinateWrite(
            input.deliveryLatitude,
            input.deliveryLongitude,
            input.deliveryGeocodeStatus,
          ),
        },
      ],
    },
    requirement: {
      create: {
        vehicleType: input.vehicleRequirement,
        vehicleLengthText: input.vehicleLengthText,
        needTailboard: input.needTailboard,
        needTarp: input.needTarp,
        valueAddedServicesText: input.valueAddedServicesText,
      },
    },
    events: {
      create: {
        actorUserId: shipperId,
        eventType: 'created',
        noteText: '货主发布订单',
        attachmentFileIds: input.cargoPhotoFileIds ?? [],
      },
    },
  };
}

function throwCouponNotAvailable(): never {
  throw new BusinessError(
    ApiErrorCode.PROFILE_COUPON_NOT_AVAILABLE,
    '优惠券不可用',
  );
}

function mapPrismaOrderCoupon(coupon: PrismaShipperCouponRecord) {
  if (
    coupon.status !== 'usable' &&
    coupon.status !== 'locked' &&
    coupon.status !== 'used' &&
    coupon.status !== 'expired'
  ) {
    throwCouponNotAvailable();
  }

  return mapPrismaCoupon(coupon);
}

async function applyPrismaOrderCouponMutation(
  transaction: PrismaOrdersTransactionClient,
  currentOrder: ShipperOrderRecord,
  input: ExecuteOrderMutationInput,
  now: Date,
): Promise<CanonicalOrderCouponPricing | undefined> {
  switch (input.mutation.type) {
    case 'shipper_update': {
      const currentCouponId = currentOrder.couponId;
      const nextCouponId = input.mutation.input.couponId;

      if (currentCouponId === nextCouponId) {
        if (!currentCouponId) {
          return undefined;
        }

        const currentCoupon = await findRequiredPrismaOrderCoupon(
          transaction,
          currentOrder.shipperId,
          currentCouponId,
        );
        const mappedCoupon = mapPrismaOrderCoupon(currentCoupon);
        assertCurrentOrderCouponOwnership(mappedCoupon, currentOrder, {
          kind: 'keep-locked',
        });
        const pricing = resolveCurrentOrderCouponPricing(
          mappedCoupon,
          createCouponPricingInput(
            currentOrder.shipperId,
            input.mutation.input,
          ),
        );

        if (currentCoupon.lockedOrderNo === null) {
          await assertPrismaCouponUpdateCount(
            transaction.shipperCoupon.updateMany({
              where: {
                id: currentCoupon.id,
                shipperId: currentOrder.shipperId,
                status: 'locked',
                lockedOrderNo: null,
              },
              data: {
                lockedOrderNo: currentOrder.orderNo,
              },
            }),
          );
        }

        return pricing;
      }

      let nextPricing: CanonicalOrderCouponPricing | undefined;

      if (nextCouponId) {
        nextPricing = await reservePrismaOrderCoupon(
          transaction,
          currentOrder.shipperId,
          input.mutation.input,
          currentOrder.orderNo,
          now,
        );
      }

      if (currentCouponId) {
        await releasePrismaOrderCoupon(
          transaction,
          currentOrder,
          currentCouponId,
        );
      }

      return nextPricing;
    }

    case 'shipper_cancel':
      if (currentOrder.couponId) {
        await releasePrismaOrderCoupon(
          transaction,
          currentOrder,
          currentOrder.couponId,
        );
      }
      return undefined;

    case 'shipper_complete':
      if (currentOrder.couponId) {
        await redeemPrismaOrderCoupon(
          transaction,
          currentOrder,
          currentOrder.couponId,
          now,
        );
      }
      return undefined;

    case 'shipper_status':
    case 'shipper_accept_quote':
    case 'shipper_add_bonus':
    case 'driver_accept':
    case 'driver_status':
      return undefined;
  }
}

async function findRequiredPrismaOrderCoupon(
  transaction: PrismaOrdersTransactionClient,
  shipperId: string,
  couponId: string,
) {
  const coupon = await transaction.shipperCoupon.findFirst({
    where: { id: couponId, shipperId },
  });

  if (!coupon) {
    throwCouponNotAvailable();
  }

  return coupon;
}

async function reservePrismaOrderCoupon(
  transaction: PrismaOrdersTransactionClient,
  shipperId: string,
  input: CreateShipperOrderRequest,
  orderNo: string,
  now: Date,
) {
  if (!input.couponId) {
    throwCouponNotAvailable();
  }

  const coupon = await findRequiredPrismaOrderCoupon(
    transaction,
    shipperId,
    input.couponId,
  );
  const pricing = resolveReservableCouponPricing(
    mapPrismaOrderCoupon(coupon),
    createCouponPricingInput(shipperId, input),
    now,
  );

  await assertPrismaCouponUpdateCount(
    transaction.shipperCoupon.updateMany({
      where: {
        id: coupon.id,
        shipperId,
        status: 'usable',
      },
      data: {
        status: 'locked',
        lockedOrderNo: orderNo,
        lockedAt: now,
        usedOrderNo: null,
        usedAt: null,
      },
    }),
  );

  return pricing;
}

async function releasePrismaOrderCoupon(
  transaction: PrismaOrdersTransactionClient,
  currentOrder: ShipperOrderRecord,
  couponId: string,
) {
  const coupon = await findRequiredPrismaOrderCoupon(
    transaction,
    currentOrder.shipperId,
    couponId,
  );
  assertCurrentOrderCouponOwnership(
    mapPrismaOrderCoupon(coupon),
    currentOrder,
    { kind: 'release-to-usable' },
  );

  if (coupon.status === 'usable') {
    return;
  }

  await assertPrismaCouponUpdateCount(
    transaction.shipperCoupon.updateMany({
      where: {
        id: coupon.id,
        shipperId: currentOrder.shipperId,
        status: 'locked',
        OR: [
          { lockedOrderNo: currentOrder.orderNo },
          { lockedOrderNo: null },
        ],
      },
      data: {
        status: 'usable',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: null,
        usedAt: null,
      },
    }),
  );
}

async function redeemPrismaOrderCoupon(
  transaction: PrismaOrdersTransactionClient,
  currentOrder: ShipperOrderRecord,
  couponId: string,
  now: Date,
) {
  const coupon = await findRequiredPrismaOrderCoupon(
    transaction,
    currentOrder.shipperId,
    couponId,
  );
  let uniqueNonCancelledOwnerOrderId: string | undefined;

  if (coupon.status === 'usable') {
    const owners = await transaction.order.findMany({
      where: {
        couponId: coupon.id,
        status: { not: 'cancelled' },
      },
      select: { id: true },
    });
    uniqueNonCancelledOwnerOrderId =
      owners.length === 1 ? owners[0].id : undefined;
  }

  assertCurrentOrderCouponOwnership(mapPrismaOrderCoupon(coupon), currentOrder, {
    kind: 'redeem-to-used',
    uniqueNonCancelledOwnerOrderId,
  });

  if (coupon.status === 'used') {
    return;
  }

  await assertPrismaCouponUpdateCount(
    transaction.shipperCoupon.updateMany({
      where:
        coupon.status === 'usable'
          ? {
              id: coupon.id,
              shipperId: currentOrder.shipperId,
              status: 'usable',
            }
          : {
              id: coupon.id,
              shipperId: currentOrder.shipperId,
              status: 'locked',
              OR: [
                { lockedOrderNo: currentOrder.orderNo },
                { lockedOrderNo: null },
              ],
            },
      data: {
        status: 'used',
        lockedOrderNo: null,
        lockedAt: null,
        usedOrderNo: currentOrder.orderNo,
        usedAt: now,
      },
    }),
  );
}

async function assertPrismaCouponUpdateCount(
  resultPromise: Promise<{ count: number }>,
) {
  const result = await resultPromise;

  if (result.count !== 1) {
    throwCouponNotAvailable();
  }
}

async function applyPrismaOrderFinancialMutation(
  transaction: PrismaOrdersTransactionClient,
  currentOrder: ShipperOrderRecord,
  input: ExecuteOrderMutationInput,
  now: Date,
  platformFeeRateBps: number,
) {
  if (input.mutation.type === 'shipper_complete') {
    return applyPrismaOrderSettlement(
      transaction,
      currentOrder,
      now,
      platformFeeRateBps,
    );
  }

  if (input.mutation.type !== 'shipper_cancel') {
    return {} as const;
  }

  const paymentStatus = resolveCancellationPaymentStatus(
    currentOrder.paymentStatus,
  );

  if (currentOrder.paymentMethod !== 'online') {
    return { paymentStatus };
  }

  const payment = await transaction.paymentOrder.findFirst({
    where: { orderId: currentOrder.id },
    orderBy: { createdAt: 'desc' },
  });

  if (paymentStatus === 'refund_pending') {
    if (!payment || payment.status !== 'escrowed') {
      throw new BusinessError(
        ApiErrorCode.REFUND_NOT_AVAILABLE,
        '已托管订单缺少可退款支付单',
      );
    }

    const paymentUpdate = await transaction.paymentOrder.updateMany({
      where: { id: payment.id, status: 'escrowed' },
      data: { status: 'refund_pending', updatedAt: now },
    });

    if (paymentUpdate.count !== 1) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
        '支付单资金状态已变化',
      );
    }

    const penalty = resolveCancellationPenaltyForOrder(currentOrder);
    const refundId = randomUUID();
    const refundNo = `RF-${payment.paymentNo}`;
    await transaction.refund.create({
      data: {
        id: refundId,
        refundNo,
        paymentOrderId: payment.id,
        orderId: currentOrder.id,
        shipperId: currentOrder.shipperId,
        channel: payment.channel,
        amountCents: penalty.refundableCents,
        reason: createCancellationRefundReason(penalty.feeCents),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    });
    await transaction.financialOutboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: 'refund.requested',
        aggregateType: 'refund',
        aggregateId: refundId,
        refundId,
        payload: {
          refundId,
          paymentOrderId: payment.id,
        },
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 10,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    return { paymentStatus };
  }

  if (!payment) {
    return { paymentStatus };
  }

  if (payment.status === 'escrowed' || payment.status === 'refund_pending') {
    throw new BusinessError(
      ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
      '订单与支付单资金状态冲突',
    );
  }

  if (payment.status === 'pending' || payment.status === 'processing') {
    const paymentUpdate = await transaction.paymentOrder.updateMany({
      where: {
        id: payment.id,
        status: { in: ['pending', 'processing'] },
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
      },
    });

    if (paymentUpdate.count !== 1) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
        '支付单资金状态已变化',
      );
    }
  }

  return { paymentStatus };
}

async function applyPrismaOrderSettlement(
  transaction: PrismaOrdersTransactionClient,
  currentOrder: ShipperOrderRecord,
  now: Date,
  platformFeeRateBps: number,
) {
  assertOrderCanCompleteFinancially(currentOrder);

  if (!currentOrder.assignedDriverId) {
    throw new BusinessError(
      ApiErrorCode.SETTLEMENT_DRIVER_MISSING,
      '订单缺少已接单司机，不能结算',
    );
  }

  const orderAmountCents = resolveOrderSettlementAmountCents(currentOrder);
  let grossAmountCents = orderAmountCents;
  let payment: PrismaOrderPaymentRecord | null = null;

  if (currentOrder.paymentMethod === 'online') {
    payment = await transaction.paymentOrder.findFirst({
      where: { orderId: currentOrder.id, status: 'escrowed' },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_REQUIRED,
        '在线订单缺少已托管支付单',
      );
    }

    if (
      orderAmountCents !== undefined &&
      orderAmountCents !== payment.amountCents
    ) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
        '订单金额与支付托管金额不一致',
      );
    }

    grossAmountCents = payment.amountCents;
  }

  const breakdown = createSettlementBreakdown(
    grossAmountCents ?? 0,
    platformFeeRateBps,
  );
  const entryDrafts =
    currentOrder.paymentMethod === 'online'
      ? createOnlineSettlementEntries(
          breakdown,
          currentOrder.assignedDriverId,
        )
      : createOfflineSettlementEntries(
          breakdown,
          currentOrder.assignedDriverId,
        );
  assertLedgerBalanced(entryDrafts);
  const transactionId = randomUUID();
  const transactionType =
    currentOrder.paymentMethod === 'online'
      ? 'online_order_settlement'
      : 'offline_order_settlement';
  await transaction.financialTransaction.create({
    data: {
      id: transactionId,
      transactionNo: `FT-${transactionId}`,
      type: transactionType,
      referenceId: currentOrder.id,
      orderId: currentOrder.id,
      paymentOrderId: payment?.id ?? null,
      amountCents: breakdown.grossAmountCents,
      occurredAt: now,
      entries: {
        create: entryDrafts.map((entry, sequence) => ({
          id: randomUUID(),
          sequence,
          accountType: entry.accountType,
          accountUserId: entry.accountUserId ?? null,
          direction: entry.direction,
          amountCents: entry.amountCents,
        })),
      },
    },
  });
  await transaction.settlement.create({
    data: {
      id: randomUUID(),
      orderId: currentOrder.id,
      paymentOrderId: payment?.id ?? null,
      driverId: currentOrder.assignedDriverId,
      ...breakdown,
      financialTransactionId: transactionId,
      settledAt: now,
      createdAt: now,
    },
  });
  await transaction.driverWallet.upsert({
    where: { driverId: currentOrder.assignedDriverId },
    create: {
      driverId: currentOrder.assignedDriverId,
      availableCents: breakdown.driverNetAmountCents,
      reservedCents: 0,
      withdrawnCents: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      availableCents: { increment: breakdown.driverNetAmountCents },
      version: { increment: 1 },
      updatedAt: now,
    },
  });

  if (payment) {
    const paymentUpdate = await transaction.paymentOrder.updateMany({
      where: { id: payment.id, status: 'escrowed' },
      data: { status: 'settled', settledAt: now, updatedAt: now },
    });

    if (paymentUpdate.count !== 1) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
        '支付单结算状态已变化',
      );
    }
  }

  return {
    paymentStatus: 'settled' as const,
    paymentSettledAt: now,
  };
}

function createPrismaOrderMutationOrderData(
  input: ExecuteOrderMutationInput,
  updatedAt: Date,
  couponPricing?: CanonicalOrderCouponPricing,
  financialMutation: {
    paymentStatus?: ShipperOrderRecord['paymentStatus'];
    paymentSettledAt?: Date;
  } = {},
) {
  switch (input.mutation.type) {
    case 'shipper_update':
      return {
        pricingMode: input.mutation.input.pricingMode,
        priceCents: input.mutation.input.priceCents ?? null,
        payablePriceCents:
          couponPricing?.payablePriceCents ??
          input.mutation.input.payablePriceCents ??
          null,
        paymentMethod: input.mutation.input.paymentMethod,
        paymentStatus: createInitialOrderPaymentStatus(
          input.mutation.input.paymentMethod,
          input.mutation.input.pricingMode,
        ),
        couponId: couponPricing?.couponId ?? input.mutation.input.couponId ?? null,
        couponTitle:
          couponPricing?.couponTitle ?? input.mutation.input.couponTitle ?? null,
        couponDiscountCents:
          couponPricing?.couponDiscountCents ??
          input.mutation.input.couponDiscountCents ??
          null,
        pickupTime: new Date(input.mutation.input.pickupTimeIso),
        expectedDeliveryText:
          input.mutation.input.expectedDeliveryTimeText ?? null,
        updatedAt,
      };
    case 'shipper_cancel':
      return {
        status: 'cancelled',
        paymentStatus: financialMutation.paymentStatus,
        updatedAt,
      };
    case 'shipper_status':
      return {
        status: input.mutation.input.nextStatus,
        updatedAt,
      };
    case 'shipper_complete':
      return {
        status: 'completed',
        paymentStatus: financialMutation.paymentStatus,
        paymentSettledAt: financialMutation.paymentSettledAt,
        updatedAt,
      };
    case 'shipper_accept_quote':
      return {
        status: 'loading',
        assignedDriverId: input.mutation.input.driverId,
        priceCents: input.mutation.input.quoteCents,
        payablePriceCents: input.mutation.input.quoteCents,
        updatedAt,
      };
    case 'shipper_add_bonus':
      return {
        exposureBonusCents: {
          increment: input.mutation.input.bonusCents,
        },
        updatedAt,
      };
    case 'driver_accept':
      return {
        status: 'loading',
        assignedDriverId: input.actorUserId,
        updatedAt,
      };
    case 'driver_status':
      return {
        status: input.mutation.input.nextStatus,
        updatedAt,
      };
  }
}

async function applyPrismaOrderMutation(
  transaction: PrismaOrdersTransactionClient,
  input: ExecuteOrderMutationInput,
  updatedAt: Date,
) {
  switch (input.mutation.type) {
    case 'shipper_update':
      await transaction.orderCargo.upsert({
        where: {
          orderId: input.orderId,
        },
        create: {
          orderId: input.orderId,
          cargoType: input.mutation.input.cargoType,
          weightText: input.mutation.input.weightText,
          volumeText: input.mutation.input.volumeText ?? null,
          quantityText: input.mutation.input.quantityText,
          description: input.mutation.input.cargoDescription ?? null,
          cargoPhotoCount: getOrderCargoPhotoCount(input.mutation.input),
          cargoPhotoFileIds: input.mutation.input.cargoPhotoFileIds ?? [],
        },
        update: {
          cargoType: input.mutation.input.cargoType,
          weightText: input.mutation.input.weightText,
          volumeText: input.mutation.input.volumeText ?? null,
          quantityText: input.mutation.input.quantityText,
          description: input.mutation.input.cargoDescription ?? null,
          cargoPhotoCount: getOrderCargoPhotoCount(input.mutation.input),
          cargoPhotoFileIds: input.mutation.input.cargoPhotoFileIds ?? [],
        },
      });
      await transaction.orderLocation.updateMany({
        where: {
          orderId: input.orderId,
          type: 'pickup',
        },
        data: {
          address: input.mutation.input.pickupAddress,
          contactName: input.mutation.input.pickupContact,
          contactPhone: input.mutation.input.pickupPhone,
          noteText: input.mutation.input.pickupNoteText ?? null,
          ...createLocationCoordinateWrite(
            input.mutation.input.pickupLatitude,
            input.mutation.input.pickupLongitude,
            input.mutation.input.pickupGeocodeStatus,
          ),
        },
      });
      await transaction.orderLocation.updateMany({
        where: {
          orderId: input.orderId,
          type: 'delivery',
        },
        data: {
          address: input.mutation.input.deliveryAddress,
          contactName: input.mutation.input.deliveryContact,
          contactPhone: input.mutation.input.deliveryPhone,
          noteText: input.mutation.input.deliveryNoteText ?? null,
          ...createLocationCoordinateWrite(
            input.mutation.input.deliveryLatitude,
            input.mutation.input.deliveryLongitude,
            input.mutation.input.deliveryGeocodeStatus,
          ),
        },
      });
      await transaction.orderRequirement.upsert({
        where: {
          orderId: input.orderId,
        },
        create: {
          orderId: input.orderId,
          vehicleType: input.mutation.input.vehicleRequirement,
          vehicleLengthText: input.mutation.input.vehicleLengthText ?? null,
          needTailboard: input.mutation.input.needTailboard,
          needTarp: input.mutation.input.needTarp,
          valueAddedServicesText:
            input.mutation.input.valueAddedServicesText ?? null,
        },
        update: {
          vehicleType: input.mutation.input.vehicleRequirement,
          vehicleLengthText: input.mutation.input.vehicleLengthText ?? null,
          needTailboard: input.mutation.input.needTailboard,
          needTarp: input.mutation.input.needTarp,
          valueAddedServicesText:
            input.mutation.input.valueAddedServicesText ?? null,
        },
      });
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'updated',
          noteText: '货主修改订单',
          attachmentFileIds: input.mutation.input.cargoPhotoFileIds ?? [],
          createdAt: updatedAt,
        },
      });
      return;
    case 'shipper_cancel':
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'cancelled',
          noteText: createOrderCancellationNote(input.mutation.input),
          createdAt: updatedAt,
        },
      });
      return;
    case 'shipper_status':
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'status_changed',
          noteText: createOrderStatusAdvanceNote(input.mutation.input.nextStatus),
          createdAt: updatedAt,
        },
      });
      return;
    case 'shipper_complete':
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'completed',
          noteText: '货主确认送达',
          createdAt: updatedAt,
        },
      });
      return;
    case 'shipper_accept_quote':
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.mutation.input.driverId,
          eventType: 'driver_accepted',
          noteText: serializeDriverAcceptOrderEventPayload({
            noteText: createShipperAcceptedQuoteNote(input.mutation.input),
            driverSnapshot: input.mutation.input.driverSnapshot,
          }),
          createdAt: updatedAt,
        },
      });
      return;
    case 'shipper_add_bonus': {
      const currentOrder = await transaction.order.findUnique({
        where: { id: input.orderId },
        select: { exposureBonusCents: true },
      });
      const nextBonusCents = currentOrder?.exposureBonusCents ?? 0;
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'bonus_added',
          noteText: createShipperBonusAddedNote(
            input.mutation.input.bonusCents,
            nextBonusCents,
          ),
          createdAt: updatedAt,
        },
      });
      return;
    }
    case 'driver_accept':
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'driver_accepted',
          noteText: serializeDriverAcceptOrderEventPayload(input.mutation.input),
          createdAt: updatedAt,
        },
      });
      return;
    case 'driver_status':
      await transaction.orderEvent.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.actorUserId,
          eventType: 'driver_status_changed',
          noteText: createDriverStatusAdvanceNote(
            input.mutation.input.nextStatus,
          ),
          attachmentFileIds: input.mutation.input.receiptPhotoFileIds ?? [],
          createdAt: updatedAt,
        },
      });
      return;
  }
}

class OrderMutationTransactionAbortError extends Error {
  constructor(public readonly result: Exclude<ExecuteOrderMutationResult, {
    kind: 'success';
  }>) {
    super(`Order mutation aborted: ${result.kind}`);
  }
}

function isPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export type PrismaOrderRecord = {
  id: string;
  orderNo: string;
  shipperId: string;
  status: ShipperOrderRecord['status'];
  pricingMode: ShipperOrderRecord['pricingMode'];
  priceCents: number | null;
  payablePriceCents: number | null;
  exposureBonusCents?: number | null;
  paymentMethod: ShipperOrderRecord['paymentMethod'];
  paymentStatus?: ShipperOrderRecord['paymentStatus'];
  assignedDriverId?: string | null;
  paymentSettledAt?: Date | null;
  refundedAt?: Date | null;
  couponId: string | null;
  couponTitle: string | null;
  couponDiscountCents: number | null;
  pickupTime: Date;
  expectedDeliveryText: string | null;
  createdAt: Date;
  updatedAt: Date;
  cargo: {
    cargoType: string;
    weightText: string;
    volumeText: string | null;
    quantityText: string;
    description: string | null;
    cargoPhotoCount: number;
    cargoPhotoFileIds: unknown;
  } | null;
  locations: Array<{
    type: string;
    address: string;
    contactName: string;
    contactPhone: string;
    noteText: string | null;
    latitude?: { toNumber(): number } | number | null;
    longitude?: { toNumber(): number } | number | null;
  }>;
  requirement: {
    vehicleType: string;
    vehicleLengthText: string | null;
    needTailboard: boolean;
    needTarp: boolean;
    valueAddedServicesText: string | null;
  } | null;
  events: Array<{
    id: string;
    actorUserId: string;
    eventType: string;
    noteText: string | null;
    attachmentFileIds: unknown;
    createdAt: Date;
  }>;
};

export type PrismaOrdersClient = {
  $transaction?<T>(
    callback: (transaction: PrismaOrdersTransactionClient) => Promise<T>,
  ): Promise<T>;
  order: {
    count(args: {
      where: PrismaOrderWhere;
    }): Promise<number>;
    findMany(args: {
      where: PrismaOrderWhere;
      include: typeof orderInclude;
      orderBy: { createdAt: 'desc' } | { updatedAt: 'desc' };
      skip?: number;
      take?: number;
    }): Promise<PrismaOrderRecord[]>;
    findUnique(args: {
      where: { id: string };
      include: typeof orderInclude;
    }): Promise<PrismaOrderRecord | null>;
    update(args: {
      where: { id: string };
      data: unknown;
      include: typeof orderInclude;
    }): Promise<PrismaOrderRecord>;
  };
  orderIdempotencyRecord?: {
    findUnique(args: unknown): Promise<PrismaOrderIdempotencyRecord | null>;
  };
  orderExceptionCase?: {
    findMany(args: unknown): Promise<PrismaOrderExceptionCaseRecord[]>;
    findUnique(args: unknown): Promise<PrismaOrderExceptionCaseRecord | null>;
    update(args: unknown): Promise<PrismaOrderExceptionCaseRecord>;
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<{ id: string; caseNo: string }>;
  };
  orderExceptionCaseAction?: {
    create(args: unknown): Promise<unknown>;
  };
  financialAuditLog?: {
    findUnique(args: unknown): Promise<PrismaExceptionCompensationAuditLog | null>;
  };
};

type PrismaExceptionCompensationAuditLog = {
  entityId: string;
  requestFingerprint: string;
  afterState: unknown;
};

type PrismaOrdersTransactionClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  order: {
    create(args: unknown): Promise<PrismaOrderRecord>;
    count(args: unknown): Promise<number>;
    findMany: {
      (args: {
        where: unknown;
        include: typeof orderInclude;
      }): Promise<PrismaOrderRecord[]>;
      (args: {
        where: unknown;
        select: { id: true };
      }): Promise<Array<{ id: string }>>;
    };
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<PrismaOrderRecord>;
    findUnique(args: unknown): Promise<PrismaOrderRecord | null>;
  };
  orderCargo: {
    upsert(args: unknown): Promise<unknown>;
  };
  orderLocation: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  orderRequirement: {
    upsert(args: unknown): Promise<unknown>;
  };
  orderEvent: {
    create(args: unknown): Promise<{
      id: string;
      actorUserId: string;
      eventType: string;
      noteText: string | null;
      attachmentFileIds: unknown;
      createdAt: Date;
    }>;
  };
  orderIdempotencyRecord: {
    findUnique(args: unknown): Promise<PrismaOrderIdempotencyRecord | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<PrismaOrderIdempotencyRecord>;
  };
  shipperCoupon: {
    findFirst(args: unknown): Promise<PrismaShipperCouponRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  orderExceptionCase: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<{ id: string; caseNo: string }>;
    update(args: unknown): Promise<PrismaOrderExceptionCaseRecord>;
    findUnique(args: unknown): Promise<PrismaOrderExceptionCaseRecord | null>;
  };
  orderExceptionCaseAction: {
    create(args: unknown): Promise<unknown>;
  };
  paymentOrder: {
    findFirst(args: unknown): Promise<PrismaOrderPaymentRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  refund: {
    create(args: unknown): Promise<unknown>;
  };
  financialOutboxEvent: {
    create(args: unknown): Promise<unknown>;
  };
  financialTransaction: {
    create(args: unknown): Promise<PrismaExceptionCompensationTransactionRecord>;
  };
  financialAuditLog: {
    findUnique(args: unknown): Promise<PrismaExceptionCompensationAuditLogRecord | null>;
    create(args: unknown): Promise<PrismaExceptionCompensationAuditLogRecord>;
  };
  settlement: {
    create(args: unknown): Promise<unknown>;
  };
  driverWallet: {
    findUnique(args: unknown): Promise<PrismaExceptionCompensationWalletRecord | null>;
    upsert(args: unknown): Promise<PrismaExceptionCompensationWalletRecord>;
  };
};

type PrismaExceptionCompensationWalletRecord = {
  driverId: string;
  availableCents: number;
  reservedCents: number;
  withdrawnCents: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaExceptionCompensationTransactionRecord = {
  id: string;
  transactionNo: string;
  type: FinancialTransactionRecord['type'];
  referenceId: string;
  orderId: string | null;
  paymentOrderId: string | null;
  amountCents: number;
  occurredAt: Date;
  createdAt: Date;
  entries: Array<{
    id: string;
    transactionId: string;
    sequence: number;
    accountType: FinancialTransactionRecord['entries'][number]['accountType'];
    accountUserId: string | null;
    direction: FinancialTransactionRecord['entries'][number]['direction'];
    amountCents: number;
    createdAt: Date;
  }>;
};

type PrismaExceptionCompensationAuditLogRecord = {
  id: string;
  actorAdminId: string;
  action: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  reason: string;
  beforeState: unknown | null;
  afterState: unknown | null;
  createdAt: Date;
};

type PrismaOrderPaymentRecord = {
  id: string;
  paymentNo: string;
  orderId: string;
  shipperId: string;
  channel: PaymentOrderRecord['channel'];
  amountCents: number;
  status: PaymentOrderRecord['status'];
};

type PrismaOrderExceptionCaseRecord = {
  id: string;
  caseNo: string;
  orderId: string;
  sourceEventId: string;
  reporterUserId: string;
  sourceRole: 'shipper' | 'driver';
  typeLabel: string;
  description: string;
  attachmentFileIds: unknown;
  status: 'pending' | 'processing' | 'resolved' | 'closed';
  resolutionText: string | null;
  compensationStatus:
    | 'not_required'
    | 'pending'
    | 'offline_completed'
    | 'executed'
    | null;
  compensationTargetRole: 'shipper' | 'driver' | null;
  compensationAmountCents: number | null;
  compensationUpdatedAt: Date | null;
  compensationTransactionId: string | null;
  compensationExecutedAt: Date | null;
  appealStatus: 'none' | 'requested' | 'rejected' | 'accepted';
  appealReason: string | null;
  appealRequestedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order: { orderNo: string; shipperId: string; assignedDriverId: string | null };
  actions: Array<{
    id: string;
    adminUserId: string;
    fromStatus: 'pending' | 'processing' | 'resolved' | 'closed';
    toStatus: 'pending' | 'processing' | 'resolved' | 'closed';
    content: string;
    createdAt: Date;
  }>;
};

type PrismaOrderIdempotencyRecord = {
  id: string;
  actorUserId: string;
  orderId: string;
  operation: string;
  idempotencyKey: string;
  requestFingerprint: string;
  responseSnapshot: unknown;
  createdAt: Date;
  expiresAt: Date;
};

type PrismaOrderWhere = {
  shipperId?: string;
  status?:
    | ShipperOrderRecord['status']
    | { in: ShipperOrderRecord['status'][] };
  paymentMethod?: ShipperOrderRecord['paymentMethod'];
  paymentStatus?: ShipperOrderRecord['paymentStatus'];
  createdAt?: {
    gte?: Date;
    lt?: Date;
  };
  events?: {
    some: {
      actorUserId: string;
      eventType: string;
    };
  };
  OR?: Array<Record<string, unknown>>;
};

const orderInclude = {
  cargo: true,
  locations: true,
  requirement: true,
  events: {
    orderBy: {
      createdAt: 'asc',
    },
  },
} as const;

export class PrismaOrdersRepository implements OrdersRepository {
  private readonly createId: () => string;

  constructor(
    private readonly prisma: PrismaOrdersClient,
    private readonly now: () => Date = () => new Date(),
    private readonly platformFeeRateBps = DEFAULT_PLATFORM_FEE_RATE_BPS,
    options: { createId?: () => string } = {},
  ) {
    this.createId = options.createId ?? randomUUID;
  }

  async executeIdempotentOrderCreate(
    input: ExecuteOrderCreateInput,
  ): Promise<ExecuteOrderCreateResult> {
    if (!this.prisma.$transaction || !this.prisma.orderIdempotencyRecord) {
      throw new Error('Prisma order create idempotency client is required');
    }

    try {
      return await this.prisma.$transaction(async transaction => {
        const now = this.now();
        const existingRecord =
          await transaction.orderIdempotencyRecord.findUnique({
            where: createOrderIdempotencyRecordWhereUnique(input),
          });

        if (existingRecord) {
          return mapExistingPrismaOrderCreateRecord(
            existingRecord,
            input,
            now,
          );
        }

        let couponPricing:
          | ReturnType<typeof resolveReservableCouponPricing>
          | undefined;

        if (input.input.couponId) {
          const coupon = await transaction.shipperCoupon.findFirst({
            where: {
              id: input.input.couponId,
              shipperId: input.actorUserId,
            },
          });

          if (!coupon) {
            throwCouponNotAvailable();
          }

          couponPricing = resolveReservableCouponPricing(
            mapPrismaOrderCoupon(coupon),
            {
              shipperId: input.actorUserId,
              priceCents: input.input.priceCents,
              couponTitle: input.input.couponTitle,
              couponDiscountCents: input.input.couponDiscountCents,
              payablePriceCents: input.input.payablePriceCents,
            },
            now,
          );
        }

        const orderNo = await createNextOrderNo(transaction, now);
        const created = await transaction.order.create({
          data: createPrismaOrderCreateData(
            input.actorUserId,
            input.input,
            orderNo,
            couponPricing,
          ),
          include: orderInclude,
        });
        const reservation =
          await transaction.orderIdempotencyRecord.create({
            data: {
              actorUserId: input.actorUserId,
              orderId: created.id,
              operation: input.operation,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: input.requestFingerprint,
              responseSnapshot: {},
              createdAt: now,
              expiresAt: new Date(input.expiresAtIso),
            },
          });

        if (couponPricing) {
          const couponUpdateResult =
            await transaction.shipperCoupon.updateMany({
              where: {
                id: couponPricing.couponId,
                shipperId: input.actorUserId,
                status: 'usable',
              },
              data: {
                status: 'locked',
                lockedOrderNo: orderNo,
                lockedAt: now,
                usedOrderNo: null,
                usedAt: null,
              },
            });

          if (couponUpdateResult.count !== 1) {
            throwCouponNotAvailable();
          }
        }

        const completeOrder = await transaction.order.findUnique({
          where: { id: created.id },
          include: orderInclude,
        });

        if (!completeOrder) {
          throw new Error(`Order not found after create: ${created.id}`);
        }

        const responseSnapshot = cloneOrderRecord(
          mapPrismaOrder(completeOrder),
        );
        await transaction.orderIdempotencyRecord.update({
          where: { id: reservation.id },
          data: { responseSnapshot },
        });

        return {
          kind: 'success' as const,
          order: responseSnapshot,
          replayed: false,
        };
      });
    } catch (error) {
      if (isPrismaErrorCode(error, 'P2002')) {
        const existingRecord =
          await this.prisma.orderIdempotencyRecord.findUnique({
            where: createOrderIdempotencyRecordWhereUnique(input),
          });

        if (existingRecord) {
          return mapExistingPrismaOrderCreateRecord(
            existingRecord,
            input,
            this.now(),
          );
        }
      }

      throw error;
    }
  }

  async resolveExistingOrderCreate(
    input: ResolveExistingOrderCreateInput,
  ): Promise<ExecuteOrderCreateResult | undefined> {
    if (!this.prisma.orderIdempotencyRecord) {
      throw new Error('Prisma order create idempotency client is required');
    }

    const existingRecord = await this.prisma.orderIdempotencyRecord.findUnique({
      where: createOrderIdempotencyRecordWhereUnique(input),
    });

    return existingRecord
      ? mapExistingPrismaOrderCreateRecord(
          existingRecord,
          input,
          this.now(),
        )
      : undefined;
  }

  async listOrders(shipperId: string, query: ListShipperOrdersQuery) {
    const where = createPrismaOrderListWhere(shipperId, query);
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({
        where,
      }),
    ]);
    return {
      items: await this.attachLatestExceptionCaseSummaries(
        items.map(mapPrismaOrder),
      ),
      total,
    };
  }

  async listAdminOrders(query: ListShipperOrdersQuery) {
    const where = createPrismaAdminOrderListWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({
        where,
      }),
    ]);
    return {
      items: await this.attachLatestExceptionCaseSummaries(
        items.map(mapPrismaOrder),
      ),
      total,
    };
  }

  async findOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: orderInclude,
    });

    return order
      ? this.attachLatestExceptionCaseSummary(mapPrismaOrder(order))
      : undefined;
  }

  private async attachLatestExceptionCaseSummaries(
    orders: ShipperOrderRecord[],
  ) {
    if (!orders.length || !this.prisma.orderExceptionCase) {
      return orders;
    }

    const records = await this.prisma.orderExceptionCase.findMany({
      where: {
        orderId: {
          in: orders.map(order => order.id),
        },
      },
      include: {
        order: { select: { orderNo: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const latestByOrderId = new Map<string, OrderExceptionCaseRecord>();

    records.forEach(record => {
      if (!latestByOrderId.has(record.orderId)) {
        latestByOrderId.set(record.orderId, mapPrismaExceptionCase(record));
      }
    });

    return orders.map(order => {
      const latest = latestByOrderId.get(order.id);
      return latest
        ? {
            ...order,
            latestExceptionCase: createExceptionCaseSummary(latest),
          }
        : order;
    });
  }

  private async attachLatestExceptionCaseSummary(order: ShipperOrderRecord) {
    const [withSummary] = await this.attachLatestExceptionCaseSummaries([order]);

    return withSummary;
  }

  async listOrderExceptionCases(orderId: string) {
    if (!this.prisma.orderExceptionCase) {
      return { items: [], total: 0 };
    }

    const records = await this.prisma.orderExceptionCase.findMany({
      where: { orderId },
      include: {
        order: { select: { orderNo: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const items = records.map(mapPrismaExceptionCase);

    return { items, total: items.length };
  }

  async listAdminOrderExceptionCases(query: OrderExceptionCaseListQuery) {
    if (!this.prisma.orderExceptionCase) {
      return { items: [], total: 0 };
    }

    const records = await this.prisma.orderExceptionCase.findMany({
      include: {
        order: { select: { orderNo: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const keyword = query.keyword?.toLocaleLowerCase();
    const matched = records.filter(record => {
      const searchable = `${record.caseNo} ${record.order.orderNo}`.toLocaleLowerCase();

      return (
        (!query.status || record.status === query.status) &&
        (!query.sourceRole || record.sourceRole === query.sourceRole) &&
        (!keyword || searchable.includes(keyword)) &&
        (!query.createdFromIso || record.createdAt >= new Date(query.createdFromIso)) &&
        (!query.createdToIso || record.createdAt < new Date(query.createdToIso))
      );
    });
    const start = (query.page - 1) * query.pageSize;

    return {
      items: matched
        .slice(start, start + query.pageSize)
        .map(mapPrismaExceptionCase),
      total: matched.length,
    };
  }

  async findOrderExceptionCaseById(caseId: string) {
    if (!this.prisma.orderExceptionCase) {
      return undefined;
    }

    const record = await this.prisma.orderExceptionCase.findUnique({
      where: { id: caseId },
      include: {
        order: { select: { orderNo: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });

    return record ? mapPrismaExceptionCase(record) : undefined;
  }

  async transitionOrderExceptionCase(
    caseId: string,
    adminUserId: string,
    expectedStatus: OrderExceptionCaseStatus,
    nextStatus: OrderExceptionCaseStatus,
    input: UpdateOrderExceptionCaseRequest | ResolveOrderExceptionCaseRequest,
  ) {
    if (!this.prisma.orderExceptionCase || !this.prisma.$transaction) {
      return undefined;
    }

    const current = await this.prisma.orderExceptionCase.findUnique({
      where: { id: caseId },
      include: {
        order: { select: { orderNo: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!current) {
      return undefined;
    }

    if (current.status !== expectedStatus) {
      return 'state-invalid' as const;
    }

    if (current.updatedAt.toISOString() !== input.baseUpdatedAtIso) {
      return 'conflict' as const;
    }

    const now = this.now();
    const updated = await this.prisma.$transaction(async transaction => {
      await transaction.orderExceptionCaseAction.create({
        data: {
          caseId,
          adminUserId,
          fromStatus: expectedStatus,
          toStatus: nextStatus,
          content: input.content,
          createdAt: now,
        },
      });

      return transaction.orderExceptionCase.update({
        where: { id: caseId },
        data: {
          status: nextStatus,
          ...(nextStatus === 'resolved'
            ? {
                resolutionText: input.content,
                resolvedAt: now,
                ...('compensationStatus' in input
                  ? {
                      compensationStatus: input.compensationStatus,
                      compensationTargetRole: input.compensationTargetRole,
                      compensationAmountCents: input.compensationAmountCents,
                      compensationUpdatedAt: now,
                    }
                  : {}),
              }
            : {}),
          ...(nextStatus === 'closed' ? { closedAt: now } : {}),
        },
        include: {
          order: { select: { orderNo: true } },
          actions: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    return mapPrismaExceptionCase(updated);
  }

  async executeExceptionCaseCompensation(
    input: ExecuteExceptionCaseCompensationInput,
  ): Promise<ExecuteExceptionCaseCompensationResult> {
    if (
      !this.prisma.orderExceptionCase ||
      !this.prisma.$transaction ||
      !this.prisma.financialAuditLog
    ) {
      return { kind: 'not-found' };
    }

    const action = 'exception_compensation.execute';

    try {
      return await this.prisma.$transaction(async transaction => {
        const existingAuditLog = await transaction.financialAuditLog.findUnique(
          {
            where: {
              FinancialAuditLog_actor_action_key_unique: {
                actorAdminId: input.adminUserId,
                action,
                idempotencyKey: input.idempotencyKey,
              },
            },
          },
        );

        if (existingAuditLog) {
          if (
            existingAuditLog.requestFingerprint !== input.requestFingerprint ||
            existingAuditLog.entityId !== input.caseId
          ) {
            return { kind: 'key-reused' as const };
          }

          const replayed = await transaction.orderExceptionCase.findUnique({
            where: { id: input.caseId },
            include: {
              order: { select: { orderNo: true } },
              actions: { orderBy: { createdAt: 'asc' } },
            },
          });

          return replayed
            ? {
                kind: 'success' as const,
                replayed: true,
                exceptionCase: mapPrismaExceptionCase(replayed),
              }
            : { kind: 'not-found' as const };
        }

        const current = await transaction.orderExceptionCase.findUnique({
          where: { id: input.caseId },
          include: {
            order: {
              select: {
                orderNo: true,
                shipperId: true,
                assignedDriverId: true,
              },
            },
            actions: { orderBy: { createdAt: 'asc' } },
          },
        });

        if (!current) {
          return { kind: 'not-found' as const };
        }

        if (
          current.compensationStatus === 'executed' ||
          current.compensationTransactionId
        ) {
          return { kind: 'already-executed' as const };
        }

        if (
          current.status !== 'resolved' ||
          current.compensationStatus !== 'pending' ||
          !current.compensationTargetRole ||
          current.compensationAmountCents === null
        ) {
          return { kind: 'not-executable' as const };
        }

        if (current.updatedAt.toISOString() !== input.baseUpdatedAtIso) {
          return { kind: 'conflict' as const };
        }

        const targetUserId = resolveCompensationTargetUserId(
          {
            shipperId: current.order.shipperId,
            assignedDriverId: current.order.assignedDriverId ?? undefined,
          },
          current.compensationTargetRole,
        );

        if (!targetUserId) {
          return { kind: 'target-missing' as const };
        }

        const amountCents = current.compensationAmountCents;
        const now = this.now();
        const entryDrafts =
          current.compensationTargetRole === 'driver'
            ? createDriverCompensationEntries(amountCents, targetUserId)
            : createShipperCompensationEntries(amountCents, targetUserId);
        assertLedgerBalanced(entryDrafts);

        const transactionId = this.createId();
        const financialTransaction =
          await transaction.financialTransaction.create({
            data: {
              id: transactionId,
              transactionNo: `FT-${transactionId}`,
              type: 'order_compensation',
              referenceId: current.id,
              orderId: current.orderId,
              amountCents,
              occurredAt: now,
              entries: {
                create: entryDrafts.map((entry, sequence) => ({
                  id: this.createId(),
                  sequence,
                  accountType: entry.accountType,
                  accountUserId: entry.accountUserId ?? null,
                  direction: entry.direction,
                  amountCents: entry.amountCents,
                  createdAt: now,
                })),
              },
              createdAt: now,
            },
            include: { entries: { orderBy: { sequence: 'asc' } } },
          });

        if (current.compensationTargetRole === 'driver') {
          await transaction.driverWallet.upsert({
            where: { driverId: targetUserId },
            create: {
              driverId: targetUserId,
              availableCents: amountCents,
              reservedCents: 0,
              withdrawnCents: 0,
              version: 1,
              createdAt: now,
              updatedAt: now,
            },
            update: {
              availableCents: { increment: amountCents },
              version: { increment: 1 },
              updatedAt: now,
            },
          });
        }

        const updatedAt = new Date(
          createNextUpdatedAtIso(current.updatedAt.toISOString(), now),
        );
        const updated = await transaction.orderExceptionCase.update({
          where: { id: current.id },
          data: {
            compensationStatus: 'executed',
            compensationTransactionId: transactionId,
            compensationExecutedAt: now,
            compensationUpdatedAt: updatedAt,
            updatedAt,
          },
          include: {
            order: { select: { orderNo: true } },
            actions: { orderBy: { createdAt: 'asc' } },
          },
        });

        await transaction.orderEvent.create({
          data: {
            orderId: current.orderId,
            actorUserId: input.adminUserId,
            eventType: 'exception_compensation_executed',
            noteText: createExceptionCompensationNote(
              current.compensationTargetRole,
              amountCents,
            ),
            attachmentFileIds: [],
            createdAt: now,
          },
        });

        await transaction.financialAuditLog.create({
          data: {
            id: this.createId(),
            actorAdminId: input.adminUserId,
            action,
            entityType: 'order_exception_case',
            entityId: current.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            requestId: input.requestId,
            reason: input.content,
            beforeState: {
              exceptionCase: mapPrismaExceptionCase(current),
            },
            afterState: {
              exceptionCase: mapPrismaExceptionCase(updated),
              financialTransactionId: financialTransaction.id,
            },
            createdAt: now,
          },
        });

        return {
          kind: 'success' as const,
          replayed: false,
          exceptionCase: mapPrismaExceptionCase(updated),
        };
      });
    } catch (error) {
      if (!isPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const auditLog = await this.prisma.financialAuditLog.findUnique({
        where: {
          FinancialAuditLog_actor_action_key_unique: {
            actorAdminId: input.adminUserId,
            action,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (!auditLog || !this.prisma.orderExceptionCase) {
        throw error;
      }

      if (
        auditLog.requestFingerprint !== input.requestFingerprint ||
        auditLog.entityId !== input.caseId
      ) {
        return { kind: 'key-reused' };
      }

      const replayed = await this.prisma.orderExceptionCase.findUnique({
        where: { id: input.caseId },
        include: {
          order: { select: { orderNo: true } },
          actions: { orderBy: { createdAt: 'asc' } },
        },
      });

      return replayed
        ? {
            kind: 'success',
            replayed: true,
            exceptionCase: mapPrismaExceptionCase(replayed),
          }
        : { kind: 'not-found' };
    }
  }

  async appealExceptionCase(
    input: AppealExceptionCaseInput,
  ): Promise<AppealExceptionCaseResult> {
    if (!this.prisma.orderExceptionCase || !this.prisma.$transaction) {
      return { kind: 'not-found' };
    }

    const current = await this.prisma.orderExceptionCase.findUnique({
      where: { id: input.caseId },
      include: {
        order: {
          select: {
            orderNo: true,
            shipperId: true,
            assignedDriverId: true,
          },
        },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!current || current.orderId !== input.orderId) {
      return { kind: 'not-found' };
    }

    const relatedUserId =
      input.actorRole === 'driver'
        ? current.order.assignedDriverId
        : current.order.shipperId;

    if (relatedUserId !== input.actorUserId) {
      return { kind: 'not-found' };
    }

    if (
      current.status !== 'resolved' ||
      current.compensationStatus === 'executed' ||
      current.appealStatus === 'requested'
    ) {
      return { kind: 'not-allowed' };
    }

    if (current.updatedAt.toISOString() !== input.baseUpdatedAtIso) {
      return { kind: 'conflict' };
    }

    const now = this.now();
    const updatedAt = new Date(
      createNextUpdatedAtIso(current.updatedAt.toISOString(), now),
    );
    const updated = await this.prisma.$transaction(async transaction => {
      await transaction.orderExceptionCaseAction.create({
        data: {
          caseId: current.id,
          adminUserId: input.actorUserId,
          fromStatus: 'resolved',
          toStatus: 'processing',
          content: input.reason,
          createdAt: updatedAt,
        },
      });

      await transaction.orderEvent.create({
        data: {
          orderId: current.orderId,
          actorUserId: input.actorUserId,
          eventType: 'exception_appeal_requested',
          noteText: `${
            input.actorRole === 'driver' ? '司机' : '货主'
          }申诉：${input.reason}`,
          attachmentFileIds: [],
          createdAt: now,
        },
      });

      return transaction.orderExceptionCase.update({
        where: { id: current.id },
        data: {
          status: 'processing',
          appealStatus: 'requested',
          appealReason: input.reason,
          appealRequestedAt: now,
          updatedAt,
        },
        include: {
          order: { select: { orderNo: true } },
          actions: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    return {
      kind: 'success',
      exceptionCase: mapPrismaExceptionCase(updated),
    };
  }

  async listAdminOrdersForAttachmentAudit(
    query: AdminOrderAttachmentAuditListQuery,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...createPrismaCreatedAtFilter(query),
        ...createPrismaKeywordFilter(query.keyword),
      },
      include: orderInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(mapPrismaOrder);
  }

  async executeIdempotentOrderMutation(
    input: ExecuteOrderMutationInput,
  ): Promise<ExecuteOrderMutationResult> {
    if (!this.prisma.$transaction || !this.prisma.orderIdempotencyRecord) {
      throw new Error('Prisma order mutation idempotency client is required');
    }

    try {
      return await this.prisma.$transaction(async transaction => {
        const now = this.now();
        const existingRecord =
          await transaction.orderIdempotencyRecord.findUnique({
            where: createOrderIdempotencyRecordWhereUnique(input),
          });

        if (existingRecord) {
          return mapExistingPrismaOrderIdempotencyRecord(
            existingRecord,
            input,
            now,
          );
        }

        const current = await transaction.order.findUnique({
          where: {
            id: input.orderId,
          },
          include: orderInclude,
        });

        if (!current) {
          return { kind: 'not-found' } as const;
        }

        const reservation = await transaction.orderIdempotencyRecord.create({
          data: {
            actorUserId: input.actorUserId,
            orderId: input.orderId,
            operation: input.operation,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            responseSnapshot: {},
            createdAt: now,
            expiresAt: new Date(input.expiresAtIso),
          },
        });
        const currentOrder = mapPrismaOrder(current);

        if (input.mutation.type === 'driver_accept') {
          assertOrderCanEnterDriverHall(currentOrder);
        }

        if (currentOrder.updatedAtIso !== input.baseUpdatedAtIso) {
          throw new OrderMutationTransactionAbortError({ kind: 'conflict' });
        }

        if (!isOrderMutationAllowed(currentOrder, input)) {
          throw new OrderMutationTransactionAbortError({
            kind: 'state-invalid',
          });
        }

        const updatedAt = new Date(
          createNextUpdatedAtIso(currentOrder.updatedAtIso, now),
        );
        const couponPricing = await applyPrismaOrderCouponMutation(
          transaction,
          currentOrder,
          input,
          now,
        );
        const financialMutation = await applyPrismaOrderFinancialMutation(
          transaction,
          currentOrder,
          input,
          now,
          this.platformFeeRateBps,
        );
        const orderUpdateResult = await transaction.order.updateMany({
          where: {
            id: input.orderId,
            updatedAt: current.updatedAt,
            status: current.status,
            paymentStatus: currentOrder.paymentStatus,
          },
          data: createPrismaOrderMutationOrderData(
            input,
            updatedAt,
            couponPricing,
            financialMutation,
          ),
        });

        if (orderUpdateResult.count !== 1) {
          throw new OrderMutationTransactionAbortError({ kind: 'conflict' });
        }

        await applyPrismaOrderMutation(transaction, input, updatedAt);

        const updated = await transaction.order.findUnique({
          where: {
            id: input.orderId,
          },
          include: orderInclude,
        });

        if (!updated) {
          throw new Error(`Order not found after mutation: ${input.orderId}`);
        }

        const responseSnapshot = cloneOrderRecord(mapPrismaOrder(updated));
        await transaction.orderIdempotencyRecord.update({
          where: {
            id: reservation.id,
          },
          data: {
            responseSnapshot,
          },
        });

        return {
          kind: 'success' as const,
          order: responseSnapshot,
          replayed: false,
        };
      });
    } catch (error) {
      if (error instanceof OrderMutationTransactionAbortError) {
        return error.result;
      }

      if (isPrismaErrorCode(error, 'P2002')) {
        const existingRecord =
          await this.prisma.orderIdempotencyRecord.findUnique({
            where: createOrderIdempotencyRecordWhereUnique(input),
          });

        if (!existingRecord) {
          throw error;
        }

        return mapExistingPrismaOrderIdempotencyRecord(
          existingRecord,
          input,
          this.now(),
        );
      }

      throw error;
    }
  }

  async resolveExistingOrderMutation(
    input: ResolveExistingOrderMutationInput,
  ): Promise<ExecuteOrderMutationResult | undefined> {
    if (!this.prisma.orderIdempotencyRecord) {
      throw new Error('Prisma order mutation idempotency client is required');
    }

    const existingRecord = await this.prisma.orderIdempotencyRecord.findUnique({
      where: createOrderIdempotencyRecordWhereUnique(input),
    });

    return existingRecord
      ? mapExistingPrismaOrderIdempotencyRecord(
          existingRecord,
          input,
          this.now(),
        )
      : undefined;
  }

  async executeIdempotentAdminBatchCancel(
    input: ExecuteAdminBatchCancelInput,
  ): Promise<BatchCancelAdminOrdersResult> {
    if (!this.prisma.$transaction || !this.prisma.orderIdempotencyRecord) {
      throw new Error('Prisma order batch cancel idempotency client is required');
    }

    try {
      return await this.prisma.$transaction(async transaction => {
        const now = this.now();
        const existingRecord =
          await transaction.orderIdempotencyRecord.findUnique({
            where: createOrderIdempotencyRecordWhereUnique(input),
          });

        if (existingRecord) {
          return mapExistingPrismaAdminBatchCancelRecord(
            existingRecord,
            input,
            now,
          );
        }

        const reservation = await transaction.orderIdempotencyRecord.create({
          data: {
            actorUserId: input.actorUserId,
            orderId: input.input.items[0].orderId,
            operation: input.operation,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            responseSnapshot: {},
            createdAt: now,
            expiresAt: new Date(input.expiresAtIso),
          },
        });
        const currentOrders = await transaction.order.findMany({
          where: {
            id: {
              in: input.input.items.map(item => item.orderId),
            },
          },
          include: orderInclude,
        });
        const currentOrderById = new Map(
          currentOrders.map(order => [order.id, order] as const),
        );

        if (currentOrderById.size !== input.input.items.length) {
          throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
        }

        for (const item of input.input.items) {
          const current = currentOrderById.get(item.orderId);

          if (!current) {
            throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
          }

          const currentOrder = mapPrismaOrder(current);

          if (currentOrder.updatedAtIso !== item.baseUpdatedAtIso) {
            throw new BusinessError(
              ApiErrorCode.ORDER_CONFLICT,
              '订单已被其他操作更新',
            );
          }

          if (currentOrder.status !== 'waiting') {
            throw new BusinessError(
              ApiErrorCode.ORDER_STATE_INVALID,
              '当前订单状态不允许批量取消',
            );
          }

          const mutationInput = createAdminBatchCancelOrderMutationInput(
            input.actorUserId,
            item,
            input,
          );
          const updatedAt = new Date(
            createNextUpdatedAtIso(currentOrder.updatedAtIso, now),
          );
          const couponPricing = await applyPrismaOrderCouponMutation(
            transaction,
            currentOrder,
            mutationInput,
            now,
          );
          const financialMutation = await applyPrismaOrderFinancialMutation(
            transaction,
            currentOrder,
            mutationInput,
            now,
            this.platformFeeRateBps,
          );
          const orderUpdateResult = await transaction.order.updateMany({
            where: {
              id: item.orderId,
              updatedAt: current.updatedAt,
              status: current.status,
              paymentStatus: currentOrder.paymentStatus,
            },
            data: createPrismaOrderMutationOrderData(
              mutationInput,
              updatedAt,
              couponPricing,
              financialMutation,
            ),
          });

          if (orderUpdateResult.count !== 1) {
            throw new BusinessError(
              ApiErrorCode.ORDER_CONFLICT,
              '订单已被其他操作更新',
            );
          }

          await applyPrismaOrderMutation(transaction, mutationInput, updatedAt);
        }

        const updatedOrders = await transaction.order.findMany({
          where: {
            id: {
              in: input.input.items.map(item => item.orderId),
            },
          },
          include: orderInclude,
        });
        const updatedOrderById = new Map(
          updatedOrders.map(order => [order.id, mapPrismaOrder(order)] as const),
        );
        const responseSnapshot = createBatchCancelAdminOrdersResult(
          input.input.items,
          input.input.items.map(item => {
            const updatedOrder = updatedOrderById.get(item.orderId);

            if (!updatedOrder) {
              throw new Error(
                `Order not found after batch cancel: ${item.orderId}`,
              );
            }

            return updatedOrder;
          }),
        );

        await transaction.orderIdempotencyRecord.update({
          where: {
            id: reservation.id,
          },
          data: {
            responseSnapshot,
          },
        });

        return responseSnapshot;
      });
    } catch (error) {
      if (isPrismaErrorCode(error, 'P2002')) {
        const existingRecord =
          await this.prisma.orderIdempotencyRecord.findUnique({
            where: createOrderIdempotencyRecordWhereUnique(input),
          });

        if (!existingRecord) {
          throw error;
        }

        return mapExistingPrismaAdminBatchCancelRecord(
          existingRecord,
          input,
          this.now(),
        );
      }

      throw error;
    }
  }

  async resolveExistingAdminBatchCancel(
    input: ResolveExistingAdminBatchCancelInput,
  ): Promise<BatchCancelAdminOrdersResult | undefined> {
    if (!this.prisma.orderIdempotencyRecord) {
      throw new Error('Prisma order batch cancel idempotency client is required');
    }

    const existingRecord = await this.prisma.orderIdempotencyRecord.findUnique({
      where: createOrderIdempotencyRecordWhereUnique(input),
    });

    return existingRecord
      ? mapExistingPrismaAdminBatchCancelRecord(
          existingRecord,
          input,
          this.now(),
        )
      : undefined;
  }

  async updateOrder(
    orderId: string,
    actorUserId: string,
    input: CreateShipperOrderRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        pricingMode: input.pricingMode,
        priceCents: input.priceCents ?? null,
        payablePriceCents: input.payablePriceCents ?? null,
        paymentMethod: input.paymentMethod,
        paymentStatus: createInitialOrderPaymentStatus(
          input.paymentMethod,
          input.pricingMode,
        ),
        couponId: input.couponId ?? null,
        couponTitle: input.couponTitle ?? null,
        couponDiscountCents: input.couponDiscountCents ?? null,
        pickupTime: new Date(input.pickupTimeIso),
        expectedDeliveryText: input.expectedDeliveryTimeText ?? null,
        cargo: {
          upsert: {
            create: {
              cargoType: input.cargoType,
              weightText: input.weightText,
              volumeText: input.volumeText ?? null,
              quantityText: input.quantityText,
              description: input.cargoDescription ?? null,
              cargoPhotoCount: getOrderCargoPhotoCount(input),
              cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
            },
            update: {
              cargoType: input.cargoType,
              weightText: input.weightText,
              volumeText: input.volumeText ?? null,
              quantityText: input.quantityText,
              description: input.cargoDescription ?? null,
              cargoPhotoCount: getOrderCargoPhotoCount(input),
              cargoPhotoFileIds: input.cargoPhotoFileIds ?? [],
            },
          },
        },
        locations: {
          updateMany: [
            {
              where: {
                type: 'pickup',
              },
              data: {
                address: input.pickupAddress,
                contactName: input.pickupContact,
                contactPhone: input.pickupPhone,
                noteText: input.pickupNoteText ?? null,
                ...createLocationCoordinateWrite(
                  input.pickupLatitude,
                  input.pickupLongitude,
                  input.pickupGeocodeStatus,
                ),
              },
            },
            {
              where: {
                type: 'delivery',
              },
              data: {
                address: input.deliveryAddress,
                contactName: input.deliveryContact,
                contactPhone: input.deliveryPhone,
                noteText: input.deliveryNoteText ?? null,
                ...createLocationCoordinateWrite(
                  input.deliveryLatitude,
                  input.deliveryLongitude,
                  input.deliveryGeocodeStatus,
                ),
              },
            },
          ],
        },
        requirement: {
          upsert: {
            create: {
              vehicleType: input.vehicleRequirement,
              vehicleLengthText: input.vehicleLengthText ?? null,
              needTailboard: input.needTailboard,
              needTarp: input.needTarp,
              valueAddedServicesText: input.valueAddedServicesText ?? null,
            },
            update: {
              vehicleType: input.vehicleRequirement,
              vehicleLengthText: input.vehicleLengthText ?? null,
              needTailboard: input.needTailboard,
              needTarp: input.needTarp,
              valueAddedServicesText: input.valueAddedServicesText ?? null,
            },
          },
        },
        events: {
          create: {
            actorUserId,
            eventType: 'updated',
            noteText: '货主修改订单',
            attachmentFileIds: input.cargoPhotoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async cancelOrder(
    orderId: string,
    actorUserId: string,
    input: Omit<CancelShipperOrderRequest, 'baseUpdatedAtIso'>,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: 'cancelled',
        events: {
          create: {
            actorUserId,
            eventType: 'cancelled',
            noteText: createOrderCancellationNote(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async completeOrder(orderId: string, actorUserId: string) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: 'completed',
        events: {
          create: {
            actorUserId,
            eventType: 'completed',
            noteText: '货主确认送达',
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async advanceOrderStatus(
    orderId: string,
    actorUserId: string,
    input: Omit<AdvanceShipperOrderStatusRequest, 'baseUpdatedAtIso'>,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: input.nextStatus,
        events: {
          create: {
            actorUserId,
            eventType: 'status_changed',
            noteText: createOrderStatusAdvanceNote(input.nextStatus),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async reportOrderException(
    orderId: string,
    actorUserId: string,
    input: ReportShipperOrderExceptionRequest,
  ) {
    return this.createPrismaExceptionCase(
      orderId,
      actorUserId,
      'shipper',
      'exception_reported',
      input,
    );
  }

  async submitOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderChangeRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId,
            eventType: 'change_requested',
            noteText: input.description,
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async listAdminOrderChangeRequests(
    query: ListAdminOrderChangeRequestsQuery,
  ): Promise<ListAdminOrderChangeRequestsResult> {
    const orders = await this.prisma.order.findMany({
      where: {},
      include: orderInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const items = orders
      .map(order => createAdminOrderChangeRequestRecord(mapPrismaOrder(order)))
      .filter(
        (record): record is AdminOrderChangeRequestRecord =>
          Boolean(record) && record!.status === query.status,
      )
      .sort((left, right) =>
        right.requestedAtIso.localeCompare(left.requestedAtIso),
      );
    const start = (query.page - 1) * query.pageSize;

    return {
      items: items.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }

  async reviewOrderChangeRequest(
    orderId: string,
    actorUserId: string,
    input: ReviewShipperOrderChangeRequest,
  ): Promise<ShipperOrderRecord> {
    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!current) {
      throw new BusinessError(ApiErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const latestRequest = findLatestOrderChangeRequest(mapPrismaOrder(current));
    if (!latestRequest || latestRequest.status !== 'pending') {
      throw new BusinessError(
        ApiErrorCode.ORDER_STATE_INVALID,
        '当前订单没有待审核的修改申请',
      );
    }

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        events: {
          create: {
            actorUserId,
            eventType:
              input.decision === 'approved'
                ? 'change_request_approved'
                : 'change_request_rejected',
            noteText: createOrderChangeReviewNote(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async submitOrderEvaluation(
    orderId: string,
    actorUserId: string,
    input: SubmitShipperOrderEvaluationRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId,
            eventType: 'evaluation_submitted',
            noteText: createOrderEvaluationNote(input),
            attachmentFileIds: input.photoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async listDriverOrderHall(query: DriverOrderHallQuery) {
    const where: PrismaOrderWhere = {
      status: 'waiting',
      OR: [
        { paymentMethod: 'cod', paymentStatus: 'not_required' },
        { paymentMethod: 'online', paymentStatus: 'escrowed' },
      ],
    };

    const items = await this.prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });
    const filteredOrders = applyDriverOrderHallFilters(
      items.map(mapPrismaOrder),
      query,
    );
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: filteredOrders.slice(startIndex, startIndex + query.pageSize),
      total: filteredOrders.length,
    };
  }

  async submitDriverQuote(
    orderId: string,
    driverId: string,
    input: DriverQuoteOrderEventPayload,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'driver_quote_submitted',
            noteText: JSON.stringify(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async acceptDriverOrder(
    orderId: string,
    driverId: string,
    input: DriverAcceptOrderEventPayload,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: 'loading',
        assignedDriverId: driverId,
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'driver_accepted',
            noteText: serializeDriverAcceptOrderEventPayload(input),
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async listDriverAcceptedOrders(driverId: string, query: DriverMyOrdersQuery) {
    const where: PrismaOrderWhere = {
      status: {
        in: query.statuses,
      },
      events: {
        some: {
          actorUserId: driverId,
          eventType: 'driver_accepted',
        },
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    return {
      items: items.map(mapPrismaOrder),
      total,
    };
  }

  async listDriverCompletedOrders(driverId: string) {
    const items = await this.prisma.order.findMany({
      where: {
        status: 'completed',
        events: {
          some: {
            actorUserId: driverId,
            eventType: 'driver_accepted',
          },
        },
      },
      include: orderInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return items.map(mapPrismaOrder);
  }

  async listDriverPendingSettlementOrders(driverId: string) {
    const items = await this.prisma.order.findMany({
      where: {
        status: {
          in: ['loading', 'transporting', 'confirming'],
        },
        events: {
          some: {
            actorUserId: driverId,
            eventType: 'driver_accepted',
          },
        },
      },
      include: orderInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return items.map(mapPrismaOrder);
  }

  async findDriverAcceptedOrder(driverId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: orderInclude,
    });

    if (!order) {
      return undefined;
    }

    const mappedOrder = mapPrismaOrder(order);

    return isOrderAcceptedByDriver(mappedOrder, driverId)
      ? mappedOrder
      : undefined;
  }

  async advanceDriverOrderStatus(
    orderId: string,
    driverId: string,
    input: Omit<DriverAdvanceOrderStatusRequest, 'baseUpdatedAtIso'>,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: input.nextStatus,
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'driver_status_changed',
            noteText: createDriverStatusAdvanceNote(input.nextStatus),
            attachmentFileIds: input.receiptPhotoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async replyToOrderEvaluation(
    orderId: string,
    driverId: string,
    input: DriverReplyEvaluationRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'evaluation_replied',
            noteText: input.content,
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  async reportDriverOrderException(
    orderId: string,
    driverId: string,
    input: DriverReportExceptionRequest,
  ) {
    return this.createPrismaExceptionCase(
      orderId,
      driverId,
      'driver',
      'driver_exception_reported',
      input,
    );
  }

  async evaluateShipper(
    orderId: string,
    driverId: string,
    input: DriverEvaluateShipperRequest,
  ) {
    const order = await this.prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        events: {
          create: {
            actorUserId: driverId,
            eventType: 'shipper_evaluation_submitted',
            noteText: createOrderEvaluationNote(input),
            attachmentFileIds: input.photoFileIds ?? [],
          },
        },
      },
      include: orderInclude,
    });

    return mapPrismaOrder(order);
  }

  private async createPrismaExceptionCase(
    orderId: string,
    reporterUserId: string,
    sourceRole: 'shipper' | 'driver',
    eventType: 'exception_reported' | 'driver_exception_reported',
    input: ReportShipperOrderExceptionRequest,
  ) {
    if (!this.prisma.$transaction) {
      throw new Error('Prisma transaction client is required for exception cases');
    }

    const now = this.now();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const result = await this.prisma.$transaction(async transaction => {
      const sequence =
        (await transaction.orderExceptionCase.count({
          where: {
            createdAt: {
              gte: dayStart,
              lt: dayEnd,
            },
          },
        })) + 1;
      const event = await transaction.orderEvent.create({
        data: {
          orderId,
          actorUserId: reporterUserId,
          eventType,
          noteText: createOrderExceptionNote(input),
          attachmentFileIds: input.photoFileIds ?? [],
          createdAt: now,
        },
      });
      const createdCase = await transaction.orderExceptionCase.create({
        data: {
          caseNo: `YC${formatOrderDate(now)}${String(sequence).padStart(4, '0')}`,
          orderId,
          sourceEventId: event.id,
          reporterUserId,
          sourceRole,
          typeLabel: input.typeLabel,
          description: input.description,
          attachmentFileIds: input.photoFileIds ?? [],
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.order.update({
        where: { id: orderId },
        data: { updatedAt: now },
        include: orderInclude,
      });
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });

      if (!order) {
        throw new Error(`Order not found after exception report: ${orderId}`);
      }

      return { order, event, createdCase };
    });
    const order = mapPrismaOrder(result.order);
    order.latestExceptionCase = {
      id: result.createdCase.id,
      caseNo: result.createdCase.caseNo,
      sourceEventId: result.event.id,
      sourceRole,
      status: 'pending',
      appealStatus: 'none',
      createdAtIso: result.event.createdAt.toISOString(),
      updatedAtIso: now.toISOString(),
    };

    return order;
  }

}

function createPrismaOrderListWhere(
  shipperId: string,
  query: ListShipperOrdersQuery,
): PrismaOrderWhere {
  return {
    shipperId,
    ...createPrismaStatusFilter(query),
    ...createPrismaCreatedAtFilter(query),
    ...createPrismaKeywordFilter(query.keyword),
  };
}

function createPrismaAdminOrderListWhere(
  query: ListShipperOrdersQuery,
): PrismaOrderWhere {
  return {
    ...createPrismaStatusFilter(query),
    ...createPrismaCreatedAtFilter(query),
    ...createPrismaKeywordFilter(query.keyword),
  };
}

function createPrismaStatusFilter(query: ListShipperOrdersQuery) {
  if (query.status) {
    return {
      status: query.status,
    };
  }

  if (query.statuses?.length) {
    return {
      status: {
        in: query.statuses,
      },
    };
  }

  return {};
}

function createPrismaCreatedAtFilter(query: ListShipperOrdersQuery) {
  if (!query.createdFromIso && !query.createdToIso) {
    return {};
  }

  return {
    createdAt: {
      ...(query.createdFromIso
        ? { gte: new Date(query.createdFromIso) }
        : {}),
      ...(query.createdToIso ? { lt: new Date(query.createdToIso) } : {}),
    },
  };
}

function createPrismaKeywordFilter(keyword?: string) {
  if (!keyword) {
    return {};
  }

  const contains = {
    contains: keyword,
    mode: 'insensitive',
  };

  return {
    OR: [
      { orderNo: contains },
      {
        cargo: {
          is: {
            OR: [
              { cargoType: contains },
              { weightText: contains },
              { quantityText: contains },
              { description: contains },
            ],
          },
        },
      },
      {
        locations: {
          some: {
            OR: [
              { address: contains },
              { contactName: contains },
              { contactPhone: contains },
              { noteText: contains },
            ],
          },
        },
      },
      {
        requirement: {
          is: {
            OR: [
              { vehicleType: contains },
              { vehicleLengthText: contains },
              { valueAddedServicesText: contains },
            ],
          },
        },
      },
    ],
  };
}

function isOrderInCreatedRange(
  order: ShipperOrderRecord,
  query: ListShipperOrdersQuery,
) {
  const createdAt = Date.parse(order.createdAtIso);

  if (
    query.createdFromIso &&
    createdAt < Date.parse(query.createdFromIso)
  ) {
    return false;
  }

  if (query.createdToIso && createdAt >= Date.parse(query.createdToIso)) {
    return false;
  }

  return true;
}

function isOrderMatchedByStatus(
  order: ShipperOrderRecord,
  query: ListShipperOrdersQuery,
) {
  if (query.status) {
    return order.status === query.status;
  }

  if (query.statuses?.length) {
    return query.statuses.includes(order.status);
  }

  return true;
}

function isOrderMatchedByKeyword(
  order: ShipperOrderRecord,
  keyword?: string,
) {
  if (!keyword) {
    return true;
  }

  const normalizedKeyword = keyword.toLocaleLowerCase();
  const searchableText = [
    order.orderNo,
    order.cargoType,
    order.weightText,
    order.volumeText,
    order.quantityText,
    order.cargoDescription,
    order.pickupAddress,
    order.pickupNoteText,
    order.pickupContact,
    order.pickupPhone,
    order.deliveryAddress,
    order.deliveryNoteText,
    order.deliveryContact,
    order.deliveryPhone,
    order.vehicleRequirement,
    order.vehicleLengthText,
    order.valueAddedServicesText,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLocaleLowerCase();

  return searchableText.includes(normalizedKeyword);
}

function applyDriverOrderHallFilters(
  orders: ShipperOrderRecord[],
  query: DriverOrderHallQuery,
) {
  const vehicleTypePreferences = query.vehicleTypePreferences ?? [];
  const hasDriverLocation =
    Number.isFinite(query.driverLatitude) &&
    Number.isFinite(query.driverLongitude);
  const maxDistanceMeters =
    query.maxDistanceKm === undefined
      ? undefined
      : query.maxDistanceKm * 1000;

  return orders
    .map(order => {
      const pickupDistanceMeters = hasDriverLocation
        ? getOrderPickupDistanceMeters(
            order,
            query.driverLatitude as number,
            query.driverLongitude as number,
          )
        : undefined;

      return {
        order,
        pickupDistanceMeters,
      };
    })
    .filter(({ order, pickupDistanceMeters }) => {
      if (
        vehicleTypePreferences.length &&
        !vehicleTypePreferences.includes(order.vehicleRequirement)
      ) {
        return false;
      }

      if (
        maxDistanceMeters !== undefined &&
        pickupDistanceMeters !== undefined &&
        pickupDistanceMeters > maxDistanceMeters
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const leftDistance = left.pickupDistanceMeters;
      const rightDistance = right.pickupDistanceMeters;
      const leftHasDistance = Number.isFinite(leftDistance);
      const rightHasDistance = Number.isFinite(rightDistance);

      if (leftHasDistance && rightHasDistance) {
        if (leftDistance !== rightDistance) {
          return (leftDistance ?? 0) - (rightDistance ?? 0);
        }

        const leftBonus = left.order.exposureBonusCents ?? 0;
        const rightBonus = right.order.exposureBonusCents ?? 0;
        if (leftBonus !== rightBonus) {
          return rightBonus - leftBonus;
        }
      } else if (leftHasDistance !== rightHasDistance) {
        return leftHasDistance ? -1 : 1;
      }

      const leftBonus = left.order.exposureBonusCents ?? 0;
      const rightBonus = right.order.exposureBonusCents ?? 0;
      if (leftBonus !== rightBonus) {
        return rightBonus - leftBonus;
      }

      return right.order.createdAtIso.localeCompare(left.order.createdAtIso);
    })
    .map(({ order, pickupDistanceMeters }) => ({
      ...order,
      ...(pickupDistanceMeters === undefined
        ? {}
        : { pickupDistanceMeters: Math.round(pickupDistanceMeters) }),
    }));
}

function getOrderPickupDistanceMeters(
  order: ShipperOrderRecord,
  driverLatitude: number,
  driverLongitude: number,
) {
  if (
    !Number.isFinite(driverLatitude) ||
    !Number.isFinite(driverLongitude) ||
    !Number.isFinite(order.pickupLatitude ?? Number.NaN) ||
    !Number.isFinite(order.pickupLongitude ?? Number.NaN)
  ) {
    return undefined;
  }

  return haversineDistanceMeters(
    {
      latitude: driverLatitude,
      longitude: driverLongitude,
    },
    {
      latitude: order.pickupLatitude as number,
      longitude: order.pickupLongitude as number,
    },
  );
}

function mapPrismaOrder(order: PrismaOrderRecord): ShipperOrderRecord {
  const pickupLocation = order.locations.find(
    location => location.type === 'pickup',
  );
  const deliveryLocation = order.locations.find(
    location => location.type === 'delivery',
  );
  const isFixedPrice = order.pricingMode === 'fixed';

  return {
    id: order.id,
    orderNo: order.orderNo,
    shipperId: order.shipperId,
    status: order.status,
    cargoType: order.cargo?.cargoType ?? '',
    weightText: order.cargo?.weightText ?? '',
    volumeText: order.cargo?.volumeText ?? undefined,
    quantityText: order.cargo?.quantityText ?? '',
    cargoDescription: order.cargo?.description ?? undefined,
    cargoPhotoCount: order.cargo?.cargoPhotoCount ?? 0,
    cargoPhotoFileIds: parseAttachmentFileIds(
      order.cargo?.cargoPhotoFileIds ?? [],
    ),
    pickupAddress: pickupLocation?.address ?? '',
    pickupNoteText: pickupLocation?.noteText ?? undefined,
    pickupContact: pickupLocation?.contactName ?? '',
    pickupPhone: pickupLocation?.contactPhone ?? '',
    ...(toOptionalCoordinate(pickupLocation?.latitude) === undefined
      ? {}
      : { pickupLatitude: toOptionalCoordinate(pickupLocation?.latitude) }),
    ...(toOptionalCoordinate(pickupLocation?.longitude) === undefined
      ? {}
      : { pickupLongitude: toOptionalCoordinate(pickupLocation?.longitude) }),
    deliveryAddress: deliveryLocation?.address ?? '',
    deliveryNoteText: deliveryLocation?.noteText ?? undefined,
    deliveryContact: deliveryLocation?.contactName ?? '',
    deliveryPhone: deliveryLocation?.contactPhone ?? '',
    ...(toOptionalCoordinate(deliveryLocation?.latitude) === undefined
      ? {}
      : {
          deliveryLatitude: toOptionalCoordinate(deliveryLocation?.latitude),
        }),
    ...(toOptionalCoordinate(deliveryLocation?.longitude) === undefined
      ? {}
      : {
          deliveryLongitude: toOptionalCoordinate(deliveryLocation?.longitude),
        }),
    vehicleRequirement: order.requirement?.vehicleType ?? '',
    vehicleLengthText: order.requirement?.vehicleLengthText ?? undefined,
    needTailboard: order.requirement?.needTailboard ?? false,
    needTarp: order.requirement?.needTarp ?? false,
    pickupTimeIso: order.pickupTime.toISOString(),
    expectedDeliveryTimeText: order.expectedDeliveryText ?? undefined,
    valueAddedServicesText:
      order.requirement?.valueAddedServicesText ?? undefined,
    pricingMode: order.pricingMode,
    priceCents: isFixedPrice ? (order.priceCents ?? undefined) : undefined,
    paymentMethod: order.paymentMethod,
    paymentStatus:
      order.paymentStatus ??
      createInitialOrderPaymentStatus(order.paymentMethod, order.pricingMode),
    ...(order.assignedDriverId
      ? { assignedDriverId: order.assignedDriverId }
      : {}),
    ...(order.paymentSettledAt
      ? { paymentSettledAtIso: order.paymentSettledAt.toISOString() }
      : {}),
    ...(order.refundedAt
      ? { refundedAtIso: order.refundedAt.toISOString() }
      : {}),
    couponId: isFixedPrice ? (order.couponId ?? undefined) : undefined,
    couponTitle: isFixedPrice ? (order.couponTitle ?? undefined) : undefined,
    couponDiscountCents: isFixedPrice
      ? (order.couponDiscountCents ?? undefined)
      : undefined,
    payablePriceCents: isFixedPrice
      ? (order.payablePriceCents ?? undefined)
      : undefined,
    exposureBonusCents: order.exposureBonusCents ?? 0,
    createdAtIso: order.createdAt.toISOString(),
    updatedAtIso: order.updatedAt.toISOString(),
    events: order.events.map(mapPrismaOrderEvent),
  };
}

function mapPrismaOrderEvent(
  event: PrismaOrderRecord['events'][number],
): ShipperOrderEventRecord {
  return {
    id: event.id,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    noteText: event.noteText ?? undefined,
    attachmentFileIds: parseAttachmentFileIds(event.attachmentFileIds),
    createdAtIso: event.createdAt.toISOString(),
  };
}

function mapPrismaExceptionCase(
  record: PrismaOrderExceptionCaseRecord,
): OrderExceptionCaseRecord {
  return {
    id: record.id,
    caseNo: record.caseNo,
    orderId: record.orderId,
    orderNo: record.order.orderNo,
    sourceEventId: record.sourceEventId,
    reporterUserId: record.reporterUserId,
    sourceRole: record.sourceRole,
    typeLabel: record.typeLabel,
    description: record.description,
    attachmentFileIds: parseAttachmentFileIds(record.attachmentFileIds) ?? [],
    status: record.status,
    resolutionText: record.resolutionText ?? undefined,
    compensationStatus: record.compensationStatus ?? undefined,
    compensationTargetRole: record.compensationTargetRole ?? undefined,
    compensationAmountCents: record.compensationAmountCents ?? undefined,
    compensationUpdatedAtIso:
      record.compensationUpdatedAt?.toISOString(),
    compensationTransactionId: record.compensationTransactionId ?? undefined,
    compensationExecutedAtIso: record.compensationExecutedAt?.toISOString(),
    appealStatus: record.appealStatus ?? 'none',
    appealReason: record.appealReason ?? undefined,
    appealRequestedAtIso: record.appealRequestedAt?.toISOString(),
    resolvedAtIso: record.resolvedAt?.toISOString(),
    closedAtIso: record.closedAt?.toISOString(),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
    actions: record.actions.map(action => ({
      id: action.id,
      adminUserId: action.adminUserId,
      fromStatus: action.fromStatus,
      toStatus: action.toStatus,
      content: action.content,
      createdAtIso: action.createdAt.toISOString(),
    })),
  };
}

function parseAttachmentFileIds(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : undefined;
}

function getOrderCargoPhotoCount(input: CreateShipperOrderRequest) {
  return input.cargoPhotoFileIds?.length ?? input.cargoPhotoCount ?? 0;
}

function createOrderCancellationNote(input: {
  reasonText: string;
  description?: string;
}) {
  return input.description
    ? `${input.reasonText}：${input.description}`
    : input.reasonText;
}

function resolveCancellationPenaltyForOrder(order: ShipperOrderRecord) {
  const orderAmountCents =
    order.payablePriceCents ?? order.priceCents ?? 0;
  return resolveCancellationPenaltyCents({
    orderStatus: order.status,
    orderAmountCents,
  });
}

function createCancellationRefundReason(feeCents: number) {
  return feeCents > 0
    ? `order_cancelled_with_penalty_${feeCents}`
    : 'order_cancelled';
}

function canAdvanceOrderStatus(
  currentStatus: ShipperOrderRecord['status'],
  nextStatus: AdvanceShipperOrderStatusRequest['nextStatus'],
) {
  const allowedNextStatusByCurrentStatus: Record<
    ShipperOrderRecord['status'],
    AdvanceShipperOrderStatusRequest['nextStatus'] | undefined
  > = {
    // Shipper waiting → loading must go through accept-quote / driver-accept,
    // not the generic status advance endpoint.
    waiting: undefined,
    loading: 'transporting',
    transporting: 'confirming',
    confirming: undefined,
    completed: undefined,
    cancelled: undefined,
  };

  return allowedNextStatusByCurrentStatus[currentStatus] === nextStatus;
}

function createOrderStatusAdvanceNote(
  nextStatus: AdvanceShipperOrderStatusRequest['nextStatus'],
) {
  const noteTextByStatus = {
    transporting: '订单进入运输中',
    confirming: '订单进入待确认',
  };

  return noteTextByStatus[nextStatus];
}

function canDriverAdvanceOrderStatus(
  currentStatus: ShipperOrderRecord['status'],
  nextStatus: DriverAdvanceOrderStatusRequest['nextStatus'],
) {
  const allowedNextStatusByCurrentStatus: Record<
    ShipperOrderRecord['status'],
    DriverAdvanceOrderStatusRequest['nextStatus'] | undefined
  > = {
    waiting: undefined,
    loading: 'transporting',
    transporting: 'confirming',
    confirming: undefined,
    completed: undefined,
    cancelled: undefined,
  };

  return allowedNextStatusByCurrentStatus[currentStatus] === nextStatus;
}

function createDriverStatusAdvanceNote(
  nextStatus: DriverAdvanceOrderStatusRequest['nextStatus'],
) {
  const noteTextByStatus = {
    transporting: '司机确认发车',
    confirming: '司机确认到达',
  };

  return noteTextByStatus[nextStatus];
}

function serializeDriverAcceptOrderEventPayload(
  input: DriverAcceptOrderEventPayload,
) {
  if (!input.driverSnapshot) {
    return input.noteText;
  }

  return JSON.stringify({
    ...(input.noteText ? { noteText: input.noteText } : {}),
    driverSnapshot: input.driverSnapshot,
  });
}

function createShipperAcceptedQuoteNote(
  input: ShipperAcceptQuoteMutationInput,
) {
  const noteParts = [
    `货主已选择司机报价 ${input.quoteCents} 分`,
    input.arrivalText,
    input.noteText,
  ].filter((part): part is string => Boolean(part && part.trim()));

  return noteParts.join('；');
}

function createShipperBonusAddedNote(
  addedBonusCents: number,
  totalBonusCents: number,
) {
  return `货主追加曝光赏金 ${addedBonusCents} 分，当前总赏金 ${totalBonusCents} 分`;
}

function createOrderChangeReviewNote(input: ReviewShipperOrderChangeRequest) {
  const defaultText =
    input.decision === 'approved'
      ? '平台客服已通过修改申请'
      : '平台客服已驳回修改申请';
  return input.reviewResultText?.trim() || defaultText;
}

function findLatestOrderChangeRequest(order: ShipperOrderRecord): {
  status: 'pending' | 'approved' | 'rejected';
  description: string;
  reviewResultText?: string;
  requestedAtIso: string;
  reviewedAtIso?: string;
} | null {
  const requestEvent = [...order.events]
    .reverse()
    .find(event => event.eventType === 'change_requested');
  if (!requestEvent) {
    return null;
  }

  const reviewEvent = order.events
    .filter(
      event =>
        (event.eventType === 'change_request_approved' ||
          event.eventType === 'change_request_rejected') &&
        event.createdAtIso >= requestEvent.createdAtIso,
    )
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso))[0];

  if (!reviewEvent) {
    return {
      status: 'pending',
      description: requestEvent.noteText ?? '',
      requestedAtIso: requestEvent.createdAtIso,
    };
  }

  return {
    status:
      reviewEvent.eventType === 'change_request_approved'
        ? 'approved'
        : 'rejected',
    description: requestEvent.noteText ?? '',
    reviewResultText: reviewEvent.noteText,
    requestedAtIso: requestEvent.createdAtIso,
    reviewedAtIso: reviewEvent.createdAtIso,
  };
}

function createAdminOrderChangeRequestRecord(
  order: ShipperOrderRecord,
): AdminOrderChangeRequestRecord | null {
  const changeRequest = findLatestOrderChangeRequest(order);
  if (!changeRequest) {
    return null;
  }

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    shipperId: order.shipperId,
    status: changeRequest.status,
    description: changeRequest.description,
    ...(changeRequest.reviewResultText
      ? { reviewResultText: changeRequest.reviewResultText }
      : {}),
    requestedAtIso: changeRequest.requestedAtIso,
    ...(changeRequest.reviewedAtIso
      ? { reviewedAtIso: changeRequest.reviewedAtIso }
      : {}),
    ...(order.assignedDriverId
      ? { assignedDriverId: order.assignedDriverId }
      : {}),
    orderStatus: order.status,
  };
}

function isOrderAcceptedByDriver(order: ShipperOrderRecord, driverId: string) {
  return order.events.some(
    event =>
      event.actorUserId === driverId && event.eventType === 'driver_accepted',
  );
}

function createOrderExceptionNote(input: ReportShipperOrderExceptionRequest) {
  const photoCount = getOrderEventPhotoCount(input);
  const photoText =
    photoCount > 0
      ? `；图片凭证 ${photoCount} 张`
      : '';

  return `${input.typeLabel}：${input.description}${photoText}`;
}

function createOrderEvaluationNote(input: SubmitShipperOrderEvaluationRequest) {
  const evaluationInfo = input.anonymous ? '匿名' : '实名';
  const photoCount = getOrderEventPhotoCount(input);
  const photoText =
    photoCount > 0
      ? `；图片凭证 ${photoCount} 张`
      : '';

  return `${input.rating} 星：${input.tags.join('、')}；评价信息：${evaluationInfo}${photoText}；评价正文：${input.content}`;
}

function getOrderEventPhotoCount(input: {
  photoCount?: number;
  photoFileIds?: string[];
}) {
  return input.photoFileIds?.length ?? input.photoCount ?? 0;
}

function createInMemoryExceptionCase({
  sequence,
  order,
  event,
  reporterUserId,
  sourceRole,
  input,
  nowIso,
}: {
  sequence: number;
  order: ShipperOrderRecord;
  event: ShipperOrderEventRecord;
  reporterUserId: string;
  sourceRole: 'shipper' | 'driver';
  input: ReportShipperOrderExceptionRequest;
  nowIso: string;
}): OrderExceptionCaseRecord {
  return {
    id: `exception-case-${sequence}`,
    caseNo: `YC${formatOrderDate(new Date(nowIso))}${String(sequence).padStart(4, '0')}`,
    orderId: order.id,
    orderNo: order.orderNo,
    sourceEventId: event.id,
    reporterUserId,
    sourceRole,
    typeLabel: input.typeLabel,
    description: input.description,
    attachmentFileIds: input.photoFileIds ?? [],
    status: 'pending',
    appealStatus: 'none',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    actions: [],
  };
}

function createExceptionCaseSummary(exceptionCase: OrderExceptionCaseRecord) {
  return {
    id: exceptionCase.id,
    caseNo: exceptionCase.caseNo,
    sourceEventId: exceptionCase.sourceEventId,
    sourceRole: exceptionCase.sourceRole,
    status: exceptionCase.status,
    resolutionText: exceptionCase.resolutionText,
    resolvedAtIso: exceptionCase.resolvedAtIso,
    compensationStatus: exceptionCase.compensationStatus,
    compensationTargetRole: exceptionCase.compensationTargetRole,
    compensationAmountCents: exceptionCase.compensationAmountCents,
    compensationUpdatedAtIso: exceptionCase.compensationUpdatedAtIso,
    compensationExecutedAtIso: exceptionCase.compensationExecutedAtIso,
    appealStatus: exceptionCase.appealStatus,
    appealReason: exceptionCase.appealReason,
    appealRequestedAtIso: exceptionCase.appealRequestedAtIso,
    createdAtIso: exceptionCase.createdAtIso,
    updatedAtIso: exceptionCase.updatedAtIso,
  };
}

function createNextUpdatedAtIso(previousIso: string, now: Date) {
  const nextTimestamp = Math.max(now.getTime(), Date.parse(previousIso) + 1);

  return new Date(nextTimestamp).toISOString();
}

const COMPENSATION_TARGET_LABEL: Record<OrderExceptionCaseSourceRole, string> = {
  shipper: '货主',
  driver: '司机',
};

function createExceptionCompensationNote(
  targetRole: OrderExceptionCaseSourceRole,
  amountCents: number,
): string {
  const amountYuan = (amountCents / 100).toFixed(2);

  return `平台向${COMPENSATION_TARGET_LABEL[targetRole]}赔付 ${amountYuan} 元已入账`;
}

function resolveCompensationTargetUserId(
  order: Pick<ShipperOrderRecord, 'shipperId' | 'assignedDriverId'>,
  targetRole: OrderExceptionCaseSourceRole,
): string | undefined {
  if (targetRole === 'shipper') {
    return order.shipperId;
  }

  return order.assignedDriverId ?? undefined;
}

function isAppealActorRelated(
  order: ShipperOrderRecord,
  input: AppealExceptionCaseInput,
): boolean {
  const relatedUserId =
    input.actorRole === 'driver' ? order.assignedDriverId : order.shipperId;

  return relatedUserId === input.actorUserId;
}

function createLocationCoordinateWrite(
  latitude?: number,
  longitude?: number,
  geocodeStatus: 'sandbox' | 'manual' | 'amap' = 'manual',
) {
  if (latitude === undefined || longitude === undefined) {
    return {};
  }

  return {
    latitude,
    longitude,
    geocodeStatus,
    geocodedAt: new Date(),
  };
}

function toOptionalCoordinate(
  value?: { toNumber(): number } | number | null,
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'number' ? value : value.toNumber();
}

function formatOrderDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}${String(date.getDate()).padStart(2, '0')}`;
}

import { randomUUID } from 'crypto';
import { BusinessError } from '../common/errors';
import type {
  PaymentProviderChannel,
  VerifiedPaymentCallback,
  VerifiedRefundCallback,
} from './payment-provider';
import {
  assertLedgerBalanced,
  createOnlineEscrowEntries,
  createOnlineRefundEntries,
  resolveSuccessfulPaymentStatus,
  type OrderPaymentStatus,
} from './payment-domain';
import type {
  FinancialLedgerEntryRecord,
  FinancialOutboxEventRecord,
  FinancialTransactionRecord,
  PaymentOrderRecord,
  PaymentSourceOrderRecord,
  RefundRecord,
} from './dto';
import {
  InMemoryProfileCouponsStore,
  type PrismaShipperCouponRecord,
} from '../profile-coupons/profile-coupons.repository';

const ACTIVE_PAYMENT_STATUSES = [
  'pending',
  'processing',
  'escrowed',
  'refund_pending',
] as const;

export type ExecutePaymentCreateInput = {
  paymentId: string;
  paymentNo: string;
  orderId: string;
  shipperId: string;
  providerChannel: PaymentProviderChannel;
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAtIso: string;
};

export type ExecutePaymentCreateResult =
  | {
      kind: 'success';
      payment: PaymentOrderRecord;
      replayed: boolean;
      preparationRequired: boolean;
    }
  | { kind: 'key-reused' }
  | { kind: 'order-not-available' }
  | { kind: 'amount-invalid' }
  | { kind: 'already-escrowed' }
  | { kind: 'active-payment-exists'; paymentId: string };

export type AppliedPaymentCallbackResult = {
  kind: 'applied';
  replayed: boolean;
  payment: PaymentOrderRecord;
  orderPaymentStatus: Extract<
    OrderPaymentStatus,
    'escrowed' | 'refund_pending'
  >;
  financialTransaction: FinancialTransactionRecord;
  refund?: RefundRecord;
  outboxEvent?: FinancialOutboxEventRecord;
};

export type ApplyPaymentCallbackResult =
  | AppliedPaymentCallbackResult
  | {
      kind: 'failed';
      replayed: boolean;
      payment: PaymentOrderRecord;
      orderPaymentStatus: 'failed';
    }
  | { kind: 'event-conflict' }
  | { kind: 'payment-conflict' }
  | { kind: 'payment-not-found' };

export type ApplyVerifiedPaymentCallbackInput = {
  channel: PaymentProviderChannel;
  callback: VerifiedPaymentCallback;
};

export type AppliedRefundCallbackResult = {
  kind: 'applied';
  replayed: boolean;
  refund: RefundRecord;
  payment: PaymentOrderRecord;
  orderPaymentStatus: 'refunded';
  financialTransaction: FinancialTransactionRecord;
};

export type ApplyRefundCallbackResult =
  | AppliedRefundCallbackResult
  | {
      kind: 'failed';
      replayed: boolean;
      refund: RefundRecord;
      payment: PaymentOrderRecord;
      orderPaymentStatus: 'refund_failed';
    }
  | { kind: 'event-conflict' }
  | { kind: 'refund-conflict' }
  | { kind: 'refund-not-found' };

export type ApplyVerifiedRefundCallbackInput = {
  channel: PaymentProviderChannel;
  callback: VerifiedRefundCallback;
};

export type ClaimRefundOutboxEventsInput = {
  workerId: string;
  limit: number;
  nowIso: string;
  leaseDurationMs: number;
};

export type ClaimedRefundOutboxEvent = {
  event: FinancialOutboxEventRecord & {
    status: 'processing';
    claimedAtIso: string;
    leaseExpiresAtIso: string;
    claimedBy: string;
  };
  refund: RefundRecord;
  payment: PaymentOrderRecord;
};

export type CompleteRefundOutboxRequestInput = {
  outboxEventId: string;
  workerId: string;
  claimAttempt: number;
  providerRefundNo: string;
  completedAtIso: string;
};

export type CompleteRefundOutboxRequestResult =
  | {
      kind: 'completed';
      event: FinancialOutboxEventRecord;
      refund: RefundRecord;
    }
  | { kind: 'claim-lost' };

export type FailRefundOutboxRequestInput = {
  outboxEventId: string;
  workerId: string;
  claimAttempt: number;
  failureCode: string;
  failureMessage: string;
  failedAtIso: string;
  nextAvailableAtIso: string;
};

export type FailRefundOutboxRequestResult =
  | {
      kind: 'retry-scheduled' | 'dead';
      event: FinancialOutboxEventRecord;
      refund: RefundRecord;
    }
  | { kind: 'claim-lost' };

export interface PaymentsRepository {
  executeIdempotentPaymentCreate(
    input: ExecutePaymentCreateInput,
  ): Promise<ExecutePaymentCreateResult>;
  completePaymentPreparation(input: {
    paymentId: string;
    clientPayload: Record<string, unknown> | string;
  }): Promise<PaymentOrderRecord | undefined>;
  failPaymentPreparation(input: {
    paymentId: string;
    failureCode: string;
    failureMessage: string;
  }): Promise<PaymentOrderRecord | undefined>;
  findPaymentOrderForShipper(
    shipperId: string,
    paymentId: string,
  ): Promise<PaymentOrderRecord | undefined>;
  findLatestPaymentOrderForShipper(
    shipperId: string,
    orderId: string,
  ): Promise<PaymentOrderRecord | undefined>;
  applyVerifiedPaymentCallback(
    input: ApplyVerifiedPaymentCallbackInput,
  ): Promise<ApplyPaymentCallbackResult>;
  applyVerifiedRefundCallback(
    input: ApplyVerifiedRefundCallbackInput,
  ): Promise<ApplyRefundCallbackResult>;
  claimRefundOutboxEvents(
    input: ClaimRefundOutboxEventsInput,
  ): Promise<ClaimedRefundOutboxEvent[]>;
  completeRefundOutboxRequest(
    input: CompleteRefundOutboxRequestInput,
  ): Promise<CompleteRefundOutboxRequestResult>;
  failRefundOutboxRequest(
    input: FailRefundOutboxRequestInput,
  ): Promise<FailRefundOutboxRequestResult>;
}

type InMemoryCallbackEvent =
  | {
      eventType: 'payment';
      rawPayloadHash: string;
      result: ApplyPaymentCallbackResult;
    }
  | {
      eventType: 'refund';
      rawPayloadHash: string;
      result: ApplyRefundCallbackResult;
    };

export class InMemoryPaymentsRepository implements PaymentsRepository {
  private readonly orders: PaymentSourceOrderRecord[];
  private readonly paymentOrders: PaymentOrderRecord[];
  private readonly callbackEvents = new Map<string, InMemoryCallbackEvent>();
  private readonly financialTransactions: FinancialTransactionRecord[] = [];
  private readonly refunds: RefundRecord[] = [];
  private readonly outboxEvents: FinancialOutboxEventRecord[] = [];
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    options: {
      now?: () => Date;
      createId?: () => string;
      orders?: PaymentSourceOrderRecord[];
      paymentOrders?: PaymentOrderRecord[];
      refunds?: RefundRecord[];
      outboxEvents?: FinancialOutboxEventRecord[];
      couponStore?: InMemoryProfileCouponsStore;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.couponStore =
      options.couponStore ?? new InMemoryProfileCouponsStore();
    this.orders = structuredClone(options.orders ?? []);
    this.paymentOrders = structuredClone(options.paymentOrders ?? []);
    this.refunds.push(...structuredClone(options.refunds ?? []));
    this.outboxEvents.push(...structuredClone(options.outboxEvents ?? []));
  }

  private readonly couponStore: InMemoryProfileCouponsStore;

  async executeIdempotentPaymentCreate(
    input: ExecutePaymentCreateInput,
  ): Promise<ExecutePaymentCreateResult> {
    const existing = this.paymentOrders.find(
      payment =>
        payment.shipperId === input.shipperId &&
        payment.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      return mapExistingPaymentCreate(existing, input.requestFingerprint);
    }

    const order = this.orders.find(
      item => item.id === input.orderId && item.shipperId === input.shipperId,
    );
    const eligibility = resolvePaymentCreationEligibility(order);

    if (eligibility.kind !== 'eligible') {
      return eligibility;
    }

    const activePayment = this.paymentOrders.find(
      payment =>
        payment.orderId === eligibility.order.id &&
        isActivePaymentStatus(payment.status),
    );

    if (activePayment) {
      return {
        kind: 'active-payment-exists',
        paymentId: activePayment.id,
      };
    }

    const nowIso = this.now().toISOString();
    const payment: PaymentOrderRecord = {
      id: input.paymentId,
      paymentNo: input.paymentNo,
      orderId: eligibility.order.id,
      orderNo: eligibility.order.orderNo,
      shipperId: eligibility.order.shipperId,
      channel: input.providerChannel,
      amountCents: eligibility.amountCents,
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      expiresAtIso: input.expiresAtIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.paymentOrders.push(payment);

    return {
      kind: 'success',
      payment: clonePayment(payment),
      replayed: false,
      preparationRequired: true,
    };
  }

  async completePaymentPreparation(input: {
    paymentId: string;
    clientPayload: Record<string, unknown> | string;
  }) {
    const payment = this.paymentOrders.find(item => item.id === input.paymentId);

    if (!payment) {
      return undefined;
    }

    if (payment.status === 'pending') {
      payment.status = 'processing';
    }

    if (
      payment.status === 'processing' ||
      payment.status === 'escrowed' ||
      payment.status === 'refund_pending'
    ) {
      payment.clientPayload = structuredClone(input.clientPayload);
      payment.updatedAtIso = this.now().toISOString();
    }

    return clonePayment(payment);
  }

  async failPaymentPreparation(input: {
    paymentId: string;
    failureCode: string;
    failureMessage: string;
  }) {
    const payment = this.paymentOrders.find(item => item.id === input.paymentId);

    if (!payment) {
      return undefined;
    }

    if (payment.status === 'pending' || payment.status === 'processing') {
      payment.status = 'failed';
      payment.failureCode = input.failureCode;
      payment.failureMessage = input.failureMessage;
      payment.updatedAtIso = this.now().toISOString();
      const order = this.orders.find(item => item.id === payment.orderId);

      if (order && order.paymentStatus === 'pending') {
        order.paymentStatus = 'failed';
      }
    }

    return clonePayment(payment);
  }

  async findPaymentOrderForShipper(shipperId: string, paymentId: string) {
    const payment = this.paymentOrders.find(
      item => item.id === paymentId && item.shipperId === shipperId,
    );

    return payment ? clonePayment(payment) : undefined;
  }

  async findLatestPaymentOrderForShipper(shipperId: string, orderId: string) {
    const payment = [...this.paymentOrders]
      .filter(
        item => item.orderId === orderId && item.shipperId === shipperId,
      )
      .sort((left, right) =>
        right.createdAtIso.localeCompare(left.createdAtIso),
      )[0];

    return payment ? clonePayment(payment) : undefined;
  }

  async claimRefundOutboxEvents(
    input: ClaimRefundOutboxEventsInput,
  ): Promise<ClaimedRefundOutboxEvent[]> {
    const now = new Date(input.nowIso);
    const nowTime = now.getTime();
    const leaseExpiresAtIso = new Date(
      nowTime + input.leaseDurationMs,
    ).toISOString();
    const candidates = this.outboxEvents
      .filter(event => {
        if (
          event.eventType !== 'refund.requested' ||
          event.attemptCount >= event.maxAttempts
        ) {
          return false;
        }

        if (event.status === 'pending') {
          return Date.parse(event.availableAtIso) <= nowTime;
        }

        return (
          event.status === 'processing' &&
          event.leaseExpiresAtIso !== undefined &&
          Date.parse(event.leaseExpiresAtIso) <= nowTime
        );
      })
      .sort(
        (left, right) =>
          left.availableAtIso.localeCompare(right.availableAtIso) ||
          left.createdAtIso.localeCompare(right.createdAtIso),
      )
      .slice(0, input.limit);
    const claims: ClaimedRefundOutboxEvent[] = [];

    for (const event of candidates) {
      const refund = this.refunds.find(item => item.id === event.refundId);
      const payment = refund
        ? this.paymentOrders.find(item => item.id === refund.paymentOrderId)
        : undefined;

      if (!refund || !payment || refund.status === 'succeeded') {
        continue;
      }

      event.status = 'processing';
      event.attemptCount += 1;
      event.claimedAtIso = input.nowIso;
      event.leaseExpiresAtIso = leaseExpiresAtIso;
      event.claimedBy = input.workerId;
      event.updatedAtIso = input.nowIso;
      refund.status = 'processing';
      refund.processingStartedAtIso = input.nowIso;
      refund.updatedAtIso = input.nowIso;
      delete refund.failureCode;
      delete refund.failureMessage;
      claims.push({
        event: {
          ...structuredClone(event),
          status: 'processing',
          claimedAtIso: input.nowIso,
          leaseExpiresAtIso,
          claimedBy: input.workerId,
        },
        refund: structuredClone(refund),
        payment: clonePayment(payment),
      });
    }

    return claims;
  }

  async completeRefundOutboxRequest(
    input: CompleteRefundOutboxRequestInput,
  ): Promise<CompleteRefundOutboxRequestResult> {
    const event = this.outboxEvents.find(
      item => item.id === input.outboxEventId,
    );

    if (
      !event ||
      event.status !== 'processing' ||
      event.claimedBy !== input.workerId ||
      event.attemptCount !== input.claimAttempt
    ) {
      return { kind: 'claim-lost' };
    }

    const refund = this.refunds.find(item => item.id === event.refundId);

    if (!refund) {
      return { kind: 'claim-lost' };
    }

    refund.providerRefundNo = input.providerRefundNo;
    refund.updatedAtIso = input.completedAtIso;
    event.status = 'completed';
    event.processedAtIso = input.completedAtIso;
    event.updatedAtIso = input.completedAtIso;
    delete event.claimedAtIso;
    delete event.leaseExpiresAtIso;
    delete event.claimedBy;

    return {
      kind: 'completed',
      event: structuredClone(event),
      refund: structuredClone(refund),
    };
  }

  async failRefundOutboxRequest(
    input: FailRefundOutboxRequestInput,
  ): Promise<FailRefundOutboxRequestResult> {
    const event = this.outboxEvents.find(
      item => item.id === input.outboxEventId,
    );

    if (
      !event ||
      event.status !== 'processing' ||
      event.claimedBy !== input.workerId ||
      event.attemptCount !== input.claimAttempt
    ) {
      return { kind: 'claim-lost' };
    }

    const refund = this.refunds.find(item => item.id === event.refundId);
    const payment = refund
      ? this.paymentOrders.find(item => item.id === refund.paymentOrderId)
      : undefined;
    const order = payment
      ? this.orders.find(item => item.id === payment.orderId)
      : undefined;

    if (!refund || !payment || !order) {
      return { kind: 'claim-lost' };
    }

    const dead = event.attemptCount >= event.maxAttempts;
    event.status = dead ? 'dead' : 'pending';
    event.availableAtIso = input.nextAvailableAtIso;
    event.lastError = input.failureMessage;
    event.updatedAtIso = input.failedAtIso;
    if (dead) {
      event.processedAtIso = input.failedAtIso;
    }
    delete event.claimedAtIso;
    delete event.leaseExpiresAtIso;
    delete event.claimedBy;
    refund.status = 'failed';
    refund.failureCode = input.failureCode;
    refund.failureMessage = input.failureMessage;
    refund.failedAtIso = input.failedAtIso;
    refund.updatedAtIso = input.failedAtIso;
    payment.status = 'refund_failed';
    payment.failureCode = input.failureCode;
    payment.failureMessage = input.failureMessage;
    payment.updatedAtIso = input.failedAtIso;
    order.paymentStatus = 'refund_failed';

    return {
      kind: dead ? 'dead' : 'retry-scheduled',
      event: structuredClone(event),
      refund: structuredClone(refund),
    };
  }

  async applyVerifiedRefundCallback(
    input: ApplyVerifiedRefundCallbackInput,
  ): Promise<ApplyRefundCallbackResult> {
    const callbackKey = createCallbackKey(input.channel, input.callback.eventId);
    const existingEvent = this.callbackEvents.get(callbackKey);

    if (existingEvent) {
      if (
        existingEvent.eventType !== 'refund' ||
        existingEvent.rawPayloadHash !== input.callback.rawPayloadHash
      ) {
        return { kind: 'event-conflict' };
      }

      return markRefundCallbackResultReplayed(existingEvent.result);
    }

    const refund = this.refunds.find(
      item =>
        item.refundNo === input.callback.refundNo &&
        item.channel === input.channel,
    );

    if (!refund) {
      return { kind: 'refund-not-found' };
    }

    const payment = this.paymentOrders.find(
      item => item.id === refund.paymentOrderId,
    );
    const order = this.orders.find(item => item.id === refund.orderId);
    const providerRefundConflict = this.refunds.some(
      item =>
        item.id !== refund.id &&
        item.channel === input.channel &&
        item.providerRefundNo === input.callback.providerRefundNo,
    );

    if (
      input.callback.amountCents !== refund.amountCents ||
      (refund.providerRefundNo !== undefined &&
        refund.providerRefundNo !== input.callback.providerRefundNo) ||
      providerRefundConflict ||
      !payment ||
      !order ||
      payment.orderId !== refund.orderId ||
      payment.shipperId !== refund.shipperId ||
      payment.channel !== refund.channel ||
      payment.amountCents !== refund.amountCents ||
      order.id !== payment.orderId ||
      order.shipperId !== refund.shipperId
    ) {
      return { kind: 'refund-conflict' };
    }

    const existingTransaction = this.financialTransactions.find(
      transaction =>
        transaction.type === 'online_refund' &&
        transaction.referenceId === refund.id,
    );

    if (input.callback.status === 'failed') {
      if (
        existingTransaction ||
        (refund.status !== 'pending' &&
          refund.status !== 'processing' &&
          refund.status !== 'failed') ||
        (payment.status !== 'refund_pending' &&
          payment.status !== 'refund_failed') ||
        (order.paymentStatus !== 'refund_pending' &&
          order.paymentStatus !== 'refund_failed')
      ) {
        return { kind: 'refund-conflict' };
      }

      const updatedAtIso = this.now().toISOString();
      refund.status = 'failed';
      refund.providerRefundNo = input.callback.providerRefundNo;
      refund.failureCode = 'provider_refund_failed';
      refund.failureMessage = '退款渠道返回失败';
      refund.failedAtIso = input.callback.occurredAtIso;
      refund.updatedAtIso = updatedAtIso;
      payment.status = 'refund_failed';
      payment.failureCode = 'provider_refund_failed';
      payment.failureMessage = '退款渠道返回失败';
      payment.updatedAtIso = updatedAtIso;
      order.paymentStatus = 'refund_failed';
      const result: ApplyRefundCallbackResult = {
        kind: 'failed',
        replayed: false,
        refund: structuredClone(refund),
        payment: clonePayment(payment),
        orderPaymentStatus: 'refund_failed',
      };
      this.recordInMemoryRefundCallback(
        callbackKey,
        input.callback,
        result,
      );
      return result;
    }

    if (existingTransaction) {
      if (
        refund.status !== 'succeeded' ||
        payment.status !== 'refunded' ||
        order.paymentStatus !== 'refunded' ||
        refund.financialTransactionId !== existingTransaction.id
      ) {
        return { kind: 'refund-conflict' };
      }

      const result: AppliedRefundCallbackResult = {
        kind: 'applied',
        replayed: true,
        refund: structuredClone(refund),
        payment: clonePayment(payment),
        orderPaymentStatus: 'refunded',
        financialTransaction: cloneFinancialTransaction(existingTransaction),
      };
      this.recordInMemoryRefundCallback(
        callbackKey,
        input.callback,
        result,
      );
      return result;
    }

    if (
      input.callback.status !== 'succeeded' ||
      (refund.status !== 'pending' &&
        refund.status !== 'processing' &&
        refund.status !== 'failed') ||
      (payment.status !== 'refund_pending' &&
        payment.status !== 'refund_failed') ||
      (order.paymentStatus !== 'refund_pending' &&
        order.paymentStatus !== 'refund_failed')
    ) {
      return { kind: 'refund-conflict' };
    }

    const transactionId = this.createId();
    const createdAtIso = this.now().toISOString();
    const entryDrafts = createOnlineRefundEntries(
      refund.amountCents,
      refund.shipperId,
    );
    assertLedgerBalanced(entryDrafts);
    const financialTransaction: FinancialTransactionRecord = {
      id: transactionId,
      transactionNo: `FT-${transactionId}`,
      type: 'online_refund',
      referenceId: refund.id,
      orderId: refund.orderId,
      paymentOrderId: refund.paymentOrderId,
      amountCents: refund.amountCents,
      occurredAtIso: input.callback.occurredAtIso,
      createdAtIso,
      entries: entryDrafts.map((entry, sequence) => ({
        id: this.createId(),
        transactionId,
        sequence,
        accountType: entry.accountType,
        ...(entry.accountUserId
          ? { accountUserId: entry.accountUserId }
          : {}),
        direction: entry.direction,
        amountCents: entry.amountCents,
        createdAtIso,
      })),
    };
    this.financialTransactions.push(financialTransaction);
    refund.status = 'succeeded';
    refund.providerRefundNo = input.callback.providerRefundNo;
    refund.succeededAtIso = input.callback.occurredAtIso;
    refund.financialTransactionId = financialTransaction.id;
    refund.updatedAtIso = createdAtIso;
    delete refund.failureCode;
    delete refund.failureMessage;
    payment.status = 'refunded';
    payment.refundedAtIso = input.callback.occurredAtIso;
    payment.updatedAtIso = createdAtIso;
    delete payment.failureCode;
    delete payment.failureMessage;
    order.paymentStatus = 'refunded';
    this.restoreInMemoryRefundCouponIfNeeded(
      order,
      input.callback.occurredAtIso,
    );
    for (const event of this.outboxEvents) {
      if (
        event.refundId === refund.id &&
        (event.status === 'pending' || event.status === 'processing')
      ) {
        event.status = 'completed';
        event.processedAtIso = createdAtIso;
        event.updatedAtIso = createdAtIso;
        delete event.claimedAtIso;
        delete event.leaseExpiresAtIso;
        delete event.claimedBy;
      }
    }

    const result: AppliedRefundCallbackResult = {
      kind: 'applied',
      replayed: false,
      refund: structuredClone(refund),
      payment: clonePayment(payment),
      orderPaymentStatus: 'refunded',
      financialTransaction: cloneFinancialTransaction(financialTransaction),
    };
    this.recordInMemoryRefundCallback(callbackKey, input.callback, result);
    return result;
  }

  private restoreInMemoryRefundCouponIfNeeded(
    order: PaymentSourceOrderRecord,
    issuedAtIso: string,
  ) {
    if (!order.couponId) {
      return;
    }

    const coupon = this.couponStore.coupons.find(
      item => item.id === order.couponId && item.shipperId === order.shipperId,
    );

    if (
      !coupon ||
      coupon.status !== 'used' ||
      coupon.usedOrderNo !== order.orderNo
    ) {
      return;
    }

    const validityWindow = createRefundReturnCouponValidityWindow(
      Date.parse(coupon.validFromIso),
      Date.parse(coupon.validUntilIso),
      Date.parse(issuedAtIso),
    );

    this.couponStore.coupons.push({
      id: `coupon-return-${this.createId()}`,
      shipperId: coupon.shipperId,
      title: coupon.title,
      status: 'usable',
      conditionText: coupon.conditionText,
      discountCents: coupon.discountCents,
      minOrderAmountCents: coupon.minOrderAmountCents,
      validFromIso: validityWindow.validFromIso,
      validUntilIso: validityWindow.validUntilIso,
      sourceText: '退款返券',
      issuedAtIso,
    });
  }

  async applyVerifiedPaymentCallback(
    input: ApplyVerifiedPaymentCallbackInput,
  ): Promise<ApplyPaymentCallbackResult> {
    const callbackKey = createCallbackKey(input.channel, input.callback.eventId);
    const existingEvent = this.callbackEvents.get(callbackKey);

    if (existingEvent) {
      if (
        existingEvent.eventType !== 'payment' ||
        existingEvent.rawPayloadHash !== input.callback.rawPayloadHash
      ) {
        return { kind: 'event-conflict' };
      }

      return markCallbackResultReplayed(existingEvent.result);
    }

    const payment = this.paymentOrders.find(
      item =>
        item.paymentNo === input.callback.paymentNo &&
        item.channel === input.channel,
    );

    if (!payment) {
      return { kind: 'payment-not-found' };
    }

    if (
      payment.amountCents !== input.callback.amountCents ||
      (payment.providerTradeNo !== undefined &&
        payment.providerTradeNo !== input.callback.providerTradeNo) ||
      this.paymentOrders.some(
        item =>
          item.id !== payment.id &&
          item.channel === input.channel &&
          item.providerTradeNo === input.callback.providerTradeNo,
      )
    ) {
      return { kind: 'payment-conflict' };
    }

    const order = this.orders.find(item => item.id === payment.orderId);

    if (!order) {
      return { kind: 'payment-conflict' };
    }

    if (input.callback.status === 'failed') {
      if (
        payment.status !== 'pending' &&
        payment.status !== 'processing' &&
        payment.status !== 'failed'
      ) {
        return { kind: 'payment-conflict' };
      }

      payment.status = 'failed';
      payment.providerTradeNo = input.callback.providerTradeNo;
      payment.failureCode = 'provider_payment_failed';
      payment.updatedAtIso = this.now().toISOString();
      order.paymentStatus = 'failed';
      const result: ApplyPaymentCallbackResult = {
        kind: 'failed',
        replayed: false,
        payment: clonePayment(payment),
        orderPaymentStatus: 'failed',
      };
      this.recordInMemoryCallback(callbackKey, input.callback, result);
      return result;
    }

    const existingTransaction = this.financialTransactions.find(
      transaction =>
        transaction.type === 'online_payment_escrow' &&
        transaction.referenceId === payment.id,
    );

    if (existingTransaction) {
      const result = this.createExistingAppliedCallbackResult(
        payment,
        order,
        existingTransaction,
      );
      this.recordInMemoryCallback(callbackKey, input.callback, result);
      return result;
    }

    let nextOrderPaymentStatus: Extract<
      OrderPaymentStatus,
      'escrowed' | 'refund_pending'
    >;

    try {
      nextOrderPaymentStatus = resolveSuccessfulPaymentStatus(
        order.status,
        payment.status,
      );
    } catch (error) {
      if (error instanceof BusinessError) {
        return { kind: 'payment-conflict' };
      }
      throw error;
    }

    const transaction = this.createEscrowTransaction(
      payment,
      input.callback.occurredAtIso,
    );
    payment.status = nextOrderPaymentStatus;
    payment.providerTradeNo = input.callback.providerTradeNo;
    payment.paidAtIso = input.callback.occurredAtIso;
    payment.updatedAtIso = this.now().toISOString();
    delete payment.failureCode;
    delete payment.failureMessage;
    order.paymentStatus = nextOrderPaymentStatus;

    const result: AppliedPaymentCallbackResult = {
      kind: 'applied',
      replayed: false,
      payment: clonePayment(payment),
      orderPaymentStatus: nextOrderPaymentStatus,
      financialTransaction: cloneFinancialTransaction(transaction),
    };

    if (nextOrderPaymentStatus === 'refund_pending') {
      const refund = this.createLatePaymentRefund(payment);
      const outboxEvent = this.createRefundOutboxEvent(refund);
      result.refund = structuredClone(refund);
      result.outboxEvent = structuredClone(outboxEvent);
    }

    this.recordInMemoryCallback(callbackKey, input.callback, result);
    return structuredClone(result);
  }

  private createEscrowTransaction(
    payment: PaymentOrderRecord,
    occurredAtIso: string,
  ) {
    const transactionId = this.createId();
    const createdAtIso = this.now().toISOString();
    const entryDrafts = createOnlineEscrowEntries(
      payment.amountCents,
      payment.shipperId,
    );
    assertLedgerBalanced(entryDrafts);
    const transaction: FinancialTransactionRecord = {
      id: transactionId,
      transactionNo: `FT-${transactionId}`,
      type: 'online_payment_escrow',
      referenceId: payment.id,
      orderId: payment.orderId,
      paymentOrderId: payment.id,
      amountCents: payment.amountCents,
      occurredAtIso,
      createdAtIso,
      entries: entryDrafts.map((entry, sequence) => ({
        id: this.createId(),
        transactionId,
        sequence,
        accountType: entry.accountType,
        ...(entry.accountUserId
          ? { accountUserId: entry.accountUserId }
          : {}),
        direction: entry.direction,
        amountCents: entry.amountCents,
        createdAtIso,
      })),
    };
    this.financialTransactions.push(transaction);
    return transaction;
  }

  private createLatePaymentRefund(payment: PaymentOrderRecord) {
    const nowIso = this.now().toISOString();
    const refund: RefundRecord = {
      id: this.createId(),
      refundNo: `RF-${payment.paymentNo}`,
      paymentOrderId: payment.id,
      orderId: payment.orderId,
      shipperId: payment.shipperId,
      channel: payment.channel,
      amountCents: payment.amountCents,
      reason: 'late_payment_after_order_cancelled',
      status: 'pending',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.refunds.push(refund);
    return refund;
  }

  private createRefundOutboxEvent(refund: RefundRecord) {
    const nowIso = this.now().toISOString();
    const event: FinancialOutboxEventRecord = {
      id: this.createId(),
      eventType: 'refund.requested',
      aggregateType: 'refund',
      aggregateId: refund.id,
      refundId: refund.id,
      payload: {
        refundId: refund.id,
        paymentOrderId: refund.paymentOrderId,
      },
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 10,
      availableAtIso: nowIso,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.outboxEvents.push(event);
    return event;
  }

  private createExistingAppliedCallbackResult(
    payment: PaymentOrderRecord,
    order: PaymentSourceOrderRecord,
    transaction: FinancialTransactionRecord,
  ): ApplyPaymentCallbackResult {
    if (
      payment.status !== 'escrowed' &&
      payment.status !== 'refund_pending' &&
      payment.status !== 'settled' &&
      payment.status !== 'refunded'
    ) {
      return { kind: 'payment-conflict' };
    }

    const orderPaymentStatus =
      payment.status === 'refund_pending' || payment.status === 'refunded'
        ? 'refund_pending'
        : 'escrowed';
    const refund = this.refunds.find(item => item.paymentOrderId === payment.id);
    const outboxEvent = refund
      ? this.outboxEvents.find(item => item.refundId === refund.id)
      : undefined;

    return {
      kind: 'applied',
      replayed: true,
      payment: clonePayment(payment),
      orderPaymentStatus:
        order.paymentStatus === 'refund_pending'
          ? 'refund_pending'
          : orderPaymentStatus,
      financialTransaction: cloneFinancialTransaction(transaction),
      ...(refund ? { refund: structuredClone(refund) } : {}),
      ...(outboxEvent ? { outboxEvent: structuredClone(outboxEvent) } : {}),
    };
  }

  private recordInMemoryCallback(
    key: string,
    callback: VerifiedPaymentCallback,
    result: ApplyPaymentCallbackResult,
  ) {
    this.callbackEvents.set(key, {
      eventType: 'payment',
      rawPayloadHash: callback.rawPayloadHash,
      result: structuredClone(result),
    });
  }

  private recordInMemoryRefundCallback(
    key: string,
    callback: VerifiedRefundCallback,
    result: ApplyRefundCallbackResult,
  ) {
    this.callbackEvents.set(key, {
      eventType: 'refund',
      rawPayloadHash: callback.rawPayloadHash,
      result: structuredClone(result),
    });
  }
}

type PrismaPaymentOrderRecord = {
  id: string;
  paymentNo: string;
  orderId: string;
  shipperId: string;
  channel: PaymentProviderChannel;
  amountCents: number;
  status: PaymentOrderRecord['status'];
  idempotencyKey: string;
  requestFingerprint: string;
  clientPayload: unknown;
  providerTradeNo: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order: PrismaPaymentSourceOrderRecord;
};

type PrismaPaymentSourceOrderRecord = {
  id: string;
  orderNo: string;
  shipperId: string;
  status: PaymentSourceOrderRecord['status'];
  pricingMode: PaymentSourceOrderRecord['pricingMode'];
  paymentMethod: PaymentSourceOrderRecord['paymentMethod'];
  paymentStatus: PaymentSourceOrderRecord['paymentStatus'];
  priceCents: number | null;
  payablePriceCents: number | null;
  couponId: string | null;
  refundedAt: Date | null;
};

type PrismaFinancialTransactionRecord = {
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
    accountType: FinancialLedgerEntryRecord['accountType'];
    accountUserId: string | null;
    direction: FinancialLedgerEntryRecord['direction'];
    amountCents: number;
    createdAt: Date;
  }>;
};

type PrismaCallbackEventRecord = {
  id: string;
  channel: PaymentProviderChannel;
  eventId: string;
  eventType: string;
  paymentOrderId: string | null;
  refundId: string | null;
  rawPayloadHash: string;
  processingResult: string;
};

type PrismaRefundRecord = {
  id: string;
  refundNo: string;
  paymentOrderId: string;
  orderId: string;
  shipperId: string;
  channel: PaymentProviderChannel;
  amountCents: number;
  reason: string;
  status: RefundRecord['status'];
  providerRefundNo: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  processingStartedAt: Date | null;
  succeededAt: Date | null;
  failedAt: Date | null;
  financialTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaOutboxRecord = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  refundId: string | null;
  payload: unknown;
  status: FinancialOutboxEventRecord['status'];
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  claimedBy: string | null;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaPaymentsTransactionClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  order: {
    findFirst(args: unknown): Promise<PrismaPaymentSourceOrderRecord | null>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  orderEvent: { create(args: unknown): Promise<unknown> };
  paymentOrder: {
    findUnique(args: unknown): Promise<PrismaPaymentOrderRecord | null>;
    findFirst(args: unknown): Promise<PrismaPaymentOrderRecord | null>;
    create(args: unknown): Promise<PrismaPaymentOrderRecord>;
    update(args: unknown): Promise<PrismaPaymentOrderRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  paymentCallbackEvent: {
    findUnique(args: unknown): Promise<PrismaCallbackEventRecord | null>;
    create(args: unknown): Promise<unknown>;
  };
  financialTransaction: {
    findUnique(args: unknown): Promise<PrismaFinancialTransactionRecord | null>;
    create(args: unknown): Promise<PrismaFinancialTransactionRecord>;
  };
  refund: {
    findUnique(args: unknown): Promise<PrismaRefundRecord | null>;
    findFirst(args: unknown): Promise<PrismaRefundRecord | null>;
    create(args: unknown): Promise<PrismaRefundRecord>;
    update(args: unknown): Promise<PrismaRefundRecord>;
  };
  shipperCoupon: {
    findFirst(args: unknown): Promise<PrismaShipperCouponRecord | null>;
    create(args: unknown): Promise<PrismaShipperCouponRecord>;
  };
  financialOutboxEvent: {
    findUnique(args: unknown): Promise<PrismaOutboxRecord | null>;
    findFirst(args: unknown): Promise<PrismaOutboxRecord | null>;
    create(args: unknown): Promise<PrismaOutboxRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

export type PrismaPaymentsClient = {
  $transaction<T>(
    callback: (transaction: PrismaPaymentsTransactionClient) => Promise<T>,
  ): Promise<T>;
  paymentOrder: {
    findUnique(args: unknown): Promise<PrismaPaymentOrderRecord | null>;
    findFirst(args: unknown): Promise<PrismaPaymentOrderRecord | null>;
  };
};

const paymentOrderInclude = {
  order: {
    select: {
      id: true,
      orderNo: true,
      shipperId: true,
      status: true,
      pricingMode: true,
      paymentMethod: true,
      paymentStatus: true,
      priceCents: true,
      payablePriceCents: true,
      couponId: true,
      refundedAt: true,
    },
  },
} as const;

const financialTransactionInclude = {
  entries: { orderBy: { sequence: 'asc' } },
} as const;

export class PrismaPaymentsRepository implements PaymentsRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly prisma: PrismaPaymentsClient,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async executeIdempotentPaymentCreate(
    input: ExecutePaymentCreateInput,
  ): Promise<ExecutePaymentCreateResult> {
    try {
      return await this.prisma.$transaction(async transaction => {
        const existing = await transaction.paymentOrder.findUnique({
          where: createPaymentIdempotencyWhere(input),
          include: paymentOrderInclude,
        });

        if (existing) {
          return mapExistingPaymentCreate(
            mapPrismaPaymentOrder(existing),
            input.requestFingerprint,
          );
        }

        const order = await transaction.order.findFirst({
          where: { id: input.orderId, shipperId: input.shipperId },
          select: paymentOrderInclude.order.select,
        });
        const eligibility = resolvePaymentCreationEligibility(
          order ? mapPrismaPaymentSourceOrder(order) : undefined,
        );

        if (eligibility.kind !== 'eligible') {
          return eligibility;
        }

        const activePayment = await transaction.paymentOrder.findFirst({
          where: {
            orderId: input.orderId,
            status: { in: [...ACTIVE_PAYMENT_STATUSES] },
          },
          include: paymentOrderInclude,
        });

        if (activePayment) {
          return {
            kind: 'active-payment-exists' as const,
            paymentId: activePayment.id,
          };
        }

        const now = this.now();
        const payment = await transaction.paymentOrder.create({
          data: {
            id: input.paymentId,
            paymentNo: input.paymentNo,
            orderId: input.orderId,
            shipperId: input.shipperId,
            channel: input.providerChannel,
            amountCents: eligibility.amountCents,
            status: 'pending',
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            expiresAt: new Date(input.expiresAtIso),
            createdAt: now,
            updatedAt: now,
          },
          include: paymentOrderInclude,
        });

        return {
          kind: 'success' as const,
          payment: mapPrismaPaymentOrder(payment),
          replayed: false,
          preparationRequired: true,
        };
      });
    } catch (error) {
      if (!isPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const existing = await this.prisma.paymentOrder.findUnique({
        where: createPaymentIdempotencyWhere(input),
        include: paymentOrderInclude,
      });

      if (existing) {
        return mapExistingPaymentCreate(
          mapPrismaPaymentOrder(existing),
          input.requestFingerprint,
        );
      }

      const activePayment = await this.prisma.paymentOrder.findFirst({
        where: {
          orderId: input.orderId,
          status: { in: [...ACTIVE_PAYMENT_STATUSES] },
        },
        include: paymentOrderInclude,
      });

      if (activePayment) {
        return {
          kind: 'active-payment-exists',
          paymentId: activePayment.id,
        };
      }

      throw error;
    }
  }

  async completePaymentPreparation(input: {
    paymentId: string;
    clientPayload: Record<string, unknown> | string;
  }) {
    return this.prisma.$transaction(async transaction => {
      await transaction.paymentOrder.updateMany({
        where: { id: input.paymentId, status: 'pending' },
        data: {
          status: 'processing',
          clientPayload: input.clientPayload,
          updatedAt: this.now(),
        },
      });
      const payment = await transaction.paymentOrder.findUnique({
        where: { id: input.paymentId },
        include: paymentOrderInclude,
      });

      return payment ? mapPrismaPaymentOrder(payment) : undefined;
    });
  }

  async failPaymentPreparation(input: {
    paymentId: string;
    failureCode: string;
    failureMessage: string;
  }) {
    return this.prisma.$transaction(async transaction => {
      const updated = await transaction.paymentOrder.updateMany({
        where: {
          id: input.paymentId,
          status: { in: ['pending', 'processing'] },
        },
        data: {
          status: 'failed',
          failureCode: input.failureCode,
          failureMessage: input.failureMessage,
          updatedAt: this.now(),
        },
      });
      const payment = await transaction.paymentOrder.findUnique({
        where: { id: input.paymentId },
        include: paymentOrderInclude,
      });

      if (updated.count === 1 && payment) {
        await transaction.order.updateMany({
          where: { id: payment.orderId, paymentStatus: 'pending' },
          data: { paymentStatus: 'failed' },
        });
      }

      return payment ? mapPrismaPaymentOrder(payment) : undefined;
    });
  }

  async findPaymentOrderForShipper(shipperId: string, paymentId: string) {
    const payment = await this.prisma.paymentOrder.findUnique({
      where: { id: paymentId },
      include: paymentOrderInclude,
    });

    return payment && payment.shipperId === shipperId
      ? mapPrismaPaymentOrder(payment)
      : undefined;
  }

  async findLatestPaymentOrderForShipper(shipperId: string, orderId: string) {
    const payment = await this.prisma.paymentOrder.findFirst({
      where: { shipperId, orderId },
      orderBy: { createdAt: 'desc' },
      include: paymentOrderInclude,
    });

    return payment ? mapPrismaPaymentOrder(payment) : undefined;
  }

  async claimRefundOutboxEvents(
    input: ClaimRefundOutboxEventsInput,
  ): Promise<ClaimedRefundOutboxEvent[]> {
    const now = new Date(input.nowIso);
    const leaseExpiresAt = new Date(
      now.getTime() + input.leaseDurationMs,
    );

    return this.prisma.$transaction(async transaction => {
      const events = await transaction.$queryRawUnsafe<PrismaOutboxRecord[]>(
        `
WITH claimable AS (
  SELECT outbox."id"
  FROM "FinancialOutboxEvent" AS outbox
  INNER JOIN "Refund" AS refund ON refund."id" = outbox."refundId"
  WHERE outbox."eventType" = 'refund.requested'
    AND outbox."attemptCount" < outbox."maxAttempts"
    AND refund."status" IN ('pending', 'processing', 'failed')
    AND (
      (outbox."status" = 'pending' AND outbox."availableAt" <= $1)
      OR
      (outbox."status" = 'processing' AND outbox."leaseExpiresAt" <= $1)
    )
  ORDER BY outbox."availableAt" ASC, outbox."createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT $2
)
UPDATE "FinancialOutboxEvent" AS outbox
SET "status" = 'processing',
    "attemptCount" = outbox."attemptCount" + 1,
    "claimedAt" = $1,
    "leaseExpiresAt" = $3,
    "claimedBy" = $4,
    "updatedAt" = $1
FROM claimable
WHERE outbox."id" = claimable."id"
RETURNING outbox.*
        `.trim(),
        now,
        input.limit,
        leaseExpiresAt,
        input.workerId,
      );
      const claims: ClaimedRefundOutboxEvent[] = [];

      for (const event of events) {
        if (!event.refundId) {
          throw new Error(`Refund outbox ${event.id} is missing refundId`);
        }

        const refund = await transaction.refund.findUnique({
          where: { id: event.refundId },
        });

        if (!refund) {
          throw new Error(`Refund ${event.refundId} does not exist`);
        }

        const payment = await transaction.paymentOrder.findUnique({
          where: { id: refund.paymentOrderId },
          include: paymentOrderInclude,
        });

        if (!payment) {
          throw new Error(`Payment ${refund.paymentOrderId} does not exist`);
        }

        const processingRefund = await transaction.refund.update({
          where: { id: refund.id },
          data: {
            status: 'processing',
            processingStartedAt: now,
            failureCode: null,
            failureMessage: null,
            updatedAt: now,
          },
        });
        claims.push({
          event: mapClaimedPrismaOutboxEvent(event),
          refund: mapPrismaRefund(processingRefund),
          payment: mapPrismaPaymentOrder(payment),
        });
      }

      return claims;
    });
  }

  async completeRefundOutboxRequest(
    input: CompleteRefundOutboxRequestInput,
  ): Promise<CompleteRefundOutboxRequestResult> {
    const completedAt = new Date(input.completedAtIso);

    return this.prisma.$transaction(async transaction => {
      const existingEvent =
        await transaction.financialOutboxEvent.findUnique({
          where: { id: input.outboxEventId },
        });

      if (!existingEvent?.refundId) {
        return { kind: 'claim-lost' };
      }

      const completed = await transaction.financialOutboxEvent.updateMany({
        where: {
          id: input.outboxEventId,
          status: 'processing',
          claimedBy: input.workerId,
          attemptCount: input.claimAttempt,
        },
        data: {
          status: 'completed',
          processedAt: completedAt,
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
          updatedAt: completedAt,
        },
      });

      if (completed.count !== 1) {
        return { kind: 'claim-lost' };
      }

      const refund = await transaction.refund.findUnique({
        where: { id: existingEvent.refundId },
      });

      if (!refund) {
        throw new Error(`Refund ${existingEvent.refundId} does not exist`);
      }

      const updatedRefund = await transaction.refund.update({
        where: { id: refund.id },
        data: {
          providerRefundNo: input.providerRefundNo,
          updatedAt: completedAt,
        },
      });
      const updatedEvent =
        await transaction.financialOutboxEvent.findUnique({
          where: { id: input.outboxEventId },
        });

      if (!updatedEvent) {
        throw new Error(`Refund outbox ${input.outboxEventId} does not exist`);
      }

      return {
        kind: 'completed',
        event: mapPrismaOutboxEvent(updatedEvent),
        refund: mapPrismaRefund(updatedRefund),
      };
    });
  }

  async failRefundOutboxRequest(
    input: FailRefundOutboxRequestInput,
  ): Promise<FailRefundOutboxRequestResult> {
    const failedAt = new Date(input.failedAtIso);
    const nextAvailableAt = new Date(input.nextAvailableAtIso);

    return this.prisma.$transaction(async transaction => {
      const existingEvent =
        await transaction.financialOutboxEvent.findUnique({
          where: { id: input.outboxEventId },
        });

      if (!existingEvent?.refundId) {
        return { kind: 'claim-lost' };
      }

      const dead = existingEvent.attemptCount >= existingEvent.maxAttempts;
      const released = await transaction.financialOutboxEvent.updateMany({
        where: {
          id: input.outboxEventId,
          status: 'processing',
          claimedBy: input.workerId,
          attemptCount: input.claimAttempt,
        },
        data: {
          status: dead ? 'dead' : 'pending',
          availableAt: nextAvailableAt,
          processedAt: dead ? failedAt : null,
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
          lastError: input.failureMessage,
          updatedAt: failedAt,
        },
      });

      if (released.count !== 1) {
        return { kind: 'claim-lost' };
      }

      const refund = await transaction.refund.findUnique({
        where: { id: existingEvent.refundId },
      });

      if (!refund) {
        throw new Error(`Refund ${existingEvent.refundId} does not exist`);
      }

      const failedRefund = await transaction.refund.update({
        where: { id: refund.id },
        data: {
          status: 'failed',
          failureCode: input.failureCode,
          failureMessage: input.failureMessage,
          failedAt,
          updatedAt: failedAt,
        },
      });
      const paymentUpdated = await transaction.paymentOrder.updateMany({
        where: {
          id: refund.paymentOrderId,
          status: { in: ['refund_pending', 'refund_failed'] },
        },
        data: {
          status: 'refund_failed',
          failureCode: input.failureCode,
          failureMessage: input.failureMessage,
          updatedAt: failedAt,
        },
      });
      const orderUpdated = await transaction.order.updateMany({
        where: {
          id: refund.orderId,
          paymentStatus: { in: ['refund_pending', 'refund_failed'] },
        },
        data: { paymentStatus: 'refund_failed' },
      });

      if (paymentUpdated.count !== 1 || orderUpdated.count !== 1) {
        throw new Error(`Refund ${refund.id} financial state is inconsistent`);
      }

      const updatedEvent =
        await transaction.financialOutboxEvent.findUnique({
          where: { id: input.outboxEventId },
        });

      if (!updatedEvent) {
        throw new Error(`Refund outbox ${input.outboxEventId} does not exist`);
      }

      return {
        kind: dead ? 'dead' : 'retry-scheduled',
        event: mapPrismaOutboxEvent(updatedEvent),
        refund: mapPrismaRefund(failedRefund),
      };
    });
  }

  async applyVerifiedRefundCallback(
    input: ApplyVerifiedRefundCallbackInput,
  ): Promise<ApplyRefundCallbackResult> {
    return this.prisma.$transaction(async transaction => {
      const existingEvent = await transaction.paymentCallbackEvent.findUnique({
        where: {
          PaymentCallbackEvent_channel_event_unique: {
            channel: input.channel,
            eventId: input.callback.eventId,
          },
        },
      });

      if (existingEvent) {
        if (existingEvent.rawPayloadHash !== input.callback.rawPayloadHash) {
          return { kind: 'event-conflict' };
        }

        if (existingEvent.eventType !== 'refund' || !existingEvent.refundId) {
          return { kind: 'event-conflict' };
        }

        return this.resolveExistingPrismaRefundCallback(
          transaction,
          existingEvent,
        );
      }

      const lockedRefunds = await transaction.$queryRawUnsafe<
        Array<{ id: string }>
      >(
        'SELECT "id" FROM "Refund" WHERE "refundNo" = $1 FOR UPDATE',
        input.callback.refundNo,
      );

      if (lockedRefunds.length !== 1) {
        return { kind: 'refund-not-found' };
      }

      const refund = await transaction.refund.findUnique({
        where: { id: lockedRefunds[0].id },
      });

      if (!refund || refund.channel !== input.channel) {
        return { kind: 'refund-not-found' };
      }

      const payment = await transaction.paymentOrder.findUnique({
        where: { id: refund.paymentOrderId },
        include: paymentOrderInclude,
      });
      const otherProviderRefund = await transaction.refund.findFirst({
        where: {
          channel: input.channel,
          providerRefundNo: input.callback.providerRefundNo,
          NOT: { id: refund.id },
        },
      });

      if (
        input.callback.amountCents !== refund.amountCents ||
        (refund.providerRefundNo !== null &&
          refund.providerRefundNo !== input.callback.providerRefundNo) ||
        otherProviderRefund ||
        !payment ||
        payment.orderId !== refund.orderId ||
        payment.shipperId !== refund.shipperId ||
        payment.channel !== refund.channel ||
        payment.amountCents !== refund.amountCents ||
        payment.order.id !== refund.orderId ||
        payment.order.shipperId !== refund.shipperId ||
        (refund.status !== 'pending' &&
          refund.status !== 'processing' &&
          refund.status !== 'failed') ||
        (payment.status !== 'refund_pending' &&
          payment.status !== 'refund_failed') ||
        (payment.order.paymentStatus !== 'refund_pending' &&
          payment.order.paymentStatus !== 'refund_failed')
      ) {
        return { kind: 'refund-conflict' };
      }

      const existingTransaction =
        await transaction.financialTransaction.findUnique({
          where: {
            FinancialTransaction_type_reference_unique: {
              type: 'online_refund',
              referenceId: refund.id,
            },
          },
          include: financialTransactionInclude,
        });
      const occurredAt = new Date(input.callback.occurredAtIso);

      if (input.callback.status === 'failed') {
        if (existingTransaction) {
          return { kind: 'refund-conflict' };
        }

        const failedRefund = await transaction.refund.update({
          where: { id: refund.id },
          data: {
            status: 'failed',
            providerRefundNo: input.callback.providerRefundNo,
            failureCode: 'provider_refund_failed',
            failureMessage: '退款渠道返回失败',
            failedAt: occurredAt,
            updatedAt: this.now(),
          },
        });
        const failedPayment = await transaction.paymentOrder.update({
          where: { id: payment.id },
          data: {
            status: 'refund_failed',
            failureCode: 'provider_refund_failed',
            failureMessage: '退款渠道返回失败',
            updatedAt: this.now(),
          },
          include: paymentOrderInclude,
        });
        await transaction.order.update({
          where: { id: refund.orderId },
          data: { paymentStatus: 'refund_failed' },
        });
        await transaction.orderEvent.create({
          data: {
            orderId: refund.orderId,
            actorUserId: 'system:payment',
            eventType: 'refund_failed',
            noteText: '在线退款失败，等待重试或人工处理',
            attachmentFileIds: [],
            createdAt: occurredAt,
          },
        });
        await transaction.financialOutboxEvent.updateMany({
          where: {
            refundId: refund.id,
            status: { in: ['pending', 'processing'] },
          },
          data: {
            status: 'completed',
            processedAt: this.now(),
            claimedAt: null,
            leaseExpiresAt: null,
            claimedBy: null,
            updatedAt: this.now(),
          },
        });
        await transaction.paymentCallbackEvent.create({
          data: {
            id: this.createId(),
            channel: input.channel,
            eventId: input.callback.eventId,
            eventType: 'refund',
            refundId: refund.id,
            rawPayloadHash: input.callback.rawPayloadHash,
            processingResult: 'refund_failed',
            occurredAt,
            processedAt: this.now(),
          },
        });

        return {
          kind: 'failed',
          replayed: false,
          refund: mapPrismaRefund(failedRefund),
          payment: mapPrismaPaymentOrder(failedPayment),
          orderPaymentStatus: 'refund_failed',
        };
      }

      if (existingTransaction) {
        return { kind: 'refund-conflict' };
      }

      const transactionId = this.createId();
      const entryDrafts = createOnlineRefundEntries(
        refund.amountCents,
        refund.shipperId,
      );
      assertLedgerBalanced(entryDrafts);
      const financialTransaction =
        await transaction.financialTransaction.create({
          data: {
            id: transactionId,
            transactionNo: `FT-${transactionId}`,
            type: 'online_refund',
            referenceId: refund.id,
            orderId: refund.orderId,
            paymentOrderId: refund.paymentOrderId,
            amountCents: refund.amountCents,
            occurredAt,
            entries: {
              create: entryDrafts.map((entry, sequence) => ({
                id: this.createId(),
                sequence,
                accountType: entry.accountType,
                accountUserId: entry.accountUserId ?? null,
                direction: entry.direction,
                amountCents: entry.amountCents,
              })),
            },
          },
          include: financialTransactionInclude,
        });
      const updatedRefund = await transaction.refund.update({
        where: { id: refund.id },
        data: {
          status: 'succeeded',
          providerRefundNo: input.callback.providerRefundNo,
          failureCode: null,
          failureMessage: null,
          succeededAt: occurredAt,
          financialTransactionId: financialTransaction.id,
          updatedAt: this.now(),
        },
      });
      const updatedPayment = await transaction.paymentOrder.update({
        where: { id: payment.id },
        data: {
          status: 'refunded',
          failureCode: null,
          failureMessage: null,
          updatedAt: this.now(),
        },
        include: paymentOrderInclude,
      });
      await transaction.order.update({
        where: { id: refund.orderId },
        data: {
          paymentStatus: 'refunded',
          refundedAt: occurredAt,
        },
      });
      await this.restorePrismaRefundCouponIfNeeded(
        transaction,
        payment.order,
        occurredAt,
      );
      await transaction.orderEvent.create({
        data: {
          orderId: refund.orderId,
          actorUserId: 'system:payment',
          eventType: 'refund_succeeded',
          noteText: '在线退款已确认到账',
          attachmentFileIds: [],
          createdAt: occurredAt,
        },
      });
      await transaction.financialOutboxEvent.updateMany({
        where: {
          refundId: refund.id,
          status: { in: ['pending', 'processing'] },
        },
        data: {
          status: 'completed',
          processedAt: this.now(),
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
          updatedAt: this.now(),
        },
      });
      await transaction.paymentCallbackEvent.create({
        data: {
          id: this.createId(),
          channel: input.channel,
          eventId: input.callback.eventId,
          eventType: 'refund',
          refundId: refund.id,
          rawPayloadHash: input.callback.rawPayloadHash,
          processingResult: 'refund_succeeded',
          occurredAt,
          processedAt: this.now(),
        },
      });

      return {
        kind: 'applied',
        replayed: false,
        refund: mapPrismaRefund(updatedRefund),
        payment: mapPrismaPaymentOrder(updatedPayment),
        orderPaymentStatus: 'refunded',
        financialTransaction: mapPrismaFinancialTransaction(
          financialTransaction,
        ),
      };
    });
  }

  private async restorePrismaRefundCouponIfNeeded(
    transaction: PrismaPaymentsTransactionClient,
    order: PrismaPaymentSourceOrderRecord,
    issuedAt: Date,
  ) {
    if (!order.couponId) {
      return;
    }

    const coupon = await transaction.shipperCoupon.findFirst({
      where: {
        id: order.couponId,
        shipperId: order.shipperId,
      },
    });

    if (
      !coupon ||
      coupon.status !== 'used' ||
      coupon.usedOrderNo !== order.orderNo
    ) {
      return;
    }

    const validityWindow = createRefundReturnCouponValidityWindow(
      coupon.validFrom.getTime(),
      coupon.validUntil.getTime(),
      issuedAt.getTime(),
    );

    await transaction.shipperCoupon.create({
      data: {
        shipperId: coupon.shipperId,
        title: coupon.title,
        status: 'usable',
        conditionText: coupon.conditionText,
        discountCents: coupon.discountCents,
        minOrderAmountCents: coupon.minOrderAmountCents,
        validFrom: new Date(validityWindow.validFromIso),
        validUntil: new Date(validityWindow.validUntilIso),
        sourceText: '退款返券',
        issuedAt,
      },
    });
  }

  private async resolveExistingPrismaRefundCallback(
    transaction: PrismaPaymentsTransactionClient,
    event: PrismaCallbackEventRecord,
  ): Promise<ApplyRefundCallbackResult> {
    if (!event.refundId) {
      return { kind: 'refund-conflict' };
    }

    const refund = await transaction.refund.findUnique({
      where: { id: event.refundId },
    });

    if (!refund) {
      return { kind: 'refund-conflict' };
    }

    const payment = await transaction.paymentOrder.findUnique({
      where: { id: refund.paymentOrderId },
      include: paymentOrderInclude,
    });

    if (event.processingResult === 'refund_failed') {
      if (
        !payment ||
        refund.status !== 'failed' ||
        payment.status !== 'refund_failed' ||
        payment.order.paymentStatus !== 'refund_failed'
      ) {
        return { kind: 'refund-conflict' };
      }

      return {
        kind: 'failed',
        replayed: true,
        refund: mapPrismaRefund(refund),
        payment: mapPrismaPaymentOrder(payment),
        orderPaymentStatus: 'refund_failed',
      };
    }

    if (event.processingResult !== 'refund_succeeded') {
      return { kind: 'refund-conflict' };
    }

    const financialTransaction =
      await transaction.financialTransaction.findUnique({
        where: {
          FinancialTransaction_type_reference_unique: {
            type: 'online_refund',
            referenceId: refund.id,
          },
        },
        include: financialTransactionInclude,
      });

    if (
      !payment ||
      !financialTransaction ||
      refund.status !== 'succeeded' ||
      refund.financialTransactionId !== financialTransaction.id ||
      payment.status !== 'refunded' ||
      payment.order.paymentStatus !== 'refunded'
    ) {
      return { kind: 'refund-conflict' };
    }

    return {
      kind: 'applied',
      replayed: true,
      refund: mapPrismaRefund(refund),
      payment: mapPrismaPaymentOrder(payment),
      orderPaymentStatus: 'refunded',
      financialTransaction: mapPrismaFinancialTransaction(
        financialTransaction,
      ),
    };
  }

  async applyVerifiedPaymentCallback(
    input: ApplyVerifiedPaymentCallbackInput,
  ): Promise<ApplyPaymentCallbackResult> {
    return this.prisma.$transaction(async transaction => {
      const existingEvent = await transaction.paymentCallbackEvent.findUnique({
        where: {
          PaymentCallbackEvent_channel_event_unique: {
            channel: input.channel,
            eventId: input.callback.eventId,
          },
        },
      });

      if (existingEvent) {
        if (existingEvent.rawPayloadHash !== input.callback.rawPayloadHash) {
          return { kind: 'event-conflict' };
        }

        return this.resolveExistingPrismaCallback(
          transaction,
          existingEvent,
        );
      }

      const payment = await transaction.paymentOrder.findUnique({
        where: { paymentNo: input.callback.paymentNo },
        include: paymentOrderInclude,
      });

      if (!payment || payment.channel !== input.channel) {
        return { kind: 'payment-not-found' };
      }

      const otherProviderTrade = await transaction.paymentOrder.findFirst({
        where: {
          channel: input.channel,
          providerTradeNo: input.callback.providerTradeNo,
          NOT: { id: payment.id },
        },
        include: paymentOrderInclude,
      });

      if (
        payment.amountCents !== input.callback.amountCents ||
        (payment.providerTradeNo !== null &&
          payment.providerTradeNo !== input.callback.providerTradeNo) ||
        otherProviderTrade
      ) {
        return { kind: 'payment-conflict' };
      }

      if (input.callback.status === 'failed') {
        if (
          payment.status !== 'pending' &&
          payment.status !== 'processing' &&
          payment.status !== 'failed'
        ) {
          return { kind: 'payment-conflict' };
        }

        const failedPayment = await transaction.paymentOrder.update({
          where: { id: payment.id },
          data: {
            status: 'failed',
            providerTradeNo: input.callback.providerTradeNo,
            failureCode: 'provider_payment_failed',
            updatedAt: this.now(),
          },
          include: paymentOrderInclude,
        });
        await transaction.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'failed' },
        });
        await this.createPrismaCallbackEvent(
          transaction,
          input,
          payment.id,
          'payment_failed',
        );
        return {
          kind: 'failed',
          replayed: false,
          payment: mapPrismaPaymentOrder(failedPayment),
          orderPaymentStatus: 'failed',
        };
      }

      const existingTransaction =
        await transaction.financialTransaction.findUnique({
          where: {
            FinancialTransaction_type_reference_unique: {
              type: 'online_payment_escrow',
              referenceId: payment.id,
            },
          },
          include: financialTransactionInclude,
        });

      if (existingTransaction) {
        const existingResult = await this.createExistingPrismaAppliedResult(
          transaction,
          payment,
          existingTransaction,
        );

        if (existingResult.kind === 'applied') {
          await this.createPrismaCallbackEvent(
            transaction,
            input,
            payment.id,
            existingResult.orderPaymentStatus === 'refund_pending'
              ? 'late_payment_refund_pending'
              : 'payment_escrowed',
          );
        }

        return existingResult;
      }

      let nextOrderPaymentStatus: Extract<
        OrderPaymentStatus,
        'escrowed' | 'refund_pending'
      >;

      try {
        nextOrderPaymentStatus = resolveSuccessfulPaymentStatus(
          payment.order.status,
          payment.status,
        );
      } catch (error) {
        if (error instanceof BusinessError) {
          return { kind: 'payment-conflict' };
        }
        throw error;
      }

      const occurredAt = new Date(input.callback.occurredAtIso);
      const transactionId = this.createId();
      const entryDrafts = createOnlineEscrowEntries(
        payment.amountCents,
        payment.shipperId,
      );
      assertLedgerBalanced(entryDrafts);
      const financialTransaction =
        await transaction.financialTransaction.create({
          data: {
            id: transactionId,
            transactionNo: `FT-${transactionId}`,
            type: 'online_payment_escrow',
            referenceId: payment.id,
            orderId: payment.orderId,
            paymentOrderId: payment.id,
            amountCents: payment.amountCents,
            occurredAt,
            entries: {
              create: entryDrafts.map((entry, sequence) => ({
                id: this.createId(),
                sequence,
                accountType: entry.accountType,
                accountUserId: entry.accountUserId ?? null,
                direction: entry.direction,
                amountCents: entry.amountCents,
              })),
            },
          },
          include: financialTransactionInclude,
        });
      const updatedPayment = await transaction.paymentOrder.update({
        where: { id: payment.id },
        data: {
          status: nextOrderPaymentStatus,
          providerTradeNo: input.callback.providerTradeNo,
          paidAt: occurredAt,
          failureCode: null,
          failureMessage: null,
          updatedAt: this.now(),
        },
        include: paymentOrderInclude,
      });
      await transaction.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: nextOrderPaymentStatus },
      });
      await transaction.orderEvent.create({
        data: {
          orderId: payment.orderId,
          actorUserId: 'system:payment',
          eventType:
            nextOrderPaymentStatus === 'refund_pending'
              ? 'late_payment_received'
              : 'payment_escrowed',
          noteText:
            nextOrderPaymentStatus === 'refund_pending'
              ? '取消订单收到迟到支付，已进入退款队列'
              : '在线支付已确认并进入托管',
          attachmentFileIds: [],
          createdAt: occurredAt,
        },
      });

      const result: AppliedPaymentCallbackResult = {
        kind: 'applied',
        replayed: false,
        payment: mapPrismaPaymentOrder(updatedPayment),
        orderPaymentStatus: nextOrderPaymentStatus,
        financialTransaction: mapPrismaFinancialTransaction(
          financialTransaction,
        ),
      };

      if (nextOrderPaymentStatus === 'refund_pending') {
        const now = this.now();
        const refundId = this.createId();
        const refund = await transaction.refund.create({
          data: {
            id: refundId,
            refundNo: `RF-${payment.paymentNo}`,
            paymentOrderId: payment.id,
            orderId: payment.orderId,
            shipperId: payment.shipperId,
            channel: payment.channel,
            amountCents: payment.amountCents,
            reason: 'late_payment_after_order_cancelled',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
        });
        const outbox = await transaction.financialOutboxEvent.create({
          data: {
            id: this.createId(),
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
        result.refund = mapPrismaRefund(refund);
        result.outboxEvent = mapPrismaOutboxEvent(outbox);
      }

      await this.createPrismaCallbackEvent(
        transaction,
        input,
        payment.id,
        nextOrderPaymentStatus === 'refund_pending'
          ? 'late_payment_refund_pending'
          : 'payment_escrowed',
      );
      return result;
    });
  }

  private async createPrismaCallbackEvent(
    transaction: PrismaPaymentsTransactionClient,
    input: ApplyVerifiedPaymentCallbackInput,
    paymentOrderId: string,
    processingResult: string,
  ) {
    await transaction.paymentCallbackEvent.create({
      data: {
        id: this.createId(),
        channel: input.channel,
        eventId: input.callback.eventId,
        eventType: 'payment',
        paymentOrderId,
        rawPayloadHash: input.callback.rawPayloadHash,
        processingResult,
        occurredAt: new Date(input.callback.occurredAtIso),
        processedAt: this.now(),
      },
    });
  }

  private async resolveExistingPrismaCallback(
    transaction: PrismaPaymentsTransactionClient,
    event: PrismaCallbackEventRecord,
  ): Promise<ApplyPaymentCallbackResult> {
    if (!event.paymentOrderId) {
      return { kind: 'payment-conflict' };
    }

    const payment = await transaction.paymentOrder.findUnique({
      where: { id: event.paymentOrderId },
      include: paymentOrderInclude,
    });

    if (!payment) {
      return { kind: 'payment-conflict' };
    }

    if (event.processingResult === 'payment_failed') {
      return {
        kind: 'failed',
        replayed: true,
        payment: mapPrismaPaymentOrder(payment),
        orderPaymentStatus: 'failed',
      };
    }

    const financialTransaction =
      await transaction.financialTransaction.findUnique({
        where: {
          FinancialTransaction_type_reference_unique: {
            type: 'online_payment_escrow',
            referenceId: payment.id,
          },
        },
        include: financialTransactionInclude,
      });

    if (!financialTransaction) {
      return { kind: 'payment-conflict' };
    }

    return this.createExistingPrismaAppliedResult(
      transaction,
      payment,
      financialTransaction,
    );
  }

  private async createExistingPrismaAppliedResult(
    transaction: PrismaPaymentsTransactionClient,
    payment: PrismaPaymentOrderRecord,
    financialTransaction: PrismaFinancialTransactionRecord,
  ): Promise<ApplyPaymentCallbackResult> {
    if (
      payment.status !== 'escrowed' &&
      payment.status !== 'refund_pending' &&
      payment.status !== 'settled' &&
      payment.status !== 'refunded'
    ) {
      return { kind: 'payment-conflict' };
    }

    const orderPaymentStatus =
      payment.status === 'refund_pending' || payment.status === 'refunded'
        ? 'refund_pending'
        : 'escrowed';
    const result: AppliedPaymentCallbackResult = {
      kind: 'applied',
      replayed: true,
      payment: mapPrismaPaymentOrder(payment),
      orderPaymentStatus,
      financialTransaction: mapPrismaFinancialTransaction(
        financialTransaction,
      ),
    };

    if (orderPaymentStatus === 'refund_pending') {
      const refund = await transaction.refund.findUnique({
        where: { paymentOrderId: payment.id },
      });

      if (!refund) {
        return { kind: 'payment-conflict' };
      }

      const outbox = await transaction.financialOutboxEvent.findFirst({
        where: { refundId: refund.id },
      });
      result.refund = mapPrismaRefund(refund);
      if (outbox) {
        result.outboxEvent = mapPrismaOutboxEvent(outbox);
      }
    }

    return result;
  }
}

function resolvePaymentCreationEligibility(
  order: PaymentSourceOrderRecord | undefined,
):
  | {
      kind: 'eligible';
      order: PaymentSourceOrderRecord;
      amountCents: number;
    }
  | { kind: 'order-not-available' }
  | { kind: 'amount-invalid' }
  | { kind: 'already-escrowed' } {
  if (!order) {
    return { kind: 'order-not-available' };
  }

  if (order.paymentStatus === 'escrowed' || order.paymentStatus === 'settled') {
    return { kind: 'already-escrowed' };
  }

  if (
    order.status !== 'waiting' ||
    order.paymentMethod !== 'online' ||
    order.pricingMode !== 'fixed' ||
    (order.paymentStatus !== 'pending' && order.paymentStatus !== 'failed')
  ) {
    return { kind: 'order-not-available' };
  }

  const amountCents = order.payablePriceCents ?? order.priceCents;

  if (!Number.isSafeInteger(amountCents) || (amountCents ?? 0) <= 0) {
    return { kind: 'amount-invalid' };
  }

  return { kind: 'eligible', order, amountCents: amountCents! };
}

function mapExistingPaymentCreate(
  payment: PaymentOrderRecord,
  requestFingerprint: string,
): ExecutePaymentCreateResult {
  if (payment.requestFingerprint !== requestFingerprint) {
    return { kind: 'key-reused' };
  }

  return {
    kind: 'success',
    payment: clonePayment(payment),
    replayed: true,
    preparationRequired: false,
  };
}

function isActivePaymentStatus(status: PaymentOrderRecord['status']) {
  return ACTIVE_PAYMENT_STATUSES.some(activeStatus => activeStatus === status);
}

function createCallbackKey(channel: PaymentProviderChannel, eventId: string) {
  return `${channel}:${eventId}`;
}

function markCallbackResultReplayed(
  result: ApplyPaymentCallbackResult,
): ApplyPaymentCallbackResult {
  if (result.kind === 'applied' || result.kind === 'failed') {
    return structuredClone({ ...result, replayed: true });
  }

  return structuredClone(result);
}

function markRefundCallbackResultReplayed(
  result: ApplyRefundCallbackResult,
): ApplyRefundCallbackResult {
  if (result.kind === 'applied' || result.kind === 'failed') {
    return structuredClone({ ...result, replayed: true });
  }

  return structuredClone(result);
}

function createPaymentIdempotencyWhere(input: ExecutePaymentCreateInput) {
  return {
    PaymentOrder_shipper_idempotency_key_unique: {
      shipperId: input.shipperId,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

function mapPrismaPaymentSourceOrder(
  order: PrismaPaymentSourceOrderRecord,
): PaymentSourceOrderRecord {
  return {
    id: order.id,
    orderNo: order.orderNo,
    shipperId: order.shipperId,
    status: order.status,
    pricingMode: order.pricingMode,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    ...(order.priceCents !== null ? { priceCents: order.priceCents } : {}),
    ...(order.payablePriceCents !== null
      ? { payablePriceCents: order.payablePriceCents }
      : {}),
    ...(order.couponId !== null ? { couponId: order.couponId } : {}),
  };
}

function mapPrismaPaymentOrder(
  payment: PrismaPaymentOrderRecord,
): PaymentOrderRecord {
  const clientPayload = parseClientPayload(payment.clientPayload);

  return {
    id: payment.id,
    paymentNo: payment.paymentNo,
    orderId: payment.orderId,
    orderNo: payment.order.orderNo,
    shipperId: payment.shipperId,
    channel: payment.channel,
    amountCents: payment.amountCents,
    status: payment.status,
    idempotencyKey: payment.idempotencyKey,
    requestFingerprint: payment.requestFingerprint,
    ...(clientPayload !== undefined ? { clientPayload } : {}),
    ...(payment.providerTradeNo
      ? { providerTradeNo: payment.providerTradeNo }
      : {}),
    ...(payment.failureCode ? { failureCode: payment.failureCode } : {}),
    ...(payment.failureMessage
      ? { failureMessage: payment.failureMessage }
      : {}),
    expiresAtIso: payment.expiresAt.toISOString(),
    ...(payment.paidAt ? { paidAtIso: payment.paidAt.toISOString() } : {}),
    ...(payment.settledAt
      ? { settledAtIso: payment.settledAt.toISOString() }
      : {}),
    ...(payment.order.refundedAt
      ? { refundedAtIso: payment.order.refundedAt.toISOString() }
      : {}),
    ...(payment.cancelledAt
      ? { cancelledAtIso: payment.cancelledAt.toISOString() }
      : {}),
    createdAtIso: payment.createdAt.toISOString(),
    updatedAtIso: payment.updatedAt.toISOString(),
  };
}

function mapPrismaFinancialTransaction(
  transaction: PrismaFinancialTransactionRecord,
): FinancialTransactionRecord {
  return {
    id: transaction.id,
    transactionNo: transaction.transactionNo,
    type: transaction.type,
    referenceId: transaction.referenceId,
    ...(transaction.orderId ? { orderId: transaction.orderId } : {}),
    ...(transaction.paymentOrderId
      ? { paymentOrderId: transaction.paymentOrderId }
      : {}),
    amountCents: transaction.amountCents,
    occurredAtIso: transaction.occurredAt.toISOString(),
    createdAtIso: transaction.createdAt.toISOString(),
    entries: transaction.entries.map(entry => ({
      id: entry.id,
      transactionId: entry.transactionId,
      sequence: entry.sequence,
      accountType: entry.accountType,
      ...(entry.accountUserId ? { accountUserId: entry.accountUserId } : {}),
      direction: entry.direction,
      amountCents: entry.amountCents,
      createdAtIso: entry.createdAt.toISOString(),
    })),
  };
}

function mapPrismaRefund(refund: PrismaRefundRecord): RefundRecord {
  return {
    id: refund.id,
    refundNo: refund.refundNo,
    paymentOrderId: refund.paymentOrderId,
    orderId: refund.orderId,
    shipperId: refund.shipperId,
    channel: refund.channel,
    amountCents: refund.amountCents,
    reason: refund.reason,
    status: refund.status,
    ...(refund.providerRefundNo
      ? { providerRefundNo: refund.providerRefundNo }
      : {}),
    ...(refund.failureCode ? { failureCode: refund.failureCode } : {}),
    ...(refund.failureMessage
      ? { failureMessage: refund.failureMessage }
      : {}),
    ...(refund.processingStartedAt
      ? { processingStartedAtIso: refund.processingStartedAt.toISOString() }
      : {}),
    ...(refund.succeededAt
      ? { succeededAtIso: refund.succeededAt.toISOString() }
      : {}),
    ...(refund.failedAt ? { failedAtIso: refund.failedAt.toISOString() } : {}),
    ...(refund.financialTransactionId
      ? { financialTransactionId: refund.financialTransactionId }
      : {}),
    createdAtIso: refund.createdAt.toISOString(),
    updatedAtIso: refund.updatedAt.toISOString(),
  };
}

function mapPrismaOutboxEvent(
  event: PrismaOutboxRecord,
): FinancialOutboxEventRecord {
  return {
    id: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    ...(event.refundId ? { refundId: event.refundId } : {}),
    payload: parseJsonObject(event.payload),
    status: event.status,
    attemptCount: event.attemptCount,
    maxAttempts: event.maxAttempts,
    availableAtIso: event.availableAt.toISOString(),
    ...(event.claimedAt
      ? { claimedAtIso: event.claimedAt.toISOString() }
      : {}),
    ...(event.leaseExpiresAt
      ? { leaseExpiresAtIso: event.leaseExpiresAt.toISOString() }
      : {}),
    ...(event.claimedBy ? { claimedBy: event.claimedBy } : {}),
    ...(event.processedAt
      ? { processedAtIso: event.processedAt.toISOString() }
      : {}),
    ...(event.lastError ? { lastError: event.lastError } : {}),
    createdAtIso: event.createdAt.toISOString(),
    updatedAtIso: event.updatedAt.toISOString(),
  };
}

function mapClaimedPrismaOutboxEvent(
  event: PrismaOutboxRecord,
): ClaimedRefundOutboxEvent['event'] {
  const mapped = mapPrismaOutboxEvent(event);

  if (
    mapped.status !== 'processing' ||
    !mapped.claimedAtIso ||
    !mapped.leaseExpiresAtIso ||
    !mapped.claimedBy
  ) {
    throw new Error(`Refund outbox ${event.id} was not claimed`);
  }

  return {
    ...mapped,
    status: 'processing',
    claimedAtIso: mapped.claimedAtIso,
    leaseExpiresAtIso: mapped.leaseExpiresAtIso,
    claimedBy: mapped.claimedBy,
  };
}

function parseClientPayload(
  value: unknown,
): Record<string, unknown> | string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return structuredClone(value as Record<string, unknown>);
  }

  return undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
}

function clonePayment(payment: PaymentOrderRecord) {
  return structuredClone(payment);
}

function cloneFinancialTransaction(transaction: FinancialTransactionRecord) {
  return structuredClone(transaction);
}

function createRefundReturnCouponValidityWindow(
  originalValidFromMs: number,
  originalValidUntilMs: number,
  issuedAtMs: number,
) {
  const durationMs = Math.max(
    1,
    originalValidUntilMs - originalValidFromMs,
  );

  return {
    validFromIso: new Date(issuedAtMs).toISOString(),
    validUntilIso: new Date(issuedAtMs + durationMs).toISOString(),
  };
}

function isPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

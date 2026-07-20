import { randomUUID } from 'crypto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { CreatePaymentRequest } from './dto';
import {
  hashCallbackPayload,
  type PaymentProvider,
  type PaymentProviderChannel,
  type ProviderRawCallback,
  type VerifiedPaymentCallback,
  type VerifiedRefundCallback,
} from './payment-provider';
import type {
  ApplyPaymentCallbackResult,
  ApplyRefundCallbackResult,
  ClaimedRefundOutboxEvent,
  ExecutePaymentCreateResult,
  PaymentsRepository,
} from './payments.repository';
import { createPaymentCreateFingerprint } from './payments.validation';

export type PaymentProviderResolver = (
  channel: PaymentProviderChannel,
) => PaymentProvider;

export class PaymentsService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly paymentExpiresSeconds: number;

  constructor(
    private readonly repository: PaymentsRepository,
    private readonly resolveProvider: PaymentProviderResolver,
    options: {
      now?: () => Date;
      createId?: () => string;
      paymentExpiresSeconds?: number;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.paymentExpiresSeconds = options.paymentExpiresSeconds ?? 900;
  }

  async createPayment(
    shipperId: string,
    orderId: string,
    idempotencyKey: string,
    input: CreatePaymentRequest,
  ) {
    const provider = this.getProvider(input.channel);
    const paymentId = this.createId();
    const expiresAtIso = new Date(
      this.now().getTime() + this.paymentExpiresSeconds * 1000,
    ).toISOString();
    const reservation = this.unwrapPaymentCreateResult(
      await this.repository.executeIdempotentPaymentCreate({
        paymentId,
        paymentNo: `PAY-${paymentId}`,
        orderId,
        shipperId,
        providerChannel: provider.channel,
        idempotencyKey,
        requestFingerprint: createPaymentCreateFingerprint(orderId, input),
        expiresAtIso,
      }),
    );

    if (!reservation.preparationRequired) {
      return {
        replayed: true,
        payment: reservation.payment,
      };
    }

    try {
      const providerPayload = await provider.createClientPayment({
        paymentNo: reservation.payment.paymentNo,
        amountCents: reservation.payment.amountCents,
        description: `货运订单 ${reservation.payment.orderNo}`,
        expiresAtIso: reservation.payment.expiresAtIso,
      });

      if (providerPayload.channel !== provider.channel) {
        throw new Error('payment provider channel mismatch');
      }

      const payment = await this.repository.completePaymentPreparation({
        paymentId: reservation.payment.id,
        clientPayload: providerPayload.payload,
      });

      if (!payment) {
        throw new BusinessError(
          ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE,
          '支付单不存在或状态已变化',
        );
      }

      return { replayed: false, payment };
    } catch (error) {
      if (
        error instanceof BusinessError &&
        error.code === ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE
      ) {
        throw error;
      }

      await this.repository.failPaymentPreparation({
        paymentId: reservation.payment.id,
        failureCode: 'provider_prepare_failed',
        failureMessage: '支付渠道下单失败',
      });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
        '支付渠道暂时不可用',
      );
    }
  }

  async getLatestPaymentForOrder(shipperId: string, orderId: string) {
    const payment = await this.repository.findLatestPaymentOrderForShipper(
      shipperId,
      orderId,
    );
    if (!payment) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE,
        '订单支付单不存在',
      );
    }

    return payment;
  }

  async handlePaymentCallback(
    channel: PaymentProviderChannel,
    rawCallback: ProviderRawCallback,
  ) {
    const provider = this.getProvider(channel);

    if (provider.channel !== channel) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_INVALID,
        '支付回调渠道不匹配',
      );
    }

    const callback = await provider.verifyPaymentCallback(rawCallback);
    return this.applyVerifiedPaymentCallback(channel, callback);
  }

  async applyVerifiedPaymentCallback(
    channel: PaymentProviderChannel,
    callback: VerifiedPaymentCallback,
  ) {
    return this.unwrapPaymentCallbackResult(
      await this.repository.applyVerifiedPaymentCallback({
        channel,
        callback,
      }),
    );
  }

  async handleRefundCallback(
    channel: PaymentProviderChannel,
    rawCallback: ProviderRawCallback,
  ) {
    const provider = this.getProvider(channel);

    if (provider.channel !== channel) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CALLBACK_INVALID,
        '退款回调渠道不匹配',
      );
    }

    const callback = await provider.verifyRefundCallback(rawCallback);
    return this.applyVerifiedRefundCallback(channel, callback);
  }

  async applyVerifiedRefundCallback(
    channel: PaymentProviderChannel,
    callback: VerifiedRefundCallback,
  ) {
    return this.unwrapRefundCallbackResult(
      await this.repository.applyVerifiedRefundCallback({
        channel,
        callback,
      }),
    );
  }

  async processRefundOutboxEvent(
    claim: ClaimedRefundOutboxEvent,
  ): Promise<void> {
    const provider = this.getProvider(claim.refund.channel);

    if (provider.channel !== claim.refund.channel) {
      throw new BusinessError(
        ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
        '退款渠道配置不匹配',
      );
    }

    const providerResult = await provider.requestRefund({
      refundNo: claim.refund.refundNo,
      paymentNo: claim.payment.paymentNo,
      ...(claim.payment.providerTradeNo
        ? { providerTradeNo: claim.payment.providerTradeNo }
        : {}),
      amountCents: claim.refund.amountCents,
      totalAmountCents: claim.payment.amountCents,
      reason: claim.refund.reason,
    });

    const completedAtIso = this.now().toISOString();

    if (providerResult.status === 'succeeded') {
      const normalizedPayload = Buffer.from(
        JSON.stringify({
          eventType: 'provider_sync_refund_succeeded',
          outboxEventId: claim.event.id,
          refundNo: claim.refund.refundNo,
          providerRefundNo: providerResult.providerRefundNo,
          amountCents: claim.refund.amountCents,
        }),
      );
      await this.applyVerifiedRefundCallback(claim.refund.channel, {
        eventId: `provider-sync:${claim.event.id}`,
        refundNo: claim.refund.refundNo,
        providerRefundNo: providerResult.providerRefundNo,
        amountCents: claim.refund.amountCents,
        status: 'succeeded',
        occurredAtIso: completedAtIso,
        rawPayloadHash: hashCallbackPayload(normalizedPayload),
      });
      return;
    }

    await this.repository.completeRefundOutboxRequest({
      outboxEventId: claim.event.id,
      workerId: claim.event.claimedBy,
      claimAttempt: claim.event.attemptCount,
      providerRefundNo: providerResult.providerRefundNo,
      completedAtIso,
    });
  }

  private getProvider(channel: PaymentProviderChannel) {
    try {
      return this.resolveProvider(channel);
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
        '支付渠道暂时不可用',
      );
    }
  }

  private unwrapPaymentCreateResult(
    result: ExecutePaymentCreateResult,
  ): Extract<ExecutePaymentCreateResult, { kind: 'success' }> {
    switch (result.kind) {
      case 'success':
        return result;
      case 'key-reused':
        throw new BusinessError(
          ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency-Key 已被其他支付请求使用',
        );
      case 'amount-invalid':
        throw new BusinessError(
          ApiErrorCode.PAYMENT_AMOUNT_INVALID,
          '订单支付金额不合法',
        );
      case 'already-escrowed':
        throw new BusinessError(
          ApiErrorCode.PAYMENT_ALREADY_ESCROWED,
          '订单已经支付',
        );
      case 'active-payment-exists':
        throw new BusinessError(
          ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE,
          '订单已有进行中的支付单',
        );
      case 'order-not-available':
        throw new BusinessError(
          ApiErrorCode.PAYMENT_ORDER_NOT_AVAILABLE,
          '当前订单不可创建支付单',
        );
    }
  }

  private unwrapPaymentCallbackResult(
    result: ApplyPaymentCallbackResult,
  ): Exclude<
    ApplyPaymentCallbackResult,
    { kind: 'event-conflict' | 'payment-conflict' | 'payment-not-found' }
  > {
    if (result.kind === 'applied' || result.kind === 'failed') {
      return result;
    }

    throw new BusinessError(
      ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
      result.kind === 'payment-not-found'
        ? '支付回调对应的支付单不存在'
        : '支付回调与已有资金事实冲突',
    );
  }

  private unwrapRefundCallbackResult(
    result: ApplyRefundCallbackResult,
  ): Exclude<
    ApplyRefundCallbackResult,
    { kind: 'event-conflict' | 'refund-conflict' | 'refund-not-found' }
  > {
    if (result.kind === 'applied' || result.kind === 'failed') {
      return result;
    }

    throw new BusinessError(
      ApiErrorCode.PAYMENT_CALLBACK_CONFLICT,
      result.kind === 'refund-not-found'
        ? '退款回调对应的退款单不存在'
        : '退款回调与已有资金事实冲突',
    );
  }
}

import { createHash } from 'crypto';
import { ApiErrorCode, BusinessError } from '../common/errors';

export type PaymentProviderChannel = 'sandbox' | 'wechat' | 'alipay';

export type ProviderCreatePaymentInput = {
  paymentNo: string;
  amountCents: number;
  description: string;
  expiresAtIso: string;
};

export type ProviderClientPayload = {
  channel: PaymentProviderChannel;
  payload: Record<string, unknown> | string;
};

export type ProviderRawCallback = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
};

export type VerifiedPaymentCallback = {
  eventId: string;
  paymentNo: string;
  providerTradeNo: string;
  amountCents: number;
  status: 'succeeded' | 'failed';
  occurredAtIso: string;
  rawPayloadHash: string;
};

export type ProviderRefundInput = {
  refundNo: string;
  paymentNo: string;
  providerTradeNo?: string;
  amountCents: number;
  totalAmountCents: number;
  reason: string;
};

export type ProviderRefundResult = {
  providerRefundNo: string;
  status: 'processing' | 'succeeded';
};

export type VerifiedRefundCallback = {
  eventId: string;
  refundNo: string;
  providerRefundNo: string;
  amountCents: number;
  status: 'succeeded' | 'failed';
  occurredAtIso: string;
  rawPayloadHash: string;
};

export interface PaymentProvider {
  readonly channel: PaymentProviderChannel;
  createClientPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderClientPayload>;
  verifyPaymentCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedPaymentCallback>;
  requestRefund(input: ProviderRefundInput): Promise<ProviderRefundResult>;
  verifyRefundCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedRefundCallback>;
}

export function getCallbackHeader(
  headers: ProviderRawCallback['headers'],
  name: string,
): string | undefined {
  const expectedName = name.toLowerCase();

  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== expectedName) {
      continue;
    }

    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  return undefined;
}

export function hashCallbackPayload(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function throwInvalidPaymentCallback(message: string): never {
  throw new BusinessError(ApiErrorCode.PAYMENT_CALLBACK_INVALID, message);
}

export function assertProviderAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throwInvalidPaymentCallback('支付回调金额不合法');
  }
}

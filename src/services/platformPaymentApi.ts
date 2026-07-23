import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

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
      const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
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

function normalizeIdempotencyKey(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new PlatformApiError(
      'Platform payment idempotency key is invalid',
      'PLATFORM_PAYMENT_KEY_INVALID',
      0,
    );
  }
  return normalized;
}

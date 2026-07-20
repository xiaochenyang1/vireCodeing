import {
  createHmac,
  timingSafeEqual,
} from 'crypto';
import {
  assertProviderAmount,
  getCallbackHeader,
  hashCallbackPayload,
  PaymentProvider,
  ProviderClientPayload,
  ProviderCreatePaymentInput,
  ProviderRawCallback,
  ProviderRefundInput,
  ProviderRefundResult,
  throwInvalidPaymentCallback,
  VerifiedPaymentCallback,
  VerifiedRefundCallback,
} from './payment-provider';

type SandboxPaymentProviderConfig = {
  secret: string;
  now?: () => Date;
  maxClockSkewSeconds?: number;
};

export class SandboxPaymentProvider implements PaymentProvider {
  readonly channel = 'sandbox' as const;
  private readonly now: () => Date;
  private readonly maxClockSkewSeconds: number;

  constructor(private readonly config: SandboxPaymentProviderConfig) {
    this.now = config.now ?? (() => new Date());
    this.maxClockSkewSeconds = config.maxClockSkewSeconds ?? 300;
  }

  async createClientPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderClientPayload> {
    const payload = {
      paymentNo: input.paymentNo,
      amountCents: input.amountCents,
      expiresAtIso: input.expiresAtIso,
    };
    const serialized = JSON.stringify(payload);

    return {
      channel: this.channel,
      payload: {
        ...payload,
        sandboxToken: createHmac('sha256', this.config.secret)
          .update(serialized)
          .digest('hex'),
      },
    };
  }

  async verifyPaymentCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedPaymentCallback> {
    this.verifySignatureAndTimestamp(input);
    const payload = parseSandboxPayload(input.rawBody);
    const eventId = readRequiredString(payload, 'eventId');
    const paymentNo = readRequiredString(payload, 'paymentNo');
    const providerTradeNo = readRequiredString(payload, 'providerTradeNo');
    const amountCents = readRequiredInteger(payload, 'amountCents');
    const status = readStatus(payload, ['succeeded', 'failed'] as const);
    const occurredAtIso = readRequiredIsoDate(payload, 'occurredAtIso');

    assertProviderAmount(amountCents);

    return {
      eventId,
      paymentNo,
      providerTradeNo,
      amountCents,
      status,
      occurredAtIso,
      rawPayloadHash: hashCallbackPayload(input.rawBody),
    };
  }

  async requestRefund(
    input: ProviderRefundInput,
  ): Promise<ProviderRefundResult> {
    assertProviderAmount(input.amountCents);

    return {
      providerRefundNo: `sandbox-${input.refundNo}`,
      status: 'processing',
    };
  }

  async verifyRefundCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedRefundCallback> {
    this.verifySignatureAndTimestamp(input);
    const payload = parseSandboxPayload(input.rawBody);
    const eventId = readRequiredString(payload, 'eventId');
    const refundNo = readRequiredString(payload, 'refundNo');
    const providerRefundNo = readRequiredString(payload, 'providerRefundNo');
    const amountCents = readRequiredInteger(payload, 'amountCents');
    const status = readStatus(payload, ['succeeded', 'failed'] as const);
    const occurredAtIso = readRequiredIsoDate(payload, 'occurredAtIso');

    assertProviderAmount(amountCents);

    return {
      eventId,
      refundNo,
      providerRefundNo,
      amountCents,
      status,
      occurredAtIso,
      rawPayloadHash: hashCallbackPayload(input.rawBody),
    };
  }

  private verifySignatureAndTimestamp(input: ProviderRawCallback): void {
    const timestamp = getCallbackHeader(input.headers, 'x-payment-timestamp');
    const nonce = getCallbackHeader(input.headers, 'x-payment-nonce');
    const signature = getCallbackHeader(input.headers, 'x-payment-signature');

    if (!timestamp || !nonce || !signature) {
      throwInvalidPaymentCallback('Sandbox 支付回调签名头缺失');
    }

    const timestampSeconds = Number(timestamp);

    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(this.now().getTime() / 1000) - timestampSeconds) >
        this.maxClockSkewSeconds
    ) {
      throwInvalidPaymentCallback('Sandbox 支付回调时间戳已过期');
    }

    const expected = createSandboxCallbackSignature(
      this.config.secret,
      timestamp,
      nonce,
      input.rawBody,
    );
    const actualBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throwInvalidPaymentCallback('Sandbox 支付回调签名无效');
    }
  }
}

export function createSandboxCallbackSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string | Buffer,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n`)
    .update(rawBody)
    .digest('hex');
}

function parseSandboxPayload(rawBody: Buffer): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Mapped to a stable callback error below.
  }

  throwInvalidPaymentCallback('Sandbox 支付回调 body 无效');
}

function readRequiredString(
  payload: Record<string, unknown>,
  field: string,
): string {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throwInvalidPaymentCallback(`Sandbox 支付回调缺少 ${field}`);
  }

  return value;
}

function readRequiredInteger(
  payload: Record<string, unknown>,
  field: string,
): number {
  const value = payload[field];

  if (!Number.isSafeInteger(value)) {
    throwInvalidPaymentCallback(`Sandbox 支付回调 ${field} 无效`);
  }

  return value as number;
}

function readRequiredIsoDate(
  payload: Record<string, unknown>,
  field: string,
): string {
  const value = readRequiredString(payload, field);

  if (Number.isNaN(Date.parse(value))) {
    throwInvalidPaymentCallback(`Sandbox 支付回调 ${field} 无效`);
  }

  return new Date(value).toISOString();
}

function readStatus<const T extends readonly string[]>(
  payload: Record<string, unknown>,
  statuses: T,
): T[number] {
  const status = payload.status;

  if (typeof status !== 'string' || !statuses.includes(status)) {
    throwInvalidPaymentCallback('Sandbox 支付回调 status 无效');
  }

  return status as T[number];
}

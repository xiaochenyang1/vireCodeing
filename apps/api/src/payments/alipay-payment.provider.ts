import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'crypto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  assertProviderAmount,
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

type AlipayPaymentProviderConfig = {
  appId: string;
  sellerId: string;
  merchantPrivateKeyPem: string;
  alipayPublicKeyPem: string;
  notifyUrl: string;
  gatewayUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type AlipayAppOrderConfig = Pick<
  AlipayPaymentProviderConfig,
  'appId' | 'merchantPrivateKeyPem' | 'notifyUrl'
> & {
  now?: () => Date;
};

type AlipayCallbackVerificationConfig = {
  alipayPublicKeyPem: string;
  expectedAppId: string;
  expectedSellerId: string;
};

export class AlipayPaymentProvider implements PaymentProvider {
  readonly channel = 'alipay' as const;
  private readonly gatewayUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: AlipayPaymentProviderConfig) {
    this.gatewayUrl =
      config.gatewayUrl ?? 'https://openapi.alipay.com/gateway.do';
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async createClientPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderClientPayload> {
    assertProviderAmount(input.amountCents);

    return {
      channel: this.channel,
      payload: createAlipayAppOrderString(
        {
          appId: this.config.appId,
          merchantPrivateKeyPem: this.config.merchantPrivateKeyPem,
          notifyUrl: this.config.notifyUrl,
          now: this.now,
        },
        input,
      ),
    };
  }

  async verifyPaymentCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedPaymentCallback> {
    return verifyAlipayPaymentCallback(input, {
      alipayPublicKeyPem: this.config.alipayPublicKeyPem,
      expectedAppId: this.config.appId,
      expectedSellerId: this.config.sellerId,
    });
  }

  async requestRefund(
    input: ProviderRefundInput,
  ): Promise<ProviderRefundResult> {
    assertProviderAmount(input.amountCents);
    const params = createAlipayCommonParams(
      this.config.appId,
      'alipay.trade.refund',
      this.now(),
    );
    params.set(
      'biz_content',
      JSON.stringify({
        ...(input.providerTradeNo
          ? { trade_no: input.providerTradeNo }
          : { out_trade_no: input.paymentNo }),
        refund_amount: formatCentsAsYuan(input.amountCents),
        refund_reason: input.reason,
        out_request_no: input.refundNo,
      }),
    );
    signAlipayParams(params, this.config.merchantPrivateKeyPem);
    let response: Response;

    try {
      response = await this.fetchImpl(this.gatewayUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch {
      throwAlipayUnavailable();
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throwAlipayUnavailable();
    }

    if (!response.ok || !isRecord(payload)) {
      throwAlipayUnavailable();
    }

    const result = payload.alipay_trade_refund_response;

    if (!isRecord(result) || result.code !== '10000') {
      throwAlipayUnavailable();
    }

    return {
      providerRefundNo:
        typeof result.trade_no === 'string'
          ? result.trade_no
          : input.providerTradeNo ?? input.refundNo,
      status: 'succeeded',
    };
  }

  async verifyRefundCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedRefundCallback> {
    const params = verifyAlipayFormSignature(
      input,
      this.config.alipayPublicKeyPem,
    );
    assertAlipayMerchant(params, this.config.appId, this.config.sellerId);
    const refundNo = readAlipayParam(params, 'out_request_no');
    const amountCents = parseCnyAmountToCents(
      readAlipayParam(params, 'refund_fee'),
    );

    return {
      eventId:
        params.get('notify_id') ??
        `${refundNo}:${readAlipayParam(params, 'gmt_refund')}`,
      refundNo,
      providerRefundNo: params.get('trade_no') ?? refundNo,
      amountCents,
      status: params.get('refund_status') === 'REFUND_SUCCESS' ? 'succeeded' : 'failed',
      occurredAtIso: normalizeAlipayDate(readAlipayParam(params, 'gmt_refund')),
      rawPayloadHash: hashCallbackPayload(input.rawBody),
    };
  }
}

export function createAlipayAppOrderString(
  config: AlipayAppOrderConfig,
  input: ProviderCreatePaymentInput,
): string {
  assertProviderAmount(input.amountCents);
  const now = config.now?.() ?? new Date();
  const params = createAlipayCommonParams(
    config.appId,
    'alipay.trade.app.pay',
    now,
  );
  params.set('notify_url', config.notifyUrl);
  params.set(
    'biz_content',
    JSON.stringify({
      subject: input.description,
      out_trade_no: input.paymentNo,
      total_amount: formatCentsAsYuan(input.amountCents),
      product_code: 'QUICK_MSECURITY_PAY',
      time_expire: formatAlipayDate(new Date(input.expiresAtIso)),
    }),
  );
  signAlipayParams(params, config.merchantPrivateKeyPem);

  return params.toString();
}

export function createAlipaySignContent(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(
      ([key, value]) => key !== 'sign' && key !== 'sign_type' && value !== '',
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function verifyAlipayPaymentCallback(
  input: ProviderRawCallback,
  config: AlipayCallbackVerificationConfig,
): VerifiedPaymentCallback {
  const params = verifyAlipayFormSignature(input, config.alipayPublicKeyPem);
  assertAlipayMerchant(params, config.expectedAppId, config.expectedSellerId);
  const amountCents = parseCnyAmountToCents(
    readAlipayParam(params, 'total_amount'),
  );
  assertProviderAmount(amountCents);
  const tradeStatus = readAlipayParam(params, 'trade_status');

  return {
    eventId:
      params.get('notify_id') ??
      `${readAlipayParam(params, 'trade_no')}:${tradeStatus}`,
    paymentNo: readAlipayParam(params, 'out_trade_no'),
    providerTradeNo: readAlipayParam(params, 'trade_no'),
    amountCents,
    status:
      tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED'
        ? 'succeeded'
        : 'failed',
    occurredAtIso: normalizeAlipayDate(
      params.get('gmt_payment') ?? readAlipayParam(params, 'notify_time'),
    ),
    rawPayloadHash: hashCallbackPayload(input.rawBody),
  };
}

export function parseCnyAmountToCents(value: string): number {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throwInvalidPaymentCallback('支付宝回调金额格式无效');
  }

  const [yuan, cents] = value.split('.');
  const amountCents = Number(yuan) * 100 + Number(cents);

  assertProviderAmount(amountCents);

  return amountCents;
}

function createAlipayCommonParams(
  appId: string,
  method: string,
  now: Date,
): URLSearchParams {
  return new URLSearchParams({
    app_id: appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayDate(now),
    version: '1.0',
  });
}

function signAlipayParams(
  params: URLSearchParams,
  privateKeyPem: string,
): void {
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(createAlipaySignContent(params)),
    createPrivateKey(privateKeyPem),
  ).toString('base64');

  params.set('sign', signature);
}

function verifyAlipayFormSignature(
  input: ProviderRawCallback,
  publicKeyPem: string,
): URLSearchParams {
  const params = new URLSearchParams(input.rawBody.toString('utf8'));
  const signature = params.get('sign');

  if (
    !signature ||
    !verify(
      'RSA-SHA256',
      Buffer.from(createAlipaySignContent(params)),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'base64'),
    )
  ) {
    throwInvalidPaymentCallback('支付宝回调签名无效');
  }

  return params;
}

function assertAlipayMerchant(
  params: URLSearchParams,
  expectedAppId: string,
  expectedSellerId: string,
): void {
  if (
    readAlipayParam(params, 'app_id') !== expectedAppId ||
    readAlipayParam(params, 'seller_id') !== expectedSellerId
  ) {
    throwInvalidPaymentCallback('支付宝回调商户信息不匹配');
  }
}

function readAlipayParam(params: URLSearchParams, field: string): string {
  const value = params.get(field);

  if (!value) {
    throwInvalidPaymentCallback(`支付宝回调缺少 ${field}`);
  }

  return value;
}

function formatCentsAsYuan(amountCents: number): string {
  assertProviderAmount(amountCents);

  return `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(
    2,
    '0',
  )}`;
}

function formatAlipayDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new BusinessError(
      ApiErrorCode.PAYMENT_AMOUNT_INVALID,
      '支付宝支付过期时间无效',
    );
  }

  const parts = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ];

  return `${parts.join('-')} ${time.join(':')}`;
}

function normalizeAlipayDate(value: string): string {
  const timestamp = Date.parse(`${value.replace(' ', 'T')}+08:00`);

  if (Number.isNaN(timestamp)) {
    throwInvalidPaymentCallback('支付宝回调时间无效');
  }

  return new Date(timestamp).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function throwAlipayUnavailable(): never {
  throw new BusinessError(
    ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
    '支付宝渠道暂不可用',
  );
}

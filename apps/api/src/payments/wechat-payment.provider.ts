import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from 'crypto';
import { ApiErrorCode, BusinessError } from '../common/errors';
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

type WechatPaymentProviderConfig = {
  appId: string;
  mchId: string;
  merchantSerialNo: string;
  merchantPrivateKeyPem: string;
  platformSerialNo: string;
  platformPublicKeyPem: string;
  apiV3Key: string;
  paymentNotifyUrl: string;
  refundNotifyUrl: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  createNonce?: () => string;
};

type WechatAuthorizationInput = {
  method: string;
  urlPath: string;
  body: string;
  mchId: string;
  merchantSerialNo: string;
  merchantPrivateKeyPem: string;
  timestamp: string;
  nonce: string;
};

type WechatCallbackVerificationConfig = {
  platformPublicKeyPem: string;
  platformSerialNo: string;
  apiV3Key: string;
  expectedMchId: string;
  expectedAppId: string;
};

type WechatEncryptedResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

export class WechatPaymentProvider implements PaymentProvider {
  readonly channel = 'wechat' as const;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly createNonce: () => string;

  constructor(private readonly config: WechatPaymentProviderConfig) {
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.mch.weixin.qq.com';
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.createNonce =
      config.createNonce ?? (() => randomBytes(16).toString('hex'));
  }

  async createClientPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderClientPayload> {
    assertProviderAmount(input.amountCents);
    const urlPath = '/v3/pay/transactions/app';
    const body = JSON.stringify({
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: input.description,
      out_trade_no: input.paymentNo,
      time_expire: input.expiresAtIso,
      notify_url: this.config.paymentNotifyUrl,
      amount: { total: input.amountCents, currency: 'CNY' },
    });
    const response = await this.requestJson('POST', urlPath, body);
    const prepayId = readWechatString(response, 'prepay_id');
    const timestamp = String(Math.floor(this.now().getTime() / 1000));
    const nonce = this.createNonce();
    const appSignature = sign(
      'RSA-SHA256',
      Buffer.from(
        `${this.config.appId}\n${timestamp}\n${nonce}\n${prepayId}\n`,
      ),
      createPrivateKey(this.config.merchantPrivateKeyPem),
    ).toString('base64');

    return {
      channel: this.channel,
      payload: {
        appid: this.config.appId,
        partnerid: this.config.mchId,
        prepayid: prepayId,
        package: 'Sign=WXPay',
        noncestr: nonce,
        timestamp,
        sign: appSignature,
      },
    };
  }

  async verifyPaymentCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedPaymentCallback> {
    return verifyWechatPaymentCallback(input, {
      platformPublicKeyPem: this.config.platformPublicKeyPem,
      platformSerialNo: this.config.platformSerialNo,
      apiV3Key: this.config.apiV3Key,
      expectedMchId: this.config.mchId,
      expectedAppId: this.config.appId,
    });
  }

  async requestRefund(
    input: ProviderRefundInput,
  ): Promise<ProviderRefundResult> {
    assertProviderAmount(input.amountCents);
    const urlPath = '/v3/refund/domestic/refunds';
    const body = JSON.stringify({
      ...(input.providerTradeNo
        ? { transaction_id: input.providerTradeNo }
        : { out_trade_no: input.paymentNo }),
      out_refund_no: input.refundNo,
      reason: input.reason,
      notify_url: this.config.refundNotifyUrl,
      amount: {
        refund: input.amountCents,
        total: input.totalAmountCents,
        currency: 'CNY',
      },
    });
    const response = await this.requestJson('POST', urlPath, body);
    const providerRefundNo = readWechatString(response, 'refund_id');
    const status = readWechatString(response, 'status');

    return {
      providerRefundNo,
      status: status === 'SUCCESS' ? 'succeeded' : 'processing',
    };
  }

  async verifyRefundCallback(
    input: ProviderRawCallback,
  ): Promise<VerifiedRefundCallback> {
    const { eventId, resource } = verifyAndDecryptWechatCallback(
      input,
      this.config,
    );
    const refundNo = readWechatString(resource, 'out_refund_no');
    const providerRefundNo = readWechatString(resource, 'refund_id');
    const refundStatus = readWechatString(resource, 'refund_status');
    const amount = readWechatObject(resource, 'amount');
    const amountCents = readWechatInteger(amount, 'refund');
    const occurredAtIso = normalizeWechatDate(
      readWechatString(resource, 'success_time', false) ||
        readWechatString(resource, 'create_time'),
    );

    return {
      eventId,
      refundNo,
      providerRefundNo,
      amountCents,
      status: refundStatus === 'SUCCESS' ? 'succeeded' : 'failed',
      occurredAtIso,
      rawPayloadHash: hashCallbackPayload(input.rawBody),
    };
  }

  private async requestJson(
    method: string,
    urlPath: string,
    body: string,
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Math.floor(this.now().getTime() / 1000));
    const nonce = this.createNonce();
    const authorization = createWechatAuthorization({
      method,
      urlPath,
      body,
      mchId: this.config.mchId,
      merchantSerialNo: this.config.merchantSerialNo,
      merchantPrivateKeyPem: this.config.merchantPrivateKeyPem,
      timestamp,
      nonce,
    });
    let response: Response;

    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${urlPath}`, {
        method,
        headers: {
          authorization,
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'truck-platform-api/1.0',
        },
        body,
      });
    } catch {
      throwProviderUnavailable();
    }

    const payload = await parseWechatJson(response);

    if (!response.ok) {
      throwProviderUnavailable();
    }

    return payload;
  }
}

export function createWechatAuthorization(
  input: WechatAuthorizationInput,
): string {
  const message = `${input.method.toUpperCase()}\n${input.urlPath}\n${input.timestamp}\n${input.nonce}\n${input.body}\n`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(message),
    createPrivateKey(input.merchantPrivateKeyPem),
  ).toString('base64');

  return [
    'WECHATPAY2-SHA256-RSA2048',
    `mchid="${input.mchId}"`,
    `nonce_str="${input.nonce}"`,
    `timestamp="${input.timestamp}"`,
    `serial_no="${input.merchantSerialNo}"`,
    `signature="${signature}"`,
  ].join(' ');
}

export function decryptWechatResource(
  resource: WechatEncryptedResource,
  apiV3Key: string,
): string {
  if (Buffer.byteLength(apiV3Key) !== 32) {
    throwInvalidPaymentCallback('微信支付 API v3 key 长度无效');
  }

  try {
    const encrypted = Buffer.from(resource.ciphertext, 'base64');
    const authTag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key),
      Buffer.from(resource.nonce),
    );
    decipher.setAAD(Buffer.from(resource.associated_data ?? ''));
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throwInvalidPaymentCallback('微信支付回调资源解密失败');
  }
}

export function verifyWechatPaymentCallback(
  input: ProviderRawCallback,
  config: WechatCallbackVerificationConfig,
): VerifiedPaymentCallback {
  const { eventId, resource } = verifyAndDecryptWechatCallback(input, config);

  if (
    readWechatString(resource, 'mchid') !== config.expectedMchId ||
    readWechatString(resource, 'appid') !== config.expectedAppId
  ) {
    throwInvalidPaymentCallback('微信支付回调商户信息不匹配');
  }

  const amount = readWechatObject(resource, 'amount');

  if (readWechatString(amount, 'currency') !== 'CNY') {
    throwInvalidPaymentCallback('微信支付回调币种无效');
  }

  const amountCents = readWechatInteger(amount, 'total');
  assertProviderAmount(amountCents);

  return {
    eventId,
    paymentNo: readWechatString(resource, 'out_trade_no'),
    providerTradeNo: readWechatString(resource, 'transaction_id'),
    amountCents,
    status:
      readWechatString(resource, 'trade_state') === 'SUCCESS'
        ? 'succeeded'
        : 'failed',
    occurredAtIso: normalizeWechatDate(
      readWechatString(resource, 'success_time'),
    ),
    rawPayloadHash: hashCallbackPayload(input.rawBody),
  };
}

function verifyAndDecryptWechatCallback(
  input: ProviderRawCallback,
  config: Pick<
    WechatCallbackVerificationConfig,
    'platformPublicKeyPem' | 'platformSerialNo' | 'apiV3Key'
  >,
): { eventId: string; resource: Record<string, unknown> } {
  const timestamp = getCallbackHeader(input.headers, 'wechatpay-timestamp');
  const nonce = getCallbackHeader(input.headers, 'wechatpay-nonce');
  const signature = getCallbackHeader(input.headers, 'wechatpay-signature');
  const serial = getCallbackHeader(input.headers, 'wechatpay-serial');

  if (!timestamp || !nonce || !signature || !serial) {
    throwInvalidPaymentCallback('微信支付回调签名头缺失');
  }

  if (serial !== config.platformSerialNo) {
    throwInvalidPaymentCallback('微信支付平台证书序列号不匹配');
  }

  const signedMessage = `${timestamp}\n${nonce}\n${input.rawBody.toString('utf8')}\n`;
  const signatureValid = verify(
    'RSA-SHA256',
    Buffer.from(signedMessage),
    createPublicKey(config.platformPublicKeyPem),
    Buffer.from(signature, 'base64'),
  );

  if (!signatureValid) {
    throwInvalidPaymentCallback('微信支付回调签名无效');
  }

  const envelope = parseWechatObject(input.rawBody);
  const eventId = readWechatString(envelope, 'id');
  const encryptedResource = readWechatObject(envelope, 'resource');
  const plaintext = decryptWechatResource(
    {
      ciphertext: readWechatString(encryptedResource, 'ciphertext'),
      nonce: readWechatString(encryptedResource, 'nonce'),
      associated_data:
        readWechatString(encryptedResource, 'associated_data', false) ?? '',
    },
    config.apiV3Key,
  );

  return {
    eventId,
    resource: parseWechatObject(Buffer.from(plaintext)),
  };
}

function parseWechatObject(rawBody: Buffer): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Mapped below.
  }

  throwInvalidPaymentCallback('微信支付回调 body 无效');
}

async function parseWechatJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();

    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readWechatObject(
  payload: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = payload[field];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwInvalidPaymentCallback(`微信支付字段 ${field} 无效`);
  }

  return value as Record<string, unknown>;
}

function readWechatString(
  payload: Record<string, unknown>,
  field: string,
  required = true,
): string {
  const value = payload[field];

  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  if (!required) {
    return '';
  }

  throwInvalidPaymentCallback(`微信支付字段 ${field} 无效`);
}

function readWechatInteger(
  payload: Record<string, unknown>,
  field: string,
): number {
  const value = payload[field];

  if (!Number.isSafeInteger(value)) {
    throwInvalidPaymentCallback(`微信支付字段 ${field} 无效`);
  }

  return value as number;
}

function normalizeWechatDate(value: string): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throwInvalidPaymentCallback('微信支付回调时间无效');
  }

  return new Date(timestamp).toISOString();
}

function throwProviderUnavailable(): never {
  throw new BusinessError(
    ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
    '微信支付渠道暂不可用',
  );
}

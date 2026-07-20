import {
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'crypto';
import {
  AlipayPaymentProvider,
  createAlipayAppOrderString,
  createAlipaySignContent,
  verifyAlipayPaymentCallback,
} from './alipay-payment.provider';
import {
  SandboxPaymentProvider,
  createSandboxCallbackSignature,
} from './sandbox-payment.provider';
import {
  WechatPaymentProvider,
  createWechatAuthorization,
  decryptWechatResource,
  verifyWechatPaymentCallback,
} from './wechat-payment.provider';

const rsaKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('payment providers', () => {
  it('creates and verifies a sandbox payment callback', async () => {
    const secret = 'sandbox-payment-secret-32-characters';
    const timestamp = '1784102400';
    const nonce = 'nonce-payment-1';
    const rawBody = JSON.stringify({
      eventId: 'sandbox-event-1',
      paymentNo: 'PAY202607150001',
      providerTradeNo: 'sandbox-trade-1',
      amountCents: 76000,
      status: 'succeeded',
      occurredAtIso: '2026-07-15T08:00:00.000Z',
    });
    const provider = new SandboxPaymentProvider({
      secret,
      now: () => new Date('2026-07-15T08:00:30.000Z'),
    });

    await expect(
      provider.verifyPaymentCallback({
        headers: {
          'x-payment-timestamp': timestamp,
          'x-payment-nonce': nonce,
          'x-payment-signature': createSandboxCallbackSignature(
            secret,
            timestamp,
            nonce,
            rawBody,
          ),
        },
        rawBody: Buffer.from(rawBody),
      }),
    ).resolves.toMatchObject({
      eventId: 'sandbox-event-1',
      paymentNo: 'PAY202607150001',
      providerTradeNo: 'sandbox-trade-1',
      amountCents: 76000,
      status: 'succeeded',
    });
  });

  it('rejects stale or tampered sandbox callbacks', async () => {
    const provider = new SandboxPaymentProvider({
      secret: 'sandbox-payment-secret-32-characters',
      now: () => new Date('2026-07-15T08:10:01.000Z'),
    });
    const rawBody = JSON.stringify({ eventId: 'event-1' });

    await expect(
      provider.verifyPaymentCallback({
        headers: {
          'x-payment-timestamp': '1784102400',
          'x-payment-nonce': 'nonce-1',
          'x-payment-signature': 'tampered',
        },
        rawBody: Buffer.from(rawBody),
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_CALLBACK_INVALID' });
  });

  it('signs a WeChat Pay v3 authorization message with merchant RSA key', () => {
    const authorization = createWechatAuthorization({
      method: 'POST',
      urlPath: '/v3/pay/transactions/app',
      body: '{"amount":{"total":76000}}',
      mchId: '1900000109',
      merchantSerialNo: 'MERCHANTSERIAL',
      merchantPrivateKeyPem: rsaKeys.privateKey,
      timestamp: '1784083200',
      nonce: 'wechat-nonce-1',
    });
    const signature = authorization.match(/signature="([^"]+)"/)?.[1];

    expect(authorization).toContain('mchid="1900000109"');
    expect(authorization).toContain('serial_no="MERCHANTSERIAL"');
    expect(signature).toBeDefined();
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(
          'POST\n/v3/pay/transactions/app\n1784083200\nwechat-nonce-1\n{"amount":{"total":76000}}\n',
        ),
        createPublicKey(rsaKeys.publicKey),
        Buffer.from(signature!, 'base64'),
      ),
    ).toBe(true);
  });

  it('verifies and decrypts a WeChat Pay v3 payment callback', () => {
    const apiV3Key = '0123456789abcdef0123456789abcdef';
    const resourceNonce = 'nonce-123456';
    const associatedData = 'transaction';
    const plaintext = JSON.stringify({
      mchid: '1900000109',
      appid: 'wx-app-id',
      out_trade_no: 'PAY202607150001',
      transaction_id: 'wx-trade-1',
      trade_state: 'SUCCESS',
      success_time: '2026-07-15T16:00:00+08:00',
      amount: { total: 76000, currency: 'CNY' },
    });
    const ciphertext = encryptWechatResource(
      plaintext,
      apiV3Key,
      resourceNonce,
      associatedData,
    );
    const rawBody = JSON.stringify({
      id: 'wechat-event-1',
      event_type: 'TRANSACTION.SUCCESS',
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext,
        nonce: resourceNonce,
        associated_data: associatedData,
      },
    });
    const timestamp = '1784083200';
    const nonce = 'callback-nonce-1';
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`),
      createPrivateKey(rsaKeys.privateKey),
    ).toString('base64');

    expect(
      decryptWechatResource(
        {
          ciphertext,
          nonce: resourceNonce,
          associated_data: associatedData,
        },
        apiV3Key,
      ),
    ).toBe(plaintext);
    expect(
      verifyWechatPaymentCallback(
        {
          headers: {
            'wechatpay-timestamp': timestamp,
            'wechatpay-nonce': nonce,
            'wechatpay-signature': signature,
            'wechatpay-serial': 'PLATFORMSERIAL',
          },
          rawBody: Buffer.from(rawBody),
        },
        {
          platformPublicKeyPem: rsaKeys.publicKey,
          platformSerialNo: 'PLATFORMSERIAL',
          apiV3Key,
          expectedMchId: '1900000109',
          expectedAppId: 'wx-app-id',
        },
      ),
    ).toMatchObject({
      eventId: 'wechat-event-1',
      paymentNo: 'PAY202607150001',
      providerTradeNo: 'wx-trade-1',
      amountCents: 76000,
      status: 'succeeded',
    });
  });

  it('falls back to create_time for a WeChat refund callback without success_time', async () => {
    const apiV3Key = '0123456789abcdef0123456789abcdef';
    const resourceNonce = 'refund-nonce';
    const associatedData = 'refund';
    const plaintext = JSON.stringify({
      out_refund_no: 'RF-PAY202607150001',
      refund_id: 'wx-refund-1',
      refund_status: 'PROCESSING',
      create_time: '2026-07-15T16:02:00+08:00',
      amount: { refund: 76000, total: 76000, currency: 'CNY' },
    });
    const ciphertext = encryptWechatResource(
      plaintext,
      apiV3Key,
      resourceNonce,
      associatedData,
    );
    const rawBody = JSON.stringify({
      id: 'wechat-refund-event-1',
      event_type: 'REFUND.SUCCESS',
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext,
        nonce: resourceNonce,
        associated_data: associatedData,
      },
    });
    const timestamp = '1784083320';
    const nonce = 'refund-callback-nonce-1';
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`),
      createPrivateKey(rsaKeys.privateKey),
    ).toString('base64');
    const provider = new WechatPaymentProvider({
      appId: 'wx-app-id',
      mchId: '1900000109',
      merchantSerialNo: 'MERCHANTSERIAL',
      merchantPrivateKeyPem: rsaKeys.privateKey,
      platformSerialNo: 'PLATFORMSERIAL',
      platformPublicKeyPem: rsaKeys.publicKey,
      apiV3Key,
      paymentNotifyUrl: 'https://api.example.com/callbacks/payment/wechat',
      refundNotifyUrl: 'https://api.example.com/callbacks/refund/wechat',
    });

    await expect(
      provider.verifyRefundCallback({
        headers: {
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': nonce,
          'wechatpay-signature': signature,
          'wechatpay-serial': 'PLATFORMSERIAL',
        },
        rawBody: Buffer.from(rawBody),
      }),
    ).resolves.toEqual({
      eventId: 'wechat-refund-event-1',
      refundNo: 'RF-PAY202607150001',
      providerRefundNo: 'wx-refund-1',
      amountCents: 76000,
      status: 'failed',
      occurredAtIso: '2026-07-15T08:02:00.000Z',
      rawPayloadHash: expect.any(String),
    });
  });

  it('requests a WeChat refund with one authoritative transaction identifier', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ refund_id: 'wx-refund-1', status: 'PROCESSING' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const provider = new WechatPaymentProvider({
      appId: 'wx-app-id',
      mchId: '1900000109',
      merchantSerialNo: 'MERCHANTSERIAL',
      merchantPrivateKeyPem: rsaKeys.privateKey,
      platformSerialNo: 'PLATFORMSERIAL',
      platformPublicKeyPem: rsaKeys.publicKey,
      apiV3Key: '0123456789abcdef0123456789abcdef',
      paymentNotifyUrl: 'https://api.example.com/callbacks/payment/wechat',
      refundNotifyUrl: 'https://api.example.com/callbacks/refund/wechat',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date('2026-07-15T08:00:00.000Z'),
      createNonce: () => 'wechat-refund-nonce-1',
    });

    await expect(
      provider.requestRefund({
        refundNo: 'RF-PAY202607150001',
        paymentNo: 'PAY202607150001',
        providerTradeNo: 'wx-trade-1',
        amountCents: 73000,
        totalAmountCents: 76000,
        reason: 'order_cancelled',
      }),
    ).resolves.toEqual({
      providerRefundNo: 'wx-refund-1',
      status: 'processing',
    });
    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(url).toBe(
      'https://api.mch.weixin.qq.com/v3/refund/domestic/refunds',
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        authorization: expect.stringContaining('WECHATPAY2-SHA256-RSA2048'),
      }),
    );
    expect(body).toEqual({
      transaction_id: 'wx-trade-1',
      out_refund_no: 'RF-PAY202607150001',
      reason: 'order_cancelled',
      notify_url: 'https://api.example.com/callbacks/refund/wechat',
      amount: { refund: 73000, total: 76000, currency: 'CNY' },
    });
  });

  it('creates an Alipay APP order string with a verifiable RSA2 signature', () => {
    const orderString = createAlipayAppOrderString(
      {
        appId: 'alipay-app-id',
        merchantPrivateKeyPem: rsaKeys.privateKey,
        notifyUrl: 'https://api.example.com/callbacks/payment/alipay',
        now: () => new Date('2026-07-15T08:00:00.000Z'),
      },
      {
        paymentNo: 'PAY202607150001',
        amountCents: 76000,
        description: '订单 HY202607150001',
        expiresAtIso: '2026-07-15T08:15:00.000Z',
      },
    );
    const params = new URLSearchParams(orderString);
    const signature = params.get('sign');
    params.delete('sign');

    expect(params.get('method')).toBe('alipay.trade.app.pay');
    expect(signature).not.toBeNull();
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(createAlipaySignContent(params)),
        createPublicKey(rsaKeys.publicKey),
        Buffer.from(signature!, 'base64'),
      ),
    ).toBe(true);
  });

  it('verifies an Alipay payment callback and converts decimal yuan to cents', () => {
    const params = new URLSearchParams({
      app_id: 'alipay-app-id',
      seller_id: 'seller-1',
      notify_id: 'alipay-event-1',
      out_trade_no: 'PAY202607150001',
      trade_no: 'alipay-trade-1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '760.00',
      gmt_payment: '2026-07-15 16:00:00',
      sign_type: 'RSA2',
    });
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(createAlipaySignContent(params)),
      createPrivateKey(rsaKeys.privateKey),
    ).toString('base64');
    params.set('sign', signature);

    expect(
      verifyAlipayPaymentCallback(
        { headers: {}, rawBody: Buffer.from(params.toString()) },
        {
          alipayPublicKeyPem: rsaKeys.publicKey,
          expectedAppId: 'alipay-app-id',
          expectedSellerId: 'seller-1',
        },
      ),
    ).toMatchObject({
      eventId: 'alipay-event-1',
      paymentNo: 'PAY202607150001',
      providerTradeNo: 'alipay-trade-1',
      amountCents: 76000,
      status: 'succeeded',
    });
  });

  it('requests an Alipay refund with signed authoritative trade facts', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          alipay_trade_refund_response: {
            code: '10000',
            msg: 'Success',
            trade_no: 'alipay-trade-1',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const provider = new AlipayPaymentProvider({
      appId: 'alipay-app-id',
      sellerId: 'seller-1',
      merchantPrivateKeyPem: rsaKeys.privateKey,
      alipayPublicKeyPem: rsaKeys.publicKey,
      notifyUrl: 'https://api.example.com/callbacks/payment/alipay',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date('2026-07-15T08:00:00.000Z'),
    });

    await expect(
      provider.requestRefund({
        refundNo: 'RF-PAY202607150001',
        paymentNo: 'PAY202607150001',
        providerTradeNo: 'alipay-trade-1',
        amountCents: 73000,
        totalAmountCents: 76000,
        reason: 'order_cancelled',
      }),
    ).resolves.toEqual({
      providerRefundNo: 'alipay-trade-1',
      status: 'succeeded',
    });
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(String(request.body));
    const signature = params.get('sign');
    expect(params.get('method')).toBe('alipay.trade.refund');
    expect(JSON.parse(params.get('biz_content') ?? '{}')).toEqual({
      trade_no: 'alipay-trade-1',
      refund_amount: '730.00',
      refund_reason: 'order_cancelled',
      out_request_no: 'RF-PAY202607150001',
    });
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(createAlipaySignContent(params)),
        createPublicKey(rsaKeys.publicKey),
        Buffer.from(signature ?? '', 'base64'),
      ),
    ).toBe(true);
  });

  it('verifies an Alipay refund callback and converts refund yuan to cents', async () => {
    const params = new URLSearchParams({
      app_id: 'alipay-app-id',
      seller_id: 'seller-1',
      notify_id: 'alipay-refund-event-1',
      out_request_no: 'RF-PAY202607150001',
      trade_no: 'alipay-trade-1',
      refund_fee: '730.00',
      refund_status: 'REFUND_SUCCESS',
      gmt_refund: '2026-07-15 16:02:00',
      sign_type: 'RSA2',
    });
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(createAlipaySignContent(params)),
      createPrivateKey(rsaKeys.privateKey),
    ).toString('base64');
    params.set('sign', signature);
    const provider = new AlipayPaymentProvider({
      appId: 'alipay-app-id',
      sellerId: 'seller-1',
      merchantPrivateKeyPem: rsaKeys.privateKey,
      alipayPublicKeyPem: rsaKeys.publicKey,
      notifyUrl: 'https://api.example.com/callbacks/payment/alipay',
    });

    await expect(
      provider.verifyRefundCallback({
        headers: {},
        rawBody: Buffer.from(params.toString()),
      }),
    ).resolves.toEqual({
      eventId: 'alipay-refund-event-1',
      refundNo: 'RF-PAY202607150001',
      providerRefundNo: 'alipay-trade-1',
      amountCents: 73000,
      status: 'succeeded',
      occurredAtIso: '2026-07-15T08:02:00.000Z',
      rawPayloadHash: expect.any(String),
    });
  });
});

function encryptWechatResource(
  plaintext: string,
  apiV3Key: string,
  nonce: string,
  associatedData: string,
) {
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return encrypted.toString('base64');
}

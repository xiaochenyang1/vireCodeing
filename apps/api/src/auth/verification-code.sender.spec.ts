import {
  createVerificationCodeSenderFromEnv,
  DevelopmentVerificationCodeSender,
  WebhookVerificationCodeSender,
} from './verification-code.sender';

describe('VerificationCodeSender', () => {
  it('uses a development sender outside production without external SMS config', () => {
    const sender = createVerificationCodeSenderFromEnv({
      NODE_ENV: 'test',
    });

    expect(sender).toBeInstanceOf(DevelopmentVerificationCodeSender);
  });

  it('requires an explicit SMS provider in production', () => {
    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'production',
      }),
    ).toThrow('SMS_PROVIDER is required in production');
  });

  it('requires a secure webhook endpoint in production', () => {
    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'http://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'production-webhook-token',
      }),
    ).toThrow('SMS_WEBHOOK_URL must use https:// in production');
  });

  it('rejects invalid webhook timeout config', () => {
    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'test',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'test-webhook-token',
        SMS_WEBHOOK_TIMEOUT_MS: '0',
      }),
    ).toThrow('SMS_WEBHOOK_TIMEOUT_MS must be a positive integer');

    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'test',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'test-webhook-token',
        SMS_WEBHOOK_TIMEOUT_MS: '3.5',
      }),
    ).toThrow('SMS_WEBHOOK_TIMEOUT_MS must be a positive integer');
  });

  it('posts verification codes to the configured webhook provider', async () => {
    const fetchCalls: Array<{
      url: string;
      init: RequestInit;
    }> = [];
    const sender = new WebhookVerificationCodeSender(
      {
        endpointUrl: 'https://sms.example.com/send',
        bearerToken: 'production-webhook-token',
        timeoutMs: 5000,
      },
      async (url, init) => {
        fetchCalls.push({
          url: String(url),
          init,
        });

        return new Response(null, {
          status: 202,
        });
      },
    );

    await sender.sendCode({
      phone: '13800138000',
      purpose: 'login',
      code: '246810',
      expiresAt: new Date('2026-06-26T06:05:00.000Z'),
    });

    expect(fetchCalls).toEqual([
      {
        url: 'https://sms.example.com/send',
        init: expect.objectContaining({
          method: 'POST',
          headers: {
            authorization: 'Bearer production-webhook-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            phone: '13800138000',
            purpose: 'login',
            code: '246810',
            expiresAt: '2026-06-26T06:05:00.000Z',
          }),
          signal: expect.any(AbortSignal),
        }),
      },
    ]);
  });

  it('throws when the webhook responds with a non-ok status', async () => {
    const sender = new WebhookVerificationCodeSender(
      {
        endpointUrl: 'https://sms.example.com/send',
        bearerToken: 'production-webhook-token',
        timeoutMs: 5000,
      },
      async () => ({ ok: false, status: 503 }),
    );

    await expect(
      sender.sendCode({
        phone: '13800138000',
        purpose: 'login',
        code: '246810',
        expiresAt: new Date('2026-06-26T06:05:00.000Z'),
      }),
    ).rejects.toThrow('SMS webhook request failed with status 503');
  });

  it('the development sender resolves without sending anything', async () => {
    await expect(
      new DevelopmentVerificationCodeSender().sendCode(),
    ).resolves.toBeUndefined();
  });

  it('rejects an unsupported SMS provider', () => {
    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'test',
        SMS_PROVIDER: 'twilio',
      }),
    ).toThrow('SMS_PROVIDER must be webhook');
  });

  it('requires the webhook url and token when provider is webhook', () => {
    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'test',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_TOKEN: 'test-webhook-token',
      }),
    ).toThrow('SMS_WEBHOOK_URL is required when SMS_PROVIDER=webhook');

    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'test',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
      }),
    ).toThrow('SMS_WEBHOOK_TOKEN is required when SMS_PROVIDER=webhook');
  });

  it('enforces a minimum webhook token length in production', () => {
    expect(() =>
      createVerificationCodeSenderFromEnv({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'webhook',
        SMS_WEBHOOK_URL: 'https://sms.example.com/send',
        SMS_WEBHOOK_TOKEN: 'short-token',
      }),
    ).toThrow(
      'SMS_WEBHOOK_TOKEN must be at least 16 characters in production',
    );
  });

  it('builds a webhook sender with a default timeout when unset', () => {
    const sender = createVerificationCodeSenderFromEnv({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'webhook',
      SMS_WEBHOOK_URL: 'https://sms.example.com/send',
      SMS_WEBHOOK_TOKEN: 'production-webhook-token',
    });

    expect(sender).toBeInstanceOf(WebhookVerificationCodeSender);

    const senderWithTimeout = createVerificationCodeSenderFromEnv({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'webhook',
      SMS_WEBHOOK_URL: 'https://sms.example.com/send',
      SMS_WEBHOOK_TOKEN: 'production-webhook-token',
      SMS_WEBHOOK_TIMEOUT_MS: '8000',
    });

    expect(senderWithTimeout).toBeInstanceOf(WebhookVerificationCodeSender);
  });
});

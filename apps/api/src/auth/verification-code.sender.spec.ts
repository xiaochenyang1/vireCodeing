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
});

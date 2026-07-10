import type { VerificationPurpose } from './dto';

export type VerificationCodeMessage = {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  expiresAt: Date;
};

export interface VerificationCodeSender {
  sendCode(message: VerificationCodeMessage): Promise<void>;
}

export type WebhookVerificationCodeSenderConfig = {
  endpointUrl: string;
  bearerToken: string;
  timeoutMs: number;
};

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status'>>;

export class DevelopmentVerificationCodeSender
  implements VerificationCodeSender
{
  async sendCode(): Promise<void> {
    return undefined;
  }
}

export class WebhookVerificationCodeSender implements VerificationCodeSender {
  constructor(
    private readonly config: WebhookVerificationCodeSenderConfig,
    private readonly fetchFn: FetchLike = globalThis.fetch,
  ) {}

  async sendCode(message: VerificationCodeMessage): Promise<void> {
    const response = await this.fetchFn(this.config.endpointUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.bearerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        phone: message.phone,
        purpose: message.purpose,
        code: message.code,
        expiresAt: message.expiresAt.toISOString(),
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `SMS webhook request failed with status ${response.status}`,
      );
    }
  }
}

export function createVerificationCodeSenderFromEnv(
  env: NodeJS.ProcessEnv,
): VerificationCodeSender {
  const provider = env.SMS_PROVIDER;

  if (!provider) {
    if (env.NODE_ENV === 'production') {
      throw new Error('SMS_PROVIDER is required in production');
    }

    return new DevelopmentVerificationCodeSender();
  }

  if (provider !== 'webhook') {
    throw new Error('SMS_PROVIDER must be webhook');
  }

  const endpointUrl = requireEnv(env.SMS_WEBHOOK_URL, 'SMS_WEBHOOK_URL');
  const bearerToken = requireEnv(env.SMS_WEBHOOK_TOKEN, 'SMS_WEBHOOK_TOKEN');
  const timeoutMs = parsePositiveInteger(
    env.SMS_WEBHOOK_TIMEOUT_MS,
    5000,
    'SMS_WEBHOOK_TIMEOUT_MS',
  );

  if (env.NODE_ENV === 'production' && !endpointUrl.startsWith('https://')) {
    throw new Error('SMS_WEBHOOK_URL must use https:// in production');
  }

  if (env.NODE_ENV === 'production' && bearerToken.length < 16) {
    throw new Error(
      'SMS_WEBHOOK_TOKEN must be at least 16 characters in production',
    );
  }

  return new WebhookVerificationCodeSender({
    endpointUrl,
    bearerToken,
    timeoutMs,
  });
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required when SMS_PROVIDER=webhook`);
  }

  return value;
}

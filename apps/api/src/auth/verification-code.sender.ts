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
  /** Number of retry attempts on transient failures (default 2) */
  retryCount?: number;
  /** Base delay in ms between retries (default 1000) */
  retryBaseDelayMs?: number;
};

type FetchLikeResponse = Pick<Response, 'ok' | 'status'> &
  Partial<Pick<Response, 'text'>>;

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<FetchLikeResponse>;

type ResolvedWebhookVerificationCodeSenderConfig = Omit<
  WebhookVerificationCodeSenderConfig,
  'retryCount' | 'retryBaseDelayMs'
> & {
  retryCount: number;
  retryBaseDelayMs: number;
};

export class DevelopmentVerificationCodeSender
  implements VerificationCodeSender
{
  async sendCode(_message: VerificationCodeMessage): Promise<void> {
    // Development mode: SMS is not sent, code is returned in the API response
    return undefined;
  }
}

export class MockSmsVerificationCodeSender implements VerificationCodeSender {
  constructor(
    private readonly config: {
      /** Simulated delivery delay in ms (default 300) */
      delayMs: number;
      /** Simulated failure rate 0..1 (default 0, never fails) */
      failureRate: number;
    } = { delayMs: 300, failureRate: 0 },
  ) {}

  async sendCode(message: VerificationCodeMessage): Promise<void> {
    await new Promise<void>(resolve =>
      setTimeout(resolve, this.config.delayMs),
    );

    const shouldFail = Math.random() < this.config.failureRate;
    if (shouldFail) {
      throw new Error(
        `Mock SMS delivery failed for ${message.phone} (simulated failure)`,
      );
    }

    // In mock mode, log the code so developers can see it in console
    // eslint-disable-next-line no-console
    console.log(
      `[MockSMS] To: ${message.phone} | Code: ${message.code} | Purpose: ${message.purpose} | Expires: ${message.expiresAt.toISOString()}`,
    );
  }
}

export class WebhookVerificationCodeSender implements VerificationCodeSender {
  private readonly config: ResolvedWebhookVerificationCodeSenderConfig;

  constructor(
    config: WebhookVerificationCodeSenderConfig,
    private readonly fetchFn: FetchLike = globalThis.fetch,
  ) {
    this.config = {
      ...config,
      retryCount: config.retryCount ?? 2,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 1000,
    };
  }

  async sendCode(message: VerificationCodeMessage): Promise<void> {
    const lastError = await this.sendWithRetry(message);

    if (lastError) {
      throw new Error(
        `SMS delivery failed after ${this.config.retryCount} retries: ${lastError.message}`,
      );
    }
  }

  private async sendWithRetry(
    message: VerificationCodeMessage,
    attempt = 0,
  ): Promise<Error | null> {
    try {
      await this.sendOnce(message);
      return null;
    } catch (error) {
      const isLastAttempt = attempt >= this.config.retryCount;
      const isTransient = this.isTransientError(error);

      if (isLastAttempt || !isTransient) {
        return error instanceof Error ? error : new Error(String(error));
      }

      const delay =
        this.config.retryBaseDelayMs * 2 ** attempt +
        Math.random() * 100;
      // eslint-disable-next-line no-console
      console.warn(
        `[SMS] Retry ${attempt + 1}/${this.config.retryCount} after ${Math.round(delay)}ms for ${message.phone}: ${error instanceof Error ? error.message : error}`,
      );
      await new Promise<void>(resolve => setTimeout(resolve, delay));
      return this.sendWithRetry(message, attempt + 1);
    }
  }

  private async sendOnce(message: VerificationCodeMessage): Promise<void> {
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
      const responseText = await this.safeReadResponseText(response);
      throw new Error(
        `SMS webhook request failed with status ${response.status}: ${responseText}`,
      );
    }
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof TypeError) {
      return true; // network errors are transient
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // 5xx server errors and network timeouts are transient
      if (message.includes('failed with status 5')) {
        return true;
      }
      if (message.includes('network') || message.includes('timeout')) {
        return true;
      }
    }

    return false;
  }

  private async safeReadResponseText(
    response: FetchLikeResponse,
  ): Promise<string> {
    if (typeof response.text !== 'function') {
      return '(response body unavailable)';
    }

    try {
      return await response.text();
    } catch {
      return '(unable to read response body)';
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

  if (provider === 'mock') {
    return new MockSmsVerificationCodeSender({
      delayMs: Number(env.SMS_MOCK_DELAY_MS ?? 300),
      failureRate: Number(env.SMS_MOCK_FAILURE_RATE ?? 0),
    });
  }

  if (provider !== 'webhook') {
    throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
  }

  const endpointUrl = requireEnv(env.SMS_WEBHOOK_URL, 'SMS_WEBHOOK_URL');
  const bearerToken = requireEnv(env.SMS_WEBHOOK_TOKEN, 'SMS_WEBHOOK_TOKEN');
  const timeoutMs = parsePositiveInteger(
    env.SMS_WEBHOOK_TIMEOUT_MS,
    5000,
    'SMS_WEBHOOK_TIMEOUT_MS',
  );
  const retryCount = parseNonNegativeInteger(
    env.SMS_WEBHOOK_RETRY_COUNT,
    2,
    'SMS_WEBHOOK_RETRY_COUNT',
  );
  const retryBaseDelayMs = parsePositiveInteger(
    env.SMS_WEBHOOK_RETRY_BASE_DELAY_MS,
    1000,
    'SMS_WEBHOOK_RETRY_BASE_DELAY_MS',
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
    retryCount,
    retryBaseDelayMs,
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

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required when SMS_PROVIDER=webhook`);
  }

  return value;
}

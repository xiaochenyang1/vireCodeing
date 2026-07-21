import type { PushProvider, PushSendInput, PushSendResult } from './push-provider';

export class SandboxPushProvider implements PushProvider {
  readonly channel = 'sandbox' as const;

  async send(input: PushSendInput): Promise<PushSendResult> {
    return {
      channel: this.channel,
      status: 'succeeded',
      providerMessageId: `sandbox-push-${input.userId}-${Buffer.from(
        input.title,
      )
        .toString('base64url')
        .slice(0, 12)}`,
    };
  }
}

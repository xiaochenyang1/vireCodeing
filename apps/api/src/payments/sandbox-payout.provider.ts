import type {
  PayoutProvider,
  PayoutRequest,
  PayoutResult,
} from './payout-provider';

export class SandboxPayoutProvider implements PayoutProvider {
  readonly channel = 'sandbox' as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async executePayout(input: PayoutRequest): Promise<PayoutResult> {
    return {
      channel: this.channel,
      providerPayoutNo: `sandbox-payout-${input.withdrawalId}`,
      status: 'succeeded',
      executedAtIso: this.now().toISOString(),
    };
  }
}

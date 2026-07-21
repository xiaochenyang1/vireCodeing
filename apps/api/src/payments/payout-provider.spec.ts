import { SandboxPayoutProvider } from './sandbox-payout.provider';

describe('SandboxPayoutProvider', () => {
  it('returns a deterministic sandbox payout number for a withdrawal', async () => {
    const provider = new SandboxPayoutProvider(
      () => new Date('2026-07-21T10:00:00.000Z'),
    );

    await expect(
      provider.executePayout({
        withdrawalId: 'withdrawal-1',
        driverId: 'driver-1',
        amountCents: 10000,
        bankAccountName: '李师傅',
        bankName: '招商银行',
        bankAccountMasked: '****1234',
      }),
    ).resolves.toEqual({
      channel: 'sandbox',
      providerPayoutNo: 'sandbox-payout-withdrawal-1',
      status: 'succeeded',
      executedAtIso: '2026-07-21T10:00:00.000Z',
    });
  });
});

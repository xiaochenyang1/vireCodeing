export type PayoutProviderChannel = 'sandbox';

export type PayoutRequest = {
  withdrawalId: string;
  driverId: string;
  amountCents: number;
  bankAccountName: string;
  bankName: string;
  bankAccountMasked: string;
};

export type PayoutResult = {
  channel: PayoutProviderChannel;
  providerPayoutNo: string;
  status: 'succeeded';
  executedAtIso: string;
};

export interface PayoutProvider {
  readonly channel: PayoutProviderChannel;
  executePayout(input: PayoutRequest): Promise<PayoutResult>;
}

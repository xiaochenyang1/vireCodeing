export type PushSendInput = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushSendResult = {
  channel: 'sandbox';
  status: 'succeeded' | 'skipped';
  providerMessageId?: string;
};

export interface PushProvider {
  readonly channel: 'sandbox';
  send(input: PushSendInput): Promise<PushSendResult>;
}

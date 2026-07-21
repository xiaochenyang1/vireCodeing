export type InboxMessageCategory =
  | 'order'
  | 'system'
  | 'service'
  | 'finance';

export type InboxMessageAudience = 'shipper' | 'driver' | 'admin';

export type InboxMessageRecord = {
  id: string;
  userId: string;
  audience: InboxMessageAudience;
  category: InboxMessageCategory;
  title: string;
  content: string;
  orderId?: string;
  orderNo?: string;
  referenceType?: string;
  referenceId?: string;
  unread: boolean;
  readAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type InboxMessageListQuery = {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
  category?: InboxMessageCategory;
};

export type InboxMessageListResult = {
  items: InboxMessageRecord[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

export type CreateInboxMessageInput = {
  userId: string;
  audience: InboxMessageAudience;
  category: InboxMessageCategory;
  title: string;
  content: string;
  orderId?: string;
  orderNo?: string;
  referenceType?: string;
  referenceId?: string;
};

export type PushDeliveryAttemptRecord = {
  id: string;
  messageId: string;
  channel: string;
  status: 'succeeded' | 'skipped' | 'failed';
  providerMessageId?: string;
  errorMessage?: string;
  createdAtIso: string;
};

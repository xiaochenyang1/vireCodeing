import { randomUUID } from 'crypto';
import type {
  CreateInboxMessageInput,
  InboxMessageListQuery,
  InboxMessageListResult,
  InboxMessageRecord,
  PushDeliveryAttemptRecord,
} from './dto';

export interface NotificationsRepository {
  createMessage(input: CreateInboxMessageInput): Promise<InboxMessageRecord>;
  listMessages(
    userId: string,
    query: InboxMessageListQuery,
  ): Promise<InboxMessageListResult>;
  markMessageRead(
    userId: string,
    messageId: string,
  ): Promise<InboxMessageRecord | 'not-found'>;
  markAllMessagesRead(userId: string): Promise<{ updatedCount: number }>;
  createPushAttempt(input: {
    messageId: string;
    channel: string;
    status: PushDeliveryAttemptRecord['status'];
    providerMessageId?: string;
    errorMessage?: string;
  }): Promise<PushDeliveryAttemptRecord>;
}

export class InMemoryNotificationsRepository
  implements NotificationsRepository
{
  private readonly messages: InboxMessageRecord[] = [];
  private readonly pushAttempts: PushDeliveryAttemptRecord[] = [];
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async createMessage(input: CreateInboxMessageInput) {
    const nowIso = this.now().toISOString();
    const record: InboxMessageRecord = {
      id: this.createId(),
      userId: input.userId,
      audience: input.audience,
      category: input.category,
      title: input.title,
      content: input.content,
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.orderNo ? { orderNo: input.orderNo } : {}),
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      unread: true,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.messages.unshift(record);
    return structuredClone(record);
  }

  async listMessages(userId: string, query: InboxMessageListQuery) {
    const filtered = this.messages
      .filter(item => item.userId === userId)
      .filter(item => (query.unreadOnly ? item.unread : true))
      .filter(item =>
        query.category ? item.category === query.category : true,
      )
      .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);
    const unreadCount = this.messages.filter(
      item => item.userId === userId && item.unread,
    ).length;

    return {
      items: structuredClone(items),
      page: query.page,
      pageSize: query.pageSize,
      total: filtered.length,
      unreadCount,
    };
  }

  async markMessageRead(userId: string, messageId: string) {
    const message = this.messages.find(
      item => item.id === messageId && item.userId === userId,
    );
    if (!message) {
      return 'not-found';
    }

    const nowIso = this.now().toISOString();
    message.unread = false;
    message.readAtIso = nowIso;
    message.updatedAtIso = nowIso;
    return structuredClone(message);
  }

  async markAllMessagesRead(userId: string) {
    const nowIso = this.now().toISOString();
    let updatedCount = 0;
    for (const message of this.messages) {
      if (message.userId === userId && message.unread) {
        message.unread = false;
        message.readAtIso = nowIso;
        message.updatedAtIso = nowIso;
        updatedCount += 1;
      }
    }
    return { updatedCount };
  }

  async createPushAttempt(input: {
    messageId: string;
    channel: string;
    status: PushDeliveryAttemptRecord['status'];
    providerMessageId?: string;
    errorMessage?: string;
  }) {
    const record: PushDeliveryAttemptRecord = {
      id: this.createId(),
      messageId: input.messageId,
      channel: input.channel,
      status: input.status,
      ...(input.providerMessageId
        ? { providerMessageId: input.providerMessageId }
        : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      createdAtIso: this.now().toISOString(),
    };
    this.pushAttempts.push(record);
    return structuredClone(record);
  }
}

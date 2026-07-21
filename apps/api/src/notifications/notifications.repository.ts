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

type PrismaInboxMessageRow = {
  id: string;
  userId: string;
  audience: InboxMessageRecord['audience'];
  category: InboxMessageRecord['category'];
  title: string;
  content: string;
  orderId: string | null;
  orderNo: string | null;
  referenceType: string | null;
  referenceId: string | null;
  unread: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaPushAttemptRow = {
  id: string;
  messageId: string;
  channel: string;
  status: PushDeliveryAttemptRecord['status'];
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

export type PrismaNotificationsClient = {
  inboxMessage: {
    create(args: {
      data: {
        userId: string;
        audience: InboxMessageRecord['audience'];
        category: InboxMessageRecord['category'];
        title: string;
        content: string;
        orderId?: string | null;
        orderNo?: string | null;
        referenceType?: string | null;
        referenceId?: string | null;
        unread?: boolean;
      };
    }): Promise<PrismaInboxMessageRow>;
    findMany(args: {
      where: {
        userId: string;
        unread?: boolean;
        category?: InboxMessageRecord['category'];
      };
      orderBy: { createdAt: 'desc' };
      skip: number;
      take: number;
    }): Promise<PrismaInboxMessageRow[]>;
    count(args: {
      where: {
        userId: string;
        unread?: boolean;
        category?: InboxMessageRecord['category'];
      };
    }): Promise<number>;
    findFirst(args: {
      where: { id: string; userId: string };
    }): Promise<PrismaInboxMessageRow | null>;
    update(args: {
      where: { id: string };
      data: {
        unread: boolean;
        readAt: Date;
        updatedAt: Date;
      };
    }): Promise<PrismaInboxMessageRow>;
    updateMany(args: {
      where: { userId: string; unread: boolean };
      data: {
        unread: boolean;
        readAt: Date;
        updatedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
  pushDeliveryAttempt: {
    create(args: {
      data: {
        messageId: string;
        channel: string;
        status: PushDeliveryAttemptRecord['status'];
        providerMessageId?: string | null;
        errorMessage?: string | null;
      };
    }): Promise<PrismaPushAttemptRow>;
  };
};

export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaNotificationsClient) {}

  async createMessage(input: CreateInboxMessageInput) {
    const record = await this.prisma.inboxMessage.create({
      data: {
        userId: input.userId,
        audience: input.audience,
        category: input.category,
        title: input.title,
        content: input.content,
        orderId: input.orderId ?? null,
        orderNo: input.orderNo ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        unread: true,
      },
    });
    return mapInboxMessage(record);
  }

  async listMessages(userId: string, query: InboxMessageListQuery) {
    const where = {
      userId,
      ...(query.unreadOnly ? { unread: true } : {}),
      ...(query.category ? { category: query.category } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.inboxMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inboxMessage.count({ where }),
      this.prisma.inboxMessage.count({
        where: { userId, unread: true },
      }),
    ]);

    return {
      items: items.map(mapInboxMessage),
      page: query.page,
      pageSize: query.pageSize,
      total,
      unreadCount,
    };
  }

  async markMessageRead(userId: string, messageId: string) {
    const existing = await this.prisma.inboxMessage.findFirst({
      where: { id: messageId, userId },
    });
    if (!existing) {
      return 'not-found';
    }

    if (!existing.unread) {
      return mapInboxMessage(existing);
    }

    const now = new Date();
    const updated = await this.prisma.inboxMessage.update({
      where: { id: messageId },
      data: {
        unread: false,
        readAt: now,
        updatedAt: now,
      },
    });
    return mapInboxMessage(updated);
  }

  async markAllMessagesRead(userId: string) {
    const result = await this.prisma.inboxMessage.updateMany({
      where: { userId, unread: true },
      data: {
        unread: false,
        readAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return { updatedCount: result.count };
  }

  async createPushAttempt(input: {
    messageId: string;
    channel: string;
    status: PushDeliveryAttemptRecord['status'];
    providerMessageId?: string;
    errorMessage?: string;
  }) {
    const record = await this.prisma.pushDeliveryAttempt.create({
      data: {
        messageId: input.messageId,
        channel: input.channel,
        status: input.status,
        providerMessageId: input.providerMessageId ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });

    return {
      id: record.id,
      messageId: record.messageId,
      channel: record.channel,
      status: record.status,
      ...(record.providerMessageId
        ? { providerMessageId: record.providerMessageId }
        : {}),
      ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
      createdAtIso: record.createdAt.toISOString(),
    };
  }
}

function mapInboxMessage(record: PrismaInboxMessageRow): InboxMessageRecord {
  return {
    id: record.id,
    userId: record.userId,
    audience: record.audience,
    category: record.category,
    title: record.title,
    content: record.content,
    ...(record.orderId ? { orderId: record.orderId } : {}),
    ...(record.orderNo ? { orderNo: record.orderNo } : {}),
    ...(record.referenceType ? { referenceType: record.referenceType } : {}),
    ...(record.referenceId ? { referenceId: record.referenceId } : {}),
    unread: record.unread,
    ...(record.readAt ? { readAtIso: record.readAt.toISOString() } : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

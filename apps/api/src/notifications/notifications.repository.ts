import { randomUUID } from 'crypto';
import type {
  CreateInboxMessageInput,
  DevicePushTokenRecord,
  InboxMessageListQuery,
  InboxMessageListResult,
  InboxMessageRecord,
  PushDeliveryAttemptRecord,
  RegisterDeviceTokenInput,
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
  registerDeviceToken(
    userId: string,
    input: RegisterDeviceTokenInput,
  ): Promise<DevicePushTokenRecord>;
  listActiveDevicePushTokens(
    userId: string,
  ): Promise<DevicePushTokenRecord[]>;
  deactivateDevicePushToken(userId: string, token: string): Promise<boolean>;
}

export class InMemoryNotificationsRepository
  implements NotificationsRepository
{
  private readonly messages: InboxMessageRecord[] = [];
  private readonly pushAttempts: PushDeliveryAttemptRecord[] = [];
  private readonly deviceTokens: DevicePushTokenRecord[] = [];
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

  async registerDeviceToken(
    userId: string,
    input: RegisterDeviceTokenInput,
  ): Promise<DevicePushTokenRecord> {
    const existing = this.deviceTokens.find(
      item => item.userId === userId && item.token === input.pushToken,
    );
    if (existing) {
      existing.deviceId = input.deviceId;
      existing.isActive = true;
      existing.lastUsedAtIso = this.now().toISOString();
      existing.updatedAtIso = this.now().toISOString();
      return structuredClone(existing);
    }

    // Deactivate other tokens for this user on the same device
    const sameDevice = this.deviceTokens.filter(
      item => item.userId === userId && item.deviceId === input.deviceId && item.isActive,
    );
    for (const item of sameDevice) {
      item.isActive = false;
      item.updatedAtIso = this.now().toISOString();
    }

    const record: DevicePushTokenRecord = {
      id: this.createId(),
      userId,
      token: input.pushToken,
      platform: input.platform,
      deviceId: input.deviceId,
      isActive: true,
      lastUsedAtIso: this.now().toISOString(),
      createdAtIso: this.now().toISOString(),
      updatedAtIso: this.now().toISOString(),
    };
    this.deviceTokens.push(record);
    return structuredClone(record);
  }

  async listActiveDevicePushTokens(
    userId: string,
  ): Promise<DevicePushTokenRecord[]> {
    return this.deviceTokens
      .filter(item => item.userId === userId && item.isActive)
      .map(item => structuredClone(item));
  }

  async deactivateDevicePushToken(
    userId: string,
    token: string,
  ): Promise<boolean> {
    const item = this.deviceTokens.find(
      item => item.userId === userId && item.token === token,
    );
    if (!item || !item.isActive) {
      return false;
    }
    item.isActive = false;
    item.updatedAtIso = this.now().toISOString();
    return true;
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

type PrismaDevicePushTokenRow = {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  devicePushToken: {
    create(args: {
      data: {
        userId: string;
        token: string;
        platform: 'ios' | 'android';
        deviceId: string;
        isActive?: boolean;
        lastUsedAt?: Date | null;
      };
    }): Promise<PrismaDevicePushTokenRow>;
    findMany(args: {
      where: { userId: string; isActive: boolean };
      orderBy: { createdAt: 'desc' };
    }): Promise<PrismaDevicePushTokenRow[]>;
    findFirst(args: {
      where: { userId: string; token: string };
    }): Promise<PrismaDevicePushTokenRow | null>;
    update(args: {
      where: { id: string };
      data: {
        deviceId?: string;
        isActive: boolean;
        lastUsedAt?: Date;
        updatedAt: Date;
      };
    }): Promise<PrismaDevicePushTokenRow>;
    updateMany(args: {
      where: { userId: string; deviceId: string; isActive: boolean };
      data: { isActive: boolean; updatedAt: Date };
    }): Promise<{ count: number }>;
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

  async registerDeviceToken(
    userId: string,
    input: RegisterDeviceTokenInput,
  ): Promise<DevicePushTokenRecord> {
    const existing = await this.prisma.devicePushToken.findFirst({
      where: { userId, token: input.pushToken },
    });

    if (existing) {
      const updated = await this.prisma.devicePushToken.update({
        where: { id: existing.id },
        data: {
          deviceId: input.deviceId,
          isActive: true,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return mapDevicePushToken(updated);
    }

    // Deactivate other tokens on the same device
    await this.prisma.devicePushToken.updateMany({
      where: { userId, deviceId: input.deviceId, isActive: true },
      data: { isActive: false, updatedAt: new Date() },
    });

    const record = await this.prisma.devicePushToken.create({
      data: {
        userId,
        token: input.pushToken,
        platform: input.platform,
        deviceId: input.deviceId,
        isActive: true,
      },
    });
    return mapDevicePushToken(record);
  }

  async listActiveDevicePushTokens(
    userId: string,
  ): Promise<DevicePushTokenRecord[]> {
    const records = await this.prisma.devicePushToken.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapDevicePushToken);
  }

  async deactivateDevicePushToken(
    userId: string,
    token: string,
  ): Promise<boolean> {
    const existing = await this.prisma.devicePushToken.findFirst({
      where: { userId, token },
    });
    if (!existing || !existing.isActive) {
      return false;
    }
    await this.prisma.devicePushToken.update({
      where: { id: existing.id },
      data: { isActive: false, updatedAt: new Date() },
    });
    return true;
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

function mapDevicePushToken(record: PrismaDevicePushTokenRow): DevicePushTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    token: record.token,
    platform: record.platform,
    deviceId: record.deviceId,
    isActive: record.isActive,
    ...(record.lastUsedAt ? { lastUsedAtIso: record.lastUsedAt.toISOString() } : {}),
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

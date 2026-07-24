import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  CreateInboxMessageInput,
  DevicePushTokenRecord,
  InboxMessageAudience,
  InboxMessageCategory,
  InboxMessageListQuery,
  InboxMessageRecord,
  RegisterDeviceTokenInput,
} from './dto';
import type { NotificationsRepository } from './notifications.repository';
import type { PushProvider } from './push-provider';

export type NotifyOrderEventInput = {
  event:
    | 'order_created'
    | 'driver_quote_submitted'
    | 'driver_accepted'
    | 'status_advanced'
    | 'completed'
    | 'cancelled'
    | 'payment_escrowed'
    | 'refund_succeeded'
    | 'settlement_closed';
  orderId: string;
  orderNo: string;
  shipperId: string;
  driverId?: string | null;
  nextStatus?: string;
  quoteCents?: number;
  arrivalText?: string;
  amountCents?: number;
};

export type NotifyExceptionEventInput = {
  event:
    | 'exception_case_created'
    | 'exception_case_resolved'
    | 'exception_compensation_executed'
    | 'exception_appeal_requested';
  caseId: string;
  caseNo?: string;
  orderId: string;
  orderNo: string;
  shipperId: string;
  driverId?: string | null;
  compensationTargetRole?: 'shipper' | 'driver' | null;
  actorRole?: 'shipper' | 'driver';
};

export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly pushProvider: PushProvider,
  ) {}

  async listMessages(userId: string, query: InboxMessageListQuery) {
    return this.repository.listMessages(userId, query);
  }

  async markMessageRead(userId: string, messageId: string) {
    const result = await this.repository.markMessageRead(userId, messageId);
    if (result === 'not-found') {
      throw new BusinessError(ApiErrorCode.MESSAGE_NOT_FOUND, '消息不存在');
    }
    return result;
  }

  async markAllMessagesRead(userId: string) {
    return this.repository.markAllMessagesRead(userId);
  }

  async registerDeviceToken(
    userId: string,
    input: RegisterDeviceTokenInput,
  ): Promise<DevicePushTokenRecord> {
    const normalizedInput: RegisterDeviceTokenInput = {
      pushToken: input.pushToken.trim(),
      platform: input.platform,
      deviceId: input.deviceId.trim(),
    };

    if (normalizedInput.pushToken.length === 0) {
      throw new BusinessError(
        ApiErrorCode.PUSH_TOKEN_INVALID,
        '推送令牌不能为空',
      );
    }

    if (normalizedInput.deviceId.length === 0) {
      throw new BusinessError(
        ApiErrorCode.DEVICE_ID_INVALID,
        '设备 ID 不能为空',
      );
    }

    return this.repository.registerDeviceToken(userId, normalizedInput);
  }

  async listDevicePushTokens(userId: string): Promise<DevicePushTokenRecord[]> {
    return this.repository.listActiveDevicePushTokens(userId);
  }

  async deactivateDevicePushToken(
    userId: string,
    token: string,
  ): Promise<boolean> {
    return this.repository.deactivateDevicePushToken(userId, token);
  }

  async createAndPush(input: CreateInboxMessageInput): Promise<InboxMessageRecord> {
    const message = await this.repository.createMessage(input);

    try {
      const pushResult = await this.pushProvider.send({
        userId: input.userId,
        title: input.title,
        body: input.content,
        data: {
          ...(input.orderId ? { orderId: input.orderId } : {}),
          ...(input.orderNo ? { orderNo: input.orderNo } : {}),
          ...(input.referenceType ? { referenceType: input.referenceType } : {}),
          ...(input.referenceId ? { referenceId: input.referenceId } : {}),
          category: input.category,
        },
      });

      await this.repository.createPushAttempt({
        messageId: message.id,
        channel: pushResult.channel,
        status: pushResult.status,
        ...(pushResult.providerMessageId
          ? { providerMessageId: pushResult.providerMessageId }
          : {}),
      });
    } catch (error) {
      await this.repository.createPushAttempt({
        messageId: message.id,
        channel: this.pushProvider.channel,
        status: 'failed',
        errorMessage:
          error instanceof Error ? error.message : 'push delivery failed',
      });
    }

    return message;
  }

  async notifyOrderEvent(input: NotifyOrderEventInput) {
    const recipients = buildOrderEventRecipients(input).filter(
      recipient => Boolean(recipient.userId),
    );
    for (const recipient of recipients) {
      await this.createAndPush({
        userId: recipient.userId,
        audience: recipient.audience,
        category: 'order',
        title: recipient.title,
        content: recipient.content,
        orderId: input.orderId,
        orderNo: input.orderNo,
        referenceType: 'order_event',
        referenceId: `${input.event}:${input.orderId}:${recipient.audience}`,
      });
    }
  }

  async notifyExceptionEvent(input: NotifyExceptionEventInput) {
    const recipients = buildExceptionEventRecipients(input).filter(
      recipient => Boolean(recipient.userId),
    );
    for (const recipient of recipients) {
      await this.createAndPush({
        userId: recipient.userId,
        audience: recipient.audience,
        category: recipient.category,
        title: recipient.title,
        content: recipient.content,
        orderId: input.orderId,
        orderNo: input.orderNo,
        referenceType: 'exception_case',
        referenceId: `${input.event}:${input.caseId}:${recipient.audience}`,
      });
    }
  }
}

type RecipientMessage = {
  userId: string;
  audience: InboxMessageAudience;
  title: string;
  content: string;
  category?: InboxMessageCategory;
};

function buildOrderEventRecipients(
  input: NotifyOrderEventInput,
): Array<Required<Pick<RecipientMessage, 'userId' | 'audience' | 'title' | 'content'>>> {
  const orderLabel = input.orderNo || input.orderId;
  const statusLabel = formatOrderStatus(input.nextStatus);

  switch (input.event) {
    case 'order_created':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '订单发布成功',
          content: `订单 ${orderLabel} 已发布，等待司机接单。`,
        },
      ];
    case 'driver_quote_submitted': {
      const quoteLabel =
        typeof input.quoteCents === 'number' && input.quoteCents > 0
          ? `报价 ${(input.quoteCents / 100).toFixed(input.quoteCents % 100 === 0 ? 0 : 2)} 元`
          : '新报价';
      const arrivalLabel = input.arrivalText?.trim()
        ? `，${input.arrivalText.trim()}`
        : '';

      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '收到司机报价',
          content: `订单 ${orderLabel} 收到司机${quoteLabel}${arrivalLabel}，可在订单详情选择报价。`,
        },
      ];
    }
    case 'driver_accepted':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '司机已接单',
          content: `订单 ${orderLabel} 已被司机接单，请关注装货进度。`,
        },
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                title: '接单成功',
                content: `你已成功接单 ${orderLabel}，请按时前往装货。`,
              },
            ]
          : []),
      ];
    case 'status_advanced':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '订单状态更新',
          content: `订单 ${orderLabel} 状态已更新为${statusLabel}。`,
        },
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                title: '订单状态更新',
                content: `订单 ${orderLabel} 状态已更新为${statusLabel}。`,
              },
            ]
          : []),
      ];
    case 'completed':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '订单已完成',
          content: `订单 ${orderLabel} 已完成，欢迎评价本次服务。`,
        },
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                title: '订单已完成',
                content: `订单 ${orderLabel} 已完成，收入将进入结算流程。`,
              },
            ]
          : []),
      ];
    case 'cancelled':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '订单已取消',
          content: `订单 ${orderLabel} 已取消。`,
        },
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                title: '订单已取消',
                content: `订单 ${orderLabel} 已取消，请停止继续执行。`,
              },
            ]
          : []),
      ];
    case 'payment_escrowed':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '支付资金已托管',
          content: `订单 ${orderLabel} 支付成功，资金已托管${formatAmountSuffix(
            input.amountCents,
          )}。`,
        },
      ];
    case 'refund_succeeded':
      return [
        {
          userId: input.shipperId,
          audience: 'shipper',
          title: '退款已到账',
          content: `订单 ${orderLabel} 退款成功${formatAmountSuffix(
            input.amountCents,
          )}。`,
        },
      ];
    case 'settlement_closed':
      return [
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                title: '订单收入已结算',
                content: `订单 ${orderLabel} 已完成结算${formatAmountSuffix(
                  input.amountCents,
                )}，可在收入明细中查看。`,
              },
            ]
          : []),
      ];
  }
}

function buildExceptionEventRecipients(
  input: NotifyExceptionEventInput,
): Array<
  Required<Pick<RecipientMessage, 'userId' | 'audience' | 'title' | 'content'>> & {
    category: InboxMessageCategory;
  }
> {
  const orderLabel = input.orderNo || input.orderId;
  const caseLabel = input.caseNo || input.caseId;

  switch (input.event) {
    case 'exception_case_created':
      return uniqueRecipients([
        {
          userId: input.shipperId,
          audience: 'shipper',
          category: 'service',
          title: '异常工单已创建',
          content: `订单 ${orderLabel} 的异常工单 ${caseLabel} 已创建，客服将跟进处理。`,
        },
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                category: 'service' as const,
                title: '异常工单已创建',
                content: `订单 ${orderLabel} 的异常工单 ${caseLabel} 已创建，请配合处理。`,
              },
            ]
          : []),
      ]);
    case 'exception_case_resolved':
      return uniqueRecipients([
        {
          userId: input.shipperId,
          audience: 'shipper',
          category: 'service',
          title: '异常工单已解决',
          content: `订单 ${orderLabel} 的异常工单 ${caseLabel} 已解决。`,
        },
        ...(input.driverId
          ? [
              {
                userId: input.driverId,
                audience: 'driver' as const,
                category: 'service' as const,
                title: '异常工单已解决',
                content: `订单 ${orderLabel} 的异常工单 ${caseLabel} 已解决。`,
              },
            ]
          : []),
      ]);
    case 'exception_compensation_executed': {
      const targetRole = input.compensationTargetRole;
      if (targetRole === 'driver' && input.driverId) {
        return [
          {
            userId: input.driverId,
            audience: 'driver',
            category: 'finance',
            title: '异常赔付已执行',
            content: `订单 ${orderLabel} 的异常赔付已执行到账。`,
          },
        ];
      }
      if (targetRole === 'shipper') {
        return [
          {
            userId: input.shipperId,
            audience: 'shipper',
            category: 'finance',
            title: '异常赔付已执行',
            content: `订单 ${orderLabel} 的异常赔付已执行，请关注账户变动。`,
          },
        ];
      }
      return [];
    }
    case 'exception_appeal_requested': {
      const actorRole = input.actorRole;
      if (actorRole === 'shipper' && input.driverId) {
        return [
          {
            userId: input.driverId,
            audience: 'driver',
            category: 'service',
            title: '异常工单申诉已提交',
            content: `订单 ${orderLabel} 的异常工单 ${caseLabel} 已发起申诉。`,
          },
        ];
      }
      if (actorRole === 'driver') {
        return [
          {
            userId: input.shipperId,
            audience: 'shipper',
            category: 'service',
            title: '异常工单申诉已提交',
            content: `订单 ${orderLabel} 的异常工单 ${caseLabel} 已发起申诉。`,
          },
        ];
      }
      return [];
    }
  }
}

function uniqueRecipients<T extends { userId: string; audience: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.audience}:${item.userId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatAmountSuffix(amountCents?: number) {
  if (
    typeof amountCents !== 'number' ||
    !Number.isFinite(amountCents) ||
    amountCents <= 0
  ) {
    return '';
  }

  const yuan = amountCents / 100;
  const amountText =
    amountCents % 100 === 0 ? String(yuan) : yuan.toFixed(2);
  return `，金额 ${amountText} 元`;
}

function formatOrderStatus(status?: string) {
  switch (status) {
    case 'waiting':
      return '待接单';
    case 'loading':
      return '待装货';
    case 'transporting':
      return '运输中';
    case 'confirming':
      return '待确认';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return status || '进行中';
  }
}

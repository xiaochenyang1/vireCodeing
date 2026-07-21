import type { MessageCenterItem } from '../types';
import type { PlatformInboxMessage } from '../services/platformMessagesApi';

export function mapPlatformInboxMessagesToLocal(
  items: PlatformInboxMessage[],
  now: Date = new Date(),
): MessageCenterItem[] {
  return items.map(item => ({
    id: item.id,
    category: mapCategory(item.category),
    title: item.title,
    content: buildMessageContent(item),
    timeText: formatRelativeTime(item.createdAtIso, now),
    unread: item.unread,
    platformOrderId: item.orderId,
    orderNo: item.orderNo,
  }));
}

function mapCategory(
  category: PlatformInboxMessage['category'],
): MessageCenterItem['category'] {
  if (category === 'finance') {
    return 'service';
  }
  return category;
}

function buildMessageContent(item: PlatformInboxMessage) {
  if (item.orderNo && !item.content.includes(item.orderNo)) {
    return `${item.content}（订单 ${item.orderNo}）`;
  }
  return item.content;
}

function formatRelativeTime(iso: string, now: Date) {
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) {
    return '刚刚';
  }

  const diffMs = Math.max(0, now.getTime() - createdAt.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  const hour = String(createdAt.getHours()).padStart(2, '0');
  const minute = String(createdAt.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

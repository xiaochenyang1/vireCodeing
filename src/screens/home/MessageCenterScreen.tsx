import { Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../../styles';
import type {
  MessageCenterItem,
  OrderDetailReturnTarget,
} from '../../types';
import { getMessageOrderId } from '../../utils/homeSupport';
import { SupportTopBar } from './SupportTopBar';

export function MessageCenterScreen({
  messages,
  unreadCount,
  noticeText,
  modeBadgeText = '本地版',
  onBackHome,
  onMarkMessageRead,
  onMarkAllMessagesRead,
  onOpenOrderDetail,
}: {
  messages: MessageCenterItem[];
  unreadCount: number;
  noticeText?: string;
  modeBadgeText?: string;
  onBackHome: () => void;
  onMarkMessageRead: (messageId: string) => void;
  onMarkAllMessagesRead: () => void;
  onOpenOrderDetail: (
    orderId: string,
    returnTarget?: OrderDetailReturnTarget,
  ) => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <SupportTopBar
        title="消息中心"
        subtitle="订单、系统、客服与财务通知"
        onBackHome={onBackHome}
        modeBadgeText={modeBadgeText}
      />

      <View style={styles.detailCard}>
        <View style={styles.routeHeader}>
          <View>
            <Text style={styles.routeName}>收件箱</Text>
            <Text testID="message-unread-summary" style={styles.routeMeta}>
              {unreadCount > 0
                ? `还有 ${unreadCount} 条未读消息`
                : '全部消息都已读'}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <Pressable
              testID="message-mark-all-read"
              style={styles.detailSecondaryButton}
              onPress={onMarkAllMessagesRead}
            >
              <Text style={styles.detailSecondaryButtonText}>全部已读</Text>
            </Pressable>
          ) : null}
        </View>
        {noticeText ? (
          <Text testID="message-refresh-notice" style={styles.draftNotice}>
            {noticeText}
          </Text>
        ) : null}
      </View>

      {messages.map(item => {
        const orderId = getMessageOrderId(item.content, {
          orderNo: item.orderNo,
          platformOrderId: item.platformOrderId,
        });
        const messageContent = (
          <>
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{item.title}</Text>
              <View style={styles.messageHeaderMeta}>
                <Text
                  testID={`message-category-${item.id}`}
                  style={styles.messageCategoryText}
                >
                  {getMessageCategoryLabel(item.category)}
                </Text>
                <Text
                  testID={`message-status-${item.id}`}
                  style={styles.routeAction}
                >
                  {item.unread ? '未读' : '已读'}
                </Text>
              </View>
            </View>
            <Text style={styles.detailMeta}>{item.content}</Text>
            <Text style={styles.routeMeta}>{item.timeText}</Text>
            {orderId ? <Text style={styles.routeMeta}>点击查看订单</Text> : null}
          </>
        );

        return orderId ? (
          <Pressable
            key={item.id}
            testID={`message-open-order-${orderId}`}
            style={({ pressed }) => [
              styles.detailCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => {
              onMarkMessageRead(item.id);
              onOpenOrderDetail(orderId, 'messages');
            }}
          >
            {messageContent}
          </Pressable>
        ) : (
          <Pressable
            key={item.id}
            testID={`message-mark-read-${item.id}`}
            style={({ pressed }) => [
              styles.detailCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => onMarkMessageRead(item.id)}
          >
            {messageContent}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function getMessageCategoryLabel(category: MessageCenterItem['category']) {
  if (category === 'order') {
    return '订单通知';
  }

  if (category === 'system') {
    return '系统通知';
  }

  if (category === 'finance') {
    return '财务通知';
  }

  return '客服通知';
}

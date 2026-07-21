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
  onBackHome,
  onMarkMessageRead,
  onMarkAllMessagesRead,
  onOpenOrderDetail,
}: {
  messages: MessageCenterItem[];
  unreadCount: number;
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
        subtitle="订单与系统通知"
        onBackHome={onBackHome}
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
              <Text
                testID={`message-status-${item.id}`}
                style={styles.routeAction}
              >
                {item.unread ? '未读' : '已读'}
              </Text>
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

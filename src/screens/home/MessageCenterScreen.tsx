import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { styles } from '../../styles';
import type {
  MessageCenterItem,
  OrderDetailReturnTarget,
} from '../../types';
import { getMessageOrderId } from '../../utils/homeSupport';
import { SupportTopBar } from './SupportTopBar';

type ConversationView = 'list' | 'chat';
type MessageListFilter = 'all' | 'unread';
type MessageCategoryFilter = 'all' | MessageCenterItem['category'];

type Conversation = {
  id: string;
  title: string;
  lastMessage: string;
  timeText: string;
  unread: boolean;
  orderId?: string;
  platformOrderId?: string;
  orderNo?: string;
  messages: MessageCenterItem[];
  avatarLabel: string;
};

const messageListFilters: Array<{
  id: MessageListFilter;
  label: string;
  testID: string;
}> = [
  { id: 'all', label: '全部', testID: 'message-filter-view-all' },
  { id: 'unread', label: '未读', testID: 'message-filter-view-unread' },
];

const messageCategoryFilters: Array<{
  id: MessageCategoryFilter;
  label: string;
  testID: string;
}> = [
  { id: 'all', label: '全部分类', testID: 'message-filter-category-all' },
  { id: 'order', label: '订单', testID: 'message-filter-category-order' },
  { id: 'service', label: '客服', testID: 'message-filter-category-service' },
  { id: 'system', label: '系统', testID: 'message-filter-category-system' },
  { id: 'finance', label: '财务', testID: 'message-filter-category-finance' },
];

function getConversationAvatarLabel(category: MessageCenterItem['category']): string {
  switch (category) {
    case 'order':
      return '订';
    case 'service':
      return '客';
    case 'finance':
      return '财';
    default:
      return '系';
  }
}

function getConversationTitle(messages: MessageCenterItem[]): string {
  const orderMessages = messages.filter(m => m.category === 'order');
  if (orderMessages.length > 0) {
    return orderMessages[0].title;
  }
  return messages[0]?.title ?? '通知';
}

function groupMessagesIntoConversations(
  messages: MessageCenterItem[],
): { conversations: Conversation[]; notifications: MessageCenterItem[] } {
  const conversationMap = new Map<string, MessageCenterItem[]>();

  messages.forEach(message => {
    const orderId = getMessageOrderId(message.content, {
      orderNo: message.orderNo,
      platformOrderId: message.platformOrderId,
    });

    if (orderId && (message.category === 'order' || message.category === 'service')) {
      const key = `order-${orderId}`;
      const existing = conversationMap.get(key) ?? [];
      existing.push(message);
      conversationMap.set(key, existing);
    }
  });

  const conversations: Conversation[] = [];
  conversationMap.forEach((msgs, key) => {
    const sorted = [...msgs].sort(
      (a, b) => a.timeText.localeCompare(b.timeText),
    );
    const latest = sorted[sorted.length - 1];
    const orderId = key.replace('order-', '');
    const platformOrderId = sorted[0].platformOrderId;
    const orderNo = sorted[0].orderNo;
    const unread = sorted.some(m => m.unread);

    conversations.push({
      id: key,
      title: getConversationTitle(sorted),
      lastMessage: latest.content,
      timeText: latest.timeText,
      unread,
      orderId,
      platformOrderId,
      orderNo,
      messages: sorted,
      avatarLabel: getConversationAvatarLabel(sorted[0].category),
    });
  });

  conversations.sort((a, b) => b.timeText.localeCompare(a.timeText));

  const notifications = messages.filter(
    m => {
      const orderId = getMessageOrderId(m.content, {
        orderNo: m.orderNo,
        platformOrderId: m.platformOrderId,
      });
      return !orderId || (m.category !== 'order' && m.category !== 'service');
    },
  );

  return { conversations, notifications };
}

export function MessageCenterScreen({
  messages,
  unreadCount,
  noticeText,
  modeBadgeText = '本地版',
  onBackHome,
  onMarkMessageRead,
  onMarkAllMessagesRead,
  canRefresh = false,
  isRefreshing = false,
  onRefresh,
  onOpenOrderDetail,
}: {
  messages: MessageCenterItem[];
  unreadCount: number;
  noticeText?: string;
  modeBadgeText?: string;
  onBackHome: () => void;
  onMarkMessageRead: (messageId: string) => void;
  onMarkAllMessagesRead: () => void;
  canRefresh?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onOpenOrderDetail: (
    orderId: string,
    returnTarget?: OrderDetailReturnTarget,
  ) => void;
}) {
  const [activeView, setActiveView] = useState<ConversationView>('list');
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [messageListFilter, setMessageListFilter] =
    useState<MessageListFilter>('all');
  const [messageCategoryFilter, setMessageCategoryFilter] =
    useState<MessageCategoryFilter>('all');

  const filteredMessages = useMemo(
    () =>
      messages.filter(message => {
        if (messageListFilter === 'unread' && !message.unread) {
          return false;
        }

        if (
          messageCategoryFilter !== 'all' &&
          message.category !== messageCategoryFilter
        ) {
          return false;
        }

        return true;
      }),
    [messageCategoryFilter, messageListFilter, messages],
  );

  const { conversations: allConversations } = useMemo(
    () => groupMessagesIntoConversations(messages),
    [messages],
  );
  const { conversations, notifications } = useMemo(
    () => groupMessagesIntoConversations(filteredMessages),
    [filteredMessages],
  );

  const activeConversation = allConversations.find(
    c => c.id === activeConversationId,
  );
  const isFiltered =
    messageListFilter !== 'all' || messageCategoryFilter !== 'all';
  const filteredSummaryText = isFiltered
    ? filteredMessages.length > 0
      ? `当前筛选显示 ${filteredMessages.length} 条消息`
      : '当前筛选下暂无消息'
    : undefined;

  const openConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    setActiveView('chat');
    conversation.messages.forEach(m => {
      if (m.unread) {
        onMarkMessageRead(m.id);
      }
    });
  };

  const handleBackFromChat = () => {
    setActiveView('list');
    setActiveConversationId(undefined);
  };

  if (activeView === 'chat' && activeConversation) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
      >
        <SupportTopBar
          title={activeConversation.title}
          subtitle={`订单号：${activeConversation.orderNo ?? activeConversation.orderId}`}
          onBackHome={handleBackFromChat}
          modeBadgeText={modeBadgeText}
          rightAction={
            activeConversation.orderId
              ? {
                  label: '查看订单',
                  onPress: () =>
                    onOpenOrderDetail(
                      activeConversation.orderId!,
                      'messages',
                    ),
                }
              : undefined
          }
        />

        <View style={styles.detailCard}>
          <View style={styles.chatBubbleContainer}>
            {activeConversation.messages.map((message, index) => {
              const isLatest = index === activeConversation.messages.length - 1;
              const showAvatar = isLatest || message.unread;

              return (
                <View
                  key={message.id}
                  style={[
                    styles.chatBubbleRow,
                    message.unread && styles.chatBubbleRowUnread,
                  ]}
                >
                  {showAvatar ? (
                    <View style={styles.chatAvatar}>
                      <Text style={styles.chatAvatarText}>
                        {activeConversation.avatarLabel}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.chatAvatar} />
                  )}
                  <View
                    style={[
                      styles.chatBubble,
                      message.unread
                        ? styles.chatBubbleUnread
                        : styles.chatBubbleRead,
                    ]}
                  >
                    <Text style={styles.chatBubbleTitle}>
                      {message.title}
                    </Text>
                    <Text style={styles.chatBubbleContent}>
                      {message.content}
                    </Text>
                    <Text style={styles.chatBubbleTime}>
                      {message.timeText}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.draftNotice}>
            这是平台消息通知中心。即时聊天功能即将上线，届时您可以与货主/司机实时沟通订单详情。
          </Text>
        </View>
      </ScrollView>
    );
  }

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
            <Text style={styles.routeName}>消息</Text>
            <Text testID="message-unread-summary" style={styles.routeMeta}>
              {unreadCount > 0
                ? `${unreadCount} 条未读`
                : '全部已读'}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <View style={styles.messageActionGroup}>
              {canRefresh ? (
                <Pressable
                  testID="message-manual-refresh"
                  disabled={isRefreshing || !onRefresh}
                  style={({ pressed }) => [
                    styles.detailSecondaryButton,
                    (isRefreshing || !onRefresh) && styles.buttonDisabled,
                    pressed && !isRefreshing && onRefresh && styles.pressedButton,
                  ]}
                  onPress={onRefresh}
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    {isRefreshing ? '刷新中...' : '手动刷新'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                testID="message-mark-all-read"
                style={styles.detailSecondaryButton}
                onPress={onMarkAllMessagesRead}
              >
                <Text style={styles.detailSecondaryButtonText}>
                  全部已读
                </Text>
              </Pressable>
            </View>
          ) : canRefresh ? (
            <Pressable
              testID="message-manual-refresh"
              disabled={isRefreshing || !onRefresh}
              style={({ pressed }) => [
                styles.detailSecondaryButton,
                (isRefreshing || !onRefresh) && styles.buttonDisabled,
                pressed && !isRefreshing && onRefresh && styles.pressedButton,
              ]}
              onPress={onRefresh}
            >
              <Text style={styles.detailSecondaryButtonText}>
                {isRefreshing ? '刷新中...' : '手动刷新'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {noticeText ? (
          <Text testID="message-refresh-notice" style={styles.draftNotice}>
            {noticeText}
          </Text>
        ) : null}
        <View style={styles.messageFilterSection}>
          <View style={styles.draftInlineSection}>
            <Text style={styles.messageFilterLabel}>查看范围</Text>
            <View style={styles.draftChoiceGrid}>
              {messageListFilters.map(filter => {
                const isActive = messageListFilter === filter.id;

                return (
                  <Pressable
                    key={filter.id}
                    testID={filter.testID}
                    style={({ pressed }) => [
                      styles.draftChoiceButton,
                      isActive && styles.draftChoiceButtonActive,
                      pressed && styles.pressedButton,
                    ]}
                    onPress={() => setMessageListFilter(filter.id)}
                  >
                    <Text
                      style={[
                        styles.draftChoiceText,
                        isActive && styles.draftChoiceTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.draftInlineSection}>
            <Text style={styles.messageFilterLabel}>消息分类</Text>
            <View style={styles.draftChoiceGrid}>
              {messageCategoryFilters.map(filter => {
                const isActive = messageCategoryFilter === filter.id;

                return (
                  <Pressable
                    key={filter.id}
                    testID={filter.testID}
                    style={({ pressed }) => [
                      styles.draftChoiceButton,
                      isActive && styles.draftChoiceButtonActive,
                      pressed && styles.pressedButton,
                    ]}
                    onPress={() => setMessageCategoryFilter(filter.id)}
                  >
                    <Text
                      style={[
                        styles.draftChoiceText,
                        isActive && styles.draftChoiceTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {filteredSummaryText ? (
            <Text
              testID="message-filter-summary"
              style={styles.messageFilterSummary}
            >
              {filteredSummaryText}
            </Text>
          ) : null}
        </View>
      </View>

      {conversations.length > 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.draftSectionTitle}>订单消息</Text>
          {conversations.map(conversation => (
            <Pressable
              key={conversation.id}
              testID={`message-conversation-${conversation.id}`}
              style={({ pressed }) => [
                styles.detailInlineGroup,
                pressed && styles.pressedCard,
              ]}
              onPress={() => openConversation(conversation)}
            >
              <View style={styles.conversationRow}>
                <View style={styles.conversationAvatar}>
                  <Text style={styles.conversationAvatarText}>
                    {conversation.avatarLabel}
                  </Text>
                </View>
                <View style={styles.conversationBody}>
                  <View style={styles.conversationHeader}>
                    <Text
                      style={[
                        styles.conversationTitle,
                        conversation.unread &&
                          styles.conversationTitleUnread,
                      ]}
                    >
                      {conversation.title}
                    </Text>
                    <Text style={styles.conversationTime}>
                      {conversation.timeText}
                    </Text>
                  </View>
                  <Text
                    style={styles.conversationPreview}
                    numberOfLines={1}
                  >
                    {conversation.lastMessage}
                  </Text>
                </View>
                {conversation.unread ? (
                  <View style={styles.conversationUnreadBadge}>
                    <Text style={styles.conversationUnreadText}>
                      未读
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {notifications.length > 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.draftSectionTitle}>通知</Text>
          {notifications.map(item => {
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
        </View>
      ) : null}

      {conversations.length === 0 && notifications.length === 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailMeta}>
            {messages.length === 0 ? '暂无消息' : '当前筛选下暂无消息'}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function getMessageCategoryLabel(
  category: MessageCenterItem['category'],
) {
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

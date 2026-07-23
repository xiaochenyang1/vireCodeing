import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { AuthField } from '../../components/AuthField';
import { helpTopics, serviceChannels } from '../../data/mockData';
import { styles } from '../../styles';
import type {
  ServiceChannel,
  SupportTicket,
  SupportTicketStatusHistoryItem,
} from '../../types';
import {
  isLocalSupportTicketId,
  type SupportTicketDraft,
} from '../../utils/homeSupport';
import { SupportTopBar } from './SupportTopBar';

export function HelpCenterScreen({
  supportTickets,
  noticeText,
  ticketsTitle = '本地工单',
  modeBadgeText = '本地版',
  canUpdateTicketStatus = true,
  isSubmittingTicket = false,
  onBackHome,
  onSubmitTicket,
  onUpdateTicketStatus,
}: {
  supportTickets: SupportTicket[];
  noticeText?: string;
  ticketsTitle?: string;
  modeBadgeText?: string;
  canUpdateTicketStatus?: boolean;
  isSubmittingTicket?: boolean;
  onBackHome: () => void;
  onSubmitTicket: (ticketDraft: SupportTicketDraft) => void;
  onUpdateTicketStatus: (
    ticketId: string,
    statusText: string,
    historyItem: SupportTicketStatusHistoryItem,
  ) => void;
}) {
  const [selectedChannel, setSelectedChannel] = useState<ServiceChannel>();
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketNotice, setTicketNotice] = useState('');

  useEffect(() => {
    if (noticeText !== undefined) {
      setTicketNotice(noticeText);
    }
  }, [noticeText]);

  const submitTicket = () => {
    if (isSubmittingTicket) {
      return;
    }

    if (!selectedChannel) {
      setTicketNotice('请选择服务渠道后再提交');
      return;
    }

    if (!ticketDescription.trim()) {
      setTicketNotice('请填写问题说明后再提交');
      return;
    }

    onSubmitTicket({
      channelName: selectedChannel.name,
      description: ticketDescription.trim(),
    });
    setTicketNotice('');
    setTicketDescription('');
  };

  const acceptTicket = (ticketId: string) => {
    onUpdateTicketStatus(ticketId, '客服已受理', {
      actionText: '客服已受理',
      timestampText: '刚刚',
    });
    setTicketNotice('工单已更新：客服已受理');
  };

  const resolveTicket = (ticketId: string) => {
    onUpdateTicketStatus(ticketId, '已处理', {
      actionText: '客服已处理',
      timestampText: '刚刚',
    });
    setTicketNotice('工单已更新：已处理');
  };

  const callServiceChannel = (channel: ServiceChannel) => {
    if (!channel.phoneNumber) {
      setTicketNotice(`${channel.name} 暂未配置客服热线`);
      return;
    }

    Linking.openURL(`tel:${channel.phoneNumber}`).catch(() => {
      setTicketNotice('无法打开系统拨号，请手动联系客服。');
    });
    setTicketNotice(`正在联系${channel.name}：${channel.phoneNumber}`);
  };

  const getSupportTicketSourceText = (ticket: SupportTicket) => {
    if (!isLocalSupportTicketId(ticket.id)) {
      return '平台工单同步';
    }

    return canUpdateTicketStatus ? '本地工单' : '本地兜底工单';
  };

  const canUpdateTicketLocally = (ticket: SupportTicket) =>
    isLocalSupportTicketId(ticket.id);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <SupportTopBar
        title="客服帮助"
        subtitle="常见问题与服务入口"
        onBackHome={onBackHome}
        modeBadgeText={modeBadgeText}
      />

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>常见问题</Text>
        {helpTopics.map(topic => (
          <View key={topic.id} style={styles.driverInfoCard}>
            <View style={styles.driverInfoHeader}>
              <View>
                <Text style={styles.driverName}>{topic.title}</Text>
                <Text style={styles.driverMeta}>{topic.phase}</Text>
              </View>
              <View style={styles.driverRatingPill}>
                <Text style={styles.driverRatingText}>FAQ</Text>
              </View>
            </View>
            <Text style={styles.detailMeta}>{topic.answer}</Text>
          </View>
        ))}
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>服务渠道</Text>
        {serviceChannels.map(channel => {
          const active = selectedChannel?.id === channel.id;

          return (
            <Pressable
              key={channel.id}
              testID={`support-channel-${channel.id}`}
              style={[
                styles.driverInfoCard,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => {
                setSelectedChannel(channel);
                setTicketNotice('');
              }}
            >
              <Text style={styles.driverName}>{channel.name}</Text>
              <Text style={styles.detailMeta}>{channel.description}</Text>
              {channel.phoneNumber ? (
                <Text
                  style={styles.detailMeta}
                >{`客服热线：${channel.phoneNumber}`}</Text>
              ) : null}
              <Text style={styles.routeMeta}>{channel.availabilityText}</Text>
              {channel.phoneNumber ? (
                <Pressable
                  testID={`support-channel-call-${channel.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => callServiceChannel(channel)}
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    拨打客服热线
                  </Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>提交工单</Text>
        <Text style={styles.detailMeta}>
          {`当前渠道：${selectedChannel?.name ?? '请选择服务渠道'}`}
        </Text>
        <AuthField
          testID="support-ticket-description"
          label="问题说明"
          placeholder="请描述订单、司机或平台体验问题"
          value={ticketDescription}
          onChangeText={setTicketDescription}
          multiline
          numberOfLines={4}
        />
        {ticketNotice ? (
          <Text style={styles.draftNotice}>{ticketNotice}</Text>
        ) : null}
        <Pressable
          testID="support-ticket-submit"
          disabled={isSubmittingTicket}
          style={({ pressed }) => [
            styles.detailPrimaryButton,
            pressed && styles.pressedButton,
          ]}
          onPress={submitTicket}
        >
          <Text style={styles.detailPrimaryButtonText}>
            {isSubmittingTicket ? '提交中...' : '提交工单'}
          </Text>
        </Pressable>
      </View>

      {supportTickets.length > 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.draftSectionTitle}>{ticketsTitle}</Text>
          {supportTickets.map(ticket => {
            const statusHistory = ticket.statusHistory ?? [
              {
                actionText: '工单已提交',
                timestampText: ticket.createdAtText,
              },
            ];

            return (
              <View key={ticket.id} style={styles.driverInfoCard}>
                <Text style={styles.driverName}>
                  {`工单类型：${ticket.channelName}`}
                </Text>
                <Text style={styles.detailMeta}>{ticket.description}</Text>
                <Text style={styles.detailMeta}>
                  {`来源：${getSupportTicketSourceText(ticket)}`}
                </Text>
                <Text style={styles.detailMeta}>
                  {`处理状态：${ticket.statusText}`}
                </Text>
                <Text style={styles.routeMeta}>{ticket.createdAtText}</Text>
                {statusHistory.map(historyItem => (
                  <Text
                    key={`${ticket.id}-${historyItem.actionText}-${historyItem.timestampText}`}
                    style={styles.detailMeta}
                  >
                    {`处理记录：${historyItem.actionText} · ${historyItem.timestampText}`}
                  </Text>
                ))}
                {canUpdateTicketLocally(ticket) &&
                ticket.statusText === '待客服跟进' ? (
                  <Pressable
                    testID={`support-ticket-accept-${ticket.id}`}
                    style={styles.detailSecondaryButton}
                    onPress={() => acceptTicket(ticket.id)}
                  >
                    <Text style={styles.detailSecondaryButtonText}>
                      客服受理
                    </Text>
                  </Pressable>
                ) : null}
                {canUpdateTicketLocally(ticket) &&
                ticket.statusText !== '已处理' ? (
                  <Pressable
                    testID={`support-ticket-resolve-${ticket.id}`}
                    style={styles.detailSecondaryButton}
                    onPress={() => resolveTicket(ticket.id)}
                  >
                    <Text style={styles.detailSecondaryButtonText}>
                      处理完成
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

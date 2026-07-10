import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { styles } from '../styles';

type LocalNetworkRetryQueueItem = {
  id: string;
  titleText: string;
  statusText: string;
  updatedAtText: string;
  noteText: string;
};

function createPendingNetworkRetryQueue(): LocalNetworkRetryQueueItem[] {
  return [
    {
      id: 'network-order-create',
      titleText: '订单发布请求',
      statusText: '待重试',
      updatedAtText: '刚刚',
      noteText: '真实 API 请求未接入，本地只展示待重试队列。',
    },
    {
      id: 'network-profile-sync',
      titleText: '资料同步请求',
      statusText: '待重试',
      updatedAtText: '刚刚',
      noteText: '真实 API 请求未接入，本地只展示待重试队列。',
    },
  ];
}

export function NetworkErrorScreen({
  onBack,
  onRetry,
}: {
  onBack: () => void;
  onRetry: () => void;
}) {
  const [retryQueueItems, setRetryQueueItems] = useState(
    createPendingNetworkRetryQueue,
  );

  const markRetryQueueFailed = () => {
    setRetryQueueItems(currentItems =>
      currentItems.map(item => ({
        ...item,
        statusText: '重试失败',
        updatedAtText: '刚刚',
        noteText: '真实 API 请求未接入，本地仅记录失败状态。',
      })),
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.draftContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.draftTopBar}>
        <Pressable
          testID="network-error-back"
          style={styles.draftBackButton}
          onPress={onBack}
        >
          <Text style={styles.draftBackText}>返回首页</Text>
        </Pressable>
        <View style={styles.draftTitleGroup}>
          <Text style={styles.pageKicker}>本地网络状态演练</Text>
          <Text style={styles.pageTitle}>网络异常</Text>
        </View>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>当前无法连接服务</Text>
        <Text style={styles.detailMeta}>
          订单、草稿、消息和个人中心仍可读取本地缓存。
        </Text>
        <Text style={styles.detailMeta}>
          新发布、修改、资料变更等操作会继续显示本地同步边界。
        </Text>
        <Text style={styles.detailMeta}>
          真实网络监听和真实 API 重试队列仍未接入。
        </Text>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>本地 API 重试队列</Text>
        {retryQueueItems.map(queueItem => (
          <View key={queueItem.id} style={styles.driverInfoCard}>
            <Text style={styles.detailMeta}>
              {`${queueItem.titleText}：${queueItem.statusText}`}
            </Text>
            <Text style={styles.detailMeta}>
              {`队列时间：${queueItem.updatedAtText}`}
            </Text>
            <Text style={styles.detailMeta}>{queueItem.noteText}</Text>
          </View>
        ))}
        <Pressable
          testID="network-retry-mark-failed"
          style={styles.detailSecondaryButton}
          onPress={markRetryQueueFailed}
        >
          <Text style={styles.detailSecondaryButtonText}>本地标记重试失败</Text>
        </Pressable>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>建议处理</Text>
        <Text style={styles.routeMeta}>
          检查系统网络后可重新检测；本地演示版只恢复页面状态，不发起真实请求。
        </Text>
        <Pressable
          testID="network-error-retry"
          style={({ pressed }) => [
            styles.detailPrimaryButton,
            pressed && styles.pressedButton,
          ]}
          onPress={onRetry}
        >
          <Text style={styles.detailPrimaryButtonText}>重新检测</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

import { Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../styles';
import {
  getNetworkRetryQueueSummary,
  type NetworkRetryQueueItem,
} from '../utils/networkRetryQueue';

export function NetworkErrorScreen({
  retryQueueItems,
  onBack,
  onMarkRetryQueueFailed,
  onRetry,
}: {
  retryQueueItems: NetworkRetryQueueItem[];
  onBack: () => void;
  onMarkRetryQueueFailed?: () => void;
  onRetry: () => void;
}) {
  const canMarkRetryQueueFailed =
    Boolean(onMarkRetryQueueFailed) &&
    retryQueueItems.some(queueItem => queueItem.syncStatus === 'pending');
  const retryQueueSummary = getNetworkRetryQueueSummary(retryQueueItems);
  const hasRetryQueueItems = retryQueueSummary.totalCount > 0;
  const retrySuggestionText = hasRetryQueueItems
    ? '检查系统网络后会先自动重试发单草稿和订单待同步队列；常用路线和个人中心仍需返回原页面继续处理。'
    : '检查系统网络后可返回首页继续处理业务。';

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
          <Text style={styles.pageKicker}>
            {hasRetryQueueItems ? '同步队列详情' : '本地网络状态演练'}
          </Text>
          <Text style={styles.pageTitle}>
            {hasRetryQueueItems ? '待处理同步' : '网络异常'}
          </Text>
        </View>
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>
          {hasRetryQueueItems ? '当前存在待处理同步队列' : '当前无法连接服务'}
        </Text>
        {hasRetryQueueItems ? (
          <Text style={styles.detailMeta}>{retryQueueSummary.summaryText}</Text>
        ) : null}
        <Text style={styles.detailMeta}>
          订单、草稿、消息和个人中心仍可读取本地缓存。
        </Text>
        <Text style={styles.detailMeta}>
          新发布、修改、资料变更等操作会继续显示本地同步边界。
        </Text>
        <Text style={styles.detailMeta}>
          待处理同步队列会按最近更新时间汇总展示。
        </Text>
        <Text style={styles.detailMeta}>
          重新检测会自动重试发单草稿和订单的待同步项。
        </Text>
        <Text style={styles.detailMeta}>
          常用路线和个人中心资料仍需返回原页面继续处理。
        </Text>
        {hasRetryQueueItems ? (
          <Text style={styles.detailMeta}>
            已失败队列不会自动转为成功，仍需进入对应页面处理。
          </Text>
        ) : null}
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>待处理同步队列</Text>
        {retryQueueItems.length > 0 ? (
          retryQueueItems.map(queueItem => (
            <View key={queueItem.id} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`${queueItem.titleText}：${queueItem.statusText}`}
              </Text>
              <Text style={styles.detailMeta}>
                {`队列时间：${queueItem.updatedAtText}`}
              </Text>
              <Text style={styles.detailMeta}>
                {`当前说明：${queueItem.messageText}`}
              </Text>
              <Text style={styles.detailMeta}>{queueItem.noteText}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.detailMeta}>当前没有待处理同步队列。</Text>
        )}
        {canMarkRetryQueueFailed ? (
          <Pressable
            testID="network-retry-mark-failed"
            style={styles.detailSecondaryButton}
            onPress={onMarkRetryQueueFailed}
          >
            <Text style={styles.detailSecondaryButtonText}>
              将待同步项标记为失败
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>建议处理</Text>
        <Text style={styles.routeMeta}>{retrySuggestionText}</Text>
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

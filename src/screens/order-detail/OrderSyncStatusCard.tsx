import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import type { RecentOrder } from '../../types';
import { formatPlatformIsoMinute } from '../../utils/dateTime';

type OrderSyncState = NonNullable<RecentOrder['syncState']>;

export function OrderSyncStatusCard({
  syncState,
  onRetry,
  onMarkFailed,
}: {
  syncState: OrderSyncState;
  onRetry: () => void;
  onMarkFailed: () => void;
}) {
  const syncQueueItems = syncState.queueItems ?? [];
  const canMarkOrderSyncFailed = syncState.status === 'pending';
  const canRetryOrderSync =
    (syncState.status === 'pending' || syncState.status === 'failed') &&
    !syncState.retryBlocked;

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>后端同步</Text>
      <Text style={styles.detailMeta}>
        {`后端同步：${getOrderSyncStatusText(syncState.status)}`}
      </Text>
      <Text style={styles.detailMeta}>{`同步说明：${syncState.message}`}</Text>
      <Text style={styles.detailMeta}>
        {`同步时间：${syncState.updatedAtText}`}
      </Text>
      {syncState.mutationContext?.baseUpdatedAtIso ? (
        <Text style={styles.detailMeta}>
          {`重试基线版本：${formatPlatformIsoMinute(
            syncState.mutationContext.baseUpdatedAtIso,
          )}`}
        </Text>
      ) : null}
      {syncState.retryBlocked ? (
        <Text style={styles.routeMeta}>
          自动重试已停止，请根据当前同步说明确认后重新发起操作。
        </Text>
      ) : null}
      <Text style={styles.draftSectionTitle}>订单同步队列</Text>
      {syncQueueItems.length > 0 ? (
        syncQueueItems.map(queueItem => (
          <View key={queueItem.id} style={styles.driverInfoCard}>
            <Text style={styles.detailMeta}>
              {`${queueItem.titleText}：${queueItem.statusText}`}
            </Text>
            <Text style={styles.detailMeta}>
              {`队列时间：${queueItem.updatedAtText}`}
            </Text>
            <Text style={styles.detailMeta}>{queueItem.noteText}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.detailMeta}>暂无待同步订单</Text>
      )}
      {canMarkOrderSyncFailed ? (
        <Pressable
          testID="order-sync-mark-failed"
          style={styles.detailSecondaryButton}
          onPress={onMarkFailed}
        >
          <Text style={styles.detailSecondaryButtonText}>本地标记失败</Text>
        </Pressable>
      ) : null}
      {canRetryOrderSync ? (
        <Pressable
          testID="order-sync-retry"
          style={styles.detailSecondaryButton}
          onPress={onRetry}
        >
          <Text style={styles.detailSecondaryButtonText}>重试同步</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getOrderSyncStatusText(status: OrderSyncState['status']) {
  if (status === 'synced') {
    return '已同步';
  }

  if (status === 'failed') {
    return '同步失败';
  }

  return '待同步';
}

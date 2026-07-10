import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import {
  createSyncedDraftSyncState,
  type DraftSyncState,
} from '../../utils/draftStorage';

export function DraftSyncStatusCard({
  syncState,
  onRetry,
  onMarkFailed,
}: {
  syncState?: DraftSyncState;
  onRetry?: () => void;
  onMarkFailed?: () => void;
}) {
  const effectiveSyncState =
    syncState ??
    createSyncedDraftSyncState('本地草稿尚未变更，等待真实草稿 API 接入。');
  const canRetry =
    Boolean(onRetry) &&
    (effectiveSyncState.status === 'pending' ||
      effectiveSyncState.status === 'failed');
  const canMarkFailed =
    Boolean(onMarkFailed) && effectiveSyncState.status === 'pending';
  const queueItems = effectiveSyncState.queueItems ?? [];

  return (
    <View>
      <Text style={styles.draftSectionTitle}>草稿同步</Text>
      <Text style={styles.detailMeta}>
        {`草稿同步：${getDraftSyncStatusText(effectiveSyncState.status)}`}
      </Text>
      <Text style={styles.detailMeta}>
        {`同步说明：${effectiveSyncState.message}`}
      </Text>
      <Text style={styles.detailMeta}>
        {`同步时间：${effectiveSyncState.updatedAtText}`}
      </Text>
      <Text style={styles.draftSectionTitle}>草稿同步队列</Text>
      {queueItems.length > 0 ? (
        queueItems.map(queueItem => (
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
        <Text style={styles.detailMeta}>暂无待同步草稿</Text>
      )}
      {canMarkFailed ? (
        <Pressable
          testID="draft-sync-mark-failed"
          style={styles.draftSecondaryButton}
          onPress={onMarkFailed}
        >
          <Text style={styles.draftSecondaryButtonText}>本地标记失败</Text>
        </Pressable>
      ) : null}
      {canRetry ? (
        <Pressable
          testID="draft-sync-retry"
          style={styles.draftSecondaryButton}
          onPress={onRetry}
        >
          <Text style={styles.draftSecondaryButtonText}>重试同步</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getDraftSyncStatusText(status: DraftSyncState['status']) {
  if (status === 'synced') {
    return '已同步';
  }

  if (status === 'failed') {
    return '同步失败';
  }

  return '待同步';
}

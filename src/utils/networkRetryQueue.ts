import type { RecentOrder } from '../types';
import type { DraftSyncState } from './draftStorage';
import type { HomeSyncState } from './homeLocalState';
import type { ProfileSyncState } from './profileLocalState';

type SyncQueueState = {
  status: 'pending' | 'synced' | 'failed';
  message: string;
  queueItems?: Array<{
    id: string;
    titleText: string;
    statusText: string;
    updatedAtText: string;
    updatedAtIso?: string;
    noteText: string;
  }>;
};

export type NetworkRetryQueueItem = {
  id: string;
  titleText: string;
  statusText: string;
  updatedAtText: string;
  updatedAtIso?: string;
  noteText: string;
  messageText: string;
  syncStatus: 'pending' | 'failed';
};

export type NetworkRetryQueueSummary = {
  totalCount: number;
  pendingCount: number;
  failedCount: number;
  summaryText: string;
};

export function getNetworkRetryQueueItems({
  draftSyncState,
  orders,
  homeSyncState,
  profileSyncState,
}: {
  draftSyncState?: DraftSyncState;
  orders: RecentOrder[];
  homeSyncState?: HomeSyncState;
  profileSyncState?: ProfileSyncState;
}) {
  const items = [
    ...mapSyncQueueItems('draft', draftSyncState),
    ...orders.flatMap(order =>
      mapSyncQueueItems(`order-${order.id}`, order.syncState, queueItem => ({
        ...queueItem,
        titleText: `${queueItem.titleText}（${order.id}）`,
      })),
    ),
    ...mapSyncQueueItems('home', homeSyncState),
    ...mapSyncQueueItems('profile', profileSyncState),
  ];

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const timestampDelta =
        getTimestampValue(right.item.updatedAtIso) -
        getTimestampValue(left.item.updatedAtIso);

      if (timestampDelta !== 0) {
        return timestampDelta;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

export function getNetworkRetryQueueSummary(
  items: NetworkRetryQueueItem[],
): NetworkRetryQueueSummary {
  const failedCount = items.filter(item => item.syncStatus === 'failed').length;
  const pendingCount = items.filter(
    item => item.syncStatus === 'pending',
  ).length;
  const totalCount = items.length;

  if (failedCount > 0) {
    return {
      totalCount,
      pendingCount,
      failedCount,
      summaryText:
        pendingCount > 0
          ? `检测到 ${totalCount} 条待处理同步队列，其中 ${failedCount} 条同步失败、${pendingCount} 条待同步。`
          : `检测到 ${failedCount} 条同步失败队列，请进入同步详情处理。`,
    };
  }

  if (pendingCount > 0) {
    return {
      totalCount,
      pendingCount,
      failedCount,
      summaryText: `检测到 ${pendingCount} 条待处理同步队列，网络恢复后可继续处理。`,
    };
  }

  return {
    totalCount,
    pendingCount,
    failedCount,
    summaryText: '本地在线，当前没有待处理同步队列。',
  };
}

function mapSyncQueueItems(
  prefix: string,
  syncState?: SyncQueueState,
  transform?: (
    queueItem: NetworkRetryQueueItem,
  ) => NetworkRetryQueueItem,
) {
  if (
    !syncState ||
    syncState.status === 'synced' ||
    !syncState.queueItems?.length
  ) {
    return [];
  }

  return syncState.queueItems.map(queueItem => {
    const normalizedItem: NetworkRetryQueueItem = {
      id: `${prefix}-${queueItem.id}`,
      titleText: queueItem.titleText,
      statusText: queueItem.statusText,
      updatedAtText: queueItem.updatedAtText,
      ...(queueItem.updatedAtIso
        ? { updatedAtIso: queueItem.updatedAtIso }
        : {}),
      noteText: queueItem.noteText,
      messageText: syncState.message,
      syncStatus: syncState.status === 'pending' ? 'pending' : 'failed',
    };

    return transform ? transform(normalizedItem) : normalizedItem;
  });
}

function getTimestampValue(updatedAtIso?: string) {
  if (!updatedAtIso) {
    return 0;
  }

  const timestamp = Date.parse(updatedAtIso);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

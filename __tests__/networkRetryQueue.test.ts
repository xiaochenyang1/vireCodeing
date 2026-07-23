import {
  getNetworkRetryQueueSummary,
  type NetworkRetryQueueItem,
} from '../src/utils/networkRetryQueue';

function createRetryQueueItem(
  id: string,
  syncStatus: NetworkRetryQueueItem['syncStatus'],
): NetworkRetryQueueItem {
  return {
    id,
    titleText: `队列 ${id}`,
    statusText: syncStatus === 'failed' ? '同步失败' : '待同步',
    updatedAtText: '刚刚',
    updatedAtIso: '2026-07-22T08:00:00.000Z',
    noteText: '测试说明',
    messageText: '测试消息',
    syncStatus,
  };
}

test('returns the online summary when no retry queues exist', () => {
  expect(getNetworkRetryQueueSummary([])).toEqual({
    totalCount: 0,
    pendingCount: 0,
    failedCount: 0,
    summaryText: '本地在线，当前没有待处理同步队列。',
  });
});

test('summarizes pending retry queues', () => {
  expect(
    getNetworkRetryQueueSummary([
      createRetryQueueItem('pending-1', 'pending'),
      createRetryQueueItem('pending-2', 'pending'),
    ]),
  ).toEqual({
    totalCount: 2,
    pendingCount: 2,
    failedCount: 0,
    summaryText: '检测到 2 条待处理同步队列，网络恢复后可继续处理。',
  });
});

test('summarizes failed retry queues', () => {
  expect(
    getNetworkRetryQueueSummary([
      createRetryQueueItem('failed-1', 'failed'),
      createRetryQueueItem('failed-2', 'failed'),
    ]),
  ).toEqual({
    totalCount: 2,
    pendingCount: 0,
    failedCount: 2,
    summaryText: '检测到 2 条同步失败队列，请进入同步详情处理。',
  });
});

test('summarizes mixed retry queues', () => {
  expect(
    getNetworkRetryQueueSummary([
      createRetryQueueItem('failed-1', 'failed'),
      createRetryQueueItem('pending-1', 'pending'),
      createRetryQueueItem('failed-2', 'failed'),
    ]),
  ).toEqual({
    totalCount: 3,
    pendingCount: 1,
    failedCount: 2,
    summaryText:
      '检测到 3 条待处理同步队列，其中 2 条同步失败、1 条待同步。',
  });
});

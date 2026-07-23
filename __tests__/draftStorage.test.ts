import {
  createFailedDraftSyncState,
  createPendingDraftSyncState,
  createSyncedDraftSyncState,
} from '../src/utils/draftStorage';

test('creates platform-neutral draft sync states by default', () => {
  const now = new Date('2026-07-23T08:30:00.000Z').getTime();
  const updatedAtIso = new Date(now).toISOString();

  expect(createSyncedDraftSyncState(undefined, now)).toMatchObject({
    status: 'synced',
    message: '本地草稿已记录，等待平台草稿同步。',
    updatedAtText: '刚刚',
    updatedAtIso,
    platformUpdatedAtIso: updatedAtIso,
    queueItems: [],
  });

  expect(createPendingDraftSyncState(undefined, now)).toMatchObject({
    status: 'pending',
    message: '草稿已在本地更新，等待平台草稿同步。',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'draft-local-change',
        titleText: '发单草稿变更',
        statusText: '待同步',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '草稿已保留在本地，待平台草稿同步。',
      },
    ],
  });

  expect(createFailedDraftSyncState(undefined, now)).toMatchObject({
    status: 'failed',
    message: '草稿同步失败，等待本地重试。',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'draft-local-change',
        titleText: '发单草稿变更',
        statusText: '同步失败',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '草稿同步未完成，已保留本地草稿队列。',
      },
    ],
  });
});

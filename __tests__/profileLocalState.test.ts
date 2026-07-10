import {
  createFailedProfileSyncState,
  createPendingProfileSyncState,
  createSyncedProfileSyncState,
} from '../src/utils/profileLocalState';

test('creates profile sync states with structured update timestamps', () => {
  const now = new Date('2026-06-30T08:00:00+08:00').getTime();
  const updatedAtIso = new Date(now).toISOString();

  expect(createSyncedProfileSyncState('已同步', now)).toMatchObject({
    status: 'synced',
    message: '已同步',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [],
  });
  expect(createPendingProfileSyncState('待同步', now)).toMatchObject({
    status: 'pending',
    message: '待同步',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        statusText: '待同步',
        updatedAtText: '刚刚',
        updatedAtIso,
      },
    ],
  });
  expect(createFailedProfileSyncState('同步失败', now)).toMatchObject({
    status: 'failed',
    message: '同步失败',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        statusText: '同步失败',
        updatedAtText: '刚刚',
        updatedAtIso,
      },
    ],
  });
});

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
  expect(createSyncedProfileSyncState(undefined, now)).toMatchObject({
    status: 'synced',
    message: '本地资料已记录，等待平台资料同步。',
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
  expect(createPendingProfileSyncState(undefined, now)).toMatchObject({
    status: 'pending',
    operation: 'local',
    message: '个人中心资料已在本地更新，等待平台资料同步。',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'profile-local-change',
        titleText: '个人中心资料变更',
        statusText: '待同步',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '个人中心资料已保留在本地，待平台资料同步。',
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
  expect(createFailedProfileSyncState(undefined, now)).toMatchObject({
    status: 'failed',
    operation: 'local',
    message: '个人中心资料同步失败，已保留本地变更。',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'profile-local-change',
        titleText: '个人中心资料变更',
        statusText: '同步失败',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText:
          '个人中心资料同步未完成，已保留本地变更，请返回个人中心重试。',
      },
    ],
  });
  expect(
    createPendingProfileSyncState('实名认证待同步', now, 'identityVerification'),
  ).toMatchObject({
    status: 'pending',
    operation: 'identityVerification',
    message: '实名认证待同步',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'profile-identity-verification-change',
        titleText: '实名认证资料',
        statusText: '待同步',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '实名认证资料已保留在本地，稍后可继续提交认证审核。',
      },
    ],
  });
  expect(
    createFailedProfileSyncState('企业认证同步失败', now, 'enterpriseVerification'),
  ).toMatchObject({
    status: 'failed',
    operation: 'enterpriseVerification',
    message: '企业认证同步失败',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'profile-enterprise-verification-change',
        titleText: '企业认证资料',
        statusText: '同步失败',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '企业认证资料提交未完成，已保留本地资料，请返回个人中心重试。',
      },
    ],
  });
  expect(
    createFailedProfileSyncState('账号资料同步失败', now, 'accountProfile'),
  ).toMatchObject({
    status: 'failed',
    operation: 'accountProfile',
    message: '账号资料同步失败',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'profile-account-profile-change',
        titleText: '账号资料与设置',
        statusText: '同步失败',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '账号资料与设置同步未完成，已保留本地修改，请返回个人中心重试。',
      },
    ],
  });
  expect(
    createFailedProfileSyncState('发票申请同步失败', now, 'invoiceApplication'),
  ).toMatchObject({
    status: 'failed',
    operation: 'invoiceApplication',
    message: '发票申请同步失败',
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      {
        id: 'profile-invoice-application-change',
        titleText: '发票申请',
        statusText: '同步失败',
        updatedAtText: '刚刚',
        updatedAtIso,
        noteText: '发票申请同步未完成，已保留本地申请，请返回个人中心重试。',
      },
    ],
  });
});

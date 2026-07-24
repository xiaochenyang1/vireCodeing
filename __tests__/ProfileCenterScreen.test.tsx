import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { orderListOrders } from '../src/data/mockData';
import { ProfileCenterScreen } from '../src/screens/ProfileCenterScreen';
import { clearAuthSession, saveAuthSession } from '../src/utils/authSession';
import {
  clearProfileLocalState,
  createFailedProfileSyncState,
  getProfileLocalState,
  saveProfileLocalState,
} from '../src/utils/profileLocalState';

function createPlatformProfileApiMock(overrides: Record<string, unknown> = {}) {
  return {
    getAccountProfile: jest.fn().mockResolvedValue(null),
    saveAccountProfile: jest.fn(),
    getIdentityVerification: jest.fn().mockResolvedValue(null),
    saveIdentityVerification: jest.fn(),
    getEnterpriseVerification: jest.fn().mockResolvedValue(null),
    saveEnterpriseVerification: jest.fn(),
    getInvoices: jest.fn().mockResolvedValue([]),
    getSpendingRecords: jest.fn().mockResolvedValue(undefined),
    getCoupons: jest.fn().mockResolvedValue(undefined),
    getEvaluations: jest.fn().mockResolvedValue(undefined),
    getReceivedEvaluations: jest.fn().mockResolvedValue(undefined),
    createInvoiceApplication: jest.fn(),
    getAddressBook: jest.fn().mockResolvedValue(null),
    saveAddressBook: jest.fn(),
    ...overrides,
  } as React.ComponentProps<typeof ProfileCenterScreen>['platformProfileApi'] &
    Record<string, jest.Mock>;
}

function createPlatformFileApiMock(overrides: Record<string, unknown> = {}) {
  return {
    createUploadIntent: jest.fn(),
    confirmUploaded: jest.fn(),
    confirmLocalUploadTarget: jest.fn(),
    getFileMetadata: jest.fn(),
    ...overrides,
  } as React.ComponentProps<typeof ProfileCenterScreen>['platformFileApi'] &
    Record<string, jest.Mock>;
}

async function renderProfileCenter(
  platformProfileApi: React.ComponentProps<typeof ProfileCenterScreen>['platformProfileApi'],
  platformFileApi?: React.ComponentProps<typeof ProfileCenterScreen>['platformFileApi'],
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ProfileCenterScreen
        now={Date.parse('2026-07-22T08:30:00.000Z')}
        orders={[orderListOrders[0]]}
        unreadMessageCount={0}
        platformProfileApi={platformProfileApi}
        platformFileApi={platformFileApi}
        onBackHome={jest.fn()}
        onLogout={jest.fn()}
      />,
    );
    await flushMicrotasks();
  });

  return renderer;
}

async function openProfileSection(
  renderer: ReactTestRenderer.ReactTestRenderer,
  sectionId:
    | 'identity-verification'
    | 'enterprise-verification'
    | 'evaluations',
) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ testID: `profile-entry-${sectionId}` }).props.onPress();
    await flushMicrotasks();
  });
}

async function backToOverview(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ testID: 'profile-back-overview' }).props.onPress();
    await flushMicrotasks();
  });
}

function createIdentityDraftState() {
  return {
    ...getProfileLocalState(),
    identityVerification: {
      realName: '本地张先生',
      idNumber: '440300199001011234',
      identityPhotoCount: 2,
      identityPhotoFiles: [
        {
          fileId: 'file-local-front',
          fileName: '身份证正面.png',
          purpose: 'identity' as const,
          status: 'uploaded' as const,
        },
        {
          fileId: 'file-local-back',
          fileName: '身份证反面.png',
          purpose: 'identity' as const,
          status: 'uploaded' as const,
        },
      ],
      faceVerified: true,
      status: 'reviewing' as const,
      updatedAtIso: '2026-07-22T08:00:00.000Z',
    },
    syncState: createFailedProfileSyncState(
      '实名认证资料提交失败，已保留本地资料，请稍后重试。',
      Date.parse('2026-07-22T08:01:00.000Z'),
      'identityVerification',
    ),
  };
}

function createEnterpriseDraftState() {
  return {
    ...getProfileLocalState(),
    enterpriseVerification: {
      enterpriseName: '本地晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
      licenseFiles: [
        {
          fileId: 'file-local-license',
          fileName: '营业执照.png',
          purpose: 'identity' as const,
          status: 'uploaded' as const,
        },
      ],
      status: 'reviewing' as const,
      updatedAtIso: '2026-07-22T08:00:00.000Z',
    },
    syncState: createFailedProfileSyncState(
      '企业认证资料提交失败，已保留本地资料，请稍后重试。',
      Date.parse('2026-07-22T08:01:00.000Z'),
      'enterpriseVerification',
    ),
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('ProfileCenterScreen verification sync guards', () => {
  afterEach(() => {
    clearAuthSession();
    clearProfileLocalState();
    jest.clearAllMocks();
  });

  it('keeps the local identity draft until sync succeeds and ignores older platform snapshots after reopening', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });
    saveProfileLocalState(createIdentityDraftState());

    const platformProfileApi = createPlatformProfileApiMock({
      getIdentityVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        realName: '平台旧实名',
        idNumber: '440300199001011233',
        identityFrontFileId: 'file-platform-front',
        identityBackFileId: 'file-platform-back',
        faceVerified: true,
        status: 'reviewing',
        updatedAtIso: '2026-07-22T08:05:00.000Z',
      }),
      saveIdentityVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        realName: '本地张先生',
        idNumber: '440300199001011234',
        identityFrontFileId: 'file-local-front',
        identityBackFileId: 'file-local-back',
        faceVerified: true,
        status: 'reviewing',
        updatedAtIso: '2026-07-22T08:10:00.000Z',
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);

    await openProfileSection(renderer, 'identity-verification');

    expect(
      renderer.root.findByProps({ testID: 'identity-verification-name' }).props.value,
    ).toBe('本地张先生');
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'identityVerification',
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'identity-verification-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformProfileApi.saveIdentityVerification).toHaveBeenCalledWith({
      realName: '本地张先生',
      idNumber: '440300199001011234',
      identityFrontFileId: 'file-local-front',
      identityBackFileId: 'file-local-back',
      faceVerified: true,
    });
    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '本地张先生',
      updatedAtIso: '2026-07-22T08:10:00.000Z',
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'synced',
      operation: 'identityVerification',
      message: '实名认证资料已同步到平台审核。',
    });

    await backToOverview(renderer);
    await openProfileSection(renderer, 'identity-verification');

    expect(platformProfileApi.getIdentityVerification).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'identity-verification-name' }).props.value,
    ).toBe('本地张先生');
    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '本地张先生',
      updatedAtIso: '2026-07-22T08:10:00.000Z',
    });
  });

  it('hydrates platform identity verification files with metadata so previews can render', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const platformProfileApi = createPlatformProfileApiMock({
      getIdentityVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        realName: '平台实名',
        idNumber: '440300199001011233',
        identityFrontFileId: 'file-platform-front',
        identityBackFileId: 'file-platform-back',
        faceVerified: true,
        status: 'reviewing',
        updatedAtIso: '2026-07-22T08:05:00.000Z',
      }),
    });
    const platformFileApi = createPlatformFileApiMock({
      getFileMetadata: jest
        .fn()
        .mockImplementation((fileId: string) =>
          Promise.resolve({
            id: fileId,
            ownerUserId: 'shipper-1',
            purpose: 'identity',
            objectKey: `shipper-1/identity/${fileId}.png`,
            status: 'uploaded',
            publicUrl: `https://cdn.example.com/${fileId}.png`,
            createdAtIso: '2026-07-22T08:04:00.000Z',
          }),
        ),
    });

    const renderer = await renderProfileCenter(
      platformProfileApi,
      platformFileApi,
    );

    await openProfileSection(renderer, 'identity-verification');

    expect(platformFileApi.getFileMetadata).toHaveBeenNthCalledWith(
      1,
      'file-platform-front',
    );
    expect(platformFileApi.getFileMetadata).toHaveBeenNthCalledWith(
      2,
      'file-platform-back',
    );
    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-front-preview-image',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-platform-front.png',
    });
    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-back-preview-image',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-platform-back.png',
    });
    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '平台实名',
      identityPhotoFiles: [
        {
          fileId: 'file-platform-front',
          publicUrl: 'https://cdn.example.com/file-platform-front.png',
          objectKey: 'shipper-1/identity/file-platform-front.png',
        },
        {
          fileId: 'file-platform-back',
          publicUrl: 'https://cdn.example.com/file-platform-back.png',
          objectKey: 'shipper-1/identity/file-platform-back.png',
        },
      ],
    });
  });

  it('keeps the local enterprise draft until sync succeeds and ignores older platform snapshots after reopening', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });
    saveProfileLocalState(createEnterpriseDraftState());

    const platformProfileApi = createPlatformProfileApiMock({
      getEnterpriseVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        enterpriseName: '平台旧企业',
        creditCode: '91440300MA5TEST999',
        legalName: '旧法人',
        legalId: '440300199001011233',
        enterprisePhone: '13800138000',
        licenseFileId: 'file-platform-license',
        status: 'reviewing',
        updatedAtIso: '2026-07-22T08:05:00.000Z',
      }),
      saveEnterpriseVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        enterpriseName: '本地晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '张先生',
        legalId: '440300199001011234',
        enterprisePhone: '13900139088',
        licenseFileId: 'file-local-license',
        status: 'reviewing',
        updatedAtIso: '2026-07-22T08:10:00.000Z',
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);

    await openProfileSection(renderer, 'enterprise-verification');

    expect(
      renderer.root.findByProps({ testID: 'enterprise-verification-name' }).props
        .value,
    ).toBe('本地晨星贸易有限公司');
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'failed',
      operation: 'enterpriseVerification',
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'enterprise-verification-submit' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformProfileApi.saveEnterpriseVerification).toHaveBeenCalledWith({
      enterpriseName: '本地晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-local-license',
    });
    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '本地晨星贸易有限公司',
      updatedAtIso: '2026-07-22T08:10:00.000Z',
    });
    expect(getProfileLocalState().syncState).toMatchObject({
      status: 'synced',
      operation: 'enterpriseVerification',
      message: '企业认证资料已同步到平台审核。',
    });

    await backToOverview(renderer);
    await openProfileSection(renderer, 'enterprise-verification');

    expect(platformProfileApi.getEnterpriseVerification).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'enterprise-verification-name' }).props
        .value,
    ).toBe('本地晨星贸易有限公司');
    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '本地晨星贸易有限公司',
      updatedAtIso: '2026-07-22T08:10:00.000Z',
    });
  });

  it('hydrates platform enterprise verification files with metadata so previews can render', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const platformProfileApi = createPlatformProfileApiMock({
      getEnterpriseVerification: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        enterpriseName: '平台晨星贸易有限公司',
        creditCode: '91440300MA5TEST999',
        legalName: '张先生',
        legalId: '440300199001011233',
        enterprisePhone: '13800138000',
        licenseFileId: 'file-platform-license',
        status: 'reviewing',
        updatedAtIso: '2026-07-22T08:05:00.000Z',
      }),
    });
    const platformFileApi = createPlatformFileApiMock({
      getFileMetadata: jest.fn().mockResolvedValue({
        id: 'file-platform-license',
        ownerUserId: 'shipper-1',
        purpose: 'identity',
        objectKey: 'shipper-1/identity/file-platform-license.png',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/file-platform-license.png',
        createdAtIso: '2026-07-22T08:04:00.000Z',
      }),
    });

    const renderer = await renderProfileCenter(
      platformProfileApi,
      platformFileApi,
    );

    await openProfileSection(renderer, 'enterprise-verification');

    expect(platformFileApi.getFileMetadata).toHaveBeenCalledWith(
      'file-platform-license',
    );
    expect(
      renderer.root.findByProps({
        testID: 'enterprise-verification-license-preview-image',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-platform-license.png',
    });
    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '平台晨星贸易有限公司',
      licenseFiles: [
        {
          fileId: 'file-platform-license',
          publicUrl: 'https://cdn.example.com/file-platform-license.png',
          objectKey: 'shipper-1/identity/file-platform-license.png',
        },
      ],
    });
  });

  it('hydrates platform evaluation files with metadata so profile previews can render', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const platformProfileApi = createPlatformProfileApiMock({
      getEvaluations: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [
          {
            id: 'evaluation-platform-1',
            orderId: 'order-platform-1',
            orderNo: 'HY202607090101',
            driverName: '平台司机李师傅',
            rating: 5,
            tags: ['准时送达'],
            content: '平台评价内容',
            anonymous: false,
            photoCount: 1,
            photoFileIds: ['file-platform-evaluation-1'],
            submittedAtIso: '2026-07-22T08:05:00.000Z',
          },
        ],
      }),
      getReceivedEvaluations: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [
          {
            id: 'received-platform-1',
            orderId: 'order-platform-2',
            orderNo: 'HY202607090102',
            driverName: '平台司机王师傅',
            rating: 4,
            tags: ['沟通顺畅'],
            content: '司机评价货主内容',
            anonymous: false,
            photoCount: 1,
            photoFileIds: ['file-platform-received-1'],
            submittedAtIso: '2026-07-22T08:10:00.000Z',
          },
        ],
      }),
    });
    const platformFileApi = createPlatformFileApiMock({
      getFileMetadata: jest
        .fn()
        .mockImplementation((fileId: string) =>
          Promise.resolve({
            id: fileId,
            ownerUserId: 'shipper-1',
            purpose: 'evaluation',
            objectKey: `shipper-1/evaluation/${fileId}.png`,
            status: 'uploaded',
            publicUrl: `https://cdn.example.com/${fileId}.png`,
            createdAtIso: '2026-07-22T08:04:00.000Z',
          }),
        ),
    });

    const renderer = await renderProfileCenter(
      platformProfileApi,
      platformFileApi,
    );

    await openProfileSection(renderer, 'evaluations');

    expect(platformFileApi.getFileMetadata).toHaveBeenNthCalledWith(
      1,
      'file-platform-evaluation-1',
    );
    expect(platformFileApi.getFileMetadata).toHaveBeenNthCalledWith(
      2,
      'file-platform-received-1',
    );
    expect(
      renderer.root.findByProps({
        testID:
          'profile-evaluation-photo-image-evaluation-platform-evaluation-platform-1-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-platform-evaluation-1.png',
    });
    expect(
      renderer.root.findByProps({
        testID:
          'profile-evaluation-photo-image-received-evaluation-platform-received-platform-1-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/file-platform-received-1.png',
    });
  });
});

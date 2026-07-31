import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { ImageCredentialCard } from '../src/components/ImageCredentialCard';
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
    listEvaluationAppealCases: jest.fn().mockResolvedValue({
      userId: 'shipper-1',
      items: [],
    }),
    submitEvaluationAppeal: jest.fn(),
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
    getOrderAttachmentPreview: jest.fn(),
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
    | 'evaluations'
    | 'settings',
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

function createAccountProfileDraftState() {
  return {
    ...getProfileLocalState(),
    account: {
      displayName: '本地昵称',
      boundPhone: '13900139088',
      avatarPhotoCount: 0,
    },
    syncState: createFailedProfileSyncState(
      '账号资料同步失败，请稍后重试。',
      Date.parse('2026-07-22T08:01:00.000Z'),
      'accountProfile',
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
    expect(
      renderer.root.findAllByProps({
        testID: 'identity-verification-manual-refresh',
      }),
    ).toHaveLength(0);
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
      renderer.root.findByProps({
        testID: 'identity-verification-manual-refresh',
      }),
    ).toBeTruthy();
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

  it('manually refreshes platform identity verification snapshots from profile', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    let identityRequestCount = 0;
    const platformProfileApi = createPlatformProfileApiMock({
      getIdentityVerification: jest.fn().mockImplementation(() => {
        identityRequestCount += 1;

        return Promise.resolve(
          identityRequestCount === 1
            ? {
                shipperId: 'shipper-1',
                realName: '平台旧实名',
                idNumber: '440300199001011233',
                identityFrontFileId: 'file-platform-front-old',
                identityBackFileId: 'file-platform-back-old',
                faceVerified: true,
                status: 'reviewing',
                updatedAtIso: '2026-07-22T08:05:00.000Z',
              }
            : {
                shipperId: 'shipper-1',
                realName: '平台新实名',
                idNumber: '440300199001011235',
                identityFrontFileId: 'file-platform-front-new',
                identityBackFileId: 'file-platform-back-new',
                faceVerified: true,
                status: 'approved',
                updatedAtIso: '2026-07-22T08:20:00.000Z',
              },
        );
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);

    await openProfileSection(renderer, 'identity-verification');

    expect(
      renderer.root.findByProps({ testID: 'identity-verification-name' }).props.value,
    ).toBe('平台旧实名');
    expect(
      renderer.root.findByProps({
        testID: 'identity-verification-manual-refresh',
      }),
    ).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'identity-verification-manual-refresh' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformProfileApi.getIdentityVerification).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'identity-verification-name' }).props.value,
    ).toBe('平台新实名');
    expect(getProfileLocalState().identityVerification).toMatchObject({
      realName: '平台新实名',
      status: 'approved',
      updatedAtIso: '2026-07-22T08:20:00.000Z',
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
    expect(
      renderer.root.findAllByProps({
        testID: 'enterprise-verification-manual-refresh',
      }),
    ).toHaveLength(0);
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
      renderer.root.findByProps({
        testID: 'enterprise-verification-manual-refresh',
      }),
    ).toBeTruthy();
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
        testID: 'enterprise-verification-license-preview-image-1',
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

  it('manually refreshes platform enterprise verification snapshots from profile', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    let enterpriseRequestCount = 0;
    const platformProfileApi = createPlatformProfileApiMock({
      getEnterpriseVerification: jest.fn().mockImplementation(() => {
        enterpriseRequestCount += 1;

        return Promise.resolve(
          enterpriseRequestCount === 1
            ? {
                shipperId: 'shipper-1',
                enterpriseName: '平台旧企业',
                creditCode: '91440300MA5TEST999',
                legalName: '旧法人',
                legalId: '440300199001011233',
                enterprisePhone: '13800138000',
                licenseFileId: 'file-platform-license-old',
                status: 'reviewing',
                updatedAtIso: '2026-07-22T08:05:00.000Z',
              }
            : {
                shipperId: 'shipper-1',
                enterpriseName: '平台新企业',
                creditCode: '91440300MA5TEST002',
                legalName: '新法人',
                legalId: '440300199001011236',
                enterprisePhone: '13900139099',
                licenseFileId: 'file-platform-license-new',
                status: 'approved',
                updatedAtIso: '2026-07-22T08:20:00.000Z',
              },
        );
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);

    await openProfileSection(renderer, 'enterprise-verification');

    expect(
      renderer.root.findByProps({ testID: 'enterprise-verification-name' }).props
        .value,
    ).toBe('平台旧企业');
    expect(
      renderer.root.findByProps({
        testID: 'enterprise-verification-manual-refresh',
      }),
    ).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'enterprise-verification-manual-refresh' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformProfileApi.getEnterpriseVerification).toHaveBeenCalledTimes(
      2,
    );
    expect(
      renderer.root.findByProps({ testID: 'enterprise-verification-name' }).props
        .value,
    ).toBe('平台新企业');
    expect(getProfileLocalState().enterpriseVerification).toMatchObject({
      enterpriseName: '平台新企业',
      status: 'approved',
      updatedAtIso: '2026-07-22T08:20:00.000Z',
    });
  });

  it('hydrates platform evaluation files through order participant access', async () => {
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
      getOrderAttachmentPreview: jest
        .fn()
        .mockImplementation((orderId: string, fileId: string) =>
          Promise.resolve({
            fileId,
            previewUrl: `https://cdn.example.com/${orderId}/${fileId}.png`,
            previewExpiresAtIso: '2026-07-22T08:40:00.000Z',
          }),
        ),
    });

    const renderer = await renderProfileCenter(
      platformProfileApi,
      platformFileApi,
    );

    await openProfileSection(renderer, 'evaluations');

    expect(platformFileApi.getOrderAttachmentPreview).toHaveBeenCalledTimes(2);
    expect(platformFileApi.getOrderAttachmentPreview).toHaveBeenCalledWith(
      'order-platform-1',
      'file-platform-evaluation-1',
    );
    expect(platformFileApi.getOrderAttachmentPreview).toHaveBeenCalledWith(
      'order-platform-2',
      'file-platform-received-1',
    );
    expect(platformFileApi.getFileMetadata).not.toHaveBeenCalled();
    expect(
      renderer.root.findByProps({
        testID:
          'profile-evaluation-photo-image-evaluation-platform-evaluation-platform-1-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/order-platform-1/file-platform-evaluation-1.png',
    });
    expect(
      renderer.root.findByProps({
        testID:
          'profile-evaluation-photo-image-received-evaluation-platform-received-platform-1-1',
      }).props.source,
    ).toEqual({
      uri: 'https://cdn.example.com/order-platform-2/file-platform-received-1.png',
    });
    const evaluationCards = renderer.root.findAllByType(ImageCredentialCard);
    const receivedCard = evaluationCards.find(
      card =>
        card.props.imageTestID ===
        'profile-evaluation-photo-image-received-evaluation-platform-received-platform-1-1',
    );

    expect(receivedCard?.props.previewAccess).toEqual({
      kind: 'order',
      orderId: 'order-platform-2',
    });
    expect(receivedCard?.props.previewGroup[0].access).toEqual({
      kind: 'order',
      orderId: 'order-platform-2',
    });
  });

  it('merges appeal cases and submits evaluation appeals from profile records', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const hiddenAppealCase = {
      id: 'evaluation-hidden-1',
      orderId: 'order-hidden-1',
      orderNo: 'HY-HIDDEN-1',
      direction: 'shipper_to_driver' as const,
      reviewerUserId: 'shipper-1',
      reviewerName: '货主',
      revieweeUserId: 'driver-1',
      revieweeName: '李师傅',
      rating: 2,
      tags: [] as string[],
      content: '被隐藏的评价',
      anonymous: false,
      photoCount: 0,
      submittedAtIso: '2026-07-22T08:00:00.000Z',
      moderationStatus: 'hidden' as const,
      moderationVersion: 3,
      appealStatus: 'none' as const,
    };
    const platformProfileApi = createPlatformProfileApiMock({
      getEvaluations: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [],
      }),
      getReceivedEvaluations: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [],
      }),
      listEvaluationAppealCases: jest
        .fn()
        .mockResolvedValueOnce({
          userId: 'shipper-1',
          items: [hiddenAppealCase],
        })
        .mockResolvedValue({
          userId: 'shipper-1',
          items: [
            {
              ...hiddenAppealCase,
              appealStatus: 'requested',
              latestAppeal: {
                id: 'appeal-1',
                evaluationId: 'evaluation-hidden-1',
                appellantUserId: 'shipper-1',
                status: 'requested',
                version: 1,
                reason: '评价内容合规，请恢复展示',
                moderationVersion: 3,
                submittedAtIso: '2026-07-22T09:00:00.000Z',
              },
            },
          ],
        }),
      submitEvaluationAppeal: jest.fn().mockResolvedValue({
        id: 'appeal-1',
        evaluationId: 'evaluation-hidden-1',
        appellantUserId: 'shipper-1',
        status: 'requested',
        version: 1,
        reason: '评价内容合规，请恢复展示',
        moderationVersion: 3,
        submittedAtIso: '2026-07-22T09:00:00.000Z',
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);
    await openProfileSection(renderer, 'evaluations');

    expect(platformProfileApi.listEvaluationAppealCases).toHaveBeenCalled();
    expect(
      renderer.root.findByProps({
        testID: 'evaluation-moderation-status-evaluation-hidden-1',
      }).props.children,
    ).toBe('展示状态：已隐藏');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'evaluation-appeal-reason-evaluation-hidden-1',
        })
        .props.onChangeText('评价内容合规，请恢复展示');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({
          testID: 'evaluation-appeal-submit-evaluation-hidden-1',
        })
        .props.onPress();
    });

    expect(platformProfileApi.submitEvaluationAppeal).toHaveBeenCalledWith(
      'evaluation-hidden-1',
      {
        reason: '评价内容合规，请恢复展示',
        baseModerationVersion: 3,
      },
    );
    expect(
      renderer.root.findByProps({
        testID: 'evaluation-appeal-status-evaluation-hidden-1',
      }).props.children,
    ).toEqual(['申诉状态：', '申诉处理中']);
  });

  it('keeps the local account profile draft and hides manual refresh while account sync is still failed', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });
    saveProfileLocalState(createAccountProfileDraftState());

    const platformProfileApi = createPlatformProfileApiMock({
      getAccountProfile: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '平台旧昵称',
        phone: '13800138000',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);

    await openProfileSection(renderer, 'settings');

    expect(
      renderer.root.findByProps({ testID: 'setting-display-name' }).props.value,
    ).toBe('本地昵称');
    expect(
      renderer.root.findAllByProps({
        testID: 'setting-account-manual-refresh',
      }),
    ).toHaveLength(0);
    expect(platformProfileApi.getAccountProfile).not.toHaveBeenCalled();
  });

  it('manually refreshes platform account profile snapshots from settings', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    let accountRequestCount = 0;
    const platformProfileApi = createPlatformProfileApiMock({
      getAccountProfile: jest.fn().mockImplementation(() => {
        accountRequestCount += 1;

        return Promise.resolve(
          accountRequestCount === 1
            ? {
                shipperId: 'shipper-1',
                displayName: '平台旧昵称',
                phone: '13800138000',
                phoneProtectionEnabled: true,
                loginProtectionEnabled: true,
                orderNotificationEnabled: true,
                promotionNotificationEnabled: false,
              }
            : {
                shipperId: 'shipper-1',
                displayName: '平台新昵称',
                phone: '13900139066',
                phoneProtectionEnabled: false,
                loginProtectionEnabled: true,
                orderNotificationEnabled: false,
                promotionNotificationEnabled: true,
                privacyConfirmedAtIso: '2026-07-22T08:20:00.000Z',
                privacyPolicyVersion: 'privacy-policy-v2026-07-22',
                privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
              },
        );
      }),
    });

    const renderer = await renderProfileCenter(platformProfileApi);

    await openProfileSection(renderer, 'settings');

    expect(
      renderer.root.findByProps({ testID: 'setting-display-name' }).props.value,
    ).toBe('平台旧昵称');
    expect(
      renderer.root.findByProps({ testID: 'setting-bound-phone' }).props.value,
    ).toBe('13800138000');
    expect(
      renderer.root.findByProps({
        testID: 'setting-account-manual-refresh',
      }),
    ).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'setting-account-manual-refresh' })
        .props.onPress();
      await flushMicrotasks();
    });

    expect(platformProfileApi.getAccountProfile).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ testID: 'setting-display-name' }).props.value,
    ).toBe('平台新昵称');
    expect(
      renderer.root.findByProps({ testID: 'setting-bound-phone' }).props.value,
    ).toBe('13900139066');
    expect(getProfileLocalState()).toMatchObject({
      account: {
        displayName: '平台新昵称',
        boundPhone: '13900139066',
      },
    });
  });
});

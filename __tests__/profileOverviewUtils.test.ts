import {
  calculateProfileCreditScore,
  createProfileOverviewModel,
  maskProfilePhoneNumber,
  profileEntryConfigs,
} from '../src/utils/profileOverview';

test('masks profile phone numbers only when they match mobile number shape', () => {
  expect(maskProfilePhoneNumber('13800138000')).toBe('138****8000');
  expect(maskProfilePhoneNumber('400-800-1234')).toBe('400-800-1234');
});

test('calculates local profile credit score from verification statuses', () => {
  expect(
    calculateProfileCreditScore({
      verificationStatus: 'verified',
      enterpriseVerificationStatus: 'unverified',
    }),
  ).toBe(96);
  expect(
    calculateProfileCreditScore({
      verificationStatus: 'reviewing',
      enterpriseVerificationStatus: 'reviewing',
    }),
  ).toBe(98);
  expect(
    calculateProfileCreditScore({
      verificationStatus: 'rejected',
      enterpriseVerificationStatus: 'rejected',
    }),
  ).toBe(92);
});

test('creates profile overview model from local profile state', () => {
  expect(
    createProfileOverviewModel({
      account: {
        displayName: ' 晨星物流 ',
        boundPhone: '13900139999',
        avatarPhotoCount: 0,
      },
      identityVerification: {
        realName: '张先生',
        idNumber: '440300199001011234',
        identityPhotoCount: 2,
        faceVerified: true,
        status: 'reviewing',
      },
      enterpriseVerification: {
        enterpriseName: '晨星物流',
        creditCode: '91440300MA5KTEST1X',
        legalName: '张先生',
        legalId: '440300199001011234',
        enterprisePhone: '13900139999',
        licensePhotoCount: 1,
        status: 'reviewing',
      },
      monthlyOrderCount: 7,
      unreadMessageCount: 3,
    }),
  ).toEqual({
    avatarInitial: '晨',
    displayName: ' 晨星物流 ',
    accountTypeLabel: '企业货主',
    maskedPhone: '139****9999',
    verificationLabel: '审核中',
    enterpriseVerificationLabel: '审核中',
    creditScore: 98,
    monthlyOrderCount: 7,
    unreadMessageCount: 3,
  });
});

test('maps approved verification snapshots to verified profile badges', () => {
  expect(
    createProfileOverviewModel({
      account: {
        displayName: '晨星物流',
        boundPhone: '13900139999',
        avatarPhotoCount: 0,
      },
      identityVerification: {
        realName: '张先生',
        idNumber: '440300199001011234',
        identityPhotoCount: 2,
        faceVerified: true,
        status: 'approved',
      },
      enterpriseVerification: {
        enterpriseName: '晨星物流',
        creditCode: '91440300MA5KTEST1X',
        legalName: '张先生',
        legalId: '440300199001011234',
        enterprisePhone: '13900139999',
        licensePhotoCount: 1,
        status: 'approved',
      },
      monthlyOrderCount: 3,
      unreadMessageCount: 1,
    }),
  ).toEqual(
    expect.objectContaining({
      verificationLabel: '已认证',
      enterpriseVerificationLabel: '已认证',
      creditScore: 98,
    }),
  );
});

test('falls back to personal account summary when enterprise verification is rejected', () => {
  expect(
    createProfileOverviewModel({
      account: {
        displayName: '',
        boundPhone: '13800138000',
        avatarPhotoCount: 0,
      },
      enterpriseVerification: {
        enterpriseName: '晨星物流',
        creditCode: '91440300MA5KTEST1X',
        legalName: '张先生',
        legalId: '440300199001011234',
        enterprisePhone: '13900139999',
        licensePhotoCount: 1,
        rejectionReason: '营业执照不清晰',
      },
      monthlyOrderCount: 2,
      unreadMessageCount: 0,
    }),
  ).toEqual({
    avatarInitial: '货',
    displayName: '',
    accountTypeLabel: '个人货主',
    maskedPhone: '138****8000',
    verificationLabel: '已认证',
    enterpriseVerificationLabel: '认证失败',
    creditScore: 96,
    monthlyOrderCount: 2,
    unreadMessageCount: 0,
  });
});

test('keeps profile entry configs in the current overview order', () => {
  expect(profileEntryConfigs.map(entry => entry.id)).toEqual([
    'addresses',
    'contacts',
    'evaluations',
    'spending',
    'identity-verification',
    'enterprise-verification',
    'invoices',
    'coupons',
    'settings',
  ]);
  expect(profileEntryConfigs[0]).toEqual({
    id: 'addresses',
    title: '常用地址',
    description: '管理装货和卸货地址，本地版展示高频地址',
  });
});

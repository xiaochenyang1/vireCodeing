import {
  createEnterpriseVerificationRequest,
  createIdentityVerificationRequest,
  getEnterpriseVerificationRejectionNotice,
  getIdentityVerificationRejectionNotice,
} from '../src/utils/profileVerifications';

test('validates and normalizes local identity verification input', () => {
  expect(
    createIdentityVerificationRequest({
      realName: '',
      idNumber: '440300199001011234',
      frontPhotoAdded: true,
      backPhotoAdded: true,
      faceVerified: true,
    }),
  ).toEqual({ noticeText: '请填写真实姓名' });
  expect(
    createIdentityVerificationRequest({
      realName: '张三',
      idNumber: '44030019900101123x',
      frontPhotoAdded: true,
      backPhotoAdded: true,
      faceVerified: true,
    }),
    ).toEqual({
      request: {
        realName: '张三',
        idNumber: '44030019900101123X',
        identityPhotoCount: 2,
        faceVerified: true,
        status: 'reviewing',
      },
      noticeText: '',
    });
});

test('requires identity photos and local face check before identity submission', () => {
  expect(
    createIdentityVerificationRequest({
      realName: '张三',
      idNumber: '440300199001011234',
      frontPhotoAdded: true,
      backPhotoAdded: false,
      faceVerified: true,
    }),
  ).toEqual({ noticeText: '请添加身份证正反面凭证' });
  expect(
    createIdentityVerificationRequest({
      realName: '张三',
      idNumber: '440300199001011234',
      frontPhotoAdded: true,
      backPhotoAdded: true,
      faceVerified: false,
    }),
  ).toEqual({ noticeText: '请先完成人脸核验' });
});

test('keeps identity verification file references when photos are attached', () => {
  expect(
    createIdentityVerificationRequest({
      realName: '张三',
      idNumber: '44030019900101123x',
      frontPhotoAdded: true,
      backPhotoAdded: true,
      faceVerified: true,
      frontPhotoFile: {
        fileId: 'file-front',
        fileName: '身份证正面.png',
        purpose: 'identity',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/front.png',
      },
      backPhotoFile: {
        fileId: 'file-back',
        fileName: '身份证反面.png',
        purpose: 'identity',
        status: 'uploaded',
        publicUrl: 'https://cdn.example.com/back.png',
      },
    }),
  ).toEqual({
      request: {
        realName: '张三',
        idNumber: '44030019900101123X',
        identityPhotoCount: 2,
        identityPhotoFiles: [
        {
          fileId: 'file-front',
          fileName: '身份证正面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/front.png',
        },
        {
          fileId: 'file-back',
          fileName: '身份证反面.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/back.png',
        },
        ],
        faceVerified: true,
        status: 'reviewing',
      },
      noticeText: '',
    });
});

test('validates and normalizes local enterprise verification input', () => {
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: '',
      creditCode: '91440300MA5TEST001',
      legalName: '张三',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
    }),
  ).toEqual({ noticeText: '请填写企业名称' });
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: ' 深圳晨星贸易有限公司 ',
      creditCode: '91440300ma5test001',
      legalName: ' 李四 ',
      legalId: '44030019900101123x',
      enterprisePhone: '13900139088',
      licensePhotoCount: 2,
    }),
    ).toEqual({
      request: {
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '李四',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licensePhotoCount: 2,
        status: 'reviewing',
      },
      noticeText: '',
    });
});

test('requires valid enterprise legal fields, phone and license voucher', () => {
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: 'bad',
      legalName: '张三',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
    }),
  ).toEqual({ noticeText: '请填写 15-20 位统一社会信用代码或营业执照号' });
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
    }),
  ).toEqual({ noticeText: '请填写法人姓名' });
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张三',
      legalId: '44030019900101123',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
    }),
  ).toEqual({ noticeText: '请填写 18 位法人身份证号' });
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张三',
      legalId: '440300199001011234',
      enterprisePhone: '12345',
      licensePhotoCount: 1,
    }),
  ).toEqual({ noticeText: '请填写 11 位企业联系电话' });
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张三',
      legalId: '440300199001011234',
      enterprisePhone: '13900139088',
      licensePhotoCount: 0,
    }),
  ).toEqual({ noticeText: '请先添加营业执照凭证' });
});

test('keeps enterprise verification license file references', () => {
  expect(
    createEnterpriseVerificationRequest({
      enterpriseName: ' 深圳晨星贸易有限公司 ',
      creditCode: '91440300ma5test001',
      legalName: ' 李四 ',
      legalId: '44030019900101123x',
      enterprisePhone: '13900139088',
      licensePhotoCount: 1,
      licenseFiles: [
        {
          fileId: 'file-license',
          fileName: '营业执照.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/license.png',
        },
      ],
    }),
  ).toEqual({
      request: {
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '李四',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licensePhotoCount: 1,
        licenseFiles: [
        {
          fileId: 'file-license',
          fileName: '营业执照.png',
          purpose: 'identity',
          status: 'uploaded',
          publicUrl: 'https://cdn.example.com/license.png',
          },
        ],
        status: 'reviewing',
      },
      noticeText: '',
    });
});

test('returns local verification rejection notices', () => {
  expect(getIdentityVerificationRejectionNotice()).toEqual({
    reason: '身份证照片边缘不完整，请重新上传清晰照片',
    noticeText: '实名认证已驳回：身份证照片边缘不完整，请重新上传清晰照片',
  });
  expect(getEnterpriseVerificationRejectionNotice()).toEqual({
    reason: '营业执照信息与企业名称不一致，请重新上传清晰凭证',
    noticeText:
      '企业认证已驳回：营业执照信息与企业名称不一致，请重新上传清晰凭证',
  });
});

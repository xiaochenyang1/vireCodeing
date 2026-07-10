import { ZodError } from 'zod';
import {
  parseSaveShipperEnterpriseVerificationRequest,
  parseSaveShipperIdentityVerificationRequest,
} from './profile-verification.validation';

describe('profile verification validation', () => {
  it('parses a shipper identity verification request', () => {
    expect(
      parseSaveShipperIdentityVerificationRequest({
        realName: ' 张三 ',
        idNumber: '44030019900101123x',
        identityFrontFileId: ' file-front ',
        identityBackFileId: ' file-back ',
        faceVerified: true,
      }),
    ).toEqual({
      realName: '张三',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
    });
  });

  it('rejects invalid shipper identity verification requests', () => {
    expect(() =>
      parseSaveShipperIdentityVerificationRequest({
        realName: ' ',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
      }),
    ).toThrow('真实姓名不能为空');
    expect(() =>
      parseSaveShipperIdentityVerificationRequest({
        realName: '张三',
        idNumber: 'bad-id',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
      }),
    ).toThrow('身份证号格式不正确');
    expect(() =>
      parseSaveShipperIdentityVerificationRequest({
        realName: '张三',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: false,
      }),
    ).toThrow('请先完成人脸核验');
  });

  it('parses a shipper enterprise verification request', () => {
    expect(
      parseSaveShipperEnterpriseVerificationRequest({
        enterpriseName: ' 深圳晨星贸易有限公司 ',
        creditCode: '91440300ma5test001',
        legalName: ' 李四 ',
        legalId: '44030019900101123x',
        enterprisePhone: ' 13900139088 ',
        licenseFileId: ' license-file ',
      }),
    ).toEqual({
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '李四',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'license-file',
    });
  });

  it('rejects invalid shipper enterprise verification requests', () => {
    expect(() =>
      parseSaveShipperEnterpriseVerificationRequest({
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: 'bad',
        legalName: '李四',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licenseFileId: 'license-file',
      }),
    ).toThrow('统一社会信用代码格式不正确');
    expect(() =>
      parseSaveShipperEnterpriseVerificationRequest({
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '李四',
        legalId: 'bad-id',
        enterprisePhone: '13900139088',
        licenseFileId: 'license-file',
      }),
    ).toThrow('法人身份证号格式不正确');
    expect(() =>
      parseSaveShipperEnterpriseVerificationRequest({
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '李四',
        legalId: '44030019900101123X',
        enterprisePhone: '12345',
        licenseFileId: 'license-file',
      }),
    ).toThrow('企业联系电话格式不正确');
    expect(() =>
      parseSaveShipperEnterpriseVerificationRequest({
        enterpriseName: '深'.repeat(61),
        creditCode: '91440300MA5TEST001',
        legalName: '李四',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licenseFileId: 'license-file',
      }),
    ).toThrow(ZodError);
  });
});

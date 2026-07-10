import {
  parseListDriverCertificationQuery,
  parseReviewDriverCertificationRequest,
  parseSubmitDriverIdentityCertificationRequest,
  parseSubmitDriverVehicleCertificationRequest,
} from './driver-certification.validation';

describe('driver certification validation', () => {
  it('normalizes identity certification requests', () => {
    expect(
      parseSubmitDriverIdentityCertificationRequest({
        realName: ' 张三 ',
        identityNumber: ' 110101199003071234 ',
        identityFrontFileId: ' file-front ',
        identityBackFileId: ' file-back ',
      }),
    ).toEqual({
      realName: '张三',
      identityNumber: '110101199003071234',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
    });
  });

  it('rejects invalid identity certification requests', () => {
    expect(() =>
      parseSubmitDriverIdentityCertificationRequest({
        realName: '',
        identityNumber: '110101199003071234',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
      }),
    ).toThrow('司机姓名不能为空');

    expect(() =>
      parseSubmitDriverIdentityCertificationRequest({
        realName: '张三',
        identityNumber: '123',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
      }),
    ).toThrow('身份证号不合法');
  });

  it('normalizes vehicle certification requests', () => {
    expect(
      parseSubmitDriverVehicleCertificationRequest({
        plateNumber: ' 粤B12345 ',
        vehicleType: ' medium ',
        vehicleLengthText: ' 6.8 米 ',
        loadCapacityText: ' 8 吨 ',
        hasTailboard: true,
        drivingLicenseFileId: ' file-vehicle-license ',
        driverLicenseFileId: ' file-driver-license ',
        transportQualificationFileId: ' file-transport-qualification ',
        operationPermitFileId: ' file-operation-permit ',
        vehiclePhotoFileId: ' file-vehicle-photo ',
      }),
    ).toEqual({
      plateNumber: '粤B12345',
      vehicleType: 'medium',
      vehicleLengthText: '6.8 米',
      loadCapacityText: '8 吨',
      hasTailboard: true,
      drivingLicenseFileId: 'file-vehicle-license',
      driverLicenseFileId: 'file-driver-license',
      transportQualificationFileId: 'file-transport-qualification',
      operationPermitFileId: 'file-operation-permit',
      vehiclePhotoFileId: 'file-vehicle-photo',
    });
  });

  it('rejects invalid vehicle certification requests', () => {
    expect(() =>
      parseSubmitDriverVehicleCertificationRequest({
        plateNumber: '',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: false,
        drivingLicenseFileId: 'file-license',
        driverLicenseFileId: 'file-driver-license',
        transportQualificationFileId: 'file-transport-qualification',
        operationPermitFileId: 'file-operation-permit',
        vehiclePhotoFileId: 'file-vehicle',
      }),
    ).toThrow('车牌号不能为空');

    expect(() =>
      parseSubmitDriverVehicleCertificationRequest({
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: 'yes',
        drivingLicenseFileId: 'file-license',
        driverLicenseFileId: 'file-driver-license',
        transportQualificationFileId: 'file-transport-qualification',
        operationPermitFileId: 'file-operation-permit',
        vehiclePhotoFileId: 'file-vehicle',
      }),
    ).toThrow();

    expect(() =>
      parseSubmitDriverVehicleCertificationRequest({
        plateNumber: '粤B12345',
        vehicleType: 'medium',
        vehicleLengthText: '6.8 米',
        loadCapacityText: '8 吨',
        hasTailboard: false,
        drivingLicenseFileId: 'file-license',
        driverLicenseFileId: '',
        transportQualificationFileId: 'file-transport-qualification',
        operationPermitFileId: 'file-operation-permit',
        vehiclePhotoFileId: 'file-vehicle',
      }),
    ).toThrow('驾驶证文件不能为空');
  });

  it('normalizes admin certification review requests', () => {
    expect(
      parseReviewDriverCertificationRequest({
        status: 'approved',
        rejectionReason: '  多余原因会被忽略  ',
      }),
    ).toEqual({
      status: 'approved',
    });

    expect(
      parseReviewDriverCertificationRequest({
        status: 'rejected',
        rejectionReason: '  证件照片不清晰  ',
      }),
    ).toEqual({
      status: 'rejected',
      rejectionReason: '证件照片不清晰',
    });
  });

  it('rejects invalid admin certification review requests', () => {
    expect(() =>
      parseReviewDriverCertificationRequest({
        status: 'reviewing',
      }),
    ).toThrow('审核状态只能是 approved 或 rejected');

    expect(() =>
      parseReviewDriverCertificationRequest({
        status: 'rejected',
        rejectionReason: '  ',
      }),
    ).toThrow('驳回原因不能为空');
  });

  it('normalizes admin certification list queries', () => {
    expect(
      parseListDriverCertificationQuery({
        status: ' approved ',
        page: '2',
        pageSize: '10',
      }),
    ).toEqual({
      status: 'approved',
      page: 2,
      pageSize: 10,
    });

    expect(parseListDriverCertificationQuery({})).toEqual({
      status: 'reviewing',
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects invalid admin certification list queries', () => {
    expect(() =>
      parseListDriverCertificationQuery({
        status: 'unsubmitted',
      }),
    ).toThrow('认证状态筛选只能是 reviewing、approved 或 rejected');

    expect(() =>
      parseListDriverCertificationQuery({
        page: '0',
      }),
    ).toThrow();
  });
});

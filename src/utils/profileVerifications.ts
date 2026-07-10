import type {
  EnterpriseVerificationRequest,
  IdentityVerificationRequest,
  VerificationFileRef,
} from './profileLocalState';

export type IdentityVerificationInput = {
  realName: string;
  idNumber: string;
  frontPhotoAdded: boolean;
  backPhotoAdded: boolean;
  frontPhotoFile?: VerificationFileRef;
  backPhotoFile?: VerificationFileRef;
  faceVerified: boolean;
};

export type EnterpriseVerificationInput = {
  enterpriseName: string;
  creditCode: string;
  legalName: string;
  legalId: string;
  enterprisePhone: string;
  licensePhotoCount: number;
  licenseFiles?: VerificationFileRef[];
};

export type IdentityVerificationResult = {
  request?: IdentityVerificationRequest;
  noticeText: string;
};

export type EnterpriseVerificationResult = {
  request?: EnterpriseVerificationRequest;
  noticeText: string;
};

export function createIdentityVerificationRequest({
  realName,
  idNumber,
  frontPhotoAdded,
  backPhotoAdded,
  frontPhotoFile,
  backPhotoFile,
  faceVerified,
}: IdentityVerificationInput): IdentityVerificationResult {
  const trimmedRealName = realName.trim();
  const normalizedIdNumber = idNumber.trim().toUpperCase();

  if (!trimmedRealName) {
    return { noticeText: '请填写真实姓名' };
  }

  if (!/^\d{17}[\dX]$/.test(normalizedIdNumber)) {
    return { noticeText: '请填写 18 位身份证号' };
  }

  if (!frontPhotoAdded || !backPhotoAdded) {
    return { noticeText: '请添加身份证正反面凭证' };
  }

  if (!faceVerified) {
    return { noticeText: '请先完成人脸核验' };
  }

  const identityPhotoFiles = [frontPhotoFile, backPhotoFile].filter(
    (file): file is VerificationFileRef => Boolean(file),
  );
  const request: IdentityVerificationRequest = {
    realName: trimmedRealName,
    idNumber: normalizedIdNumber,
    identityPhotoCount: 2,
    faceVerified: true,
    status: 'reviewing',
  };

  if (identityPhotoFiles.length > 0) {
    request.identityPhotoFiles = identityPhotoFiles;
  }

  return {
    request,
    noticeText: '',
  };
}

export function createEnterpriseVerificationRequest({
  enterpriseName,
  creditCode,
  legalName,
  legalId,
  enterprisePhone,
  licensePhotoCount,
  licenseFiles,
}: EnterpriseVerificationInput): EnterpriseVerificationResult {
  const trimmedEnterpriseName = enterpriseName.trim();
  const normalizedCreditCode = creditCode.trim().toUpperCase();
  const trimmedLegalName = legalName.trim();
  const normalizedLegalId = legalId.trim().toUpperCase();
  const trimmedEnterprisePhone = enterprisePhone.trim();

  if (!trimmedEnterpriseName) {
    return { noticeText: '请填写企业名称' };
  }

  if (!/^[0-9A-Z]{15,20}$/.test(normalizedCreditCode)) {
    return { noticeText: '请填写 15-20 位统一社会信用代码或营业执照号' };
  }

  if (!trimmedLegalName) {
    return { noticeText: '请填写法人姓名' };
  }

  if (!/^\d{17}[\dX]$/.test(normalizedLegalId)) {
    return { noticeText: '请填写 18 位法人身份证号' };
  }

  if (!/^1\d{10}$/.test(trimmedEnterprisePhone)) {
    return { noticeText: '请填写 11 位企业联系电话' };
  }

  if (licensePhotoCount < 1) {
    return { noticeText: '请先添加营业执照凭证' };
  }

  const request: EnterpriseVerificationRequest = {
    enterpriseName: trimmedEnterpriseName,
    creditCode: normalizedCreditCode,
    legalName: trimmedLegalName,
    legalId: normalizedLegalId,
    enterprisePhone: trimmedEnterprisePhone,
    licensePhotoCount,
    status: 'reviewing',
  };

  if (licenseFiles && licenseFiles.length > 0) {
    request.licenseFiles = licenseFiles;
  }

  return {
    request,
    noticeText: '',
  };
}

export function getIdentityVerificationRejectionNotice() {
  const reason = '身份证照片边缘不完整，请重新上传清晰照片';

  return {
    reason,
    noticeText: `实名认证已驳回：${reason}`,
  };
}

export function getEnterpriseVerificationRejectionNotice() {
  const reason = '营业执照信息与企业名称不一致，请重新上传清晰凭证';

  return {
    reason,
    noticeText: `企业认证已驳回：${reason}`,
  };
}

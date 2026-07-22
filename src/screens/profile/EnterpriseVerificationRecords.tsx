import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import { PlatformApiError } from '../../services/platformApiClient';
import type {
  PlatformFileUploadConfirmationApi,
  PlatformFileUploadRecord,
  createPlatformFileApi,
} from '../../services/platformFileApi';
import { confirmPlatformFileUploadIntent } from '../../services/platformFileApi';
import type { createPlatformProfileApi } from '../../services/platformProfileApi';
import { styles } from '../../styles';
import type {
  EnterpriseVerificationRequest,
  VerificationFileRef,
} from '../../utils/profileLocalState';
import {
  createEnterpriseVerificationRequest,
  getEnterpriseVerificationRejectionNotice,
} from '../../utils/profileVerifications';

type EnterprisePlatformFileApi = PlatformFileUploadConfirmationApi &
  Pick<
  ReturnType<typeof createPlatformFileApi>,
    'createUploadIntent'
  >;
type EnterprisePlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  'saveEnterpriseVerification'
>;

function getVerificationFileStatusText(status: VerificationFileRef['status']) {
  switch (status) {
    case 'uploaded':
      return '已上传';
    case 'rejected':
      return '已驳回';
    default:
      return '待上传';
  }
}

function mapPlatformFileToVerificationRef(
  file: PlatformFileUploadRecord,
  fileName: string,
): VerificationFileRef {
  return {
    fileId: file.id,
    fileName,
    purpose: 'identity',
    status: file.status,
    objectKey: file.objectKey,
    publicUrl: file.publicUrl,
  };
}

function getEnterpriseVerificationStatus(
  verification?: EnterpriseVerificationRequest,
) {
  if (verification?.status) {
    return verification.status;
  }

  if (verification?.rejectionReason) {
    return 'rejected';
  }

  if (verification) {
    return 'reviewing';
  }

  return undefined;
}

export function EnterpriseVerificationRecords({
  verification,
  platformProfileApi,
  platformFileApi,
  onSubmit,
  onReject,
}: {
  verification?: EnterpriseVerificationRequest;
  platformProfileApi?: EnterprisePlatformProfileApi;
  platformFileApi?: EnterprisePlatformFileApi;
  onSubmit: (
    request: EnterpriseVerificationRequest,
    options?: {
      syncStatus?: 'failed';
      syncMessage?: string;
    },
  ) => void;
  onReject: (reason: string) => void;
}) {
  const [enterpriseName, setEnterpriseName] = useState(
    verification?.enterpriseName ?? '',
  );
  const [creditCode, setCreditCode] = useState(verification?.creditCode ?? '');
  const [legalName, setLegalName] = useState(verification?.legalName ?? '');
  const [legalId, setLegalId] = useState(verification?.legalId ?? '');
  const [enterprisePhone, setEnterprisePhone] = useState(
    verification?.enterprisePhone ?? '',
  );
  const [licensePhotoCount, setLicensePhotoCount] = useState(
    verification?.licensePhotoCount ?? 0,
  );
  const [licenseFiles, setLicenseFiles] = useState<VerificationFileRef[]>(
    verification?.licenseFiles ?? [],
  );
  const [notice, setNotice] = useState('');
  const verificationStatus = getEnterpriseVerificationStatus(verification);
  const isRejected = verificationStatus === 'rejected';
  const isApproved = verificationStatus === 'approved';

  useEffect(() => {
    setEnterpriseName(verification?.enterpriseName ?? '');
    setCreditCode(verification?.creditCode ?? '');
    setLegalName(verification?.legalName ?? '');
    setLegalId(verification?.legalId ?? '');
    setEnterprisePhone(verification?.enterprisePhone ?? '');
    setLicensePhotoCount(verification?.licensePhotoCount ?? 0);
    setLicenseFiles(verification?.licenseFiles ?? []);
  }, [verification]);

  const submitVerification = async () => {
    const result = createEnterpriseVerificationRequest({
      enterpriseName,
      creditCode,
      legalName,
      legalId,
      enterprisePhone,
      licensePhotoCount,
      licenseFiles,
    });

    if (!result.request) {
      setNotice(result.noticeText);
      return;
    }

    if (platformProfileApi) {
      const licenseFileId = licenseFiles[0]?.fileId;

      if (!licenseFileId) {
        setNotice('平台企业认证提交需要先上传营业执照凭证。');
        return;
      }

      try {
        const savedVerification =
          await platformProfileApi.saveEnterpriseVerification({
            enterpriseName: result.request.enterpriseName,
            creditCode: result.request.creditCode,
            legalName: result.request.legalName,
            legalId: result.request.legalId,
            enterprisePhone: result.request.enterprisePhone,
            licenseFileId,
          });

        onSubmit({
          ...result.request,
          ...(licenseFiles.length ? { licenseFiles } : {}),
          status: savedVerification.status,
          rejectionReason: savedVerification.rejectionReason,
          updatedAtIso: savedVerification.updatedAtIso,
        });
        setNotice('企业认证资料已提交到平台审核。');
      } catch (error) {
        const noticeText =
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? '企业认证提交需要重新登录后再同步。'
            : '企业认证资料提交失败，已保留本地资料，请稍后重试。';
        onSubmit(result.request, {
          syncStatus: 'failed',
          syncMessage: noticeText,
        });
        setNotice(noticeText);
      }
      return;
    }

    onSubmit(result.request);
    setNotice('企业认证资料已提交，当前为本地演示状态。');
  };

  const rejectVerification = () => {
    const { reason, noticeText } = getEnterpriseVerificationRejectionNotice();
    onReject(reason);
    setNotice(noticeText);
  };

  const attachLicensePhoto = async () => {
    const fileName = '营业执照.png';

    if (!platformFileApi) {
      setLicensePhotoCount(1);
      setNotice('营业执照凭证已添加，本地版不会上传真实文件。');
      return;
    }

    try {
      const intent = await platformFileApi.createUploadIntent({
        purpose: 'identity',
        fileName,
        contentType: 'image/png',
        byteSize: 2048,
      });
      const uploadedFile = await confirmPlatformFileUploadIntent(
        platformFileApi,
        intent,
      );

      setLicenseFiles([mapPlatformFileToVerificationRef(uploadedFile, fileName)]);
      setLicensePhotoCount(1);
      setNotice('营业执照凭证已关联平台文件对象。');
    } catch {
      setLicensePhotoCount(1);
      setNotice('营业执照凭证上传失败，已保留本地占位。');
    }
  };

  return (
    <View style={styles.detailCard}>
      {verification ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>
              {isApproved
                ? '企业认证已通过'
                : isRejected
                  ? '企业认证认证失败'
                  : '企业认证审核中'}
            </Text>
            <Text style={styles.routeAction}>
              {isApproved ? '已认证' : isRejected ? '认证失败' : '审核中'}
            </Text>
          </View>
          <Text style={styles.detailMeta}>{verification.enterpriseName}</Text>
          <Text style={styles.routeMeta}>
            {`统一社会信用代码：${verification.creditCode}`}
          </Text>
          <Text style={styles.routeMeta}>{`法人：${verification.legalName}`}</Text>
          <Text style={styles.routeMeta}>
            {`企业联系电话：${verification.enterprisePhone}`}
          </Text>
          <Text style={styles.routeMeta}>
            {`营业执照凭证 ${verification.licensePhotoCount} 张`}
          </Text>
          {verification.rejectionReason ? (
            <Text style={styles.detailMeta}>
              {`失败原因：${verification.rejectionReason}`}
            </Text>
          ) : isApproved ? (
            <Text style={styles.detailMeta}>
              平台企业认证已通过，可继续申请企业发票。
            </Text>
          ) : (
            <Text style={styles.detailMeta}>预计 1 个工作日内完成审核</Text>
          )}
          {!platformProfileApi && !verification.rejectionReason && !isApproved ? (
            <Pressable
              testID="enterprise-verification-reject"
              style={styles.detailSecondaryButton}
              onPress={rejectVerification}
            >
              <Text style={styles.detailSecondaryButtonText}>本地驳回</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.draftSectionTitle}>企业认证资料</Text>
      <AuthField
        testID="enterprise-verification-name"
        label="企业名称"
        placeholder="例如 深圳晨星贸易有限公司"
        value={enterpriseName}
        onChangeText={setEnterpriseName}
      />
      <AuthField
        testID="enterprise-verification-code"
        label="统一社会信用代码"
        placeholder="例如 91440300MA5TEST001"
        value={creditCode}
        onChangeText={setCreditCode}
        maxLength={20}
      />
      <AuthField
        testID="enterprise-verification-legal-name"
        label="法人姓名"
        placeholder="例如 张先生"
        value={legalName}
        onChangeText={setLegalName}
      />
      <AuthField
        testID="enterprise-verification-legal-id"
        label="法人身份证号"
        placeholder="例如 440300199001011234"
        value={legalId}
        onChangeText={setLegalId}
        maxLength={18}
      />
      <AuthField
        testID="enterprise-verification-phone"
        label="企业联系电话"
        placeholder="例如 13900139088"
        value={enterprisePhone}
        onChangeText={setEnterprisePhone}
        keyboardType="phone-pad"
        maxLength={11}
      />
      <Pressable
        testID="enterprise-verification-license-photo"
        style={styles.detailSecondaryButton}
        onPress={attachLicensePhoto}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {licensePhotoCount > 0 ? '已添加营业执照凭证' : '添加营业执照凭证'}
        </Text>
      </Pressable>
      {licensePhotoCount > 0 ? (
        <>
          <Text style={styles.routeMeta}>
            {`营业执照凭证 ${licensePhotoCount} 张`}
          </Text>
          <View>
            <Text style={styles.draftSectionTitle}>营业执照凭证清单</Text>
            {licenseFiles.length > 0 ? (
              licenseFiles.slice(0, licensePhotoCount).map(file => (
                <ImageCredentialCard
                  key={file.fileId}
                  title={`营业执照凭证：${file.fileName}`}
                  publicUrl={file.publicUrl}
                  placeholderLabel="营业执照"
                  metaLines={[
                    `来源：平台文件对象（${getVerificationFileStatusText(file.status)}）`,
                    `文件 ID：${file.fileId}`,
                    ...(file.publicUrl
                      ? ['已生成预览地址。']
                      : file.objectKey
                        ? ['已写入平台对象存储。']
                        : []),
                  ]}
                  imageTestID="enterprise-verification-license-preview-image"
                  placeholderTestID="enterprise-verification-license-preview-placeholder"
                />
              ))
            ) : (
              <ImageCredentialCard
                title="营业执照凭证：本地已保存"
                placeholderLabel="营业执照"
                metaLines={['来源：本地图片凭证占位']}
                placeholderTestID="enterprise-verification-license-preview-placeholder"
              />
            )}
          </View>
        </>
      ) : null}
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="enterprise-verification-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submitVerification}
      >
        <Text style={styles.detailPrimaryButtonText}>
          {platformProfileApi ? '提交平台企业认证' : '提交企业认证'}
        </Text>
      </Pressable>
    </View>
  );
}

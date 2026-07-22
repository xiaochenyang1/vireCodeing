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
  IdentityVerificationRequest,
  VerificationFileRef,
} from '../../utils/profileLocalState';
import {
  createIdentityVerificationRequest,
  getIdentityVerificationRejectionNotice,
} from '../../utils/profileVerifications';

type IdentityPlatformFileApi = PlatformFileUploadConfirmationApi &
  Pick<
  ReturnType<typeof createPlatformFileApi>,
    'createUploadIntent'
  >;
type IdentityPlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  'saveIdentityVerification'
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

function getIdentityVerificationStatus(
  verification?: IdentityVerificationRequest,
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

function getFaceCheckNoticeText(
  usesPlatformIdentityVerification: boolean,
) {
  return usesPlatformIdentityVerification
    ? '人脸核验已完成，当前客户端未接入平台人脸 SDK，已使用平台占位校验标记。'
    : '人脸核验已完成，本地版不会调用第三方 SDK。';
}

export function IdentityVerificationRecords({
  verification,
  platformProfileApi,
  platformFileApi,
  onSubmit,
  onReject,
}: {
  verification?: IdentityVerificationRequest;
  platformProfileApi?: IdentityPlatformProfileApi;
  platformFileApi?: IdentityPlatformFileApi;
  onSubmit: (
    request: IdentityVerificationRequest,
    options?: {
      syncStatus?: 'failed';
      syncMessage?: string;
    },
  ) => void;
  onReject: (reason: string) => void;
}) {
  const [realName, setRealName] = useState(verification?.realName ?? '');
  const [idNumber, setIdNumber] = useState(verification?.idNumber ?? '');
  const [frontPhotoAdded, setFrontPhotoAdded] = useState(
    Boolean(verification && verification.identityPhotoCount >= 1),
  );
  const [backPhotoAdded, setBackPhotoAdded] = useState(
    Boolean(verification && verification.identityPhotoCount >= 2),
  );
  const [frontPhotoFile, setFrontPhotoFile] = useState<
    VerificationFileRef | undefined
  >(verification?.identityPhotoFiles?.[0]);
  const [backPhotoFile, setBackPhotoFile] = useState<
    VerificationFileRef | undefined
  >(verification?.identityPhotoFiles?.[1]);
  const [faceVerified, setFaceVerified] = useState(
    verification?.faceVerified ?? false,
  );
  const [notice, setNotice] = useState('');
  const verificationStatus = getIdentityVerificationStatus(verification);
  const isRejected = verificationStatus === 'rejected';
  const isApproved = verificationStatus === 'approved';
  const identityPhotoEntries = [
    {
      key: 'front',
      label: '身份证正面凭证',
      added: frontPhotoAdded,
      file: frontPhotoFile,
    },
    {
      key: 'back',
      label: '身份证反面凭证',
      added: backPhotoAdded,
      file: backPhotoFile,
    },
  ].filter(entry => entry.added || entry.file);

  useEffect(() => {
    setRealName(verification?.realName ?? '');
    setIdNumber(verification?.idNumber ?? '');
    setFrontPhotoAdded(Boolean(verification && verification.identityPhotoCount >= 1));
    setBackPhotoAdded(Boolean(verification && verification.identityPhotoCount >= 2));
    setFrontPhotoFile(verification?.identityPhotoFiles?.[0]);
    setBackPhotoFile(verification?.identityPhotoFiles?.[1]);
    setFaceVerified(verification?.faceVerified ?? false);
  }, [verification]);

  const submitVerification = async () => {
    const result = createIdentityVerificationRequest({
      realName,
      idNumber,
      frontPhotoAdded,
      backPhotoAdded,
      frontPhotoFile,
      backPhotoFile,
      faceVerified,
    });

    if (!result.request) {
      setNotice(result.noticeText);
      return;
    }

    if (platformProfileApi) {
      const identityFrontFileId = frontPhotoFile?.fileId;
      const identityBackFileId = backPhotoFile?.fileId;

      if (!identityFrontFileId || !identityBackFileId) {
        setNotice('平台实名认证提交需要先上传身份证正反面凭证。');
        return;
      }

      try {
        const savedVerification =
          await platformProfileApi.saveIdentityVerification({
            realName: result.request.realName,
            idNumber: result.request.idNumber,
            identityFrontFileId,
            identityBackFileId,
            faceVerified: true,
          });
        const identityPhotoFiles = [frontPhotoFile, backPhotoFile].filter(
          (file): file is VerificationFileRef => Boolean(file),
        );

        onSubmit({
          ...result.request,
          ...(identityPhotoFiles.length ? { identityPhotoFiles } : {}),
          status: savedVerification.status,
          rejectionReason: savedVerification.rejectionReason,
          updatedAtIso: savedVerification.updatedAtIso,
        });
        setNotice('实名认证资料已提交到平台审核。');
      } catch (error) {
        const noticeText =
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? '实名认证提交需要重新登录后再同步。'
            : '实名认证资料提交失败，已保留本地资料，请稍后重试。';
        onSubmit(result.request, {
          syncStatus: 'failed',
          syncMessage: noticeText,
        });
        setNotice(noticeText);
      }
      return;
    }

    onSubmit(result.request);
    setNotice('实名认证资料已提交，当前为本地演示状态。');
  };

  const rejectVerification = () => {
    const { reason, noticeText } = getIdentityVerificationRejectionNotice();
    onReject(reason);
    setNotice(noticeText);
  };

  const attachIdentityPhoto = async (
    side: 'front' | 'back',
    fileName: string,
  ) => {
    const setPhotoAdded =
      side === 'front' ? setFrontPhotoAdded : setBackPhotoAdded;
    const setPhotoFile =
      side === 'front' ? setFrontPhotoFile : setBackPhotoFile;
    const label = side === 'front' ? '身份证正面' : '身份证反面';

    if (!platformFileApi) {
      setPhotoAdded(true);
      setNotice(`${label}凭证已添加，本地版不会上传真实文件。`);
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

      setPhotoFile(mapPlatformFileToVerificationRef(uploadedFile, fileName));
      setPhotoAdded(true);
      setNotice(`${label}凭证已关联平台文件对象。`);
    } catch {
      setPhotoAdded(true);
      setNotice(`${label}凭证上传失败，已保留本地占位。`);
    }
  };

  return (
    <View style={styles.detailCard}>
      {verification ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>
              {isApproved
                ? '实名认证已通过'
                : isRejected
                  ? '实名认证认证失败'
                  : '实名认证审核中'}
            </Text>
            <Text style={styles.routeAction}>
              {isApproved ? '已认证' : isRejected ? '认证失败' : '审核中'}
            </Text>
          </View>
          <Text style={styles.detailMeta}>{verification.realName}</Text>
          <Text style={styles.routeMeta}>
            {`身份证号：${verification.idNumber}`}
          </Text>
          <Text style={styles.routeMeta}>
            {`身份证正反面凭证 ${verification.identityPhotoCount} 张`}
          </Text>
          <Text style={styles.routeMeta}>
            {verification.faceVerified ? '人脸核验已完成' : '人脸核验未完成'}
          </Text>
          {verification.rejectionReason ? (
            <Text style={styles.detailMeta}>
              {`失败原因：${verification.rejectionReason}`}
            </Text>
          ) : isApproved ? (
            <Text style={styles.detailMeta}>平台认证已通过，可继续发单。</Text>
          ) : (
            <Text style={styles.detailMeta}>预计 1 个工作日内完成审核</Text>
          )}
          {!platformProfileApi && !verification.rejectionReason && !isApproved ? (
            <Pressable
              testID="identity-verification-reject"
              style={styles.detailSecondaryButton}
              onPress={rejectVerification}
            >
              <Text style={styles.detailSecondaryButtonText}>本地驳回</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.draftSectionTitle}>实名认证资料</Text>
      <AuthField
        testID="identity-verification-name"
        label="真实姓名"
        placeholder="例如 张先生"
        value={realName}
        onChangeText={setRealName}
      />
      <AuthField
        testID="identity-verification-id-number"
        label="身份证号码"
        placeholder="例如 440300199001011234"
        value={idNumber}
        onChangeText={setIdNumber}
        maxLength={18}
      />
      <Pressable
        testID="identity-verification-front-photo"
        style={styles.detailSecondaryButton}
        onPress={() => attachIdentityPhoto('front', '身份证正面.png')}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {frontPhotoAdded ? '已添加身份证正面凭证' : '添加身份证正面凭证'}
        </Text>
      </Pressable>
      <Pressable
        testID="identity-verification-back-photo"
        style={styles.detailSecondaryButton}
        onPress={() => attachIdentityPhoto('back', '身份证反面.png')}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {backPhotoAdded ? '已添加身份证反面凭证' : '添加身份证反面凭证'}
        </Text>
      </Pressable>
      <Pressable
        testID="identity-verification-face-check"
        style={styles.detailSecondaryButton}
        onPress={() => {
          setFaceVerified(true);
          setNotice(getFaceCheckNoticeText(Boolean(platformProfileApi)));
        }}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {faceVerified ? '人脸核验已完成' : '开始人脸核验'}
        </Text>
      </Pressable>
      {frontPhotoAdded && backPhotoAdded ? (
        <Text style={styles.routeMeta}>身份证正反面凭证 2 张</Text>
      ) : null}
      {identityPhotoEntries.length > 0 ? (
        <View>
          <Text style={styles.draftSectionTitle}>身份证凭证清单</Text>
          {identityPhotoEntries.map(entry => (
            <ImageCredentialCard
              key={entry.key}
              title={
                entry.file
                  ? `${entry.label}：${entry.file.fileName}`
                  : `${entry.label}：本地已保存`
              }
              publicUrl={entry.file?.publicUrl}
              placeholderLabel={
                entry.key === 'front' ? '身份证正面' : '身份证反面'
              }
              metaLines={
                entry.file
                  ? [
                      `来源：平台文件对象（${getVerificationFileStatusText(entry.file.status)}）`,
                      `文件 ID：${entry.file.fileId}`,
                      ...(entry.file.publicUrl
                        ? ['已生成预览地址。']
                        : entry.file.objectKey
                          ? ['已写入平台对象存储。']
                          : []),
                    ]
                  : ['来源：本地图片凭证占位']
              }
              imageTestID={`identity-verification-${entry.key}-preview-image`}
              placeholderTestID={`identity-verification-${entry.key}-preview-placeholder`}
            />
          ))}
        </View>
      ) : null}
      {faceVerified ? <Text style={styles.routeMeta}>人脸核验已完成</Text> : null}
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="identity-verification-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submitVerification}
      >
        <Text style={styles.detailPrimaryButtonText}>
          {platformProfileApi ? '提交平台实名认证' : '提交实名认证'}
        </Text>
      </Pressable>
    </View>
  );
}

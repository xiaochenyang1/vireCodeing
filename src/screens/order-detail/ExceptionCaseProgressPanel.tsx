import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import type { createPlatformFileApi } from '../../services/platformFileApi';
import type { PlatformOrderExceptionCase } from '../../services/platformOrderApi';
import { styles } from '../../styles';
import type { FileAttachmentRef } from '../../types';
import {
  canAppealOrderExceptionCase,
  getOrderExceptionCaseAppealStatusText,
  getOrderExceptionCaseCompensationSummary,
  getOrderExceptionCaseSourceText,
  getOrderExceptionCaseStatusText,
  sortOrderExceptionCaseActions,
} from '../../utils/orderExceptionCases';

type ExceptionCasePlatformFileApi = Partial<
  Pick<ReturnType<typeof createPlatformFileApi>, 'getFileMetadata'>
>;

function getAttachmentStatusText(status: FileAttachmentRef['status']) {
  switch (status) {
    case 'uploaded':
      return '已上传';
    case 'rejected':
      return '已驳回';
    default:
      return '待上传';
  }
}

function createFallbackExceptionCaseAttachment(
  fileId: string,
  index: number,
): FileAttachmentRef {
  return {
    fileId,
    fileName: `异常工单凭证 ${index + 1}`,
    purpose: 'exception',
    status: 'uploaded',
  };
}

async function hydrateExceptionCaseAttachments(
  cases: PlatformOrderExceptionCase[],
  platformFileApi?: ExceptionCasePlatformFileApi,
) {
  const metadataCache = new Map<
    string,
    ReturnType<NonNullable<ExceptionCasePlatformFileApi['getFileMetadata']>>
  >();
  const entries = await Promise.all(
    cases.map(async exceptionCase => {
      const normalizedFileIds = exceptionCase.attachmentFileIds
        .map(fileId => fileId.trim())
        .filter(Boolean);

      if (normalizedFileIds.length === 0) {
        return [exceptionCase.id, [] as FileAttachmentRef[]] as const;
      }

      const attachments = await Promise.all(
        normalizedFileIds.map(async (fileId, index) => {
          if (!platformFileApi?.getFileMetadata) {
            return createFallbackExceptionCaseAttachment(fileId, index);
          }

          let metadataPromise = metadataCache.get(fileId);

          if (!metadataPromise) {
            metadataPromise = platformFileApi.getFileMetadata(fileId);
            metadataCache.set(fileId, metadataPromise);
          }

          try {
            const metadata = await metadataPromise;

            return {
              fileId: metadata.id,
              fileName: `异常工单凭证 ${index + 1}`,
              purpose: 'exception' as const,
              status: metadata.status,
              ...(metadata.objectKey ? { objectKey: metadata.objectKey } : {}),
              ...(metadata.publicUrl ? { publicUrl: metadata.publicUrl } : {}),
            };
          } catch {
            return createFallbackExceptionCaseAttachment(fileId, index);
          }
        }),
      );

      return [exceptionCase.id, attachments] as const;
    }),
  );

  return entries.reduce<Record<string, FileAttachmentRef[]>>(
    (result, [caseId, attachments]) => {
      if (attachments.length > 0) {
        result[caseId] = attachments;
      }

      return result;
    },
    {},
  );
}

export function ExceptionCaseProgressPanel({
  cases,
  isLoading,
  notice,
  appealDrafts = {},
  appealingCaseId,
  onChangeAppealReason,
  onSubmitAppeal,
  platformFileApi,
}: {
  cases: PlatformOrderExceptionCase[];
  isLoading: boolean;
  notice?: string;
  appealDrafts?: Record<string, string>;
  appealingCaseId?: string;
  onChangeAppealReason?: (caseId: string, reason: string) => void;
  onSubmitAppeal?: (exceptionCase: PlatformOrderExceptionCase) => void;
  platformFileApi?: ExceptionCasePlatformFileApi;
}) {
  const [attachmentMap, setAttachmentMap] = useState<Record<string, FileAttachmentRef[]>>(
    {},
  );

  useEffect(() => {
    let active = true;

    void hydrateExceptionCaseAttachments(cases, platformFileApi).then(
      hydratedAttachments => {
        if (active) {
          setAttachmentMap(hydratedAttachments);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [cases, platformFileApi]);

  return (
    <View style={styles.detailInlineGroup}>
      <Text style={styles.draftSectionTitle}>异常处理进度</Text>
      {isLoading ? <Text style={styles.detailMeta}>正在加载异常工单...</Text> : null}
      {notice ? <Text style={styles.detailMeta}>{notice}</Text> : null}
      {!isLoading && !notice && cases.length === 0 ? (
        <Text style={styles.detailMeta}>暂无异常处理工单</Text>
      ) : null}
      {cases.map(exceptionCase => {
        const compensationSummary =
          getOrderExceptionCaseCompensationSummary(exceptionCase);
        const canAppeal = canAppealOrderExceptionCase(exceptionCase);
        const appealDraft = appealDrafts[exceptionCase.id] ?? '';
        const isAppealing = appealingCaseId === exceptionCase.id;
        const caseAttachments = attachmentMap[exceptionCase.id] ?? [];

        return (
          <View
            key={exceptionCase.id}
            testID={`exception-case-${exceptionCase.caseNo}`}
            style={styles.detailInlineGroup}
          >
            <Text style={styles.detailMeta}>
              {exceptionCase.caseNo} ·{' '}
              {getOrderExceptionCaseStatusText(exceptionCase.status)}
            </Text>
            <Text style={styles.detailMeta}>
              {getOrderExceptionCaseSourceText(exceptionCase.sourceRole)} ·{' '}
              {exceptionCase.typeLabel}
            </Text>
            <Text style={styles.detailMeta}>{exceptionCase.description}</Text>
            <Text style={styles.detailMeta}>
              提交时间：{exceptionCase.createdAtIso}
            </Text>
            {caseAttachments.length > 0 ? (
              <View style={styles.detailInlineGroup}>
                <Text style={styles.detailMeta}>
                  附件凭证 {caseAttachments.length} 张
                </Text>
                <Text style={styles.draftSectionTitle}>异常工单凭证</Text>
                {caseAttachments.map((attachment, index) => (
                  <ImageCredentialCard
                    key={`${exceptionCase.id}-${attachment.fileId}-${index}`}
                    title={`异常工单凭证：${attachment.fileName}`}
                    publicUrl={attachment.publicUrl}
                    placeholderLabel="异常工单图片"
                    metaLines={[
                      `来源：平台文件对象（${getAttachmentStatusText(
                        attachment.status,
                      )}）`,
                      `文件 ID：${attachment.fileId}`,
                      ...(attachment.publicUrl
                        ? ['已生成预览地址。']
                        : attachment.objectKey
                          ? ['已写入平台对象存储。']
                          : []),
                    ]}
                    imageTestID={`exception-case-proof-image-${exceptionCase.caseNo}-${index + 1}`}
                    placeholderTestID={`exception-case-proof-placeholder-${exceptionCase.caseNo}-${index + 1}`}
                  />
                ))}
              </View>
            ) : null}
            {exceptionCase.resolutionText ? (
              <Text style={styles.detailMeta}>
                处理结论：{exceptionCase.resolutionText}
              </Text>
            ) : null}
            {compensationSummary ? (
              <Text
                style={styles.detailMeta}
                testID={`exception-case-compensation-${exceptionCase.caseNo}`}
              >
                {compensationSummary}
              </Text>
            ) : null}
            {exceptionCase.compensationExecutedAtIso ? (
              <Text style={styles.detailMeta}>
                赔付执行时间：{exceptionCase.compensationExecutedAtIso}
              </Text>
            ) : null}
            {exceptionCase.appealStatus && exceptionCase.appealStatus !== 'none' ? (
              <Text
                style={styles.detailMeta}
                testID={`exception-case-appeal-status-${exceptionCase.caseNo}`}
              >
                申诉状态：
                {getOrderExceptionCaseAppealStatusText(exceptionCase.appealStatus)}
              </Text>
            ) : null}
            {exceptionCase.appealReason ? (
              <Text style={styles.detailMeta}>
                申诉理由：{exceptionCase.appealReason}
              </Text>
            ) : null}
            {sortOrderExceptionCaseActions(exceptionCase.actions).map(action => (
              <Text key={action.id} style={styles.detailMeta}>
                {getOrderExceptionCaseStatusText(action.fromStatus)} →{' '}
                {getOrderExceptionCaseStatusText(action.toStatus)}：
                {action.content}
              </Text>
            ))}
            {canAppeal && onSubmitAppeal ? (
              <View style={styles.detailInlineGroup}>
                <Text style={styles.detailMeta}>申请申诉</Text>
                <TextInput
                  testID={`exception-case-appeal-reason-${exceptionCase.caseNo}`}
                  style={styles.ordersSearchInput}
                  placeholder="请填写 6-500 字申诉理由"
                  value={appealDraft}
                  editable={!isAppealing}
                  multiline
                  onChangeText={value =>
                    onChangeAppealReason?.(exceptionCase.id, value)
                  }
                />
                <Pressable
                  testID={`exception-case-appeal-submit-${exceptionCase.caseNo}`}
                  style={styles.detailSecondaryButton}
                  disabled={isAppealing}
                  onPress={() => onSubmitAppeal(exceptionCase)}
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    {isAppealing ? '申诉提交中...' : '提交申诉'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

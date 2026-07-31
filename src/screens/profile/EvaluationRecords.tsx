import { Pressable, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import { styles } from '../../styles';
import type { FileAttachmentRef } from '../../types';
import {
  canSubmitEvaluationAppeal,
  filterEvaluationRecords,
  getEvaluationAppealStatusText,
  type EvaluationFilter,
  type ProfileEvaluationDirection,
  type ProfileEvaluationRecordItem,
} from '../../utils/profileEvaluations';

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

function getAttachmentTitle(direction: ProfileEvaluationDirection) {
  return direction === 'driver_to_shipper'
    ? '司机评价图片凭证'
    : '评价图片凭证';
}

function getAttachmentPlaceholderLabel(direction: ProfileEvaluationDirection) {
  return direction === 'driver_to_shipper' ? '司机评价图片' : '评价图片';
}

function createAttachmentMetaLines(file: FileAttachmentRef) {
  const isPlatformAttachment = Boolean(file.fileId);

  if (!isPlatformAttachment) {
    return ['来源：本地图片凭证占位'];
  }

  return [
    `来源：平台文件对象（${getAttachmentStatusText(file.status)}）`,
    `文件 ID：${file.fileId}`,
    ...(file.publicUrl
      ? ['已生成预览地址。']
      : file.objectKey
      ? ['已写入平台对象存储。']
      : []),
  ];
}

function getRecordKey(item: ProfileEvaluationRecordItem) {
  return item.platformEvaluationId ?? item.id;
}

export function EvaluationRecords({
  evaluationRecords,
  canRefresh = false,
  isRefreshing = false,
  notice,
  onRefresh,
  canSubmitAppeal = false,
  appealingEvaluationId,
  onSubmitAppeal,
}: {
  evaluationRecords: ProfileEvaluationRecordItem[];
  canRefresh?: boolean;
  isRefreshing?: boolean;
  notice?: string;
  onRefresh?: () => void;
  canSubmitAppeal?: boolean;
  appealingEvaluationId?: string;
  onSubmitAppeal?: (
    record: ProfileEvaluationRecordItem,
    reason: string,
  ) => void;
}) {
  const [filter, setFilter] = useState<EvaluationFilter>('all');
  const [appealDrafts, setAppealDrafts] = useState<Record<string, string>>({});
  const [localAppealNotice, setLocalAppealNotice] = useState('');
  const filterOptions: Array<{
    id: EvaluationFilter;
    label: string;
    testID: string;
  }> = [
    { id: 'all', label: '全部', testID: 'evaluation-filter-all' },
    { id: 'high', label: '5 星', testID: 'evaluation-filter-high' },
    {
      id: 'lower',
      label: '4 星及以下',
      testID: 'evaluation-filter-lower',
    },
  ];
  const filteredRecords = filterEvaluationRecords(evaluationRecords, filter);

  return (
    <View style={styles.detailCard}>
      {canRefresh ? (
        <View style={styles.routeHeader}>
          <Text style={styles.routeName}>平台评价</Text>
          <Pressable
            testID="evaluation-manual-refresh"
            disabled={isRefreshing || !onRefresh}
            style={({ pressed }) => [
              styles.detailSecondaryButton,
              (isRefreshing || !onRefresh) && styles.buttonDisabled,
              pressed && !isRefreshing && onRefresh && styles.pressedButton,
            ]}
            onPress={onRefresh}
          >
            <Text style={styles.detailSecondaryButtonText}>
              {isRefreshing ? '刷新中...' : '手动刷新'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      {localAppealNotice ? (
        <Text style={styles.draftNotice}>{localAppealNotice}</Text>
      ) : null}
      <Text style={styles.draftSectionTitle}>评价筛选</Text>
      <View style={styles.draftChoiceGrid}>
        {filterOptions.map(option => {
          const active = option.id === filter;

          return (
            <Pressable
              key={option.id}
              testID={option.testID}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setFilter(option.id)}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  active && styles.draftChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.draftSectionTitle}>评价明细</Text>
      {filteredRecords.map(item => {
        const recordKey = getRecordKey(item);
        const isAppealing = appealingEvaluationId === recordKey;
        const canAppeal =
          canSubmitAppeal &&
          Boolean(onSubmitAppeal) &&
          canSubmitEvaluationAppeal(item);
        const appealDraft = appealDrafts[recordKey] ?? '';

        return (
          <View key={item.id} style={styles.driverInfoCard}>
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{item.orderId}</Text>
              <Text style={styles.routeAction}>{item.ratingText}</Text>
            </View>
            <Text style={styles.driverName}>{item.driverName}</Text>
            {item.moderationStatus === 'hidden' ? (
              <Text
                style={styles.detailMeta}
                testID={`evaluation-moderation-status-${recordKey}`}
              >
                展示状态：已隐藏
              </Text>
            ) : null}
            {item.appealStatus && item.appealStatus !== 'none' ? (
              <Text
                style={styles.detailMeta}
                testID={`evaluation-appeal-status-${recordKey}`}
              >
                申诉状态：{getEvaluationAppealStatusText(item.appealStatus)}
              </Text>
            ) : null}
            {item.appealReason ? (
              <Text style={styles.detailMeta}>
                申诉理由：{item.appealReason}
              </Text>
            ) : null}
            {item.appealResolutionReason ? (
              <Text style={styles.detailMeta}>
                裁定说明：{item.appealResolutionReason}
              </Text>
            ) : null}
            {item.photoText ? (
              <Text style={styles.detailMeta}>{item.photoText}</Text>
            ) : null}
            {item.photoFiles?.length ? (
              <View style={styles.detailInlineGroup}>
                <Text style={styles.draftSectionTitle}>
                  {getAttachmentTitle(item.direction)}清单
                </Text>
                {item.photoFiles.map((file, index) => (
                  <ImageCredentialCard
                    key={`${item.id}-${file.fileId}-${index}`}
                    title={`${getAttachmentTitle(item.direction)}：${
                      file.fileName
                    }`}
                    publicUrl={file.publicUrl}
                    placeholderLabel={getAttachmentPlaceholderLabel(
                      item.direction,
                    )}
                    metaLines={createAttachmentMetaLines(file)}
                    imageTestID={`profile-evaluation-photo-image-${item.id}-${
                      index + 1
                    }`}
                    placeholderTestID={`profile-evaluation-photo-placeholder-${
                      item.id
                    }-${index + 1}`}
                    previewGroup={(item.photoFiles ?? []).map(
                      (groupFile, groupIndex) => ({
                        key: `${item.id}-${groupFile.fileId}-${groupIndex}`,
                        title: `${getAttachmentTitle(item.direction)}：${
                          groupFile.fileName
                        }`,
                        publicUrl: groupFile.publicUrl,
                        fileId: groupFile.fileId,
                        ...(item.platformOrderId
                          ? {
                              access: {
                                kind: 'order' as const,
                                orderId: item.platformOrderId,
                              },
                            }
                          : {}),
                      }),
                    )}
                    previewKey={`${item.id}-${file.fileId}-${index}`}
                    previewFileId={file.fileId}
                    previewAccess={
                      item.platformOrderId
                        ? {
                            kind: 'order',
                            orderId: item.platformOrderId,
                          }
                        : undefined
                    }
                  />
                ))}
              </View>
            ) : null}
            <Text style={styles.detailMeta}>{item.content}</Text>
            <Text style={styles.routeMeta}>{item.timeText}</Text>
            {item.driverReplyText ? (
              <>
                <Text style={styles.detailMeta}>
                  {`司机回复：${item.driverReplyText}`}
                </Text>
                <Text style={styles.routeMeta}>
                  {`回复时间：${item.driverReplyTimeText}`}
                </Text>
              </>
            ) : null}
            {canAppeal ? (
              <View style={styles.detailInlineGroup}>
                <Text style={styles.detailMeta}>申请申诉</Text>
                <TextInput
                  testID={`evaluation-appeal-reason-${recordKey}`}
                  style={styles.ordersSearchInput}
                  placeholder="请填写 6-500 字申诉理由"
                  value={appealDraft}
                  editable={!isAppealing}
                  multiline
                  onChangeText={value =>
                    setAppealDrafts(current => ({
                      ...current,
                      [recordKey]: value,
                    }))
                  }
                />
                <Pressable
                  testID={`evaluation-appeal-submit-${recordKey}`}
                  style={[
                    styles.detailSecondaryButton,
                    isAppealing && styles.buttonDisabled,
                  ]}
                  disabled={isAppealing}
                  onPress={() => {
                    const reason = appealDraft.trim();
                    if (reason.length < 6 || reason.length > 500) {
                      setLocalAppealNotice('请填写 6 到 500 字的申诉理由。');
                      return;
                    }

                    setLocalAppealNotice('');
                    onSubmitAppeal?.(item, reason);
                  }}
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

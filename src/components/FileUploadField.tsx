import { useMemo } from 'react';
import {
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';

import { colors, styles } from '../styles';
import type { UseImageUploadResult } from '../hooks/useImageUpload';

export type FileUploadFieldProps = {
  label: string;
  uploader: UseImageUploadResult;
  publicUrl?: string;
  testIDPrefix?: string;
};

export function FileUploadField({
  label,
  uploader,
  publicUrl,
  testIDPrefix = 'file-upload',
}: FileUploadFieldProps) {
  const { state, pickAndUpload, clear } = uploader;
  const isUploading = state.isUploading;
  const hasFile = Boolean(publicUrl || state.file?.publicUrl);
  const resolvedPublicUrl = publicUrl ?? state.file?.publicUrl;
  const displayLabel = isUploading ? '上传中...' : label;

  const metaLines = useMemo(() => {
    const lines: string[] = [];

    if (isUploading) {
      lines.push('正在上传，请稍候...');
    }

    if (state.error) {
      lines.push(`错误：${state.error}`);
    }

    if (state.file && !isUploading) {
      lines.push(`文件 ID：${state.file.id}`);
      lines.push(`状态：${getStatusText(state.file.status)}`);
    }

    if (!hasFile && !isUploading && !state.error) {
      lines.push('尚未上传文件');
    }

    return lines;
  }, [isUploading, state.error, state.file, hasFile]);

  const previewTestID = `${testIDPrefix}-preview`;
  const placeholderTestID = `${testIDPrefix}-placeholder`;
  const pickTestID = `${testIDPrefix}-pick`;
  const clearTestID = `${testIDPrefix}-clear`;

  return (
    <View style={styles.driverInfoCard}>
      <View style={cardStyles.previewRow}>
        <View style={cardStyles.previewFrame}>
          {resolvedPublicUrl ? (
            <Pressable
              testID={previewTestID}
              style={cardStyles.previewPressable}
              onPress={() => {}}
            >
              <Image
                source={{ uri: resolvedPublicUrl }}
                style={cardStyles.previewImage}
              />
            </Pressable>
          ) : (
            <View
              testID={placeholderTestID}
              style={cardStyles.placeholderFrame}
            >
              <Text style={cardStyles.placeholderText}>
                {displayLabel}
              </Text>
            </View>
          )}
        </View>
        <View style={cardStyles.textGroup}>
          <Text style={styles.routeName}>{label}</Text>
          {metaLines.map((line, index) => (
            <Text
              key={`${testIDPrefix}-meta-${index}`}
              style={styles.detailMeta}
            >
              {line}
            </Text>
          ))}
          <View style={cardStyles.actionRow}>
            <Pressable
              testID={pickTestID}
              style={[
                cardStyles.actionButton,
                isUploading && cardStyles.actionButtonDisabled,
              ]}
              onPress={pickAndUpload}
              disabled={isUploading}
            >
              <Text
                style={[
                  cardStyles.actionButtonText,
                  isUploading && cardStyles.actionButtonTextDisabled,
                ]}
              >
                {isUploading ? '上传中...' : hasFile ? '重新选择' : '选择图片'}
              </Text>
            </Pressable>
            {hasFile && !isUploading ? (
              <Pressable
                testID={clearTestID}
                style={cardStyles.actionButtonSecondary}
                onPress={clear}
              >
                <Text style={cardStyles.actionButtonTextSecondary}>
                  清除
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function getStatusText(status: string): string {
  switch (status) {
    case 'uploaded':
      return '已上传';
    case 'pending':
      return '等待上传';
    case 'rejected':
      return '已驳回';
    default:
      return status;
  }
}

const cardStyles = {
  previewRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  previewFrame: {
    width: 88,
    height: 66,
    borderRadius: 8,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  previewImage: {
    width: '100%' as const,
    height: '100%' as const,
  },
  previewPressable: {
    flex: 1,
  },
  placeholderFrame: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceMuted,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
  },
  textGroup: {
    flex: 1,
    gap: 4,
  },
  actionRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 6,
  },
  actionButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 8,
    backgroundColor: colors.teal,
  },
  actionButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800' as const,
  },
  actionButtonTextDisabled: {
    color: colors.surface,
  },
  actionButtonSecondary: {
    minHeight: 32,
    paddingHorizontal: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionButtonTextSecondary: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800' as const,
  },
} as const;

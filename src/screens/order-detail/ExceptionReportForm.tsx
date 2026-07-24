import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import { exceptionTypeOptions } from '../../data/mockData';
import { useImageUpload } from '../../hooks/useImageUpload';
import type {
  PlatformFileUploadRecord,
  createPlatformFileApi,
} from '../../services/platformFileApi';
import { styles } from '../../styles';
import type { FileAttachmentRef } from '../../types';

type ExceptionPlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
>;

type ExceptionReportDraft = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFiles?: FileAttachmentRef[];
};

const maxExceptionPhotoCount = 6;

function getPhotoFileStatusText(status: FileAttachmentRef['status']) {
  switch (status) {
    case 'uploaded':
      return '已上传';
    case 'rejected':
      return '已驳回';
    default:
      return '待上传';
  }
}

function mapPlatformFileToAttachmentRef(
  file: PlatformFileUploadRecord,
  fileName: string,
): FileAttachmentRef {
  return {
    fileId: file.id,
    fileName,
    purpose: 'exception',
    status: file.status,
    objectKey: file.objectKey,
    publicUrl: file.publicUrl,
  };
}

export function ExceptionReportForm({
  platformFileApi,
  onSubmit,
}: {
  platformFileApi?: ExceptionPlatformFileApi;
  onSubmit: (report: ExceptionReportDraft) => void;
}) {
  const [selectedType, setSelectedType] = useState<
    (typeof exceptionTypeOptions)[number] | undefined
  >();
  const [description, setDescription] = useState('');
  const [photoCount, setPhotoCount] = useState(0);
  const [photoFiles, setPhotoFiles] = useState<FileAttachmentRef[]>([]);
  const [notice, setNotice] = useState('');
  const photoCountRef = useRef(0);
  const { pickAndUpload: pickExceptionPhotoAndUpload } = useImageUpload(
    platformFileApi,
    {
      purpose: 'exception',
      fileName: '异常图片凭证.png',
      contentType: 'image/png',
      byteSize: 2048,
    },
  );
  const uploadedPhotoFiles = photoFiles.slice(0, photoCount);
  const localPlaceholderIndexes = Array.from(
    { length: Math.max(photoCount - uploadedPhotoFiles.length, 0) },
    (_, index) => uploadedPhotoFiles.length + index + 1,
  );

  const submit = () => {
    const trimmedDescription = description.trim();

    if (!selectedType) {
      setNotice('请选择异常类型后再提交');
      return;
    }

    if (!trimmedDescription) {
      setNotice('请填写异常说明后再提交');
      return;
    }

    if (trimmedDescription.length < 6) {
      setNotice('请至少填写 6 个字的异常说明');
      return;
    }

    onSubmit({
      typeLabel: selectedType.label,
      description: trimmedDescription,
      photoCount,
      ...(photoFiles.length > 0 ? { photoFiles } : {}),
    });
  };

  const attachPhoto = async () => {
    const previousPhotoCount = photoCountRef.current;

    if (previousPhotoCount >= maxExceptionPhotoCount) {
      setNotice(`最多添加 ${maxExceptionPhotoCount} 张异常图片凭证`);
      return;
    }

    const previousPhotoFiles = photoFiles;
    const nextPhotoCount = previousPhotoCount + 1;
    photoCountRef.current = nextPhotoCount;
    setPhotoCount(nextPhotoCount);
    setNotice('');

    if (!platformFileApi) {
      return;
    }

    const result = await pickExceptionPhotoAndUpload();

    if (result.status === 'uploaded') {
      const fileName =
        nextPhotoCount === 1
          ? '异常图片凭证.png'
          : `异常图片凭证${nextPhotoCount}.png`;
      setPhotoCount(nextPhotoCount);
      setPhotoFiles(currentFiles => [
        ...currentFiles.slice(0, nextPhotoCount - 1),
        mapPlatformFileToAttachmentRef(result.file, fileName),
      ]);
      setNotice('异常图片凭证已关联平台文件对象。');
      return;
    }

    if (result.status === 'cancelled') {
      photoCountRef.current = previousPhotoCount;
      setPhotoCount(previousPhotoCount);
      setPhotoFiles(previousPhotoFiles);
      setNotice('');
      return;
    }

    if (result.status === 'error') {
      photoCountRef.current = previousPhotoCount;
      setPhotoCount(previousPhotoCount);
      setPhotoFiles(previousPhotoFiles);
      setNotice(result.message);
    }
  };

  const removeLatestPhoto = () => {
    const nextPhotoCount = Math.max(photoCountRef.current - 1, 0);

    photoCountRef.current = nextPhotoCount;
    setPhotoCount(nextPhotoCount);
    setPhotoFiles(currentFiles =>
      currentFiles.slice(0, Math.min(currentFiles.length, nextPhotoCount)),
    );
    setNotice('已移除最新异常图片凭证，本地不会删除真实文件。');
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>异常上报</Text>
      <View style={styles.draftChoiceGrid}>
        {exceptionTypeOptions.map(option => {
          const active = option.id === selectedType?.id;

          return (
            <Pressable
              key={option.id}
              testID={`exception-type-${option.id}`}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setSelectedType(option)}
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
      <AuthField
        testID="exception-description"
        label="异常说明"
        placeholder="请描述异常情况"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />
      <Pressable
        testID="exception-photo-add"
        style={[
          styles.draftChoiceButton,
          photoCount > 0 && styles.draftChoiceButtonActive,
        ]}
        onPress={attachPhoto}
      >
        <Text
          style={[
            styles.draftChoiceText,
            photoCount > 0 && styles.draftChoiceTextActive,
          ]}
        >
          {photoCount > 0 ? `图片凭证 ${photoCount} 张` : '添加图片凭证'}
        </Text>
      </Pressable>
      {photoCount > 0 ? (
        <View>
          <Text style={styles.draftSectionTitle}>异常图片凭证清单</Text>
          {uploadedPhotoFiles.map((file, index) => (
            <ImageCredentialCard
              key={file.fileId}
              title={`异常图片凭证：${file.fileName}`}
              publicUrl={file.publicUrl}
              placeholderLabel="异常图片"
              metaLines={[
                `来源：平台文件对象（${getPhotoFileStatusText(file.status)}）`,
                `文件 ID：${file.fileId}`,
                ...(file.publicUrl
                  ? ['已生成预览地址。']
                  : file.objectKey
                    ? ['已写入平台对象存储。']
                    : []),
              ]}
              imageTestID={`exception-photo-preview-image-${index + 1}`}
              placeholderTestID={`exception-photo-preview-placeholder-${index + 1}`}
            />
          ))}
          {localPlaceholderIndexes.map(voucherIndex => (
            <ImageCredentialCard
              key={voucherIndex}
              title={`本地图片凭证 ${voucherIndex}：本地已保存`}
              placeholderLabel={`异常图片 ${voucherIndex}`}
              metaLines={['来源：本地图片凭证占位']}
              placeholderTestID={`exception-photo-preview-placeholder-${voucherIndex}`}
            />
          ))}
          <Pressable
            testID="exception-photo-remove-latest"
            style={styles.detailSecondaryButton}
            onPress={removeLatestPhoto}
          >
            <Text style={styles.detailSecondaryButtonText}>移除最新凭证</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="exception-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>提交异常</Text>
      </Pressable>
    </View>
  );
}

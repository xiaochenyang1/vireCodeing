import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import { evaluationTagOptions } from '../../data/mockData';
import type {
  PlatformFileUploadConfirmationApi,
  PlatformFileUploadRecord,
  createPlatformFileApi,
} from '../../services/platformFileApi';
import { confirmPlatformFileUploadIntent } from '../../services/platformFileApi';
import { styles } from '../../styles';
import type { FileAttachmentRef } from '../../types';

type EvaluationPlatformFileApi = PlatformFileUploadConfirmationApi &
  Pick<
  ReturnType<typeof createPlatformFileApi>,
    'createUploadIntent'
  >;

type DriverEvaluationDraft = {
  rating: number;
  tags: string[];
  content: string;
  anonymous?: boolean;
  photoCount?: number;
  photoFiles?: FileAttachmentRef[];
};

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
    purpose: 'evaluation',
    status: file.status,
    objectKey: file.objectKey,
    publicUrl: file.publicUrl,
  };
}

export function DriverEvaluationForm({
  platformFileApi,
  onSubmit,
}: {
  platformFileApi?: EvaluationPlatformFileApi;
  onSubmit: (evaluation: DriverEvaluationDraft) => void;
}) {
  const [rating, setRating] = useState(5);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoFiles, setPhotoFiles] = useState<FileAttachmentRef[]>([]);
  const [notice, setNotice] = useState('');
  const uploadedPhotoFiles = photoFiles.slice(0, photoCount);
  const localPlaceholderIndexes = Array.from(
    { length: Math.max(photoCount - uploadedPhotoFiles.length, 0) },
    (_, index) => uploadedPhotoFiles.length + index + 1,
  );

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(current =>
      current.includes(tagId)
        ? current.filter(item => item !== tagId)
        : [...current, tagId],
    );
  };

  const submit = () => {
    const trimmedContent = content.trim();

    if (selectedTagIds.length === 0) {
      setNotice('请选择至少一个评价标签');
      return;
    }

    if (!trimmedContent) {
      setNotice('请填写评价内容后再提交');
      return;
    }

    if (trimmedContent.length < 6) {
      setNotice('请至少填写 6 个字的评价内容');
      return;
    }

    if (trimmedContent.length > 200) {
      setNotice('评价内容最多 200 字');
      return;
    }

    onSubmit({
      rating,
      tags: evaluationTagOptions
        .filter(option => selectedTagIds.includes(option.id))
        .map(option => option.label),
      content: trimmedContent,
      anonymous,
      photoCount,
      ...(photoFiles.length > 0 ? { photoFiles } : {}),
    });
  };

  const attachPhoto = async () => {
    const fileName = '评价图片凭证.png';
    setPhotoCount(1);
    setPhotoFiles([]);

    if (!platformFileApi) {
      return;
    }

    try {
      const intent = await platformFileApi.createUploadIntent({
        purpose: 'evaluation',
        fileName,
        contentType: 'image/png',
        byteSize: 2048,
      });
      const uploadedFile = await confirmPlatformFileUploadIntent(
        platformFileApi,
        intent,
      );

      setPhotoFiles([mapPlatformFileToAttachmentRef(uploadedFile, fileName)]);
      setNotice('评价图片凭证已关联平台文件对象。');
    } catch {
      setNotice('评价图片凭证上传失败，已保留本地占位。');
    }
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>评价司机</Text>
      <View style={styles.draftChoiceGrid}>
        {[1, 2, 3, 4, 5].map(value => {
          const active = value === rating;

          return (
            <Pressable
              key={value}
              testID={`evaluation-rating-${value}`}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setRating(value)}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  active && styles.draftChoiceTextActive,
                ]}
              >
                {value} 星
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.draftChoiceGrid}>
        {evaluationTagOptions.map(option => {
          const active = selectedTagIds.includes(option.id);

          return (
            <Pressable
              key={option.id}
              testID={`evaluation-tag-${option.id}`}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => toggleTag(option.id)}
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
        testID="evaluation-content"
        label="评价内容"
        placeholder="说说这次运输体验"
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={4}
      />
      <Pressable
        testID="evaluation-anonymous-toggle"
        style={[
          styles.draftChoiceButton,
          anonymous && styles.draftChoiceButtonActive,
        ]}
        onPress={() => setAnonymous(current => !current)}
      >
        <Text
          style={[
            styles.draftChoiceText,
            anonymous && styles.draftChoiceTextActive,
          ]}
        >
          {anonymous ? '匿名评价已开启' : '匿名评价'}
        </Text>
      </Pressable>
      <Pressable
        testID="evaluation-photo-add"
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
          {photoCount > 0 ? '图片凭证 1 张' : '添加图片凭证'}
        </Text>
      </Pressable>
      {photoCount > 0 ? (
        <View>
          <Text style={styles.draftSectionTitle}>评价图片凭证清单</Text>
          {uploadedPhotoFiles.map((file, index) => (
            <ImageCredentialCard
              key={file.fileId}
              title={`评价图片凭证：${file.fileName}`}
              publicUrl={file.publicUrl}
              placeholderLabel="评价图片"
              metaLines={[
                `来源：平台文件对象（${getPhotoFileStatusText(file.status)}）`,
                `文件 ID：${file.fileId}`,
                ...(file.publicUrl
                  ? ['已生成预览地址。']
                  : file.objectKey
                    ? ['已写入平台对象存储。']
                    : []),
              ]}
              imageTestID={`evaluation-photo-preview-image-${index + 1}`}
              placeholderTestID={`evaluation-photo-preview-placeholder-${index + 1}`}
            />
          ))}
          {localPlaceholderIndexes.map(voucherIndex => (
            <ImageCredentialCard
              key={voucherIndex}
              title={`本地图片凭证 ${voucherIndex}：本地已保存`}
              placeholderLabel={`评价图片 ${voucherIndex}`}
              metaLines={['来源：本地图片凭证占位']}
              placeholderTestID={`evaluation-photo-preview-placeholder-${voucherIndex}`}
            />
          ))}
        </View>
      ) : null}
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="evaluation-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>提交评价</Text>
      </Pressable>
    </View>
  );
}

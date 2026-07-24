import { Pressable, Text, View } from 'react-native';

import { ImageCredentialCard } from '../../components/ImageCredentialCard';
import { styles } from '../../styles';
import type { FileAttachmentRef, RecentOrder } from '../../types';

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

function renderAttachmentCards({
  title,
  placeholderLabel,
  files,
  testIDPrefix,
}: {
  title: string;
  placeholderLabel: string;
  files: FileAttachmentRef[] | undefined;
  testIDPrefix: string;
}) {
  if (!files?.length) {
    return null;
  }

  return (
    <View style={styles.detailInlineGroup}>
      <Text style={styles.draftSectionTitle}>{title}清单</Text>
      {files.map((file, index) => (
        <ImageCredentialCard
          key={`${file.fileId || file.fileName}-${index}`}
          title={`${title}：${file.fileName}`}
          publicUrl={file.publicUrl}
          placeholderLabel={placeholderLabel}
          metaLines={[
            `来源：平台文件对象（${getAttachmentStatusText(file.status)}）`,
            `文件 ID：${file.fileId}`,
            ...(file.publicUrl
              ? ['已生成预览地址。']
              : file.objectKey
                ? ['已写入平台对象存储。']
                : []),
          ]}
          imageTestID={`${testIDPrefix}-image-${index + 1}`}
          placeholderTestID={`${testIDPrefix}-placeholder-${index + 1}`}
        />
      ))}
    </View>
  );
}

export function ExceptionRecordCard({
  orderId,
  exceptionReport,
  onResolve,
}: {
  orderId: string;
  exceptionReport: NonNullable<RecentOrder['exceptionReport']>;
  onResolve: () => void;
}) {
  const photoCount =
    exceptionReport.photoCount ?? exceptionReport.photoFiles?.length ?? 0;

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>异常记录</Text>
      <Text style={styles.detailMeta}>
        {exceptionReport.typeLabel} · {exceptionReport.description}
      </Text>
      <Text style={styles.detailMeta}>
        {`处理状态：${exceptionReport.statusText ?? '待客服跟进'}`}
      </Text>
      {photoCount > 0 ? (
        <Text style={styles.detailMeta}>
          {`图片凭证 ${photoCount} 张`}
        </Text>
      ) : null}
      {renderAttachmentCards({
        title: '异常图片凭证',
        placeholderLabel: '异常图片',
        files: exceptionReport.photoFiles,
        testIDPrefix: 'order-exception-record-photo',
      })}
      {exceptionReport.statusText !== '已处理' ? (
        <Pressable
          testID={`exception-resolve-${orderId}`}
          style={styles.detailSecondaryButton}
          onPress={onResolve}
        >
          <Text style={styles.detailSecondaryButtonText}>标记已处理</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ModificationRequestRecordCard({
  orderId,
  modificationRequest,
  onReview,
}: {
  orderId: string;
  modificationRequest: NonNullable<RecentOrder['modificationRequest']>;
  onReview: (statusText: string, reviewResultText: string) => void;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>修改申请记录</Text>
      <Text style={styles.detailMeta}>{modificationRequest.description}</Text>
      <Text style={styles.detailMeta}>
        {`处理状态：${modificationRequest.statusText}`}
      </Text>
      <Text style={styles.detailMeta}>{modificationRequest.impactText}</Text>
      {modificationRequest.costImpactText ? (
        <Text style={styles.detailMeta}>
          {`费用影响：${modificationRequest.costImpactText}`}
        </Text>
      ) : null}
      {modificationRequest.refundText ? (
        <Text style={styles.detailMeta}>
          {`退款状态：${modificationRequest.refundText}`}
        </Text>
      ) : null}
      {modificationRequest.driverNoticeText ? (
        <Text style={styles.detailMeta}>
          {`司机通知：${modificationRequest.driverNoticeText}`}
        </Text>
      ) : null}
      {modificationRequest.reviewResultText ? (
        <Text style={styles.detailMeta}>
          {`审核结果：${modificationRequest.reviewResultText}`}
        </Text>
      ) : null}
      {modificationRequest.statusText === '待客服确认' ? (
        <>
          <Pressable
            testID={`change-request-approve-${orderId}`}
            style={styles.detailSecondaryButton}
            onPress={() =>
              onReview('已确认', '客服已确认修改申请，司机通知已同步。')
            }
          >
            <Text style={styles.detailSecondaryButtonText}>本地确认修改</Text>
          </Pressable>
          <Pressable
            testID={`change-request-reject-${orderId}`}
            style={styles.detailSecondaryButton}
            onPress={() =>
              onReview('已驳回', '客服驳回修改申请，订单按原信息继续执行。')
            }
          >
            <Text style={styles.detailSecondaryButtonText}>本地驳回修改</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export function CancellationRecordCard({
  cancellation,
}: {
  cancellation: NonNullable<RecentOrder['cancellation']>;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>取消记录</Text>
      <Text style={styles.detailMeta}>
        {`取消原因：${cancellation.reasonText}`}
      </Text>
      <Text style={styles.detailMeta}>{cancellation.description}</Text>
      <Text style={styles.detailMeta}>{`违约提示：${cancellation.feeText}`}</Text>
      {cancellation.settlementText ? (
        <Text style={styles.detailMeta}>
          {`结算结果：${cancellation.settlementText}`}
        </Text>
      ) : null}
      {cancellation.refundText ? (
        <Text style={styles.detailMeta}>
          {`退款状态：${cancellation.refundText}`}
        </Text>
      ) : null}
      {cancellation.reviewStatusText ? (
        <Text style={styles.detailMeta}>
          {`客服审核：${cancellation.reviewStatusText}`}
        </Text>
      ) : null}
      {cancellation.driverNoticeText ? (
        <Text style={styles.detailMeta}>
          {`司机通知：${cancellation.driverNoticeText}`}
        </Text>
      ) : null}
    </View>
  );
}

export function EvaluationRecordCard({
  evaluation,
}: {
  evaluation: NonNullable<RecentOrder['evaluation']>;
}) {
  const photoCount = evaluation.photoCount ?? evaluation.photoFiles?.length ?? 0;

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>我的评价</Text>
      <Text style={styles.detailMeta}>
        {evaluation.rating} 星 · {evaluation.tags.join('、')}
      </Text>
      {evaluation.anonymous ? (
        <Text style={styles.detailMeta}>匿名评价</Text>
      ) : null}
      {photoCount > 0 ? (
        <Text style={styles.detailMeta}>
          {`图片凭证 ${photoCount} 张`}
        </Text>
      ) : null}
      {renderAttachmentCards({
        title: '评价图片凭证',
        placeholderLabel: '评价图片',
        files: evaluation.photoFiles,
        testIDPrefix: 'order-evaluation-record-photo',
      })}
      <Text style={styles.detailMeta}>{evaluation.content}</Text>
    </View>
  );
}

export function ShipperEvaluationRecordCard({
  shipperEvaluation,
}: {
  shipperEvaluation: NonNullable<RecentOrder['shipperEvaluation']>;
}) {
  const photoCount =
    shipperEvaluation.photoCount ?? shipperEvaluation.photoFiles?.length ?? 0;

  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailRoute}>司机评价</Text>
      <View style={styles.detailInlineGroup}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.detailMeta}>
            {`评分：${'★'.repeat(shipperEvaluation.rating)}${'☆'.repeat(5 - shipperEvaluation.rating)}`}
          </Text>
        </View>
        {shipperEvaluation.tags.map((tag, index) => (
          <Text key={index} style={styles.detailMeta}>
            {`#${tag}`}
          </Text>
        ))}
        {shipperEvaluation.anonymous ? (
          <Text style={styles.detailMeta}>匿名评价</Text>
        ) : null}
        {photoCount > 0 ? (
          <Text style={styles.detailMeta}>{`图片凭证 ${photoCount} 张`}</Text>
        ) : null}
        {renderAttachmentCards({
          title: '司机评价图片凭证',
          placeholderLabel: '司机评价图片',
          files: shipperEvaluation.photoFiles,
          testIDPrefix: 'order-shipper-evaluation-record-photo',
        })}
        <Text style={styles.detailMeta}>{shipperEvaluation.content}</Text>
      </View>
    </View>
  );
}

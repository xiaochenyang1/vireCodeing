import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import type { RecentOrder } from '../../types';

export function ExceptionRecordCard({
  orderId,
  exceptionReport,
  onResolve,
}: {
  orderId: string;
  exceptionReport: NonNullable<RecentOrder['exceptionReport']>;
  onResolve: () => void;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>异常记录</Text>
      <Text style={styles.detailMeta}>
        {exceptionReport.typeLabel} · {exceptionReport.description}
      </Text>
      <Text style={styles.detailMeta}>
        {`处理状态：${exceptionReport.statusText ?? '待客服跟进'}`}
      </Text>
      {exceptionReport.photoCount ? (
        <Text style={styles.detailMeta}>
          {`图片凭证 ${exceptionReport.photoCount} 张`}
        </Text>
      ) : null}
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
  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>我的评价</Text>
      <Text style={styles.detailMeta}>
        {evaluation.rating} 星 · {evaluation.tags.join('、')}
      </Text>
      {evaluation.anonymous ? (
        <Text style={styles.detailMeta}>匿名评价</Text>
      ) : null}
      {evaluation.photoCount ? (
        <Text style={styles.detailMeta}>
          {`图片凭证 ${evaluation.photoCount} 张`}
        </Text>
      ) : null}
      <Text style={styles.detailMeta}>{evaluation.content}</Text>
    </View>
  );
}

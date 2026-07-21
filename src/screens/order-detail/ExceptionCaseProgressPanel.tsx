import { Pressable, Text, TextInput, View } from 'react-native';

import type { PlatformOrderExceptionCase } from '../../services/platformOrderApi';
import { styles } from '../../styles';
import {
  canAppealOrderExceptionCase,
  getOrderExceptionCaseAppealStatusText,
  getOrderExceptionCaseCompensationSummary,
  getOrderExceptionCaseSourceText,
  getOrderExceptionCaseStatusText,
  sortOrderExceptionCaseActions,
} from '../../utils/orderExceptionCases';

export function ExceptionCaseProgressPanel({
  cases,
  isLoading,
  notice,
  appealDrafts = {},
  appealingCaseId,
  onChangeAppealReason,
  onSubmitAppeal,
}: {
  cases: PlatformOrderExceptionCase[];
  isLoading: boolean;
  notice?: string;
  appealDrafts?: Record<string, string>;
  appealingCaseId?: string;
  onChangeAppealReason?: (caseId: string, reason: string) => void;
  onSubmitAppeal?: (exceptionCase: PlatformOrderExceptionCase) => void;
}) {
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

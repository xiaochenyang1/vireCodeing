import { Text, View } from 'react-native';

import type { PlatformOrderExceptionCase } from '../../services/platformOrderApi';
import { styles } from '../../styles';
import {
  getOrderExceptionCaseCompensationSummary,
  getOrderExceptionCaseSourceText,
  getOrderExceptionCaseStatusText,
  sortOrderExceptionCaseActions,
} from '../../utils/orderExceptionCases';

export function ExceptionCaseProgressPanel({
  cases,
  isLoading,
  notice,
}: {
  cases: PlatformOrderExceptionCase[];
  isLoading: boolean;
  notice?: string;
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
              <Text style={styles.detailMeta}>{compensationSummary}</Text>
            ) : null}
            {sortOrderExceptionCaseActions(exceptionCase.actions).map(action => (
              <Text key={action.id} style={styles.detailMeta}>
                {getOrderExceptionCaseStatusText(action.fromStatus)} →{' '}
                {getOrderExceptionCaseStatusText(action.toStatus)}：
                {action.content}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

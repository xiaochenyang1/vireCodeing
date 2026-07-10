import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import type { PlatformProfileSpendingSnapshot } from '../../services/platformProfileApi';
import { styles } from '../../styles';
import type { RecentOrder } from '../../types';
import {
  filterSpendingRecords,
  getSpendingTotals,
  type SpendingFilter,
  type SpendingTimeFilter,
} from '../../utils/profileSpending';
import {
  createSpendingRecords,
  formatLocalCurrency,
} from './profileRecordUtils';

export function SpendingRecords({
  orders,
  platformSpendingSnapshot,
  notice,
}: {
  orders: RecentOrder[];
  platformSpendingSnapshot?: PlatformProfileSpendingSnapshot;
  notice?: string;
}) {
  const isPlatformMode = Boolean(platformSpendingSnapshot);
  const spendingRecords = createSpendingRecords(orders, {
    platformOnly: isPlatformMode,
    platformRecords: platformSpendingSnapshot?.items ?? [],
  });
  const [filter, setFilter] = useState<SpendingFilter>('all');
  const [timeFilter, setTimeFilter] = useState<SpendingTimeFilter>('all');
  const filterOptions: Array<{
    id: SpendingFilter;
    label: string;
    testID: string;
  }> = [
    { id: 'all', label: '全部', testID: 'spending-filter-all' },
    {
      id: 'completed',
      label: '已完成',
      testID: 'spending-filter-completed',
    },
    { id: 'active', label: '进行中', testID: 'spending-filter-active' },
    { id: 'refund', label: '退款', testID: 'spending-filter-refund' },
  ];
  const timeFilterOptions: Array<{
    id: SpendingTimeFilter;
    label: string;
    testID: string;
  }> = [
    { id: 'all', label: '全部时间', testID: 'spending-time-all' },
    { id: 'recent', label: '近期', testID: 'spending-time-recent' },
    { id: 'history', label: '历史', testID: 'spending-time-history' },
  ];
  const { completedTotal, activeTotal, refundTotal } = isPlatformMode
    ? {
        completedTotal: convertCentsToYuan(
          platformSpendingSnapshot?.summary.completedTotalCents ?? 0,
        ),
        activeTotal: convertCentsToYuan(
          platformSpendingSnapshot?.summary.activeTotalCents ?? 0,
        ),
        refundTotal: convertCentsToYuan(
          platformSpendingSnapshot?.summary.refundTotalCents ?? 0,
        ),
      }
    : getSpendingTotals(spendingRecords);
  const filteredRecords = filterSpendingRecords(
    spendingRecords,
    filter,
    timeFilter,
  );

  return (
    <View style={styles.detailCard}>
      {notice ? <Text style={styles.routeMeta}>{notice}</Text> : null}
      <Text style={styles.draftSectionTitle}>总消费统计</Text>
      <View style={styles.metricRow}>
        <SpendingMetricItem
          label="已完成消费"
          value={formatLocalCurrency(completedTotal)}
        />
        <SpendingMetricItem
          label="托管中金额"
          value={formatLocalCurrency(activeTotal)}
        />
        <SpendingMetricItem
          label="退款中金额"
          value={formatLocalCurrency(refundTotal)}
        />
      </View>
      <Text style={styles.routeMeta}>
        {`已完成消费：${formatLocalCurrency(completedTotal)}`}
      </Text>
      <Text style={styles.routeMeta}>
        {`托管中金额：${formatLocalCurrency(activeTotal)}`}
      </Text>
      <Text style={styles.routeMeta}>
        {`退款中金额：${formatLocalCurrency(refundTotal)}`}
      </Text>

      <Text style={styles.draftSectionTitle}>记录筛选</Text>
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

      <Text style={styles.draftSectionTitle}>时间筛选</Text>
      <View style={styles.draftChoiceGrid}>
        {timeFilterOptions.map(option => {
          const active = option.id === timeFilter;

          return (
            <Pressable
              key={option.id}
              testID={option.testID}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setTimeFilter(option.id)}
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

      <Text style={styles.draftSectionTitle}>消费明细</Text>
      {filteredRecords.length > 0 ? (
        filteredRecords.map(item => (
          <View key={item.id} style={styles.driverInfoCard}>
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{item.orderId}</Text>
              <Text style={styles.routeAction}>{item.amountText}</Text>
            </View>
            {item.routeText ? (
              <Text style={styles.detailMeta}>{item.routeText}</Text>
            ) : null}
            <Text style={styles.detailMeta}>
              {item.methodText} · {item.statusText}
            </Text>
            <Text style={styles.routeMeta}>{item.timeText}</Text>
            <Text style={styles.routeMeta}>{item.paymentTimeText}</Text>
            <Text style={styles.routeMeta}>{item.paymentStatusText}</Text>
            {item.originalPriceText ? (
              <Text style={styles.routeMeta}>
                {`原价：${item.originalPriceText}`}
              </Text>
            ) : null}
            {item.couponTitleText ? (
              <Text style={styles.routeMeta}>
                {`优惠券：${item.couponTitleText}`}
              </Text>
            ) : null}
            {item.couponDiscountText ? (
              <Text style={styles.routeMeta}>
                {`优惠金额：${item.couponDiscountText}`}
              </Text>
            ) : null}
            {item.payablePriceText ? (
              <Text style={styles.routeMeta}>
                {`实付金额：${item.payablePriceText}`}
              </Text>
            ) : null}
            <Text style={styles.routeMeta}>{item.settlementText}</Text>
            <Text style={styles.routeMeta}>{item.flowText}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.routeMeta}>
          {isPlatformMode ? '暂无平台消费记录' : '暂无消费记录'}
        </Text>
      )}
    </View>
  );
}

function SpendingMetricItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function convertCentsToYuan(cents: number) {
  return cents / 100;
}

import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { colors, styles } from '../styles';

export type DailyIncomePoint = {
  dateText: string;
  incomeCents: number;
  orderCount: number;
};

export type IncomeChartProps = {
  data: DailyIncomePoint[];
  daysToShow?: number;
  testID?: string;
};

const BAR_GAP = 4;
const BAR_MIN_WIDTH = 8;
const CHART_HEIGHT = 120;

export function IncomeChart({
  data,
  daysToShow = 7,
  testID,
}: IncomeChartProps) {
  const visibleData = useMemo(
    () => data.slice(-daysToShow),
    [data, daysToShow],
  );

  if (!visibleData.length) {
    return (
      <View style={chartStyles.empty} testID={testID}>
        <Text style={chartStyles.emptyText}>暂无收入数据</Text>
      </View>
    );
  }

  const maxIncome = Math.max(
    ...visibleData.map(point => point.incomeCents),
    1,
  );

  const totalIncome = visibleData.reduce(
    (sum, point) => sum + point.incomeCents,
    0,
  );
  const totalOrders = visibleData.reduce(
    (sum, point) => sum + point.orderCount,
    0,
  );

  return (
    <View>
      <View style={chartStyles.summaryRow}>
        <View style={chartStyles.summaryItem}>
          <Text style={chartStyles.summaryValue}>
            {(totalIncome / 100).toFixed(2)}
          </Text>
          <Text style={chartStyles.summaryLabel}>近{daysToShow}天收入（元）</Text>
        </View>
        <View style={chartStyles.summaryItem}>
          <Text style={chartStyles.summaryValue}>{totalOrders}</Text>
          <Text style={chartStyles.summaryLabel}>近{daysToShow}天订单</Text>
        </View>
        <View style={chartStyles.summaryItem}>
          <Text style={chartStyles.summaryValue}>
            {totalOrders > 0
              ? (totalIncome / totalOrders / 100).toFixed(2)
              : '0.00'}
          </Text>
          <Text style={chartStyles.summaryLabel}>平均单均（元）</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chartStyles.scrollContent}
      >
        <View style={chartStyles.chartRow}>
          {visibleData.map((point, index) => {
            const barHeight =
              maxIncome > 0
                ? (point.incomeCents / maxIncome) * CHART_HEIGHT
                : 0;

            return (
              <View
                key={point.dateText}
                style={chartStyles.barColumn}
                testID={testID ? `${testID}-bar-${index}` : undefined}
              >
                <Text
                  style={chartStyles.barValue}
                  testID={
                    testID ? `${testID}-bar-value-${index}` : undefined
                  }
                >
                  {point.incomeCents > 0
                    ? `${(point.incomeCents / 100).toFixed(0)}`
                    : ''}
                </Text>
                <View style={chartStyles.barTrack}>
                  <View
                    style={[
                      chartStyles.barFill,
                      {
                        height: Math.max(barHeight, 2),
                        backgroundColor: point.incomeCents > 0
                          ? colors.teal
                          : colors.border,
                      },
                    ]}
                  />
                </View>
                <Text style={chartStyles.barLabel}>{point.dateText}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const chartStyles = {
  empty: {
    paddingVertical: 24,
    alignItems: 'center' as const,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: 'center' as const,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  chartRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: BAR_GAP,
    minHeight: CHART_HEIGHT + 24,
  },
  barColumn: {
    alignItems: 'center' as const,
    width: BAR_MIN_WIDTH + 12,
  },
  barValue: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  barTrack: {
    width: BAR_MIN_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
  },
  barFill: {
    width: BAR_MIN_WIDTH,
    borderRadius: 3,
    minHeight: 2,
  },
  barLabel: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
} as const;

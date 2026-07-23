import { Pressable, Text, View } from 'react-native';

import { recentOrderStatusCopy } from '../data/mockData';
import { styles } from '../styles';
import type { RecentOrder } from '../types';
import { formatVehicleRequirementText } from '../utils/order';
import {
  getOrderExceptionCaseSummaryHeadline,
  getOrderExceptionCaseSummaryText,
} from '../utils/orderExceptionCases';

export function RecentOrderCard({
  order,
  onOpenOrderDetail,
  onReorder,
}: {
  order: RecentOrder;
  onOpenOrderDetail: (orderId: string) => void;
  onReorder?: (prefill: { orderId: string }) => void;
}) {
  const status = recentOrderStatusCopy[order.status];
  const vehicleRequirementText = formatVehicleRequirementText(order);
  const latestExceptionCaseHeadline = order.latestExceptionCase
    ? getOrderExceptionCaseSummaryHeadline(order.latestExceptionCase)
    : undefined;
  const latestExceptionCaseDetail = order.latestExceptionCase
    ? getOrderExceptionCaseSummaryText(order.latestExceptionCase)
    : undefined;

  return (
    <Pressable
      testID={`home-recent-order-${order.id}`}
      style={({ pressed }) => [styles.orderCard, pressed && styles.pressedCard]}
      onPress={() => onOpenOrderDetail(order.id)}
    >
      <View style={styles.orderTopRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{status.label}</Text>
        </View>
        <Text style={styles.orderId}>{order.id}</Text>
      </View>

      <Text style={styles.orderRoute} numberOfLines={2}>
        {order.from} → {order.to}
      </Text>

      {latestExceptionCaseHeadline ? (
        <View style={styles.orderExceptionSummary}>
          <Text style={styles.orderExceptionSummaryTitle} numberOfLines={1}>
            {latestExceptionCaseHeadline}
          </Text>
          {latestExceptionCaseDetail ? (
            <Text style={styles.orderExceptionSummaryText} numberOfLines={2}>
              {latestExceptionCaseDetail}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.orderMetaRow}>
        <Text style={styles.orderMetaText}>{order.cargoType}</Text>
        <Text style={styles.orderMetaText}>{order.weightText}</Text>
        <Text style={styles.orderMetaText}>{vehicleRequirementText}</Text>
      </View>

      <View style={styles.orderBottomRow}>
        <View>
          <Text style={styles.orderPrice}>{order.priceText}</Text>
          <Text style={styles.orderTime}>{order.updatedAtText}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {(order.status === 'completed' || order.status === 'cancelled') &&
          onReorder ? (
            <Pressable
              testID={`home-reorder-${order.id}`}
              style={styles.secondaryButton}
              onPress={() => onReorder({ orderId: order.id })}
            >
              <Text style={styles.secondaryButtonText}>重新下单</Text>
            </Pressable>
          ) : null}
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{status.action}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

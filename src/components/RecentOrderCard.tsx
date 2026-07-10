import { Pressable, Text, View } from 'react-native';

import { recentOrderStatusCopy } from '../data/mockData';
import { styles } from '../styles';
import type { RecentOrder } from '../types';
import { formatVehicleRequirementText } from '../utils/order';

export function RecentOrderCard({
  order,
  onOpenOrderDetail,
}: {
  order: RecentOrder;
  onOpenOrderDetail: (orderId: string) => void;
}) {
  const status = recentOrderStatusCopy[order.status];
  const vehicleRequirementText = formatVehicleRequirementText(order);

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
        <View style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{status.action}</Text>
        </View>
      </View>
    </Pressable>
  );
}

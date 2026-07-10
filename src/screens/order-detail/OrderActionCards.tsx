import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import type { RecentOrder } from '../../types';

type OrderProgressAction = {
  label: string;
  description: string;
};

export function OrderActionsCard({
  order,
  primaryAction,
  secondaryAction,
  canRequestChange,
  onPrimaryAction,
  onSecondaryAction,
  onEditOrder,
  onToggleBonus,
  onToggleChangeRequest,
}: {
  order: RecentOrder;
  primaryAction: string;
  secondaryAction: string;
  canRequestChange: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onEditOrder: (order: RecentOrder) => void;
  onToggleBonus: () => void;
  onToggleChangeRequest: () => void;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>操作</Text>
      <Pressable
        testID="order-detail-primary-action"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onPrimaryAction}
      >
        <Text style={styles.detailPrimaryButtonText}>{primaryAction}</Text>
      </Pressable>
      <Pressable
        testID="order-detail-secondary-action"
        style={styles.detailSecondaryButton}
        onPress={onSecondaryAction}
      >
        <Text style={styles.detailSecondaryButtonText}>{secondaryAction}</Text>
      </Pressable>
      {order.status === 'waiting' ? (
        <Pressable
          testID="order-detail-edit-action"
          style={styles.detailSecondaryButton}
          onPress={() => onEditOrder(order)}
        >
          <Text style={styles.detailSecondaryButtonText}>修改订单</Text>
        </Pressable>
      ) : null}
      {order.status === 'waiting' ? (
        <Pressable
          testID="order-detail-bonus-action"
          style={styles.detailSecondaryButton}
          onPress={onToggleBonus}
        >
          <Text style={styles.detailSecondaryButtonText}>追加赏金</Text>
        </Pressable>
      ) : null}
      {canRequestChange ? (
        <Pressable
          testID="order-detail-change-request-action"
          style={styles.detailSecondaryButton}
          onPress={onToggleChangeRequest}
        >
          <Text style={styles.detailSecondaryButtonText}>申请修改</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OrderProgressActionCard({
  progressAction,
  onProgressAction,
}: {
  progressAction: OrderProgressAction;
  onProgressAction: () => void;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>本地状态操作</Text>
      <Text style={styles.detailMeta}>{progressAction.description}</Text>
      <Pressable
        testID="order-detail-progress-action"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onProgressAction}
      >
        <Text style={styles.detailPrimaryButtonText}>
          {progressAction.label}
        </Text>
      </Pressable>
    </View>
  );
}

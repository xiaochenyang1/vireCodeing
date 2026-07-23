import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileAvatar } from '../../components/ProfileAvatar';
import { RecentOrderCard } from '../../components/RecentOrderCard';
import { SectionHeader } from '../../components/SectionHeader';
import {
  verificationCopy,
} from '../../data/mockData';
import { colors, styles } from '../../styles';
import type { FrequentRoute, OrderListFilter, RecentOrder } from '../../types';
import {
  getHomeCitySuggestionOptions,
  getHomeSummaryMetrics,
  getOrderListFilterForSummaryStatus,
} from '../../utils/homeDashboard';
import { getOrderStatusSummaries } from '../../utils/order';
import {
  createProfileOverviewModel,
  getProfileAvatarInitial,
} from '../../utils/profileOverview';
import {
  getEffectiveIdentityVerificationStatus,
  getIdentityPublishGateNotice,
  getProfileLocalState,
} from '../../utils/profileLocalState';

export function NetworkStatusCard({
  summaryText,
  actionText,
  onOpenNetworkError,
}: {
  summaryText: string;
  actionText: string;
  onOpenNetworkError: () => void;
}) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.routeHeader}>
        <View>
          <Text style={styles.routeName}>网络状态</Text>
          <Text style={styles.routeMeta}>{summaryText}</Text>
        </View>
        <Pressable
          testID="home-open-network-error"
          style={styles.detailSecondaryButton}
          onPress={onOpenNetworkError}
        >
          <Text style={styles.detailSecondaryButtonText}>{actionText}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TopBar({
  city,
  unreadMessageCount,
  onLogout,
  onOpenCitySelector,
  onOpenMessages,
  onOpenHelp,
  onOpenProfile,
}: {
  city: string;
  unreadMessageCount: number;
  onLogout: () => void;
  onOpenCitySelector: () => void;
  onOpenMessages: () => void;
  onOpenHelp: () => void;
  onOpenProfile: () => void;
}) {
  const { account } = getProfileLocalState();
  const profileAvatarInitial = getProfileAvatarInitial(account.displayName);

  return (
    <View style={styles.topBar}>
      <Pressable
        testID="home-open-city-selector"
        style={styles.cityPill}
        onPress={onOpenCitySelector}
      >
        <Text style={styles.cityText}>{city}</Text>
      </Pressable>

      <View style={styles.topTitleGroup}>
        <Text style={styles.pageKicker}>货主端</Text>
        <Text style={styles.pageTitle}>货运发单</Text>
      </View>

      <View style={styles.topActions}>
        <Pressable
          testID="home-open-messages"
          style={styles.iconButton}
          onPress={onOpenMessages}
        >
          <Text style={styles.iconButtonText}>消息</Text>
          <View style={styles.badge}>
            <Text testID="home-unread-message-count" style={styles.badgeText}>
              {unreadMessageCount}
            </Text>
          </View>
        </Pressable>
        <Pressable
          testID="home-open-help"
          style={styles.iconButton}
          onPress={onOpenHelp}
        >
          <Text style={styles.iconButtonText}>客服</Text>
        </Pressable>
        <Pressable
          testID="home-open-profile"
          style={[styles.iconButton, topBarStyles.profileButton]}
          onPress={onOpenProfile}
        >
          <ProfileAvatar
            initial={profileAvatarInitial}
            publicUrl={account.avatarPublicUrl}
            size="xs"
            imageTestID="home-top-bar-avatar-image"
            textTestID="home-top-bar-avatar-text"
          />
          <Text style={styles.iconButtonText}>我的</Text>
        </Pressable>
        <Pressable
          style={styles.iconButton}
          onPress={onLogout}
          testID="home-logout"
        >
          <Text style={styles.iconButtonText}>退出</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CitySelector({
  selectedCity,
  routes,
  orders,
  onSelectCity,
}: {
  selectedCity: string;
  routes: FrequentRoute[];
  orders: RecentOrder[];
  onSelectCity: (city: string) => void;
}) {
  const citySuggestions = getHomeCitySuggestionOptions({
    selectedCity,
    routes,
    orders,
  });

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>选择城市</Text>
      <View style={styles.draftChoiceGrid}>
        {citySuggestions.map(option => {
          const active = option.label === selectedCity;

          return (
            <Pressable
              key={option.id}
              testID={`city-option-${option.id}`}
              style={[
                styles.draftChoiceButton,
                citySelectorStyles.button,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => onSelectCity(option.label)}
            >
              <View style={citySelectorStyles.header}>
                <Text
                  style={[
                    styles.draftChoiceText,
                    active && styles.draftChoiceTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    citySelectorStyles.badgeText,
                    active ? citySelectorStyles.badgeTextActive : null,
                  ]}
                >
                  {option.badgeText}
                </Text>
              </View>
              <Text
                style={[
                  citySelectorStyles.detailText,
                  active ? citySelectorStyles.detailTextActive : null,
                ]}
              >
                {option.detailText}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.routeMeta}>
        当前城市建议会结合已选城市、常用路线和订单路线生成；定位、城市服务和跨城规则仍未接入。
      </Text>
    </View>
  );
}

export function VerificationPanel({
  orders,
  routeCount,
  unreadMessageCount,
}: {
  orders: RecentOrder[];
  routeCount: number;
  unreadMessageCount: number;
}) {
  const { account, identityVerification, enterpriseVerification } =
    getProfileLocalState();
  const verificationStatus =
    getEffectiveIdentityVerificationStatus(identityVerification);
  const verification = verificationCopy[verificationStatus];
  const profileOverview = createProfileOverviewModel({
    account,
    identityVerification,
    enterpriseVerification,
    monthlyOrderCount: orders.length,
    unreadMessageCount,
  });
  const metrics = getHomeSummaryMetrics({
    orderCount: orders.length,
    routeCount,
    creditScore: profileOverview.creditScore,
  });

  return (
    <View style={styles.verificationPanel}>
      <View style={styles.panelHeader}>
        <View style={styles.profileIdentityRow}>
          <ProfileAvatar
            initial={profileOverview.avatarInitial}
            publicUrl={profileOverview.avatarPublicUrl}
            size="md"
            imageTestID="home-verification-avatar-image"
          />
          <View>
            <Text style={styles.greeting}>
              下午好，{profileOverview.displayName}
            </Text>
            <Text style={styles.subtleText}>
              {profileOverview.accountTypeLabel} · {verification.description}
            </Text>
            <Text style={styles.subtleText}>
              {profileOverview.avatarPublicUrl
                ? '头像：平台已同步'
                : profileOverview.avatarPhotoCount > 0
                  ? '头像凭证：本地已保存'
                  : `头像占位：${profileOverview.avatarInitial}`}
            </Text>
          </View>
        </View>

        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedBadgeText}>{verification.label}</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        {metrics.map(metric => (
          <MetricItem
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </View>
    </View>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const topBarStyles = StyleSheet.create({
  profileButton: {
    minWidth: 72,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
  },
});

const citySelectorStyles = StyleSheet.create({
  button: {
    flexBasis: '48%',
    flexGrow: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    gap: 6,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeText: {
    color: colors.teal,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: colors.surface,
  },
  detailText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  detailTextActive: {
    color: colors.tealSoft,
  },
});

export function PrimaryActionPanel({
  draftGateNotice,
  onOpenOrderDraft,
}: {
  draftGateNotice?: string;
  onOpenOrderDraft: () => void;
}) {
  const currentDraftGateNotice = draftGateNotice
    ? getIdentityPublishGateNotice(getProfileLocalState().identityVerification)
    : '';

  return (
    <View style={styles.primaryPanel}>
      <View style={styles.primaryTextGroup}>
        <Text style={styles.primaryTitle}>快速发单</Text>
        <Text style={styles.primaryDescription}>
          填写货物和路线，快速匹配附近司机
        </Text>
        <Text style={styles.primaryMeta}>预计 1 分钟完成发单</Text>
        {currentDraftGateNotice ? (
          <Text style={styles.draftNotice}>{currentDraftGateNotice}</Text>
        ) : null}
      </View>

      <Pressable
        testID="home-create-order"
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onOpenOrderDraft}
      >
        <Text style={styles.primaryButtonText}>立即发货</Text>
      </Pressable>
    </View>
  );
}

export function OrderStatusGrid({
  orders,
  onOpenOrders,
  onOpenOrdersWithFilter,
}: {
  orders: RecentOrder[];
  onOpenOrders: () => void;
  onOpenOrdersWithFilter: (filter: OrderListFilter) => void;
}) {
  const summaries = getOrderStatusSummaries(orders);

  return (
    <View style={styles.section}>
      <SectionHeader
        title="订单状态"
        actionLabel="全部订单"
        actionTestID="home-status-view-all"
        onActionPress={onOpenOrders}
      />
      <View style={styles.statusGrid}>
        {summaries.map(item => (
          <Pressable
            key={item.status}
            testID={`home-status-${item.status}`}
            style={({ pressed }) => [
              styles.statusCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() =>
              onOpenOrdersWithFilter(
                getOrderListFilterForSummaryStatus(item.status),
              )
            }
          >
            <Text style={styles.statusCount}>{item.count}</Text>
            <Text style={styles.statusLabel}>{item.label}</Text>
            <Text style={styles.statusDescription}>{item.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function RecentOrdersSection({
  orders,
  onOpenOrderDetail,
  onOpenOrders,
  onReorder,
}: {
  orders: RecentOrder[];
  onOpenOrderDetail: (orderId: string) => void;
  onOpenOrders: () => void;
  onReorder?: (prefill: { orderId: string }) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader
        title="最近订单"
        actionLabel="查看更多"
        actionTestID="home-orders-view-all"
        onActionPress={onOpenOrders}
      />
      <View style={styles.orderList}>
        {orders.map(order => (
          <RecentOrderCard
            key={order.id}
            order={order}
            onOpenOrderDetail={onOpenOrderDetail}
            onReorder={onReorder}
          />
        ))}
      </View>
    </View>
  );
}

import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

import { RecentOrderCard } from '../components/RecentOrderCard';
import { colors, styles } from '../styles';
import type {
  PlatformListShipperOrdersQuery,
  PlatformShipperOrderStatus,
} from '../services/platformOrderApi';
import type { OrderListFilter, RecentOrder } from '../types';
import {
  getFilteredOrders,
  parseCustomDateRange,
  validateCustomDateRange,
  type OrderCustomDateRange,
  type OrderTimeFilter,
} from '../utils/orderList';

export function OrdersScreen({
  now,
  orders,
  initialFilter,
  platformNotice,
  platformPageInfo,
  onBack,
  onOpenOrderDetail,
  onPlatformQueryChange,
  onLoadMorePlatformOrders,
  onReorder,
}: {
  now: number;
  orders: RecentOrder[];
  initialFilter: OrderListFilter;
  platformNotice?: string;
  platformPageInfo?: {
    loadedCount: number;
    total: number;
    isLoadingMore: boolean;
    canLoadMore: boolean;
  };
  onBack: () => void;
  onOpenOrderDetail: (orderId: string) => void;
  onPlatformQueryChange?: (query: PlatformListShipperOrdersQuery) => void;
  onLoadMorePlatformOrders?: () => void;
  onReorder?: (prefill: { orderId: string }) => void;
}) {
  const [activeFilter, setActiveFilter] =
    useState<OrderListFilter>(initialFilter);
  const [activeTimeFilter, setActiveTimeFilter] =
    useState<OrderTimeFilter>('all');
  const [customStartDateText, setCustomStartDateText] = useState('');
  const [customEndDateText, setCustomEndDateText] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const customDateRange: OrderCustomDateRange = {
    startDateText: customStartDateText,
    endDateText: customEndDateText,
  };
  const customDateRangeValidation = validateCustomDateRange(customDateRange);
  const hasCompleteCustomDateRange =
    activeTimeFilter === 'custom' &&
    !customDateRangeValidation &&
    parseCustomDateRange(customDateRange) !== undefined;

  const filteredOrders = getFilteredOrders({
    orders,
    statusFilter: activeFilter,
    timeFilter: activeTimeFilter,
    customDateRange,
    searchKeyword,
    now,
  });

  const tabs: Array<{ id: OrderListFilter; label: string }> = [
    { id: 'all', label: '全部订单' },
    { id: 'waiting', label: '待接单' },
    { id: 'active', label: '进行中' },
    { id: 'confirming', label: '待确认' },
    { id: 'completed', label: '已完成' },
    { id: 'cancelled', label: '已取消' },
  ];
  const timeFilters: Array<{ id: OrderTimeFilter; label: string }> = [
    { id: 'all', label: '全部时间' },
    { id: 'today', label: '今天' },
    { id: 'week', label: '本周' },
    { id: 'history', label: '历史' },
  ];
  const refreshPlatformQuery = ({
    statusFilter = activeFilter,
    timeFilter = activeTimeFilter,
    dateRange = customDateRange,
    keyword = searchKeyword,
  }: {
    statusFilter?: OrderListFilter;
    timeFilter?: OrderTimeFilter;
    dateRange?: OrderCustomDateRange;
    keyword?: string;
  }) => {
    onPlatformQueryChange?.(
      createOrdersPlatformListQuery({
        statusFilter,
        timeFilter,
        customDateRange: dateRange,
        searchKeyword: keyword,
        now,
      }),
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.ordersContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.ordersTopBar}>
        <Pressable
          testID="orders-back"
          style={styles.draftBackButton}
          onPress={onBack}
        >
          <Text style={styles.draftBackText}>返回首页</Text>
        </Pressable>
        <View style={styles.ordersTitleGroup}>
          <Text style={styles.draftKicker}>订单管理</Text>
          <Text style={styles.ordersTitle}>我的订单</Text>
        </View>
        <View style={styles.draftBadge}>
          <Text style={styles.draftBadgeText}>{filteredOrders.length} 单</Text>
        </View>
      </View>

      {platformNotice ? (
        <View style={styles.detailNoticeCard}>
          <Text style={styles.detailNoticeText}>{platformNotice}</Text>
        </View>
      ) : null}

      <View style={styles.ordersTabs}>
        {tabs.map(tab => {
          const active = tab.id === activeFilter;

          return (
            <Pressable
              key={tab.id}
              testID={`orders-tab-${tab.id}`}
              style={[styles.ordersTab, active && styles.ordersTabActive]}
              onPress={() => {
                setActiveFilter(tab.id);
                refreshPlatformQuery({ statusFilter: tab.id });
              }}
            >
              <Text
                style={[
                  styles.ordersTabText,
                  active && styles.ordersTabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.ordersTabs}>
        {timeFilters.map(filter => {
          const active = filter.id === activeTimeFilter;

          return (
            <Pressable
              key={filter.id}
              testID={`orders-time-${filter.id}`}
              style={[styles.ordersTab, active && styles.ordersTabActive]}
              onPress={() => {
                setActiveTimeFilter(filter.id);
                refreshPlatformQuery({ timeFilter: filter.id });
              }}
            >
              <Text
                style={[
                  styles.ordersTabText,
                  active && styles.ordersTabTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.driverInfoCard}>
        <Text style={styles.draftFieldLabel}>自定义日期范围（本地）</Text>
        <View style={styles.authInlineRow}>
          <TextInput
            testID="orders-custom-start-date"
            style={[styles.ordersSearchInput, styles.authInlineInput]}
            placeholder="开始日期 YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={customStartDateText}
            onChangeText={value => {
              const nextDateRange = {
                startDateText: value,
                endDateText: customEndDateText,
              };
              setCustomStartDateText(value);
              setActiveTimeFilter('custom');
              refreshPlatformQuery({
                timeFilter: 'custom',
                dateRange: nextDateRange,
              });
            }}
          />
          <TextInput
            testID="orders-custom-end-date"
            style={[styles.ordersSearchInput, styles.authInlineInput]}
            placeholder="结束日期 YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={customEndDateText}
            onChangeText={value => {
              const nextDateRange = {
                startDateText: customStartDateText,
                endDateText: value,
              };
              setCustomEndDateText(value);
              setActiveTimeFilter('custom');
              refreshPlatformQuery({
                timeFilter: 'custom',
                dateRange: nextDateRange,
              });
            }}
          />
        </View>
        <Text style={styles.detailMeta}>
          {hasCompleteCustomDateRange
            ? `自定义日期范围：${customStartDateText.trim()} 至 ${customEndDateText.trim()}`
            : '平台查询会使用结构化日期，本地列表继续保留时间文案兜底。'}
        </Text>
        {activeTimeFilter === 'custom' && customDateRangeValidation ? (
          <Text style={styles.detailNoticeText}>
            {customDateRangeValidation}
          </Text>
        ) : null}
      </View>

      <TextInput
        testID="orders-search"
        style={styles.ordersSearchInput}
        placeholder="搜索订单号、地址、货物或司机"
        placeholderTextColor={colors.textMuted}
        value={searchKeyword}
        onChangeText={value => {
          setSearchKeyword(value);
          refreshPlatformQuery({ keyword: value });
        }}
      />

      <View style={styles.orderList}>
        {filteredOrders.map(order => (
          <RecentOrderCard
            key={order.id}
            order={order}
            onOpenOrderDetail={onOpenOrderDetail}
            onReorder={onReorder}
          />
        ))}
      </View>

      {platformPageInfo?.total ? (
        <Text style={styles.detailMeta}>
          已加载 {platformPageInfo.loadedCount}/{platformPageInfo.total} 单
        </Text>
      ) : null}

      {platformPageInfo?.canLoadMore ? (
        <Pressable
          testID="orders-load-more"
          style={styles.draftSecondaryButton}
          disabled={platformPageInfo.isLoadingMore}
          onPress={onLoadMorePlatformOrders}
        >
          <Text style={styles.draftSecondaryButtonText}>
            {platformPageInfo.isLoadingMore ? '正在加载...' : '加载更多'}
          </Text>
        </Pressable>
      ) : null}

      {filteredOrders.length === 0 ? (
        <View style={styles.ordersEmptyState}>
          <Text style={styles.ordersEmptyTitle}>暂无订单</Text>
          <Text style={styles.ordersEmptyText}>
            切换筛选条件后这里会显示结果
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function createOrdersPlatformListQuery({
  statusFilter,
  timeFilter,
  customDateRange,
  searchKeyword,
  now,
}: {
  statusFilter: OrderListFilter;
  timeFilter: OrderTimeFilter;
  customDateRange: OrderCustomDateRange;
  searchKeyword: string;
  now: number;
}): PlatformListShipperOrdersQuery {
  return {
    ...createOrdersPlatformStatusQuery(statusFilter),
    ...createOrdersPlatformTimeQuery(timeFilter, customDateRange, now),
    ...createOrdersPlatformKeywordQuery(searchKeyword),
    page: 1,
    pageSize: 20,
  };
}

function createOrdersPlatformStatusQuery(filter: OrderListFilter) {
  if (filter === 'active') {
    return {
      statuses: ['loading', 'transporting'] as PlatformShipperOrderStatus[],
    };
  }

  if (
    filter === 'waiting' ||
    filter === 'confirming' ||
    filter === 'completed' ||
    filter === 'cancelled'
  ) {
    return { status: filter as PlatformShipperOrderStatus };
  }

  return {};
}

function createOrdersPlatformKeywordQuery(searchKeyword: string) {
  const keyword = searchKeyword.trim();

  return keyword ? { keyword } : {};
}

function createOrdersPlatformTimeQuery(
  filter: OrderTimeFilter,
  customDateRange: OrderCustomDateRange,
  now: number,
) {
  if (filter === 'all') {
    return {};
  }

  if (filter === 'custom') {
    const range = parseCustomDateTextRange(customDateRange);

    return range ? range : {};
  }

  const todayStart = getLocalDayStart(new Date(now));

  if (filter === 'today') {
    return createIsoRange(todayStart, addDays(todayStart, 1));
  }

  if (filter === 'history') {
    return {
      createdToIso: todayStart.toISOString(),
    };
  }

  const monday = addDays(todayStart, -((todayStart.getDay() + 6) % 7));

  return createIsoRange(monday, addDays(monday, 7));
}

function parseCustomDateTextRange(customDateRange: OrderCustomDateRange) {
  if (validateCustomDateRange(customDateRange)) {
    return undefined;
  }

  const startDate = parseLocalDateText(customDateRange.startDateText);
  const endDate = parseLocalDateText(customDateRange.endDateText);

  if (!startDate || !endDate) {
    return undefined;
  }

  return createIsoRange(startDate, addDays(endDate, 1));
}

function parseLocalDateText(dateText: string) {
  const match = dateText.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function createIsoRange(createdFrom: Date, createdTo: Date) {
  return {
    createdFromIso: createdFrom.toISOString(),
    createdToIso: createdTo.toISOString(),
  };
}

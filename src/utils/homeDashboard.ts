import type {
  FrequentRoute,
  RecentOrder,
  HomeSupportView,
  OrderListFilter,
  OrderSummaryStatus,
  SupportTicket,
  SupportTicketStatusHistoryItem,
} from '../types';
import {
  createFailedHomeSyncState,
  createSyncedHomeSyncState,
  type HomeSyncState,
} from './homeLocalState';
import {
  createAddFrequentRouteChange,
  createDeleteFrequentRouteChange,
  createMoveFrequentRouteChange,
  createUpdateFrequentRouteChange,
  type FrequentRouteDraft,
} from './homeRoutes';
import {
  createAddSupportTicketChange,
  createUpdateSupportTicketStatusChange,
  type SupportTicketDraft,
} from './homeSupport';

export type HomeCityOption = {
  id: 'shenzhen' | 'guangzhou' | 'dongguan' | 'foshan';
  label: string;
};

export type HomeCitySuggestionOption = HomeCityOption & {
  routeMatchCount: number;
  orderMatchCount: number;
  badgeText: string;
  detailText: string;
};

export type HomeDashboardLocalState = {
  selectedCity: string;
  routes: FrequentRoute[];
  supportTickets: SupportTicket[];
  syncState?: HomeSyncState;
};

export type HomeCitySelectionChange = {
  selectedCity: string;
  showCitySelector: false;
  notice: string;
};

export type HomeSupportViewChange = {
  supportView: HomeSupportView;
};

export type HomeRouteChangeStatePatch = Pick<
  HomeDashboardLocalState,
  'routes' | 'syncState'
>;

export type HomeSupportTicketStatePatch = Pick<
  HomeDashboardLocalState,
  'supportTickets'
>;

export type HomeSyncStatePatch = Pick<HomeDashboardLocalState, 'syncState'>;

export function getHomeCityOptions(): HomeCityOption[] {
  return [
    { id: 'shenzhen', label: '深圳' },
    { id: 'guangzhou', label: '广州' },
    { id: 'dongguan', label: '东莞' },
    { id: 'foshan', label: '佛山' },
  ];
}

const HOME_CITY_KEYWORDS: Record<HomeCityOption['id'], string[]> = {
  shenzhen: [
    '深圳',
    '宝安',
    '南山',
    '龙岗',
    '福田',
    '罗湖',
    '盐田',
    '龙华',
    '坪山',
    '光明',
    '前海',
  ],
  guangzhou: [
    '广州',
    '番禺',
    '天河',
    '白云',
    '海珠',
    '黄埔',
    '花都',
    '增城',
    '从化',
    '荔湾',
    '越秀',
    '南沙',
  ],
  dongguan: [
    '东莞',
    '长安',
    '虎门',
    '厚街',
    '常平',
    '塘厦',
    '寮步',
    '大朗',
    '凤岗',
    '松山湖',
    '清溪',
    '麻涌',
  ],
  foshan: [
    '佛山',
    '顺德',
    '南海',
    '禅城',
    '三水',
    '高明',
  ],
};

export function getHomeCitySuggestionOptions({
  selectedCity,
  routes,
  orders,
}: {
  selectedCity: string;
  routes: FrequentRoute[];
  orders: RecentOrder[];
}): HomeCitySuggestionOption[] {
  const baseOptions = getHomeCityOptions();

  return baseOptions
    .map((option, index) => {
      const routeMatchCount = routes.filter(route =>
        matchesHomeCity(
          [route.name, route.from, route.to].filter(Boolean).join(' '),
          option.id,
        ),
      ).length;
      const orderMatchCount = orders.filter(order =>
        matchesHomeCity(
          [order.from, order.to].filter(Boolean).join(' '),
          option.id,
        ),
      ).length;
      const isSelected = option.label === selectedCity;

      return {
        ...option,
        routeMatchCount,
        orderMatchCount,
        badgeText: isSelected
          ? '当前城市'
          : routeMatchCount + orderMatchCount > 0
            ? '已有关联'
            : '可切换',
        detailText: createHomeCitySuggestionDetailText({
          isSelected,
          routeMatchCount,
          orderMatchCount,
        }),
        sortIndex: index,
      };
    })
    .sort((left, right) => {
      const leftSelected = left.label === selectedCity ? 1 : 0;
      const rightSelected = right.label === selectedCity ? 1 : 0;
      if (leftSelected !== rightSelected) {
        return rightSelected - leftSelected;
      }

      const leftScore = left.routeMatchCount + left.orderMatchCount;
      const rightScore = right.routeMatchCount + right.orderMatchCount;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return left.sortIndex - right.sortIndex;
    })
    .map(({ sortIndex: _sortIndex, ...option }) => option);
}

function createHomeCitySuggestionDetailText({
  isSelected,
  routeMatchCount,
  orderMatchCount,
}: {
  isSelected: boolean;
  routeMatchCount: number;
  orderMatchCount: number;
}) {
  const matchParts = [
    routeMatchCount > 0 ? `常用路线 ${routeMatchCount} 条` : undefined,
    orderMatchCount > 0 ? `订单路线 ${orderMatchCount} 单` : undefined,
  ].filter((part): part is string => Boolean(part));

  if (matchParts.length > 0) {
    return isSelected
      ? `当前展示已命中${matchParts.join('、')}。`
      : `关联：${matchParts.join('、')}。`;
  }

  return isSelected
    ? '当前首页按此城市展示，可继续切换其他城市演练。'
    : '当前没有本地路线或订单命中，仍可手动切换演练。';
}

function matchesHomeCity(text: string, cityId: HomeCityOption['id']) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return false;
  }

  return HOME_CITY_KEYWORDS[cityId].some(keyword =>
    normalizedText.includes(keyword),
  );
}

export function getHomeSummaryMetrics({
  orderCount,
  routeCount,
  creditScore,
}: {
  orderCount: number;
  routeCount: number;
  creditScore: number;
}) {
  return [
    { label: '本月发单', value: `${orderCount} 单` },
    { label: '常用路线', value: `${routeCount} 条` },
    { label: '综合信用', value: `${creditScore} 分` },
  ];
}

export function getOrderListFilterForSummaryStatus(
  status: OrderSummaryStatus,
): OrderListFilter {
  const statusFilterMap: Record<OrderSummaryStatus, OrderListFilter> = {
    waiting: 'waiting',
    transporting: 'active',
    confirming: 'confirming',
    completed: 'completed',
  };

  return statusFilterMap[status];
}

export function createHomeCitySelectionChange(
  selectedCity: string,
): HomeCitySelectionChange {
  return {
    selectedCity,
    showCitySelector: false,
    notice: `已切换城市：${selectedCity}`,
  };
}

export function createHomeLocalStateSnapshot(
  currentState: HomeDashboardLocalState,
  nextState: Partial<HomeDashboardLocalState>,
): HomeDashboardLocalState {
  return {
    selectedCity: nextState.selectedCity ?? currentState.selectedCity,
    routes: nextState.routes ?? currentState.routes,
    supportTickets: nextState.supportTickets ?? currentState.supportTickets,
    syncState: nextState.syncState ?? currentState.syncState,
  };
}

export function createHomeSupportViewChange(
  supportView: HomeSupportView,
): HomeSupportViewChange {
  return { supportView };
}

export function createHomeSupportBackHomeChange(): HomeSupportViewChange {
  return createHomeSupportViewChange('home');
}

export function createHomeRouteChangeStatePatch(
  routeChange: HomeRouteChangeStatePatch,
): HomeRouteChangeStatePatch {
  return {
    routes: routeChange.routes,
    syncState: routeChange.syncState,
  };
}

export function createHomeSupportTicketStatePatch(
  ticketChange: HomeSupportTicketStatePatch,
): HomeSupportTicketStatePatch {
  return {
    supportTickets: ticketChange.supportTickets,
  };
}

export function createHomeSyncStatePatch(
  syncState: HomeSyncState,
): HomeSyncStatePatch {
  return { syncState };
}

export function createHomeRouteAddedState(
  currentState: HomeDashboardLocalState,
  route: FrequentRouteDraft,
  now = Date.now(),
): HomeDashboardLocalState {
  const routeChange = createAddFrequentRouteChange(
    currentState.routes,
    route,
    now,
  );

  return createHomeLocalStateSnapshot(
    currentState,
    createHomeRouteChangeStatePatch({
      ...routeChange,
      syncState: preserveKnownPlatformRouteVersion(
        routeChange.syncState,
        currentState.syncState,
      ),
    }),
  );
}

export function createHomeRouteUpdatedState(
  currentState: HomeDashboardLocalState,
  routeId: string,
  routeUpdates: FrequentRouteDraft,
  now = Date.now(),
): HomeDashboardLocalState {
  const routeChange = createUpdateFrequentRouteChange(
    currentState.routes,
    routeId,
    routeUpdates,
    now,
  );

  return createHomeLocalStateSnapshot(
    currentState,
    createHomeRouteChangeStatePatch({
      ...routeChange,
      syncState: preserveKnownPlatformRouteVersion(
        routeChange.syncState,
        currentState.syncState,
      ),
    }),
  );
}

export function createHomeRouteMovedState(
  currentState: HomeDashboardLocalState,
  routeId: string,
  direction: 'up' | 'down',
  now = Date.now(),
): HomeDashboardLocalState | undefined {
  const routeChange = createMoveFrequentRouteChange(
    currentState.routes,
    routeId,
    direction,
    now,
  );

  if (!routeChange) {
    return undefined;
  }

  return createHomeLocalStateSnapshot(
    currentState,
    createHomeRouteChangeStatePatch({
      ...routeChange,
      syncState: preserveKnownPlatformRouteVersion(
        routeChange.syncState,
        currentState.syncState,
      ),
    }),
  );
}

export function createHomeRouteDeletedState(
  currentState: HomeDashboardLocalState,
  routeId: string,
  now = Date.now(),
): HomeDashboardLocalState {
  const routeChange = createDeleteFrequentRouteChange(
    currentState.routes,
    routeId,
    now,
  );

  return createHomeLocalStateSnapshot(
    currentState,
    createHomeRouteChangeStatePatch({
      ...routeChange,
      syncState: preserveKnownPlatformRouteVersion(
        routeChange.syncState,
        currentState.syncState,
      ),
    }),
  );
}

export function createHomeRouteSyncRetriedState(
  currentState: HomeDashboardLocalState,
  now = Date.now(),
): HomeDashboardLocalState {
  return createHomeLocalStateSnapshot(
    currentState,
    createHomeSyncStatePatch(
      preserveKnownPlatformRouteVersion(
        createSyncedHomeSyncState(undefined, now),
        currentState.syncState,
      ),
    ),
  );
}

export function createHomeRouteSyncFailedState(
  currentState: HomeDashboardLocalState,
  now = Date.now(),
  message?: string,
): HomeDashboardLocalState {
  return createHomeLocalStateSnapshot(
    currentState,
    createHomeSyncStatePatch(
      preserveKnownPlatformRouteVersion(
        createFailedHomeSyncState(message, now),
        currentState.syncState,
      ),
    ),
  );
}

function preserveKnownPlatformRouteVersion(
  syncState: HomeSyncState,
  currentSyncState?: HomeSyncState,
): HomeSyncState {
  if (
    !currentSyncState?.platformUpdatedAtIso &&
    !currentSyncState?.platformRouteIds
  ) {
    return syncState;
  }

  return {
    ...syncState,
    platformUpdatedAtIso: currentSyncState.platformUpdatedAtIso,
    platformRouteIds: currentSyncState.platformRouteIds,
  };
}

export function createHomeSupportTicketSubmittedState(
  currentState: HomeDashboardLocalState,
  ticketDraft: SupportTicketDraft,
  now = Date.now(),
): HomeDashboardLocalState {
  return createHomeLocalStateSnapshot(
    currentState,
    createHomeSupportTicketStatePatch(
      createAddSupportTicketChange(
        currentState.supportTickets,
        ticketDraft,
        now,
      ),
    ),
  );
}

export function createHomeSupportTicketStatusUpdatedState(
  currentState: HomeDashboardLocalState,
  ticketId: string,
  statusText: string,
  historyItem: SupportTicketStatusHistoryItem,
  now = Date.now(),
): HomeDashboardLocalState {
  return createHomeLocalStateSnapshot(
    currentState,
    createHomeSupportTicketStatePatch(
      createUpdateSupportTicketStatusChange(
        currentState.supportTickets,
        ticketId,
        statusText,
        historyItem,
        now,
      ),
    ),
  );
}

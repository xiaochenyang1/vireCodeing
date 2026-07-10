import type {
  FrequentRoute,
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

export function getHomeSummaryMetrics({
  orderCount,
  routeCount,
}: {
  orderCount: number;
  routeCount: number;
}) {
  return [
    { label: '本月发单', value: `${orderCount} 单` },
    { label: '常用路线', value: `${routeCount} 条` },
    { label: '综合信用', value: '96 分' },
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

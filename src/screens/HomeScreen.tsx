import { ScrollView, Text } from 'react-native';
import { useRef, useState } from 'react';

import { styles } from '../styles';
import type {
  FrequentRoute,
  HomeSupportView,
  MessageCenterItem,
  OrderDetailReturnTarget,
  OrderListFilter,
  RecentOrder,
  SupportTicket,
  SupportTicketStatusHistoryItem,
} from '../types';
import {
  createSyncedHomeSyncState,
  getHomeLocalState,
  saveHomeLocalState,
  type HomeRouteConflictFieldItem,
  type HomeRouteConflictFieldKey,
  type HomeSyncState,
} from '../utils/homeLocalState';
import {
  createHomeCitySelectionChange,
  createHomeLocalStateSnapshot,
  createHomeSupportBackHomeChange,
  createHomeRouteAddedState,
  createHomeRouteDeletedState,
  createHomeRouteMovedState,
  createHomeRouteSyncFailedState,
  createHomeRouteSyncRetriedState,
  createHomeRouteUpdatedState,
  createHomeSupportTicketStatusUpdatedState,
  createHomeSupportTicketSubmittedState,
  createHomeSupportViewChange,
  type HomeDashboardLocalState,
} from '../utils/homeDashboard';
import type { FrequentRouteDraft } from '../utils/homeRoutes';
import type { SupportTicketDraft } from '../utils/homeSupport';
import { ProfileCenterScreen } from './ProfileCenterScreen';
import { FrequentRoutesSection } from './home/FrequentRoutesSection';
import {
  CitySelector,
  NetworkStatusCard,
  OrderStatusGrid,
  PrimaryActionPanel,
  RecentOrdersSection,
  TopBar,
  VerificationPanel,
} from './home/HomeDashboardSections';
import { HelpCenterScreen } from './home/HelpCenterScreen';
import { MessageCenterScreen } from './home/MessageCenterScreen';
import type { createPlatformAuthApi } from '../services/platformAuthApi';
import type { createPlatformProfileApi } from '../services/platformProfileApi';
import type { createPlatformFrequentRoutesApi } from '../services/platformFrequentRoutesApi';
import type { createPlatformFileApi } from '../services/platformFileApi';
import { PlatformApiError } from '../services/platformApiClient';
import { getAuthSessionSnapshot } from '../utils/authSession';

type HomePlatformAuthApi = Pick<
  ReturnType<typeof createPlatformAuthApi>,
  'changePassword'
>;
type HomePlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  | 'getAccountProfile'
  | 'saveAccountProfile'
  | 'getIdentityVerification'
  | 'saveIdentityVerification'
  | 'getEnterpriseVerification'
  | 'saveEnterpriseVerification'
  | 'getInvoices'
  | 'getSpendingRecords'
  | 'getCoupons'
  | 'getEvaluations'
  | 'getReceivedEvaluations'
  | 'createInvoiceApplication'
  | 'getAddressBook'
  | 'saveAddressBook'
>;
type HomePlatformFrequentRoutesApi = Pick<
  ReturnType<typeof createPlatformFrequentRoutesApi>,
  'getFrequentRoutes' | 'saveFrequentRoutes'
>;
type HomePlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
>;

const frequentRouteConflictMissingAuthMessage =
  '平台常用路线冲突处理需要重新登录后再同步。';
const frequentRouteLoadMissingAuthMessage =
  '平台常用路线拉取需要重新登录后再同步。';
const frequentRouteLoadFailureMessage =
  '平台常用路线拉取失败，已保留本地常用路线。';

const frequentRouteConflictFields: Array<{
  key: HomeRouteConflictFieldKey;
  label: string;
}> = [
  { key: 'name', label: '路线名称' },
  { key: 'from', label: '装货地' },
  { key: 'to', label: '卸货地' },
];

function createFrequentRoutesConflictSummary(routes: FrequentRoute[]) {
  return `服务端常用路线：${routes[0]?.name ?? '服务端暂无路线'}`;
}

function createPlatformRouteIds(routes: FrequentRoute[]) {
  return routes.map(route => route.id);
}

function createFrequentRouteConflictFieldItems(
  localRoutes: FrequentRoute[],
  platformRoutes: FrequentRoute[],
): HomeRouteConflictFieldItem[] {
  return platformRoutes.flatMap(platformRoute => {
    const localRoute = localRoutes.find(route => route.id === platformRoute.id);

    if (!localRoute) {
      return [];
    }

    return frequentRouteConflictFields
      .filter(field => localRoute[field.key] !== platformRoute[field.key])
      .map(field => ({
        id: `${platformRoute.id}-${field.key}`,
        routeId: platformRoute.id,
        fieldKey: field.key,
        fieldLabel: field.label,
        localValue: localRoute[field.key],
        platformValue: platformRoute[field.key],
      }));
  });
}

function createFrequentRouteDeletedConflictItems(
  localRoutes: FrequentRoute[],
  platformRoutes: FrequentRoute[],
  knownPlatformRouteIds: string[],
) {
  const platformRouteIds = new Set(createPlatformRouteIds(platformRoutes));
  const knownRouteIds = new Set(knownPlatformRouteIds);

  return localRoutes.filter(route => {
    return knownRouteIds.has(route.id) && !platformRouteIds.has(route.id);
  });
}

function upsertFrequentRoute(
  routes: FrequentRoute[],
  nextRoute: FrequentRoute,
) {
  if (routes.some(route => route.id === nextRoute.id)) {
    return routes.map(route => (route.id === nextRoute.id ? nextRoute : route));
  }

  return [...routes, nextRoute];
}

function updateFrequentRouteConflictField(
  routes: FrequentRoute[],
  routeId: string,
  fieldKey: HomeRouteConflictFieldKey,
  platformValue: string,
) {
  return routes.map(route => {
    if (route.id !== routeId) {
      return route;
    }

    return {
      ...route,
      [fieldKey]: platformValue,
    };
  });
}

function createResolvedFrequentRouteConflictSyncState(
  syncState: HomeSyncState,
) {
  const hasConflictItems =
    (syncState.conflictRouteItems?.length ?? 0) > 0 ||
    (syncState.conflictRouteFieldItems?.length ?? 0) > 0 ||
    (syncState.conflictDeletedRouteItems?.length ?? 0) > 0;

  if (hasConflictItems) {
    return syncState;
  }

  const nextSyncState = {
    ...syncState,
    message: '平台常用路线冲突项已处理完，请重试同步覆盖平台。',
  };

  delete nextSyncState.conflictSummaryText;
  delete nextSyncState.conflictRouteItems;
  delete nextSyncState.conflictRouteFieldItems;
  delete nextSyncState.conflictDeletedRouteItems;

  return nextSyncState;
}

export function HomeScreen({
  now,
  orders,
  messages,
  initialSupportView,
  platformAuthApi,
  platformProfileApi,
  platformFrequentRoutesApi,
  platformFileApi,
  onLogout,
  onOpenOrderDraft,
  onOpenOrderDetail,
  onOpenOrders,
  onOpenOrdersWithFilter,
  onOpenNetworkError,
  onMarkMessageRead,
  onMarkAllMessagesRead,
  onReuseRoute,
  draftGateNotice,
  networkNotice,
}: {
  now: number;
  orders: RecentOrder[];
  messages: MessageCenterItem[];
  initialSupportView?: HomeSupportView;
  draftGateNotice?: string;
  networkNotice?: string;
  platformAuthApi?: HomePlatformAuthApi;
  platformProfileApi?: HomePlatformProfileApi;
  platformFrequentRoutesApi?: HomePlatformFrequentRoutesApi;
  platformFileApi?: HomePlatformFileApi;
  onLogout: () => void;
  onOpenOrderDraft: () => void;
  onOpenOrderDetail: (
    orderId: string,
    returnTarget?: OrderDetailReturnTarget,
  ) => void;
  onOpenOrders: () => void;
  onOpenOrdersWithFilter: (filter: OrderListFilter) => void;
  onOpenNetworkError: () => void;
  onMarkMessageRead: (messageId: string) => void;
  onMarkAllMessagesRead: () => void;
  onReuseRoute: (route: FrequentRoute) => void;
}) {
  const initialHomeState = getHomeLocalState();
  const [supportView, setSupportView] = useState<HomeSupportView>(
    initialSupportView ?? 'home',
  );
  const [selectedCity, setSelectedCity] = useState(initialHomeState.selectedCity);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [cityNotice, setCityNotice] = useState('');
  const [routes, setRoutes] = useState<FrequentRoute[]>(initialHomeState.routes);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(
    initialHomeState.supportTickets,
  );
  const [routeSyncState, setRouteSyncState] = useState<HomeSyncState | undefined>(
    initialHomeState.syncState,
  );
  const hasLoadedPlatformFrequentRoutes = useRef(false);
  const unreadMessageCount = messages.filter(message => message.unread).length;

  const getCurrentHomeState = (): HomeDashboardLocalState => ({
    selectedCity,
    routes,
    supportTickets,
    syncState: routeSyncState,
  });

  const applyHomeLocalState = (
    nextHomeState: HomeDashboardLocalState | undefined,
  ) => {
    if (!nextHomeState) {
      return;
    }

    setSelectedCity(nextHomeState.selectedCity);
    setRoutes(nextHomeState.routes);
    setSupportTickets(nextHomeState.supportTickets);
    setRouteSyncState(nextHomeState.syncState);
    saveHomeLocalState(nextHomeState);
  };

  const keepFrequentRoutesQueuedUntilLogin = (
    nextHomeState: HomeDashboardLocalState,
    message: string,
  ) => {
    const failedHomeState = createHomeRouteSyncFailedState(nextHomeState, now);

    applyHomeLocalState(
      createHomeLocalStateSnapshot(failedHomeState, {
        syncState: failedHomeState.syncState
          ? {
              ...failedHomeState.syncState,
              message,
            }
          : undefined,
      }),
    );
  };

  const syncFrequentRoutesToPlatform = (
    nextHomeState: HomeDashboardLocalState | undefined,
    missingAuthMessage = '平台常用路线保存需要重新登录后再同步。',
  ) => {
    if (!nextHomeState || !platformFrequentRoutesApi) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      keepFrequentRoutesQueuedUntilLogin(nextHomeState, missingAuthMessage);
      return;
    }

    platformFrequentRoutesApi
      .saveFrequentRoutes({
        routes: nextHomeState.routes,
        clientUpdatedAtIso: nextHomeState.syncState?.updatedAtIso,
        baseUpdatedAtIso: nextHomeState.syncState?.platformUpdatedAtIso,
      })
      .then(platformRoutes => {
        applyHomeLocalState(
          createHomeLocalStateSnapshot(nextHomeState, {
            routes: platformRoutes.routes,
            syncState: {
              ...createSyncedHomeSyncState(
                '平台常用路线已同步到本地。',
                now,
              ),
              platformUpdatedAtIso: platformRoutes.updatedAtIso,
              platformRouteIds: createPlatformRouteIds(platformRoutes.routes),
            },
          }),
        );
      })
      .catch(error => {
        const isConflict =
          error instanceof PlatformApiError &&
          error.code === 'PROFILE_FREQUENT_ROUTES_CONFLICT';
        const failedHomeState = createHomeRouteSyncFailedState(
          nextHomeState,
          now,
        );

        applyHomeLocalState(failedHomeState);

        if (isConflict) {
          if (!getAuthSessionSnapshot()?.accessToken) {
            applyHomeLocalState(
              createHomeRouteSyncFailedState(
                nextHomeState,
                now,
                frequentRouteConflictMissingAuthMessage,
              ),
            );
            return;
          }

          platformFrequentRoutesApi
            .getFrequentRoutes()
            .then(platformRoutes => {
              if (!platformRoutes) {
                return;
              }

              const currentHomeState = getHomeLocalState();

              if (currentHomeState.syncState?.status !== 'failed') {
                return;
              }

              const platformRouteIds = createPlatformRouteIds(
                platformRoutes.routes,
              );

              applyHomeLocalState(
                createHomeLocalStateSnapshot(currentHomeState, {
                  syncState: {
                    ...currentHomeState.syncState,
                    platformUpdatedAtIso: platformRoutes.updatedAtIso,
                    platformRouteIds,
                    conflictSummaryText: createFrequentRoutesConflictSummary(
                      platformRoutes.routes,
                    ),
                    conflictRouteItems: platformRoutes.routes.filter(
                      platformRoute =>
                        !currentHomeState.routes.some(
                          route => route.id === platformRoute.id,
                        ),
                    ),
                    conflictRouteFieldItems:
                      createFrequentRouteConflictFieldItems(
                        currentHomeState.routes,
                        platformRoutes.routes,
                      ),
                    conflictDeletedRouteItems:
                      createFrequentRouteDeletedConflictItems(
                        currentHomeState.routes,
                        platformRoutes.routes,
                        currentHomeState.syncState.platformRouteIds ?? [],
                      ),
                  },
                }),
              );
            })
            .catch(fetchConflictError => {
              if (
                fetchConflictError instanceof PlatformApiError &&
                fetchConflictError.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ) {
                applyHomeLocalState(
                  createHomeRouteSyncFailedState(
                    getHomeLocalState(),
                    now,
                    frequentRouteConflictMissingAuthMessage,
                  ),
                );
              }
            });
        }
      });
  };

  const loadFrequentRoutesFromPlatform = () => {
    if (
      !platformFrequentRoutesApi ||
      hasLoadedPlatformFrequentRoutes.current ||
      routeSyncState?.status !== 'synced'
    ) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      applyHomeLocalState(
        createHomeRouteSyncFailedState(
          getHomeLocalState(),
          now,
          frequentRouteLoadMissingAuthMessage,
        ),
      );
      return;
    }

    hasLoadedPlatformFrequentRoutes.current = true;

    platformFrequentRoutesApi
      .getFrequentRoutes()
      .then(platformRoutes => {
        if (!platformRoutes) {
          return;
        }

        const currentHomeState = getHomeLocalState();

        if (currentHomeState.syncState?.status !== 'synced') {
          return;
        }

        applyHomeLocalState(
          createHomeLocalStateSnapshot(currentHomeState, {
            routes: platformRoutes.routes,
            syncState: {
              ...createSyncedHomeSyncState(
                '平台常用路线已拉取到本地。',
                now,
              ),
              platformUpdatedAtIso: platformRoutes.updatedAtIso,
              platformRouteIds: createPlatformRouteIds(platformRoutes.routes),
            },
          }),
        );
      })
      .catch(error => {
        const message =
          error instanceof PlatformApiError &&
          error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? frequentRouteLoadMissingAuthMessage
            : frequentRouteLoadFailureMessage;
        const currentHomeState = getHomeLocalState();

        if (currentHomeState.syncState?.status !== 'synced') {
          return;
        }

        applyHomeLocalState(
          createHomeRouteSyncFailedState(currentHomeState, now, message),
        );
      });
  };

  const openSupportView = (nextSupportView: HomeSupportView) => {
    const supportViewChange = createHomeSupportViewChange(nextSupportView);
    setSupportView(supportViewChange.supportView);
  };

  const backHome = () => {
    const supportViewChange = createHomeSupportBackHomeChange();
    setSupportView(supportViewChange.supportView);
  };

  const submitSupportTicket = (ticketDraft: SupportTicketDraft) => {
    applyHomeLocalState(
      createHomeSupportTicketSubmittedState(
        getCurrentHomeState(),
        ticketDraft,
        now,
      ),
    );
  };

  const updateSupportTicketStatus = (
    ticketId: string,
    statusText: string,
    historyItem: SupportTicketStatusHistoryItem,
  ) => {
    applyHomeLocalState(
      createHomeSupportTicketStatusUpdatedState(
        getCurrentHomeState(),
        ticketId,
        statusText,
        historyItem,
        now,
      ),
    );
  };

  const selectCity = (city: string) => {
    const cityChange = createHomeCitySelectionChange(city);
    applyHomeLocalState(
      createHomeLocalStateSnapshot(getCurrentHomeState(), {
        selectedCity: cityChange.selectedCity,
      }),
    );
    setShowCitySelector(cityChange.showCitySelector);
    setCityNotice(cityChange.notice);
  };

  const retryRouteSync = () => {
    const nextHomeState = createHomeRouteSyncRetriedState(
      getCurrentHomeState(),
      now,
    );

    applyHomeLocalState(nextHomeState);
    syncFrequentRoutesToPlatform(
      nextHomeState,
      '平台常用路线重试需要重新登录后再同步。',
    );
  };

  const markRouteSyncFailed = () => {
    applyHomeLocalState(
      createHomeRouteSyncFailedState(getCurrentHomeState(), now),
    );
  };

  const adoptConflictRoute = (routeId: string) => {
    const currentHomeState = getHomeLocalState();
    const conflictRoute = currentHomeState.syncState?.conflictRouteItems?.find(
      route => route.id === routeId,
    );

    if (!conflictRoute || !currentHomeState.syncState) {
      return;
    }

    applyHomeLocalState(
      createHomeLocalStateSnapshot(currentHomeState, {
        routes: upsertFrequentRoute(currentHomeState.routes, conflictRoute),
        syncState: createResolvedFrequentRouteConflictSyncState({
          ...currentHomeState.syncState,
          conflictRouteItems:
            currentHomeState.syncState.conflictRouteItems?.filter(
              route => route.id !== routeId,
            ),
        }),
      }),
    );
  };

  const adoptConflictRouteField = (fieldId: string) => {
    const currentHomeState = getHomeLocalState();
    const conflictField =
      currentHomeState.syncState?.conflictRouteFieldItems?.find(
        field => field.id === fieldId,
      );

    if (!conflictField || !currentHomeState.syncState) {
      return;
    }

    applyHomeLocalState(
      createHomeLocalStateSnapshot(currentHomeState, {
        routes: updateFrequentRouteConflictField(
          currentHomeState.routes,
          conflictField.routeId,
          conflictField.fieldKey,
          conflictField.platformValue,
        ),
        syncState: createResolvedFrequentRouteConflictSyncState({
          ...currentHomeState.syncState,
          conflictRouteFieldItems:
            currentHomeState.syncState.conflictRouteFieldItems?.filter(
              field => field.id !== fieldId,
            ),
        }),
      }),
    );
  };

  const adoptConflictDeletedRoute = (routeId: string) => {
    const currentHomeState = getHomeLocalState();
    const conflictDeletedRoute =
      currentHomeState.syncState?.conflictDeletedRouteItems?.find(
        route => route.id === routeId,
      );

    if (!conflictDeletedRoute || !currentHomeState.syncState) {
      return;
    }

    applyHomeLocalState(
      createHomeLocalStateSnapshot(currentHomeState, {
        routes: currentHomeState.routes.filter(route => route.id !== routeId),
        syncState: createResolvedFrequentRouteConflictSyncState({
          ...currentHomeState.syncState,
          conflictDeletedRouteItems:
            currentHomeState.syncState.conflictDeletedRouteItems?.filter(
              route => route.id !== routeId,
            ),
          conflictRouteFieldItems:
            currentHomeState.syncState.conflictRouteFieldItems?.filter(
              field => field.routeId !== routeId,
            ),
        }),
      }),
    );
  };

  const addRoute = (route: FrequentRouteDraft) => {
    const nextHomeState = createHomeRouteAddedState(
      getCurrentHomeState(),
      route,
      now,
    );

    applyHomeLocalState(nextHomeState);
    syncFrequentRoutesToPlatform(nextHomeState);
  };

  const updateRoute = (
    routeId: string,
    routeUpdates: FrequentRouteDraft,
  ) => {
    const nextHomeState = createHomeRouteUpdatedState(
      getCurrentHomeState(),
      routeId,
      routeUpdates,
      now,
    );

    applyHomeLocalState(nextHomeState);
    syncFrequentRoutesToPlatform(nextHomeState);
  };

  const moveRoute = (routeId: string, direction: 'up' | 'down') => {
    const nextHomeState = createHomeRouteMovedState(
      getCurrentHomeState(),
      routeId,
      direction,
      now,
    );

    applyHomeLocalState(nextHomeState);
    syncFrequentRoutesToPlatform(nextHomeState);
  };

  const deleteRoute = (routeId: string) => {
    const nextHomeState = createHomeRouteDeletedState(
      getCurrentHomeState(),
      routeId,
      now,
    );

    applyHomeLocalState(nextHomeState);
    syncFrequentRoutesToPlatform(nextHomeState);
  };

  if (supportView === 'messages') {
    return (
      <MessageCenterScreen
        messages={messages}
        onBackHome={backHome}
        onMarkMessageRead={onMarkMessageRead}
        onMarkAllMessagesRead={onMarkAllMessagesRead}
        onOpenOrderDetail={onOpenOrderDetail}
      />
    );
  }

  if (supportView === 'help') {
    return (
      <HelpCenterScreen
        supportTickets={supportTickets}
        onBackHome={backHome}
        onSubmitTicket={submitSupportTicket}
        onUpdateTicketStatus={updateSupportTicketStatus}
      />
    );
  }

  if (supportView === 'profile') {
    return (
      <ProfileCenterScreen
        now={now}
        orders={orders}
        platformAuthApi={platformAuthApi}
        platformProfileApi={platformProfileApi}
        platformFileApi={platformFileApi}
        onBackHome={backHome}
        onLogout={onLogout}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TopBar
        city={selectedCity}
        unreadMessageCount={unreadMessageCount}
        onLogout={onLogout}
        onOpenCitySelector={() => setShowCitySelector(current => !current)}
        onOpenMessages={() => openSupportView('messages')}
        onOpenHelp={() => openSupportView('help')}
        onOpenProfile={() => openSupportView('profile')}
      />
      {showCitySelector ? (
        <CitySelector selectedCity={selectedCity} onSelectCity={selectCity} />
      ) : null}
      {cityNotice ? <Text style={styles.draftNotice}>{cityNotice}</Text> : null}
      {networkNotice ? (
        <Text style={styles.draftNotice}>{networkNotice}</Text>
      ) : null}
      <NetworkStatusCard onOpenNetworkError={onOpenNetworkError} />
      <VerificationPanel orders={orders} routeCount={routes.length} />
      <PrimaryActionPanel
        draftGateNotice={draftGateNotice}
        onOpenOrderDraft={onOpenOrderDraft}
      />
      <OrderStatusGrid
        orders={orders}
        onOpenOrders={onOpenOrders}
        onOpenOrdersWithFilter={onOpenOrdersWithFilter}
      />
      <FrequentRoutesSection
        routes={routes}
        syncState={routeSyncState}
        onOpenManager={loadFrequentRoutesFromPlatform}
        onRetrySync={retryRouteSync}
        onMarkSyncFailed={markRouteSyncFailed}
        onAddRoute={addRoute}
        onUpdateRoute={updateRoute}
        onMoveRoute={moveRoute}
        onDeleteRoute={deleteRoute}
        onReuseRoute={onReuseRoute}
        onAdoptConflictRoute={adoptConflictRoute}
        onAdoptConflictRouteField={adoptConflictRouteField}
        onAdoptConflictDeletedRoute={adoptConflictDeletedRoute}
      />
      <RecentOrdersSection
        orders={orders.slice(0, 3)}
        onOpenOrderDetail={onOpenOrderDetail}
        onOpenOrders={onOpenOrders}
      />
    </ScrollView>
  );
}

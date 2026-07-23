import { ScrollView, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';

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
import {
  isLocalSupportTicketId,
  type SupportTicketDraft,
} from '../utils/homeSupport';
import {
  inferSupportTicketMode,
  mergeSupportTicketsWithLocalFallback,
  mapPlatformSupportTicketToLocal,
  mapPlatformSupportTicketsToLocal,
} from '../utils/platformSupportTickets';
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
import type { createPlatformSupportTicketsApi } from '../services/platformSupportTicketsApi';
import { PlatformApiError } from '../services/platformApiClient';
import { getAuthSessionSnapshot } from '../utils/authSession';

type HomePlatformAuthApi = Pick<
  ReturnType<typeof createPlatformAuthApi>,
  'changePassword'
> &
  Partial<
    Pick<
      ReturnType<typeof createPlatformAuthApi>,
      'listSessions' | 'revokeOtherSessions'
    >
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
type HomePlatformSupportTicketsApi = Pick<
  ReturnType<typeof createPlatformSupportTicketsApi>,
  'getSupportTickets' | 'createSupportTicket'
>;

const frequentRouteConflictMissingAuthMessage =
  '平台常用路线冲突处理需要重新登录后再同步。';
const frequentRouteLoadMissingAuthMessage =
  '平台常用路线拉取需要重新登录后再同步。';
const frequentRouteLoadFailureMessage =
  '平台常用路线拉取失败，已保留本地常用路线。';
const supportTicketLoadMissingAuthMessage =
  '平台工单拉取需要重新登录，当前保留本地工单。';
const supportTicketLoadFailureMessage =
  '平台工单拉取失败，当前保留本地工单。';
const supportTicketSubmitMissingAuthMessage =
  '平台工单提交需要重新登录，已改为本地保存工单。';
const supportTicketSubmitFailureMessage =
  '平台工单提交失败，已改为本地保存工单。';

function hasLocalFallbackSupportTickets(supportTickets: SupportTicket[]) {
  return supportTickets.some(ticket => isLocalSupportTicketId(ticket.id));
}

function getSupportTicketsTitle(
  supportTicketMode: 'local' | 'platform',
  supportTickets: SupportTicket[],
) {
  if (supportTicketMode === 'local') {
    return '本地工单';
  }

  const hasLocalFallbackTickets = hasLocalFallbackSupportTickets(supportTickets);

  if (!hasLocalFallbackTickets) {
    return '平台工单';
  }

  return supportTickets.some(ticket => !isLocalSupportTicketId(ticket.id))
    ? '平台工单（含本地兜底）'
    : '本地兜底工单';
}

function getSupportTicketModeBadgeText(
  supportTicketMode: 'local' | 'platform',
) {
  return supportTicketMode === 'platform' ? '平台同步' : '本地版';
}

function getPlatformSupportTicketLoadNotice(
  platformTicketCount: number,
  supportTickets: SupportTicket[],
) {
  const hasLocalFallbackTickets = hasLocalFallbackSupportTickets(supportTickets);

  if (platformTicketCount > 0) {
    return hasLocalFallbackTickets
      ? '平台工单已同步到当前列表，本地兜底工单已保留。'
      : '平台工单已同步到当前列表。';
  }

  return hasLocalFallbackTickets
    ? '暂无平台工单，当前保留本地兜底工单。'
    : '暂无平台工单，提交后可在此查看处理进度。';
}

function getPlatformSupportTicketSubmitNotice(
  channelName: string,
  supportTickets: SupportTicket[],
) {
  return hasLocalFallbackSupportTickets(supportTickets)
    ? `平台工单已提交：${channelName}，本地兜底工单已保留。`
    : `平台工单已提交：${channelName}`;
}

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
  messageUnreadCount,
  initialSupportView,
  usesPlatformMessagesApi,
  platformAuthApi,
  platformProfileApi,
  platformFrequentRoutesApi,
  platformFileApi,
  platformSupportTicketsApi,
  onLogout,
  onOpenOrderDraft,
  onOpenOrderDetail,
  onOpenOrders,
  onOpenOrdersWithFilter,
  onOpenNetworkError,
  onOpenMessagesView,
  onMarkMessageRead,
  onMarkAllMessagesRead,
  onReuseRoute,
  draftGateNotice,
  networkNotice,
  networkStatusSummaryText,
  networkStatusActionText,
  messageCenterNotice,
}: {
  now: number;
  orders: RecentOrder[];
  messages: MessageCenterItem[];
  messageUnreadCount: number;
  initialSupportView?: HomeSupportView;
  usesPlatformMessagesApi?: boolean;
  draftGateNotice?: string;
  networkNotice?: string;
  networkStatusSummaryText: string;
  networkStatusActionText: string;
  messageCenterNotice?: string;
  platformAuthApi?: HomePlatformAuthApi;
  platformProfileApi?: HomePlatformProfileApi;
  platformFrequentRoutesApi?: HomePlatformFrequentRoutesApi;
  platformFileApi?: HomePlatformFileApi;
  platformSupportTicketsApi?: HomePlatformSupportTicketsApi;
  onLogout: () => void;
  onOpenOrderDraft: () => void;
  onOpenOrderDetail: (
    orderId: string,
    returnTarget?: OrderDetailReturnTarget,
  ) => void;
  onOpenOrders: () => void;
  onOpenOrdersWithFilter: (filter: OrderListFilter) => void;
  onOpenNetworkError: () => void;
  onOpenMessagesView: () => void;
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
  const [supportTicketMode, setSupportTicketMode] = useState<
    'local' | 'platform'
  >(inferSupportTicketMode(initialHomeState.supportTickets));
  const [supportTicketNotice, setSupportTicketNotice] = useState('');
  const [routeSyncState, setRouteSyncState] = useState<HomeSyncState | undefined>(
    initialHomeState.syncState,
  );
  const hasLoadedPlatformFrequentRoutes = useRef(false);
  const supportTicketRequestVersionRef = useRef(0);
  const [isSubmittingPlatformSupportTicket, setIsSubmittingPlatformSupportTicket] =
    useState(false);

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

  const applySupportTicketsState = (
    nextSupportTickets: SupportTicket[],
    mode: 'local' | 'platform',
  ) => {
    applyHomeLocalState(
      createHomeLocalStateSnapshot(getHomeLocalState(), {
        supportTickets: nextSupportTickets,
      }),
    );
    setSupportTicketMode(mode);
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

  useEffect(() => {
    if (supportView !== 'help' || !platformSupportTicketsApi) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setSupportTicketNotice(supportTicketLoadMissingAuthMessage);
      return;
    }

    const requestVersion = ++supportTicketRequestVersionRef.current;

    platformSupportTicketsApi
      .getSupportTickets()
      .then(result => {
        if (requestVersion !== supportTicketRequestVersionRef.current) {
          return;
        }

        const currentHomeState = getHomeLocalState();
        const nextSupportTickets = mergeSupportTicketsWithLocalFallback(
          mapPlatformSupportTicketsToLocal(result.items, new Date(now)),
          currentHomeState.supportTickets,
        );

        applyHomeLocalState(
          createHomeLocalStateSnapshot(currentHomeState, {
            supportTickets: nextSupportTickets,
          }),
        );
        setSupportTicketMode('platform');
        setSupportTicketNotice(
          getPlatformSupportTicketLoadNotice(
            result.items.length,
            nextSupportTickets,
          ),
        );
      })
      .catch(error => {
        if (requestVersion !== supportTicketRequestVersionRef.current) {
          return;
        }

        setSupportTicketNotice(
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? supportTicketLoadMissingAuthMessage
            : supportTicketLoadFailureMessage,
        );
      });
  }, [now, platformSupportTicketsApi, supportView]);

  const openSupportView = (nextSupportView: HomeSupportView) => {
    const supportViewChange = createHomeSupportViewChange(nextSupportView);
    setSupportView(supportViewChange.supportView);
    if (nextSupportView === 'messages') {
      onOpenMessagesView();
    }
  };

  const backHome = () => {
    const supportViewChange = createHomeSupportBackHomeChange();
    setSupportView(supportViewChange.supportView);
  };

  const submitSupportTicket = (ticketDraft: SupportTicketDraft) => {
    const requestVersion = ++supportTicketRequestVersionRef.current;
    const submitLocalSupportTicket = (noticeText: string) => {
      const nextHomeState = createHomeSupportTicketSubmittedState(
        getHomeLocalState(),
        ticketDraft,
        now,
      );

      applyHomeLocalState(nextHomeState);
      setSupportTicketMode(inferSupportTicketMode(nextHomeState.supportTickets));
      setSupportTicketNotice(noticeText);
    };

    setSupportTicketNotice('');

    if (!platformSupportTicketsApi) {
      submitLocalSupportTicket(`工单已提交：${ticketDraft.channelName}`);
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      submitLocalSupportTicket(supportTicketSubmitMissingAuthMessage);
      return;
    }

    setIsSubmittingPlatformSupportTicket(true);

    platformSupportTicketsApi
      .createSupportTicket(ticketDraft)
      .then(platformTicket => {
        if (requestVersion !== supportTicketRequestVersionRef.current) {
          return;
        }

        const currentHomeState = getHomeLocalState();
        const nextSupportTickets = mergeSupportTicketsWithLocalFallback(
          [
            mapPlatformSupportTicketToLocal(platformTicket, new Date(now)),
            ...currentHomeState.supportTickets.filter(
              ticket =>
                !isLocalSupportTicketId(ticket.id) && ticket.id !== platformTicket.id,
            ),
          ],
          currentHomeState.supportTickets,
        );

        applySupportTicketsState(nextSupportTickets, 'platform');
        setSupportTicketNotice(
          getPlatformSupportTicketSubmitNotice(
            platformTicket.channelName,
            nextSupportTickets,
          ),
        );
      })
      .catch(error => {
        if (requestVersion !== supportTicketRequestVersionRef.current) {
          return;
        }

        submitLocalSupportTicket(
          error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? supportTicketSubmitMissingAuthMessage
            : supportTicketSubmitFailureMessage,
        );
      })
      .finally(() => {
        if (requestVersion === supportTicketRequestVersionRef.current) {
          setIsSubmittingPlatformSupportTicket(false);
        }
      });
  };

  const updateSupportTicketStatus = (
    ticketId: string,
    statusText: string,
    historyItem: SupportTicketStatusHistoryItem,
  ) => {
    const nextHomeState = createHomeSupportTicketStatusUpdatedState(
      getCurrentHomeState(),
      ticketId,
      statusText,
      historyItem,
      now,
    );

    applyHomeLocalState(nextHomeState);
    setSupportTicketMode(inferSupportTicketMode(nextHomeState.supportTickets));
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
        unreadCount={messageUnreadCount}
        noticeText={messageCenterNotice}
        modeBadgeText={usesPlatformMessagesApi ? '平台同步' : '本地版'}
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
        noticeText={supportTicketNotice}
        ticketsTitle={getSupportTicketsTitle(supportTicketMode, supportTickets)}
        modeBadgeText={getSupportTicketModeBadgeText(supportTicketMode)}
        canUpdateTicketStatus={supportTicketMode === 'local'}
        isSubmittingTicket={isSubmittingPlatformSupportTicket}
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
        unreadMessageCount={messageUnreadCount}
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
        unreadMessageCount={messageUnreadCount}
        onLogout={onLogout}
        onOpenCitySelector={() => setShowCitySelector(current => !current)}
        onOpenMessages={() => openSupportView('messages')}
        onOpenHelp={() => openSupportView('help')}
        onOpenProfile={() => openSupportView('profile')}
      />
      {showCitySelector ? (
        <CitySelector
          selectedCity={selectedCity}
          routes={routes}
          orders={orders}
          onSelectCity={selectCity}
        />
      ) : null}
      {cityNotice ? <Text style={styles.draftNotice}>{cityNotice}</Text> : null}
      {networkNotice ? (
        <Text style={styles.draftNotice}>{networkNotice}</Text>
      ) : null}
      <NetworkStatusCard
        summaryText={networkStatusSummaryText}
        actionText={networkStatusActionText}
        onOpenNetworkError={onOpenNetworkError}
      />
      <VerificationPanel
        orders={orders}
        routeCount={routes.length}
        unreadMessageCount={messageUnreadCount}
      />
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

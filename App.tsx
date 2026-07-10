import { StatusBar, useColorScheme } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  cargoTypeOptions,
  fallbackSafeAreaMetrics,
  vehicleRequirementOptions,
} from './src/data/mockData';
import type {
  DraftOrderInput,
  DraftOrderPrefill,
  HomeSupportView,
  MessageCenterItem,
  OrderDetailReturnTarget,
  OrderListFilter,
  OrderSyncOperation,
  RecentOrder,
  RootScreen,
} from './src/types';
import {
  createFailedOrderSyncState,
  createLocalOrder,
  createOrderUpdateFromDraft,
  createPendingOrderSyncState,
  createPrefillFromOrder,
  createSyncedOrderSyncState,
} from './src/utils/order';
import type { OrderProgressAction } from './src/utils/orderDetail';
import {
  createFailedDraftSyncState,
  createSyncedDraftSyncState,
  clearSavedDraft,
  getDraftStorageSnapshot,
  getSavedDraft,
  hydrateDraftStorage,
  markSavedDraftFailed,
  markSavedDraftSynced,
  rememberSavedDraftPlatformUpdatedAtIso,
  saveDraft,
  type DraftSyncState,
} from './src/utils/draftStorage';
import {
  clearAuthSession,
  getAuthSessionSnapshot,
  hydrateAuthSession,
  hasSavedAuthSession,
  saveAuthSession,
} from './src/utils/authSession';
import {
  hasCompletedOnboarding,
  saveOnboardingCompleted,
} from './src/utils/onboardingState';
import {
  getAppRuntimeState,
  hydrateAppRuntimeState,
  saveAppRuntimeState,
} from './src/utils/appRuntimeState';
import { hydrateHomeLocalState } from './src/utils/homeLocalState';
import {
  createPendingProfileSyncState,
  createSyncedProfileSyncState,
  getIdentityPublishGateNotice,
  getProfileLocalState,
  hydrateProfileLocalState,
  saveProfileLocalState,
} from './src/utils/profileLocalState';
import {
  createOrderCouponUsageChanges,
} from './src/utils/profileCoupons';
import { colors, styles } from './src/styles';
import { AuthScreen } from './src/screens/AuthScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NetworkErrorScreen } from './src/screens/NetworkErrorScreen';
import { OrderDraftScreen } from './src/screens/OrderDraftScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { OrderDetailScreen } from './src/screens/OrderDetailScreen';
import { DriverHomeScreen } from './src/screens/DriverHomeScreen';
import {
  createPlatformAuthApi,
  type PlatformAuthenticatedUser,
  type PlatformAuthTokens,
} from './src/services/platformAuthApi';
import {
  createPlatformOrderApi,
  type PlatformCreateShipperOrderRequest,
  type PlatformListShipperOrdersQuery,
} from './src/services/platformOrderApi';
import { createPlatformOrderDraftApi } from './src/services/platformOrderDraftApi';
import { createPlatformProfileApi } from './src/services/platformProfileApi';
import { createPlatformFrequentRoutesApi } from './src/services/platformFrequentRoutesApi';
import { createPlatformDriverOrderApi } from './src/services/platformDriverOrderApi';
import { createPlatformDriverCertificationApi } from './src/services/platformDriverCertificationApi';
import { createPlatformFileApi } from './src/services/platformFileApi';
import { mapPlatformOrderToRecentOrder } from './src/services/platformOrderMapper';
import { PlatformApiError } from './src/services/platformApiClient';
import { resolvePlatformApiBaseUrl } from './src/services/platformRuntimeConfig';
import type { PlatformMobileUserType } from './src/services/platformAuthApi';

type AppProps = {
  now?: number;
  platformApiBaseUrl?: string;
};

type PlatformOrderListPaging = {
  page: number;
  pageSize: number;
  total: number;
  loadedCount: number;
  isLoadingMore: boolean;
};

const startupPlatformAuthSessionInvalidCodes = new Set([
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_ACCESS_TOKEN_INVALID',
  'AUTH_USER_DISABLED',
]);
const orderDraftConflictErrorCode = 'ORDER_DRAFT_CONFLICT';
const authAccessTokenMissingErrorCode = 'AUTH_ACCESS_TOKEN_MISSING';
const draftSaveConflictNoticeText =
  '服务端草稿已被其他设备更新，已保留本地草稿，请处理冲突。';
const draftSaveConflictSyncMessage =
  '平台发单草稿存在跨设备冲突，已保留本地草稿。';
const draftConflictMissingAuthSyncMessage =
  '平台发单草稿冲突处理需要重新登录后再同步。';
const draftRestoreMissingAuthSyncMessage =
  '平台发单草稿恢复需要重新登录后再同步。';
const draftRestoreFailureSyncMessage =
  '平台发单草稿恢复失败，已保留本地草稿。';

function shouldClearAuthSessionAfterStartupPlatformAuthError(error: unknown) {
  return (
    error instanceof PlatformApiError &&
    startupPlatformAuthSessionInvalidCodes.has(error.code)
  );
}

function mergePlatformOrderWithLocalRuntimeState(
  platformOrder: RecentOrder,
  localOrder?: RecentOrder,
): RecentOrder {
  if (!localOrder) {
    return platformOrder;
  }

  return {
    ...platformOrder,
    ...(localOrder.bonusText ? { bonusText: localOrder.bonusText } : {}),
    ...(localOrder.driverInfo ? { driverInfo: localOrder.driverInfo } : {}),
    ...(localOrder.driverQuotes ? { driverQuotes: localOrder.driverQuotes } : {}),
    ...(localOrder.cargoPhotoFiles
      ? { cargoPhotoFiles: localOrder.cargoPhotoFiles }
      : {}),
    ...(localOrder.exceptionReport
      ? { exceptionReport: localOrder.exceptionReport }
      : {}),
    ...(localOrder.modificationRequest
      ? { modificationRequest: localOrder.modificationRequest }
      : {}),
    ...(localOrder.cancellation ? { cancellation: localOrder.cancellation } : {}),
    ...(localOrder.evaluation ? { evaluation: localOrder.evaluation } : {}),
    ...(localOrder.reorderSource
      ? { reorderSource: localOrder.reorderSource }
      : {}),
  };
}

function App({ now = Date.now(), platformApiBaseUrl }: AppProps = {}) {
  const nowRef = useRef(now);
  nowRef.current = now;
  const isDarkMode = useColorScheme() === 'dark';
  const resolvedPlatformApiBaseUrl =
    resolvePlatformApiBaseUrl(platformApiBaseUrl);
  const platformAuthApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformAuthApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformOrderApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformOrderApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformOrderDraftApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformOrderDraftApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformProfileApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformProfileApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformFrequentRoutesApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformFrequentRoutesApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformFileApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformFileApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformDriverOrderApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformDriverOrderApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformDriverCertificationApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformDriverCertificationApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [screen, setScreen] = useState<RootScreen>('auth');
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [messages, setMessages] = useState<MessageCenterItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [initialOrderFilter, setInitialOrderFilter] =
    useState<OrderListFilter>('all');
  const [orderDetailReturnTarget, setOrderDetailReturnTarget] =
    useState<OrderDetailReturnTarget>('home');
  const [homeInitialSupportView, setHomeInitialSupportView] =
    useState<HomeSupportView>('home');
  const [draftGateNotice, setDraftGateNotice] = useState('');
  const [networkNotice, setNetworkNotice] = useState('');
  const [platformOrderListNotice, setPlatformOrderListNotice] = useState('');
  const [platformOrderListQuery, setPlatformOrderListQuery] =
    useState<PlatformListShipperOrdersQuery>({ page: 1, pageSize: 20 });
  const [platformOrderListPaging, setPlatformOrderListPaging] =
    useState<PlatformOrderListPaging>({
      page: 1,
      pageSize: 20,
      total: 0,
      loadedCount: 0,
      isLoadingMore: false,
    });
  const [draftPrefill, setDraftPrefill] = useState<DraftOrderPrefill>();
  const [draftConflictPlatformPrefill, setDraftConflictPlatformPrefill] =
    useState<DraftOrderPrefill>();
  const [draftConflictNoticeText, setDraftConflictNoticeText] = useState('');
  const [savedDraft, setSavedDraft] = useState<DraftOrderPrefill | undefined>(
    undefined,
  );
  const [draftSyncState, setDraftSyncState] = useState<
    DraftSyncState | undefined
  >(undefined);

  const syncPlatformAuthenticatedProfile = useCallback(
    (user?: PlatformAuthenticatedUser) => {
      if (!user) {
        return;
      }

      const profileState = getProfileLocalState();

      saveProfileLocalState({
        ...profileState,
        account: {
          ...profileState.account,
          boundPhone: user.phone,
        },
        syncState: createSyncedProfileSyncState(
          '平台认证手机号已同步到本地资料快照。',
        ),
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateApp = async () => {
      await hydrateAuthSession(now);
      const hydratedAuthSession = getAuthSessionSnapshot();

      if (platformAuthApi && hydratedAuthSession?.refreshToken) {
        try {
          const tokens = await platformAuthApi.refresh({
            refreshToken: hydratedAuthSession.refreshToken,
            deviceId: 'local-device',
          });
          saveAuthSession(now, tokens);
        } catch (error) {
          if (shouldClearAuthSessionAfterStartupPlatformAuthError(error)) {
            clearAuthSession();
          }
        }
      }

      await Promise.all([
        hydrateDraftStorage(now),
        hydrateAppRuntimeState(),
        hydrateHomeLocalState(),
        hydrateProfileLocalState(),
      ]);

      let startupUserType: PlatformMobileUserType = 'shipper';

      if (platformAuthApi && getAuthSessionSnapshot()?.accessToken) {
        try {
          const currentUser = await platformAuthApi.getMe();
          startupUserType = currentUser.userType;
          syncPlatformAuthenticatedProfile(currentUser);
        } catch (error) {
          if (shouldClearAuthSessionAfterStartupPlatformAuthError(error)) {
            clearAuthSession();
          }
        }
      }

      const isAuthSessionSaved = hasSavedAuthSession(now);
      const isOnboardingCompleted =
        isAuthSessionSaved || (await hasCompletedOnboarding());

      if (cancelled) {
        return;
      }

      const runtimeState = getAppRuntimeState();
      const hydratedOrders = runtimeState.orders;

      setOrders(hydratedOrders);
      setMessages(runtimeState.messages);
      setSelectedOrderId(hydratedOrders[0]?.id ?? '');
      const hydratedDraft = getSavedDraft(now);
      setSavedDraft(hydratedDraft);
      setDraftSyncState(
        hydratedDraft ? getDraftStorageSnapshot()?.syncState : undefined,
      );
      setScreen(
        isAuthSessionSaved
          ? startupUserType === 'driver'
            ? 'driver-home'
            : 'home'
          : isOnboardingCompleted
            ? 'auth'
            : 'onboarding',
      );
      setIsHydrated(true);
    };

    hydrateApp().catch(() => {
      if (!cancelled) {
        const runtimeState = getAppRuntimeState();
        setOrders(runtimeState.orders);
        setMessages(runtimeState.messages);
        setSelectedOrderId(runtimeState.orders[0]?.id ?? '');
        const hydratedDraft = getSavedDraft(now);
        setSavedDraft(hydratedDraft);
        setDraftSyncState(
          hydratedDraft ? getDraftStorageSnapshot()?.syncState : undefined,
        );
        setScreen(hasSavedAuthSession(now) ? 'home' : 'onboarding');
        setIsHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [now, platformAuthApi, syncPlatformAuthenticatedProfile]);

  const openHome = (supportView: HomeSupportView = 'home') => {
    setHomeInitialSupportView(supportView);
    setScreen('home');
  };

  const persistRuntimeState = ({
    nextOrders = orders,
    nextMessages = messages,
  }: {
    nextOrders?: RecentOrder[];
    nextMessages?: MessageCenterItem[];
  }) => {
    saveAppRuntimeState({
      orders: nextOrders,
      messages: nextMessages,
    });
  };

  const handleAuthenticated = (
    tokens?: PlatformAuthTokens,
    user?: PlatformAuthenticatedUser,
  ) => {
    saveAuthSession(now, tokens);
    syncPlatformAuthenticatedProfile(user);
    const nextUserType = user?.userType ?? 'shipper';
    if (nextUserType === 'driver') {
      setScreen('driver-home');
      return;
    }

    openHome();
  };

  const handleOnboardingFinished = () => {
    saveOnboardingCompleted(now);
    setScreen('auth');
  };

  const handleLogout = () => {
    const currentAuthSession = getAuthSessionSnapshot();

    if (platformAuthApi && currentAuthSession?.refreshToken) {
      platformAuthApi
        .logout({
          refreshToken: currentAuthSession.refreshToken,
          deviceId: 'local-device',
        })
        .catch(() => undefined);
    }

    clearAuthSession();
    setHomeInitialSupportView('home');
    setNetworkNotice('');
    setScreen('auth');
  };

  const openNetworkError = () => {
    setNetworkNotice('');
    setScreen('network-error');
  };

  const retryNetworkCheck = () => {
    setNetworkNotice('网络已恢复到本地演示状态，本地 API 重试队列已清空');
    openHome();
  };

  const openOrderDetail = (
    orderId: string,
    returnTarget: OrderDetailReturnTarget = 'home',
  ) => {
    setSelectedOrderId(orderId);
    setOrderDetailReturnTarget(returnTarget);
    if (returnTarget === 'home') {
      setHomeInitialSupportView('home');
    }
    if (returnTarget === 'messages') {
      setHomeInitialSupportView('messages');
    }
    setScreen('order-detail');
    refreshPlatformOrderDetail(orderId);
  };

  const refreshPlatformOrderDetail = (orderId: string) => {
    if (!platformOrderApi) {
      return;
    }

    const platformOrderId = orders.find(order => order.id === orderId)
      ?.platformOrderId;

    if (!platformOrderId) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setOrders(currentOrders => {
        const nextOrders = currentOrders.map(order =>
          order.id === orderId
            ? {
                ...order,
                syncState: createFailedOrderSyncState(
                  '平台订单详情刷新需要重新登录后再同步。',
                  'refresh',
                  nowRef.current,
                ),
              }
            : order,
        );
        persistRuntimeState({ nextOrders });
        return nextOrders;
      });
      return;
    }

    platformOrderApi
      .getOrder(platformOrderId)
      .then(platformOrder => {
        const platformRecentOrder = mapPlatformOrderToRecentOrder(platformOrder);

        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === orderId
            ? platformRecentOrder.id
            : currentSelectedOrderId,
        );
        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(order =>
            order.id === orderId
              ? mergePlatformOrderWithLocalRuntimeState(
                  platformRecentOrder,
                  order,
                )
              : order,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
      })
      .catch(() => {
        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(order =>
            order.id === orderId
              ? {
                  ...order,
                  syncState: createFailedOrderSyncState(
                    '平台订单详情刷新失败，已保留本地订单详情。',
                    'refresh',
                    nowRef.current,
                  ),
                }
              : order,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
      });
  };

  const refreshPlatformOrders = (query: PlatformListShipperOrdersQuery = {}) => {
    if (!platformOrderApi) {
      return;
    }

    const nextQuery = normalizePlatformOrderListQuery(query);
    const isLoadingMore = (nextQuery.page ?? 1) > 1;

    if (!getAuthSessionSnapshot()?.accessToken) {
      setPlatformOrderListQuery(nextQuery);
      setPlatformOrderListPaging(currentPaging =>
        isLoadingMore
          ? {
              ...currentPaging,
              isLoadingMore: false,
            }
          : {
              page: nextQuery.page ?? 1,
              pageSize: nextQuery.pageSize ?? 20,
              total: 0,
              loadedCount: 0,
              isLoadingMore: false,
            },
      );
      setPlatformOrderListNotice('平台订单列表刷新需要重新登录后再同步。');
      return;
    }

    setPlatformOrderListQuery(nextQuery);
    if (isLoadingMore) {
      setPlatformOrderListPaging(currentPaging => ({
        ...currentPaging,
        isLoadingMore: true,
      }));
    } else {
      setPlatformOrderListPaging({
        page: nextQuery.page ?? 1,
        pageSize: nextQuery.pageSize ?? 20,
        total: 0,
        loadedCount: 0,
        isLoadingMore: false,
      });
    }

    platformOrderApi
      .listOrders(nextQuery)
      .then(result => {
        const platformPageOrders = result.items.map(mapPlatformOrderToRecentOrder);

        setOrders(currentOrders => {
          const pageOrders = platformPageOrders.map(platformOrder =>
            mergePlatformOrderWithLocalRuntimeState(
              platformOrder,
              findLocalOrderForPlatformOrder(currentOrders, platformOrder),
            ),
          );
          const localPendingCreateOrders = currentOrders.filter(order =>
            shouldKeepLocalCreateOrderInPlatformList(order),
          );
          const nextOrders = isLoadingMore
            ? mergeRecentOrdersById(currentOrders, pageOrders)
            : mergeRecentOrdersById(localPendingCreateOrders, pageOrders);

          persistRuntimeState({ nextOrders });
          setSelectedOrderId(currentSelectedOrderId =>
            isLoadingMore
              ? currentSelectedOrderId || nextOrders[0]?.id || ''
              : nextOrders[0]?.id ?? '',
          );
          return nextOrders;
        });
        setPlatformOrderListPaging(currentPaging => ({
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          loadedCount: isLoadingMore
            ? currentPaging.loadedCount + result.items.length
            : result.items.length,
          isLoadingMore: false,
        }));
        setPlatformOrderListQuery({
          ...nextQuery,
          page: result.page,
          pageSize: result.pageSize,
        });
        setPlatformOrderListNotice('');
      })
      .catch(() => {
        setPlatformOrderListPaging(currentPaging => ({
          ...currentPaging,
          isLoadingMore: false,
        }));
        setPlatformOrderListNotice(
          '平台订单列表刷新失败，已保留本地订单列表。',
        );
      });
  };

  const loadMorePlatformOrders = () => {
    if (
      platformOrderListPaging.isLoadingMore ||
      platformOrderListPaging.total <= platformOrderListPaging.loadedCount
    ) {
      return;
    }

    refreshPlatformOrders({
      ...platformOrderListQuery,
      page: platformOrderListPaging.page + 1,
      pageSize: platformOrderListPaging.pageSize,
    });
  };

  const openOrders = () => {
    setInitialOrderFilter('all');
    setScreen('orders');
    refreshPlatformOrders({ page: 1, pageSize: 20 });
  };

  const openOrdersWithFilter = (filter: OrderListFilter) => {
    setInitialOrderFilter(filter);
    setScreen('orders');
    refreshPlatformOrders(createPlatformOrderListQuery(filter));
  };

  const canOpenOrderDraft = () => {
    const notice = getIdentityPublishGateNotice(
      getProfileLocalState().identityVerification,
    );

    if (notice) {
      setDraftGateNotice(notice);
      setHomeInitialSupportView('home');
      setScreen('home');
      return false;
    }

    setDraftGateNotice('');
    return true;
  };

  const openOrderDraft = () => {
    if (!canOpenOrderDraft()) {
      return;
    }

    const localDraftSnapshot = getDraftStorageSnapshot();

    if (!platformOrderDraftApi) {
      setDraftConflictPlatformPrefill(undefined);
      setDraftConflictNoticeText('');
      setDraftPrefill(savedDraft);
      setScreen('order-draft');
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      markSavedDraftAsFailed(
        draftRestoreMissingAuthSyncMessage,
        getPlatformDraftBaseUpdatedAtIso(localDraftSnapshot?.syncState),
      );
      setDraftConflictPlatformPrefill(undefined);
      setDraftConflictNoticeText('');
      setDraftPrefill(localDraftSnapshot?.draft ?? savedDraft);
      setScreen('order-draft');
      return;
    }

    platformOrderDraftApi
      .getDraft()
      .then(platformDraft => {
        if (
          platformDraft &&
          shouldUsePlatformDraft(
            platformDraft.updatedAtIso,
            localDraftSnapshot?.syncState?.updatedAtIso,
          )
        ) {
          const platformDraftPrefill = createDraftPrefillFromPlatformDraft(
            platformDraft.draftSnapshot,
          );
          const restoredSnapshot = saveDraft(
            platformDraftPrefill,
            nowRef.current,
            createSyncedDraftSyncState(
              '平台发单草稿已恢复到本地。',
              Date.parse(platformDraft.updatedAtIso),
            ),
          );

          setSavedDraft(restoredSnapshot.draft);
          setDraftSyncState(restoredSnapshot.syncState);
          setDraftConflictPlatformPrefill(undefined);
          setDraftConflictNoticeText('');
          setDraftPrefill(restoredSnapshot.draft);
          setScreen('order-draft');
          return;
        }

        if (platformDraft && localDraftSnapshot?.draft) {
          const platformDraftPrefill = createDraftPrefillFromPlatformDraft(
            platformDraft.draftSnapshot,
          );
          const draftSnapshotWithPlatformVersion =
            rememberSavedDraftPlatformUpdatedAtIso(platformDraft.updatedAtIso);

          setDraftConflictPlatformPrefill({
            ...platformDraftPrefill,
            noticeText: '已切换为服务端发单草稿。',
          });
          setDraftConflictNoticeText('');
          setDraftPrefill({
            ...localDraftSnapshot.draft,
            noticeText: '已保留本地较新的发单草稿，服务端草稿未覆盖。',
          });
          if (draftSnapshotWithPlatformVersion) {
            setSavedDraft(draftSnapshotWithPlatformVersion.draft);
            setDraftSyncState(draftSnapshotWithPlatformVersion.syncState);
          }
          setScreen('order-draft');
          return;
        }

        setDraftConflictPlatformPrefill(undefined);
        setDraftConflictNoticeText('');
        setDraftPrefill(savedDraft);
        setScreen('order-draft');
      })
      .catch(error => {
        markSavedDraftAsFailed(
          isAuthAccessTokenMissingError(error)
            ? draftRestoreMissingAuthSyncMessage
            : draftRestoreFailureSyncMessage,
          getPlatformDraftBaseUpdatedAtIso(localDraftSnapshot?.syncState),
        );
        setDraftConflictPlatformPrefill(undefined);
        setDraftConflictNoticeText('');
        setDraftPrefill(localDraftSnapshot?.draft ?? savedDraft);
        setScreen('order-draft');
      });
  };

  const openDraftWithPrefill = (prefill?: DraftOrderPrefill) => {
    if (!canOpenOrderDraft()) {
      return;
    }

    setDraftConflictPlatformPrefill(undefined);
    setDraftConflictNoticeText('');
    setDraftPrefill(prefill);
    setScreen('order-draft');
  };

  const openOrderEditor = (order: RecentOrder) => {
    if (!canOpenOrderDraft()) {
      return;
    }

    setDraftConflictPlatformPrefill(undefined);
    setDraftConflictNoticeText('');
    setDraftPrefill({
      ...createPrefillFromOrder(order, now),
      couponId: order.couponId,
      editingOrderId: order.id,
      noticeText: `正在修改订单：${order.id}`,
    });
    setScreen('order-draft');
  };

  const updateSavedDraft = useCallback((draft: DraftOrderPrefill) => {
    const currentDraftSnapshot = getDraftStorageSnapshot();

    if (
      currentDraftSnapshot &&
      areDraftPrefillsEqual(currentDraftSnapshot.draft, draft)
    ) {
      setSavedDraft(currentDraftSnapshot.draft);
      setDraftSyncState(currentDraftSnapshot.syncState);
      return;
    }

    const savedSnapshot = saveDraft(draft, nowRef.current);
    setSavedDraft(savedSnapshot.draft);
    setDraftSyncState(savedSnapshot.syncState);
  }, []);

  const markSavedDraftAsFailed = useCallback(
    (message: string, baseUpdatedAtIso?: string) => {
      const failedSnapshot = markSavedDraftFailed(
        createFailedDraftSyncState(
          message,
          nowRef.current,
          baseUpdatedAtIso,
        ),
      );

      if (failedSnapshot) {
        setSavedDraft(failedSnapshot.draft);
        setDraftSyncState(failedSnapshot.syncState);
      }
    },
    [],
  );

  const showLatestPlatformDraftConflict = useCallback(
    (baseUpdatedAtIso?: string) => {
      if (!platformOrderDraftApi) {
        markSavedDraftAsFailed(
          draftSaveConflictSyncMessage,
          baseUpdatedAtIso,
        );
        return;
      }

      if (!getAuthSessionSnapshot()?.accessToken) {
        markSavedDraftAsFailed(
          draftConflictMissingAuthSyncMessage,
          baseUpdatedAtIso,
        );
        return;
      }

      platformOrderDraftApi
        .getDraft()
        .then(platformDraft => {
          if (!platformDraft) {
            markSavedDraftAsFailed(
              draftSaveConflictSyncMessage,
              baseUpdatedAtIso,
            );
            return;
          }

          const platformDraftPrefill = createDraftPrefillFromPlatformDraft(
            platformDraft.draftSnapshot,
          );

          setDraftConflictPlatformPrefill({
            ...platformDraftPrefill,
            noticeText: '已切换为服务端发单草稿。',
          });
          setDraftConflictNoticeText(draftSaveConflictNoticeText);
          markSavedDraftAsFailed(
            draftSaveConflictSyncMessage,
            platformDraft.updatedAtIso,
          );
        })
        .catch(error => {
          if (isAuthAccessTokenMissingError(error)) {
            markSavedDraftAsFailed(
              draftConflictMissingAuthSyncMessage,
              baseUpdatedAtIso,
            );
            return;
          }

          markSavedDraftAsFailed(
            draftSaveConflictSyncMessage,
            baseUpdatedAtIso,
          );
        });
    },
    [markSavedDraftAsFailed, platformOrderDraftApi],
  );

  const handleDraftSaveFailure = useCallback(
    (error: unknown, failedMessage: string, baseUpdatedAtIso?: string) => {
      if (isOrderDraftConflictError(error)) {
        showLatestPlatformDraftConflict(baseUpdatedAtIso);
        return;
      }

      markSavedDraftAsFailed(failedMessage, baseUpdatedAtIso);
    },
    [markSavedDraftAsFailed, showLatestPlatformDraftConflict],
  );

  const syncSavedDraftToPlatform = useCallback(
    (draft: DraftOrderPrefill) => {
      const baseUpdatedAtIso = getPlatformDraftBaseUpdatedAtIso(
        getDraftStorageSnapshot()?.syncState,
      );
      const savedSnapshot = saveDraft(draft, nowRef.current);
      setSavedDraft(savedSnapshot.draft);
      setDraftSyncState(savedSnapshot.syncState);

      if (!platformOrderDraftApi) {
        return;
      }

      if (!getAuthSessionSnapshot()?.accessToken) {
        markSavedDraftAsFailed(
          '平台发单草稿保存需要重新登录后再同步。',
          baseUpdatedAtIso,
        );
        return;
      }

      platformOrderDraftApi
        .saveDraft({
          draftSnapshot: savedSnapshot.draft,
          clientUpdatedAtIso: savedSnapshot.syncState?.updatedAtIso,
          baseUpdatedAtIso,
        })
        .then(result => {
          const syncedSnapshot = markSavedDraftSynced(
            createSyncedDraftSyncState(
              '平台发单草稿已同步。',
              Date.parse(result.updatedAtIso),
            ),
          );

          if (syncedSnapshot) {
            setSavedDraft(syncedSnapshot.draft);
            setDraftSyncState(syncedSnapshot.syncState);
            setDraftConflictPlatformPrefill(undefined);
            setDraftConflictNoticeText('');
          }
        })
        .catch(error => {
          handleDraftSaveFailure(
            error,
              '平台发单草稿同步失败，已保留本地草稿。',
            baseUpdatedAtIso,
          );
        });
    },
    [handleDraftSaveFailure, markSavedDraftAsFailed, platformOrderDraftApi],
  );

  const removeSavedDraft = useCallback(() => {
    clearSavedDraft();
    setSavedDraft(undefined);
    setDraftSyncState(undefined);
  }, []);

  const retryDraftSync = useCallback(() => {
    const currentDraftSnapshot = getDraftStorageSnapshot();
    const baseUpdatedAtIso = getPlatformDraftBaseUpdatedAtIso(
      currentDraftSnapshot?.syncState,
    );

    if (
      platformOrderDraftApi &&
      !getAuthSessionSnapshot()?.accessToken &&
      currentDraftSnapshot
    ) {
      markSavedDraftAsFailed(
        '平台发单草稿重试需要重新登录后再同步。',
        baseUpdatedAtIso,
      );
      return;
    }

    if (platformOrderDraftApi && currentDraftSnapshot) {
      platformOrderDraftApi
        .saveDraft({
          draftSnapshot: currentDraftSnapshot.draft,
          clientUpdatedAtIso: currentDraftSnapshot.syncState?.updatedAtIso,
          baseUpdatedAtIso,
        })
        .then(result => {
          const syncedSnapshot = markSavedDraftSynced(
            createSyncedDraftSyncState(
              '平台发单草稿重试已同步。',
              Date.parse(result.updatedAtIso),
            ),
          );

          if (syncedSnapshot) {
            setSavedDraft(syncedSnapshot.draft);
            setDraftSyncState(syncedSnapshot.syncState);
            setDraftConflictPlatformPrefill(undefined);
            setDraftConflictNoticeText('');
          }
        })
        .catch(error => {
          handleDraftSaveFailure(
            error,
              '平台发单草稿重试失败，已保留本地草稿。',
            baseUpdatedAtIso,
          );
        });
      return;
    }

    const savedSnapshot = markSavedDraftSynced(undefined, nowRef.current);

    if (!savedSnapshot) {
      return;
    }

    setSavedDraft(savedSnapshot.draft);
    setDraftSyncState(savedSnapshot.syncState);
  }, [handleDraftSaveFailure, markSavedDraftAsFailed, platformOrderDraftApi]);

  const markDraftSyncFailed = useCallback(() => {
    const savedSnapshot = markSavedDraftFailed(undefined, nowRef.current);

    if (!savedSnapshot) {
      return;
    }

    setSavedDraft(savedSnapshot.draft);
    setDraftSyncState(savedSnapshot.syncState);
  }, []);

  const returnFromOrderDetail = () => {
    if (orderDetailReturnTarget === 'orders') {
      setScreen('orders');
      return;
    }

    openHome(orderDetailReturnTarget === 'messages' ? 'messages' : 'home');
  };

  const publishOrder = async (draftOrder: DraftOrderInput) => {
    if (!canOpenOrderDraft()) {
      return;
    }

    const editingOrderId = draftPrefill?.editingOrderId;

    if (editingOrderId) {
      const previousOrder = orders.find(order => order.id === editingOrderId);
      const localOrderChanges = createOrderUpdateFromDraft(draftOrder, now);

      if (
        previousOrder &&
        platformOrderApi &&
        getAuthSessionSnapshot()?.accessToken &&
        previousOrder.platformOrderId
      ) {
        const editedLocalOrder = {
          ...previousOrder,
          ...localOrderChanges,
        };

        try {
          const platformOrder = await platformOrderApi.updateOrder(
            previousOrder.platformOrderId,
            createPlatformCreateOrderRequest(draftOrder, editedLocalOrder),
          );
          const updatedOrder = mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(order =>
              order.id === editingOrderId
                ? mergePlatformOrderWithLocalRuntimeState(updatedOrder, order)
                : order,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          syncLocalCouponUsage(draftOrder, updatedOrder.id, previousOrder.couponId);
          removeSavedDraft();
          setDraftConflictPlatformPrefill(undefined);
          setDraftPrefill(undefined);
          setSelectedOrderId(updatedOrder.id);
          setOrderDetailReturnTarget('home');
          setHomeInitialSupportView('home');
          setScreen('order-detail');
          return;
        } catch {
          updateOrder(editingOrderId, {
            ...localOrderChanges,
            syncState: createFailedOrderSyncState(
              '平台订单修改失败，已保留本地修改记录。',
              'update',
              nowRef.current,
            ),
          });
          syncLocalCouponUsage(draftOrder, editingOrderId, previousOrder.couponId);
          removeSavedDraft();
          setDraftConflictPlatformPrefill(undefined);
          setDraftPrefill(undefined);
          setSelectedOrderId(editingOrderId);
          setOrderDetailReturnTarget('home');
          setHomeInitialSupportView('home');
          setScreen('order-detail');
          return;
        }
      }

      if (
        previousOrder &&
        platformOrderApi &&
        previousOrder.platformOrderId &&
        !getAuthSessionSnapshot()?.accessToken
      ) {
        updateOrder(editingOrderId, {
          ...localOrderChanges,
          syncState: createFailedOrderSyncState(
            '平台订单修改需要重新登录后再同步。',
            'update',
            nowRef.current,
          ),
        });
        syncLocalCouponUsage(draftOrder, editingOrderId, previousOrder.couponId);
        removeSavedDraft();
        setDraftConflictPlatformPrefill(undefined);
        setDraftPrefill(undefined);
        setSelectedOrderId(editingOrderId);
        setOrderDetailReturnTarget('home');
        setHomeInitialSupportView('home');
        setScreen('order-detail');
        return;
      }

      updateOrder(editingOrderId, localOrderChanges);
      syncLocalCouponUsage(draftOrder, editingOrderId, previousOrder?.couponId);
      removeSavedDraft();
      setDraftConflictPlatformPrefill(undefined);
      setDraftPrefill(undefined);
      setSelectedOrderId(editingOrderId);
      setOrderDetailReturnTarget('home');
      setHomeInitialSupportView('home');
      setScreen('order-detail');
      return;
    }

    const localOrder = createLocalOrder(draftOrder, orders, now);
    let order = localOrder;

    if (platformOrderApi && !getAuthSessionSnapshot()?.accessToken) {
      order = {
        ...localOrder,
        syncState: createFailedOrderSyncState(
          '平台订单发布需要重新登录后再同步。',
          'create',
          nowRef.current,
        ),
      };
    } else if (platformOrderApi && getAuthSessionSnapshot()?.accessToken) {
      try {
        const platformOrder = await platformOrderApi.createOrder(
          createPlatformCreateOrderRequest(draftOrder, localOrder),
        );

        order = mergePlatformOrderWithLocalRuntimeState(
          mapPlatformOrderToRecentOrder(platformOrder),
          localOrder,
        );
      } catch {
        order = {
          ...localOrder,
          syncState: createFailedOrderSyncState(
            '平台订单接口不可用，已保留本地待同步订单。',
            'create',
            nowRef.current,
          ),
        };
      }
    }

    setOrders(currentOrders => {
      const nextOrders = [order, ...currentOrders];
      persistRuntimeState({ nextOrders });
      return nextOrders;
    });
    syncLocalCouponUsage(draftOrder, order.id);
    removeSavedDraft();
    setDraftConflictPlatformPrefill(undefined);
    setDraftPrefill(undefined);
    setSelectedOrderId(order.id);
    setOrderDetailReturnTarget('home');
    setHomeInitialSupportView('home');
    setScreen('order-detail');
  };

  const syncLocalCouponUsage = (
    draftOrder: DraftOrderInput,
    orderId: string,
    previousCouponId?: string,
  ) => {
    if (!draftOrder.couponId && !previousCouponId) {
      return;
    }

    const profileState = getProfileLocalState();
    const changes = createOrderCouponUsageChanges(profileState.coupons, {
      orderId,
      couponId: draftOrder.couponId,
      previousCouponId,
    });

    if (!changes) {
      return;
    }

    saveProfileLocalState({
      ...profileState,
      coupons: changes.coupons,
      syncState: createPendingProfileSyncState(
        '本地优惠券使用状态已更新，等待真实优惠券 API 接入后同步。',
      ),
    });
  };

  const updateOrder = (orderId: string, changes: Partial<RecentOrder>) => {
    setOrders(currentOrders => {
      const nextOrders = currentOrders.map(order =>
        order.id === orderId
          ? {
              ...order,
              ...changes,
              syncState:
                'syncState' in changes
                  ? changes.syncState
                  : createPendingOrderSyncState(
                      '本地订单状态已变更，等待真实后端 API 接入后同步。',
                      'local',
                      nowRef.current,
                    ),
            }
          : order,
      );
      persistRuntimeState({ nextOrders });
      return nextOrders;
    });
  };

  const retryOrderSyncToPlatform = (order: RecentOrder) => {
    if (!platformOrderApi) {
      updateOrder(order.id, {
        syncState: createSyncedOrderSyncState(
          undefined,
          'local',
          nowRef.current,
        ),
      });
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      updateOrder(order.id, {
        syncState: createFailedOrderSyncState(
          '平台订单重试需要重新登录后再同步。',
          order.syncState?.operation ?? 'local',
          nowRef.current,
        ),
      });
      return;
    }

    if (order.syncState?.operation === 'refresh' && order.platformOrderId) {
      platformOrderApi
        .getOrder(order.platformOrderId)
        .then(platformOrder => {
          const refreshedPlatformOrder =
            mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? mergePlatformOrderWithLocalRuntimeState(
                    refreshedPlatformOrder,
                    currentOrder,
                  )
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? refreshedPlatformOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单详情刷新重试失败，已继续保留本地订单详情。',
              'refresh',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (order.syncState?.operation === 'update' && order.platformOrderId) {
      platformOrderApi
        .updateOrder(
          order.platformOrderId,
          createPlatformCreateOrderRequestFromRecentOrder(order),
        )
        .then(platformOrder => {
          const syncedOrder = mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? mergePlatformOrderWithLocalRuntimeState(
                    syncedOrder,
                    currentOrder,
                  )
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? syncedOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单修改重试失败，已继续保留本地修改记录。',
              'update',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (
      order.syncState?.operation === 'cancel' &&
      order.platformOrderId &&
      order.cancellation
    ) {
      platformOrderApi
        .cancelOrder(order.platformOrderId, {
          reasonText: order.cancellation.reasonText,
          description: optionalText(order.cancellation.description),
        })
        .then(platformOrder => {
          const cancelledPlatformOrder =
            mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? {
                    ...mergePlatformOrderWithLocalRuntimeState(
                      cancelledPlatformOrder,
                      currentOrder,
                    ),
                    cancellation: order.cancellation,
                  }
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? cancelledPlatformOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单取消重试失败，已继续保留本地取消记录。',
              'cancel',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (order.syncState?.operation === 'complete' && order.platformOrderId) {
      platformOrderApi
        .completeOrder(order.platformOrderId)
        .then(platformOrder => {
          const completedOrder = mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? mergePlatformOrderWithLocalRuntimeState(
                    completedOrder,
                    currentOrder,
                  )
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? completedOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单确认送达重试失败，已继续保留本地完成记录。',
              'complete',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (
      order.syncState?.operation === 'status' &&
      order.platformOrderId &&
      isPlatformOrderAdvanceStatus(order.status)
    ) {
      platformOrderApi
        .advanceOrderStatus(order.platformOrderId, {
          nextStatus: order.status,
        })
        .then(platformOrder => {
          const syncedOrder = mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? mergePlatformOrderWithLocalRuntimeState(
                    syncedOrder,
                    currentOrder,
                  )
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? syncedOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单状态推进重试失败，已继续保留本地状态变更。',
              'status',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (
      order.syncState?.operation === 'exception' &&
      order.platformOrderId &&
      order.exceptionReport
    ) {
      platformOrderApi
        .reportException(
          order.platformOrderId,
          createPlatformExceptionReportRequest(order.exceptionReport),
        )
        .then(platformOrder => {
          const syncedPlatformOrder =
            mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? {
                    ...mergePlatformOrderWithLocalRuntimeState(
                      syncedPlatformOrder,
                      currentOrder,
                    ),
                    exceptionReport: order.exceptionReport,
                  }
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? syncedPlatformOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单异常上报重试失败，已继续保留本地异常记录。',
              'exception',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (
      order.syncState?.operation === 'evaluation' &&
      order.platformOrderId &&
      order.evaluation
    ) {
      platformOrderApi
        .submitEvaluation(
          order.platformOrderId,
          createPlatformEvaluationRequest(order.evaluation),
        )
        .then(platformOrder => {
          const syncedPlatformOrder =
            mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? {
                    ...mergePlatformOrderWithLocalRuntimeState(
                      syncedPlatformOrder,
                      currentOrder,
                    ),
                    evaluation: order.evaluation,
                  }
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? syncedPlatformOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单评价重试失败，已继续保留本地评价记录。',
              'evaluation',
              nowRef.current,
            ),
          });
        });
      return;
    }

    if (
      order.syncState?.operation === 'changeRequest' &&
      order.platformOrderId &&
      order.modificationRequest
    ) {
      platformOrderApi
        .submitChangeRequest(
          order.platformOrderId,
          createPlatformChangeRequest(order.modificationRequest),
        )
        .then(platformOrder => {
          const syncedPlatformOrder =
            mapPlatformOrderToRecentOrder(platformOrder);

          setOrders(currentOrders => {
            const nextOrders = currentOrders.map(currentOrder =>
              currentOrder.id === order.id
                ? {
                    ...mergePlatformOrderWithLocalRuntimeState(
                      syncedPlatformOrder,
                      currentOrder,
                    ),
                    modificationRequest: order.modificationRequest,
                  }
                : currentOrder,
            );
            persistRuntimeState({ nextOrders });
            return nextOrders;
          });
          setSelectedOrderId(currentSelectedOrderId =>
            currentSelectedOrderId === order.id
              ? syncedPlatformOrder.id
              : currentSelectedOrderId,
          );
        })
        .catch(() => {
          updateOrder(order.id, {
            syncState: createFailedOrderSyncState(
              '平台订单修改申请重试失败，已继续保留本地修改申请。',
              'changeRequest',
              nowRef.current,
            ),
          });
        });
      return;
    }

    platformOrderApi
      .createOrder(createPlatformCreateOrderRequestFromRecentOrder(order))
      .then(platformOrder => {
        const syncedOrder = mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? mergePlatformOrderWithLocalRuntimeState(
                  syncedOrder,
                  currentOrder,
                )
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? syncedOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          syncState: createFailedOrderSyncState(
            '平台订单同步重试失败，已继续保留本地待同步订单。',
            'create',
            nowRef.current,
          ),
        });
      });
  };

  const isPlatformOrderActionMissingAuth = (order: RecentOrder) =>
    Boolean(
      platformOrderApi &&
        order.platformOrderId &&
        !getAuthSessionSnapshot()?.accessToken,
    );

  const keepPlatformOrderActionQueuedUntilLogin = (
    order: RecentOrder,
    changes: Partial<RecentOrder>,
    operation: OrderSyncOperation,
    actionText: string,
  ) => {
    updateOrder(order.id, {
      ...changes,
      syncState: createFailedOrderSyncState(
        `平台订单${actionText}需要重新登录后再同步。`,
        operation,
        nowRef.current,
      ),
    });
  };

  const submitOrderEvaluationFromDetail = (
    order: RecentOrder,
    evaluation: NonNullable<RecentOrder['evaluation']>,
  ) => {
    const localEvaluationChanges: Partial<RecentOrder> = {
      evaluation,
      updatedAtIso: new Date(nowRef.current).toISOString(),
    };

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localEvaluationChanges,
        'evaluation',
        '评价',
      );
      return;
    }

    if (
      !platformOrderApi ||
      !getAuthSessionSnapshot()?.accessToken ||
      !order.platformOrderId
    ) {
      updateOrder(order.id, localEvaluationChanges);
      return;
    }

    platformOrderApi
      .submitEvaluation(
        order.platformOrderId,
        createPlatformEvaluationRequest(evaluation),
      )
      .then(platformOrder => {
        const evaluatedPlatformOrder =
          mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? {
                  ...mergePlatformOrderWithLocalRuntimeState(
                    evaluatedPlatformOrder,
                    currentOrder,
                  ),
                  evaluation,
                }
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? evaluatedPlatformOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          ...localEvaluationChanges,
          syncState: createFailedOrderSyncState(
            '平台订单评价失败，已保留本地评价记录。',
            'evaluation',
            nowRef.current,
          ),
        });
      });
  };

  const submitOrderChangeRequestFromDetail = (
    order: RecentOrder,
    modificationRequest: NonNullable<RecentOrder['modificationRequest']>,
  ) => {
    const localChangeRequestChanges: Partial<RecentOrder> = {
      modificationRequest,
      updatedAtIso: new Date(nowRef.current).toISOString(),
    };

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localChangeRequestChanges,
        'changeRequest',
        '修改申请',
      );
      return;
    }

    if (
      !platformOrderApi ||
      !getAuthSessionSnapshot()?.accessToken ||
      !order.platformOrderId
    ) {
      updateOrder(order.id, localChangeRequestChanges);
      return;
    }

    platformOrderApi
      .submitChangeRequest(
        order.platformOrderId,
        createPlatformChangeRequest(modificationRequest),
      )
      .then(platformOrder => {
        const changedPlatformOrder =
          mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? {
                  ...mergePlatformOrderWithLocalRuntimeState(
                    changedPlatformOrder,
                    currentOrder,
                  ),
                  modificationRequest,
                }
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? changedPlatformOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          ...localChangeRequestChanges,
          syncState: createFailedOrderSyncState(
            '平台订单修改申请失败，已保留本地修改申请。',
            'changeRequest',
            nowRef.current,
          ),
        });
      });
  };

  const reportOrderExceptionFromDetail = (
    order: RecentOrder,
    exceptionReport: NonNullable<RecentOrder['exceptionReport']>,
  ) => {
    const localExceptionChanges: Partial<RecentOrder> = {
      exceptionReport,
      updatedAtIso: new Date(nowRef.current).toISOString(),
    };

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localExceptionChanges,
        'exception',
        '异常上报',
      );
      return;
    }

    if (
      !platformOrderApi ||
      !getAuthSessionSnapshot()?.accessToken ||
      !order.platformOrderId
    ) {
      updateOrder(order.id, localExceptionChanges);
      return;
    }

    platformOrderApi
      .reportException(
        order.platformOrderId,
        createPlatformExceptionReportRequest(exceptionReport),
      )
      .then(platformOrder => {
        const reportedPlatformOrder =
          mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? {
                  ...mergePlatformOrderWithLocalRuntimeState(
                    reportedPlatformOrder,
                    currentOrder,
                  ),
                  exceptionReport,
                }
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? reportedPlatformOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          ...localExceptionChanges,
          syncState: createFailedOrderSyncState(
            '平台订单异常上报失败，已保留本地异常记录。',
            'exception',
            nowRef.current,
          ),
        });
      });
  };

  const advanceOrderStatusFromDetail = (
    order: RecentOrder,
    progressAction: OrderProgressAction,
  ) => {
    const localStatusChanges: Partial<RecentOrder> = {
      status: progressAction.nextStatus,
      updatedAtText: progressAction.updatedAtText,
      updatedAtIso: new Date(nowRef.current).toISOString(),
    };

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localStatusChanges,
        'status',
        '状态推进',
      );
      return;
    }

    if (
      !platformOrderApi ||
      !getAuthSessionSnapshot()?.accessToken ||
      !order.platformOrderId ||
      !isPlatformOrderAdvanceStatus(progressAction.nextStatus)
    ) {
      updateOrder(order.id, localStatusChanges);
      return;
    }

    platformOrderApi
      .advanceOrderStatus(order.platformOrderId, {
        nextStatus: progressAction.nextStatus,
      })
      .then(platformOrder => {
        const advancedOrder = mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? mergePlatformOrderWithLocalRuntimeState(
                  advancedOrder,
                  currentOrder,
                )
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? advancedOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          ...localStatusChanges,
          syncState: createFailedOrderSyncState(
            '平台订单状态推进失败，已保留本地状态变更。',
            'status',
            nowRef.current,
          ),
        });
      });
  };

  const cancelOrderFromDetail = (
    order: RecentOrder,
    cancellation: NonNullable<RecentOrder['cancellation']>,
  ) => {
    const localCancellationChanges: Partial<RecentOrder> = {
      status: 'cancelled',
      updatedAtText: '已取消 · 刚刚',
      updatedAtIso: new Date(nowRef.current).toISOString(),
      cancellation,
    };

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localCancellationChanges,
        'cancel',
        '取消',
      );
      return;
    }

    if (
      !platformOrderApi ||
      !getAuthSessionSnapshot()?.accessToken ||
      !order.platformOrderId
    ) {
      updateOrder(order.id, localCancellationChanges);
      return;
    }

    platformOrderApi
      .cancelOrder(order.platformOrderId, {
        reasonText: cancellation.reasonText,
        description: optionalText(cancellation.description),
      })
      .then(platformOrder => {
        const cancelledPlatformOrder =
          mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? {
                  ...mergePlatformOrderWithLocalRuntimeState(
                    cancelledPlatformOrder,
                    currentOrder,
                  ),
                  cancellation,
                }
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? cancelledPlatformOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          ...localCancellationChanges,
          syncState: createFailedOrderSyncState(
            '平台订单取消失败，已保留本地取消记录。',
            'cancel',
            nowRef.current,
          ),
        });
      });
  };

  const completeOrderFromDetail = (order: RecentOrder) => {
    const localCompletionChanges: Partial<RecentOrder> = {
      status: 'completed',
      updatedAtText: '订单已完成 · 刚刚',
      updatedAtIso: new Date(nowRef.current).toISOString(),
    };

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localCompletionChanges,
        'complete',
        '确认送达',
      );
      return;
    }

    if (
      !platformOrderApi ||
      !getAuthSessionSnapshot()?.accessToken ||
      !order.platformOrderId
    ) {
      updateOrder(order.id, localCompletionChanges);
      return;
    }

    platformOrderApi
      .completeOrder(order.platformOrderId)
      .then(platformOrder => {
        const completedOrder = mapPlatformOrderToRecentOrder(platformOrder);

        setOrders(currentOrders => {
          const nextOrders = currentOrders.map(currentOrder =>
            currentOrder.id === order.id
              ? mergePlatformOrderWithLocalRuntimeState(
                  completedOrder,
                  currentOrder,
                )
              : currentOrder,
          );
          persistRuntimeState({ nextOrders });
          return nextOrders;
        });
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === order.id
            ? completedOrder.id
            : currentSelectedOrderId,
        );
      })
      .catch(() => {
        updateOrder(order.id, {
          ...localCompletionChanges,
          syncState: createFailedOrderSyncState(
            '平台订单确认送达失败，已保留本地完成记录。',
            'complete',
            nowRef.current,
          ),
        });
      });
  };

  const markMessageRead = (messageId: string) => {
    setMessages(currentMessages => {
      const nextMessages = currentMessages.map(message =>
        message.id === messageId ? { ...message, unread: false } : message,
      );
      persistRuntimeState({ nextMessages });
      return nextMessages;
    });
  };

  if (!isHydrated) {
    return (
      <SafeAreaProvider
        initialMetrics={initialWindowMetrics ?? fallbackSafeAreaMetrics}
      >
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <SafeAreaView style={styles.safeArea} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider
      initialMetrics={initialWindowMetrics ?? fallbackSafeAreaMetrics}
    >
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <SafeAreaView style={styles.safeArea}>
        {screen === 'onboarding' ? (
          <OnboardingScreen onFinish={handleOnboardingFinished} />
        ) : screen === 'auth' ? (
          <AuthScreen
            now={now}
            onAuthenticated={handleAuthenticated}
            platformAuthApi={platformAuthApi}
          />
        ) : screen === 'driver-home' ? (
          <DriverHomeScreen
            platformDriverOrderApi={platformDriverOrderApi}
            platformDriverCertificationApi={platformDriverCertificationApi}
            platformFileApi={platformFileApi}
            onLogout={handleLogout}
          />
        ) : screen === 'network-error' ? (
          <NetworkErrorScreen
            onBack={() => openHome()}
            onRetry={retryNetworkCheck}
          />
        ) : screen === 'order-draft' ? (
          <OrderDraftScreen
            onBack={() => openHome()}
            now={now}
            prefill={draftPrefill}
            conflictPlatformDraft={draftConflictPlatformPrefill}
            draftConflictNoticeText={draftConflictNoticeText}
            draftSyncState={draftSyncState}
            onDraftChange={updateSavedDraft}
            onSaveDraft={syncSavedDraftToPlatform}
            onRetryDraftSync={retryDraftSync}
            onMarkDraftSyncFailed={markDraftSyncFailed}
            platformFileApi={platformFileApi}
            onPublish={publishOrder}
          />
        ) : screen === 'order-detail' ? (
          <OrderDetailScreen
            orderId={selectedOrderId}
            now={now}
            orders={orders}
            onBack={returnFromOrderDetail}
            onUpdateOrder={updateOrder}
            onReorder={openDraftWithPrefill}
            onEditOrder={openOrderEditor}
            onRetryOrderSync={retryOrderSyncToPlatform}
            onCancelOrder={cancelOrderFromDetail}
            onCompleteOrder={completeOrderFromDetail}
            onAdvanceOrderStatus={advanceOrderStatusFromDetail}
            onReportException={reportOrderExceptionFromDetail}
            onSubmitChangeRequest={submitOrderChangeRequestFromDetail}
            onSubmitEvaluation={submitOrderEvaluationFromDetail}
            platformFileApi={platformFileApi}
          />
        ) : screen === 'orders' ? (
          <OrdersScreen
            now={now}
            orders={orders}
            initialFilter={initialOrderFilter}
            platformNotice={platformOrderListNotice}
            platformPageInfo={{
              loadedCount: platformOrderListPaging.loadedCount,
              total: platformOrderListPaging.total,
              isLoadingMore: platformOrderListPaging.isLoadingMore,
              canLoadMore:
                platformOrderListPaging.total >
                platformOrderListPaging.loadedCount,
            }}
            onBack={() => openHome()}
            onOpenOrderDetail={orderId => openOrderDetail(orderId, 'orders')}
            onPlatformQueryChange={refreshPlatformOrders}
            onLoadMorePlatformOrders={loadMorePlatformOrders}
          />
        ) : (
          <HomeScreen
            now={now}
            orders={orders}
            messages={messages}
            initialSupportView={homeInitialSupportView}
            draftGateNotice={draftGateNotice}
            networkNotice={networkNotice}
            platformAuthApi={platformAuthApi}
            platformProfileApi={platformProfileApi}
            platformFrequentRoutesApi={platformFrequentRoutesApi}
            platformFileApi={platformFileApi}
            onLogout={handleLogout}
            onOpenNetworkError={openNetworkError}
            onOpenOrderDraft={openOrderDraft}
            onOpenOrderDetail={openOrderDetail}
            onOpenOrders={openOrders}
            onOpenOrdersWithFilter={openOrdersWithFilter}
            onMarkMessageRead={markMessageRead}
            onReuseRoute={route =>
              openDraftWithPrefill({
                pickupAddress: route.from,
                deliveryAddress: route.to,
                noticeText: `已带入常用路线：${route.name}`,
              })
            }
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function createPlatformCreateOrderRequest(
  draftOrder: DraftOrderInput,
  localOrder: RecentOrder,
): PlatformCreateShipperOrderRequest {
  const pricingFields = createPlatformPricingFields({
    pricingMode: draftOrder.pricingMode,
    priceText: draftOrder.priceText,
    couponId: draftOrder.couponId,
    couponTitleText: draftOrder.couponTitleText,
    couponDiscountText: draftOrder.couponDiscountText,
    payablePriceText: draftOrder.payablePriceText,
  });

  return {
    cargoType: draftOrder.cargoType,
    weightText: draftOrder.weightText,
    volumeText: optionalText(draftOrder.volumeText),
    quantityText: draftOrder.quantityText,
    cargoDescription: optionalText(draftOrder.cargoDescription),
    cargoPhotoCount: draftOrder.cargoPhotoCount,
    ...createPlatformCargoPhotoFileIdFields(draftOrder.cargoPhotoFiles),
    pickupAddress: draftOrder.pickupAddress,
    pickupNoteText: optionalText(draftOrder.pickupNoteText),
    pickupContact: draftOrder.pickupContact,
    pickupPhone: draftOrder.pickupPhone,
    deliveryAddress: draftOrder.deliveryAddress,
    deliveryNoteText: optionalText(draftOrder.deliveryNoteText),
    deliveryContact: draftOrder.deliveryContact,
    deliveryPhone: draftOrder.deliveryPhone,
    vehicleRequirement: draftOrder.vehicleRequirement,
    vehicleLengthText: localOrder.vehicleLengthText,
    needTailboard: draftOrder.needTailboard,
    needTarp: draftOrder.needTarp,
    pickupTimeIso: localOrder.pickupTimeIso ?? new Date().toISOString(),
    expectedDeliveryTimeText: optionalText(draftOrder.expectedDeliveryTimeText),
    valueAddedServicesText: localOrder.valueAddedServicesText,
    pricingMode: draftOrder.pricingMode,
    ...pricingFields,
    paymentMethod: draftOrder.paymentMethod,
  };
}

function createPlatformCreateOrderRequestFromRecentOrder(
  order: RecentOrder,
): PlatformCreateShipperOrderRequest {
  const pricingMode =
    order.priceText === '司机报价' ? 'negotiable' : 'fixed';
  const pricingFields = createPlatformPricingFields({
    pricingMode,
    priceText: order.originalPriceText ?? order.priceText,
    couponId: order.couponId,
    couponTitleText: order.couponTitleText,
    couponDiscountText: order.couponDiscountText,
    payablePriceText: order.payablePriceText,
  });

  return {
    cargoType: getPlatformCargoTypeId(order.cargoType),
    weightText: order.weightText,
    volumeText: optionalText(order.volumeText),
    quantityText: order.quantityText ?? '1 件',
    cargoDescription: optionalText(order.cargoDescription),
    cargoPhotoCount: order.cargoPhotoCount,
    ...createPlatformCargoPhotoFileIdFields(order.cargoPhotoFiles),
    pickupAddress: order.from,
    pickupNoteText: optionalText(order.pickupNoteText),
    pickupContact: order.pickupContact ?? '',
    pickupPhone: order.pickupPhone ?? '',
    deliveryAddress: order.to,
    deliveryNoteText: optionalText(order.deliveryNoteText),
    deliveryContact: order.deliveryContact ?? '',
    deliveryPhone: order.deliveryPhone ?? '',
    vehicleRequirement: getPlatformVehicleRequirementId(order.vehicleRequirement),
    vehicleLengthText: optionalText(order.vehicleLengthText),
    needTailboard: Boolean(
      order.vehicleExtraRequirementsText?.includes('需要尾板'),
    ),
    needTarp: Boolean(order.vehicleExtraRequirementsText?.includes('需要篷布')),
    pickupTimeIso:
      order.pickupTimeIso ?? order.createdAtIso ?? new Date().toISOString(),
    expectedDeliveryTimeText: optionalText(order.expectedDeliveryTimeText),
    valueAddedServicesText: optionalText(order.valueAddedServicesText),
    pricingMode,
    ...pricingFields,
    paymentMethod:
      order.paymentMethodText === '在线支付' ? 'online' : 'cod',
  };
}

function createPlatformPricingFields({
  pricingMode,
  priceText,
  couponId,
  couponTitleText,
  couponDiscountText,
  payablePriceText,
}: {
  pricingMode: DraftOrderInput['pricingMode'];
  priceText?: string;
  couponId?: string;
  couponTitleText?: string;
  couponDiscountText?: string;
  payablePriceText?: string;
}): Pick<
  PlatformCreateShipperOrderRequest,
  | 'priceCents'
  | 'couponId'
  | 'couponTitle'
  | 'couponDiscountCents'
  | 'payablePriceCents'
> {
  if (pricingMode !== 'fixed') {
    return {};
  }

  const couponDiscountCents = parseMoneyCents(couponDiscountText);
  const payablePriceCents = parseMoneyCents(payablePriceText);
  const couponTitle = optionalText(couponTitleText);
  const activeCouponId = optionalText(couponId);
  const couponFields =
    activeCouponId &&
    couponTitle &&
    couponDiscountCents !== undefined &&
    payablePriceCents !== undefined
      ? {
          couponId: activeCouponId,
          couponTitle,
          couponDiscountCents,
          payablePriceCents,
        }
      : {};

  return {
    priceCents: parseMoneyCents(priceText),
    ...couponFields,
  };
}

function createPlatformExceptionReportRequest(
  exceptionReport: NonNullable<RecentOrder['exceptionReport']>,
) {
  return {
    typeLabel: exceptionReport.typeLabel,
    description: exceptionReport.description,
    ...(exceptionReport.photoCount && exceptionReport.photoCount > 0
      ? { photoCount: exceptionReport.photoCount }
      : {}),
    ...createPlatformPhotoFileIdFields(exceptionReport.photoFiles),
  };
}

function createPlatformChangeRequest(
  modificationRequest: NonNullable<RecentOrder['modificationRequest']>,
) {
  return {
    description: modificationRequest.description,
  };
}

function createPlatformEvaluationRequest(
  evaluation: NonNullable<RecentOrder['evaluation']>,
) {
  return {
    rating: evaluation.rating,
    tags: evaluation.tags,
    content: evaluation.content,
    anonymous: Boolean(evaluation.anonymous),
    ...(evaluation.photoCount && evaluation.photoCount > 0
      ? { photoCount: evaluation.photoCount }
      : {}),
    ...createPlatformPhotoFileIdFields(evaluation.photoFiles),
  };
}

function createPlatformCargoPhotoFileIdFields(
  cargoPhotoFiles:
    | DraftOrderInput['cargoPhotoFiles']
    | RecentOrder['cargoPhotoFiles'],
) {
  const cargoPhotoFileIds = normalizeUploadedAttachmentFileIds(cargoPhotoFiles);

  return cargoPhotoFileIds.length > 0 ? { cargoPhotoFileIds } : {};
}

function createPlatformPhotoFileIdFields(
  photoFiles:
    | NonNullable<RecentOrder['exceptionReport']>['photoFiles']
    | NonNullable<RecentOrder['evaluation']>['photoFiles'],
) {
  const photoFileIds = normalizeUploadedAttachmentFileIds(photoFiles);

  return photoFileIds.length > 0 ? { photoFileIds } : {};
}

function normalizeUploadedAttachmentFileIds(
  files:
    | DraftOrderInput['cargoPhotoFiles']
    | RecentOrder['cargoPhotoFiles']
    | NonNullable<RecentOrder['exceptionReport']>['photoFiles']
    | NonNullable<RecentOrder['evaluation']>['photoFiles'],
) {
  return Array.from(
    new Set(
      (files ?? [])
        .filter(file => file.status === 'uploaded')
        .map(file => file.fileId.trim())
        .filter(Boolean),
    ),
  );
}

function parseMoneyCents(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/^[+-]?[￥¥]/, '').replace(/,/g, '');
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return Math.round(Math.abs(amount) * 100);
}

function optionalText(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function getPlatformCargoTypeId(cargoTypeText: string) {
  return (
    cargoTypeOptions.find(option => option.label === cargoTypeText)?.id ??
    cargoTypeText
  );
}

function getPlatformVehicleRequirementId(vehicleRequirementText: string) {
  return (
    vehicleRequirementOptions.find(
      option => option.label === vehicleRequirementText,
    )?.id ?? vehicleRequirementText
  );
}

function createPlatformOrderListQuery(
  filter: OrderListFilter,
): PlatformListShipperOrdersQuery {
  const baseQuery = {
    page: 1,
    pageSize: 20,
  };

  if (
    filter === 'waiting' ||
    filter === 'confirming' ||
    filter === 'completed' ||
    filter === 'cancelled'
  ) {
    return {
      ...baseQuery,
      status: filter,
    };
  }

  if (filter === 'active') {
    return {
      ...baseQuery,
      statuses: ['loading', 'transporting'],
    };
  }

  return baseQuery;
}

function normalizePlatformOrderListQuery(
  query: PlatformListShipperOrdersQuery,
): PlatformListShipperOrdersQuery {
  return {
    ...query,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

function mergeRecentOrdersById(
  currentOrders: RecentOrder[],
  nextPageOrders: RecentOrder[],
) {
  const mergedOrders = [...currentOrders];
  const existingOrderIds = new Set(currentOrders.map(order => order.id));

  nextPageOrders.forEach(order => {
    if (!existingOrderIds.has(order.id)) {
      mergedOrders.push(order);
      existingOrderIds.add(order.id);
    }
  });

  return mergedOrders;
}

function shouldKeepLocalCreateOrderInPlatformList(
  order: RecentOrder,
) {
  return (
    !order.platformOrderId &&
    order.syncState?.operation === 'create' &&
    order.syncState.status !== 'synced'
  );
}

function findLocalOrderForPlatformOrder(
  currentOrders: RecentOrder[],
  platformOrder: RecentOrder,
) {
  return currentOrders.find(
    currentOrder =>
      (platformOrder.platformOrderId &&
        currentOrder.platformOrderId === platformOrder.platformOrderId) ||
      currentOrder.id === platformOrder.id,
  );
}

function shouldUsePlatformDraft(
  platformUpdatedAtIso: string,
  localUpdatedAtIso?: string,
) {
  if (!localUpdatedAtIso) {
    return true;
  }

  return Date.parse(platformUpdatedAtIso) > Date.parse(localUpdatedAtIso);
}

function getPlatformDraftBaseUpdatedAtIso(syncState?: DraftSyncState) {
  return syncState?.platformUpdatedAtIso ??
    (syncState?.status === 'synced' ? syncState.updatedAtIso : undefined);
}

function areDraftPrefillsEqual(
  left: DraftOrderPrefill,
  right: DraftOrderPrefill,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlatformOrderAdvanceStatus(
  status: RecentOrder['status'],
): status is 'loading' | 'transporting' | 'confirming' {
  return (
    status === 'loading' ||
    status === 'transporting' ||
    status === 'confirming'
  );
}

function isOrderDraftConflictError(error: unknown) {
  return (
    error instanceof PlatformApiError &&
    error.code === orderDraftConflictErrorCode
  );
}

function isAuthAccessTokenMissingError(error: unknown) {
  return (
    error instanceof PlatformApiError &&
    error.code === authAccessTokenMissingErrorCode
  );
}

function createDraftPrefillFromPlatformDraft(
  draftSnapshot: Record<string, unknown>,
): DraftOrderPrefill {
  return draftSnapshot as DraftOrderPrefill;
}

export default App;

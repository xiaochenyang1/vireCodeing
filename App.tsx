import { StatusBar, useColorScheme } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { fallbackSafeAreaMetrics } from './src/data/mockData';
import type {
  DraftOrderInput,
  DraftOrderPrefill,
  HomeSupportView,
  MessageCenterItem,
  OrderCreateIdempotencyContext,
  OrderMutationContext,
  OrderDetailReturnTarget,
  OrderListFilter,
  OrderSyncOperation,
  RecentOrder,
} from './src/types';
import {
  createFailedOrderSyncState,
  createLocalOrder,
  createOrderUpdateFromDraft,
  createPendingOrderSyncState,
  createPrefillFromOrder,
  createSyncedOrderSyncState,
} from './src/utils/order';
import {
  createFailedOrderMutationSyncState,
  createOrderCreateContext,
  createOrderMutationContext,
  getOrderCreateFailureAction,
  getOrderMutationFailureAction,
  getOrderMutationRetryContext,
} from './src/utils/orderMutationSync';
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
  saveAppRuntimeStateDurably,
} from './src/utils/appRuntimeState';
import { hydrateHomeLocalState } from './src/utils/homeLocalState';
import { useAppNavigation } from './src/navigation/appNavigation';
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
  type PlatformListShipperOrdersQuery,
  type PlatformShipperOrder,
} from './src/services/platformOrderApi';
import { createPlatformOrderDraftApi } from './src/services/platformOrderDraftApi';
import { createPlatformProfileApi } from './src/services/platformProfileApi';
import { createPlatformFrequentRoutesApi } from './src/services/platformFrequentRoutesApi';
import { createPlatformDriverOrderApi } from './src/services/platformDriverOrderApi';
import { createPlatformDriverCertificationApi } from './src/services/platformDriverCertificationApi';
import { createPlatformFileApi } from './src/services/platformFileApi';
import {
  createPlatformPaymentApi,
  type PlatformPaymentSdk,
} from './src/services/platformPaymentApi';
import { createPlatformMapsApi } from './src/services/platformMapsApi';
import { createPlatformMessagesApi } from './src/services/platformMessagesApi';
import { mapPlatformInboxMessagesToLocal } from './src/utils/platformMessages';
import { mapPlatformOrderToRecentOrder } from './src/services/platformOrderMapper';
import { PlatformApiError } from './src/services/platformApiClient';
import { resolvePlatformApiBaseUrl } from './src/services/platformRuntimeConfig';
import type { PlatformMobileUserType } from './src/services/platformAuthApi';
import {
  createPlatformChangeRequest,
  createPlatformCreateOrderRequest,
  createPlatformCreateOrderRequestFromRecentOrder,
  createPlatformEvaluationRequest,
  createPlatformExceptionReportRequest,
  optionalText,
} from './src/utils/platformOrderRequest';
import {
  createPlatformOrderListQuery,
  findLocalOrderForPlatformOrder,
  isPlatformOrderAdvanceStatus,
  isPlatformOrderMutationOperation,
  mergeRecentOrdersById,
  normalizePlatformOrderListQuery,
  shouldKeepLocalCreateOrderInPlatformList,
  type PlatformOrderMutationOperation,
} from './src/utils/platformOrderList';
import {
  areDraftPrefillsEqual,
  createDraftPrefillFromPlatformDraft,
  getPlatformDraftBaseUpdatedAtIso,
  isAuthAccessTokenMissingError,
  isOrderDraftConflictError,
  shouldUsePlatformDraft,
} from './src/utils/platformSyncGuards';
import { resumePendingPlatformPayment } from './src/utils/payment';

type AppProps = {
  now?: number;
  platformApiBaseUrl?: string;
  paymentSdk?: PlatformPaymentSdk;
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

function createPlatformOrderCreateFailure(
  error: unknown,
  createContext: OrderCreateIdempotencyContext,
  now: number,
  fallbackMessage: string,
) {
  const failureAction = getOrderCreateFailureAction(error);

  if (failureAction === 'retry') {
    return {
      shouldRefresh: false,
      syncState: createFailedOrderSyncState(
        fallbackMessage,
        'create',
        now,
        { createContext },
      ),
    };
  }

  const message =
    failureAction === 'contract-error'
      ? '平台创建接口返回契约异常（ORDER_CONFLICT），已停止自动重试并保留本地订单。'
      : error instanceof PlatformApiError &&
          error.code === 'IDEMPOTENCY_KEY_REUSED'
        ? '平台发布凭证与原请求不一致，已刷新平台订单；自动重试已停止，请确认后重新发布。'
        : '平台发布凭证已过期，已刷新平台订单；自动重试已停止，请确认后重新发布。';

  return {
    shouldRefresh: failureAction === 'refresh',
    syncState: createFailedOrderSyncState(message, 'create', now, {
      createContext,
      retryBlocked: true,
    }),
  };
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

function App({
  now = Date.now(),
  platformApiBaseUrl,
  paymentSdk,
}: AppProps = {}) {
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
  const platformPaymentApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformPaymentApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformMapsApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformMapsApi({
            baseUrl: resolvedPlatformApiBaseUrl,
            getAccessToken: () => getAuthSessionSnapshot()?.accessToken,
          })
        : undefined,
    [resolvedPlatformApiBaseUrl],
  );
  const platformMessagesApi = useMemo(
    () =>
      resolvedPlatformApiBaseUrl
        ? createPlatformMessagesApi({
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
  const [authenticatedUser, setAuthenticatedUser] =
    useState<PlatformAuthenticatedUser>();
  const {
    screen,
    orderListFilter: initialOrderFilter,
    orderDetailReturnTarget,
    homeSupportView: homeInitialSupportView,
    reset: resetScreen,
    goAuth,
    goDriverHome,
    goHome: navigateHome,
    goNetworkError,
    goOrderDraft,
    goOrders,
    goOrderDetail,
  } = useAppNavigation();
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [messages, setMessages] = useState<MessageCenterItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
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
          setAuthenticatedUser(currentUser);
          syncPlatformAuthenticatedProfile(currentUser);
        } catch (error) {
          if (shouldClearAuthSessionAfterStartupPlatformAuthError(error)) {
            clearAuthSession();
          }
        }
      }

      if (platformPaymentApi && getAuthSessionSnapshot()?.accessToken) {
        try {
          await resumePendingPlatformPayment({ api: platformPaymentApi });
        } catch {
          // Keep the pending record so the next cold start or manual refresh can retry.
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
      resetScreen(
        isAuthSessionSaved
          ? startupUserType === 'driver'
            ? 'driver-home'
            : 'home'
          : isOnboardingCompleted
            ? 'auth'
            : 'onboarding',
      );
      setIsHydrated(true);
      if (
        isAuthSessionSaved &&
        startupUserType !== 'driver' &&
        platformMessagesApi &&
        getAuthSessionSnapshot()?.accessToken
      ) {
        platformMessagesApi
          .listMessages({ page: 1, pageSize: 50 })
          .then(result => {
            if (cancelled) {
              return;
            }
            const nextMessages = mapPlatformInboxMessagesToLocal(
              result.items,
              new Date(nowRef.current),
            );
            setMessages(nextMessages);
            saveAppRuntimeState({
              ...getAppRuntimeState(),
              messages: nextMessages,
            });
          })
          .catch(() => undefined);
      }
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
        resetScreen(hasSavedAuthSession(now) ? 'home' : 'onboarding');
        setIsHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    now,
    platformAuthApi,
    platformMessagesApi,
    platformPaymentApi,
    resetScreen,
    syncPlatformAuthenticatedProfile,
  ]);

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

  const refreshPlatformMessages = useCallback(() => {
    if (!platformMessagesApi || !getAuthSessionSnapshot()?.accessToken) {
      return;
    }

    platformMessagesApi
      .listMessages({ page: 1, pageSize: 50 })
      .then(result => {
        const nextMessages = mapPlatformInboxMessagesToLocal(
          result.items,
          new Date(nowRef.current),
        );
        setMessages(nextMessages);
        saveAppRuntimeState({
          ...getAppRuntimeState(),
          messages: nextMessages,
        });
      })
      .catch(() => undefined);
  }, [platformMessagesApi]);

  const openHome = (supportView: HomeSupportView = 'home') => {
    navigateHome(supportView);
    if (supportView === 'home' || supportView === 'messages') {
      refreshPlatformMessages();
    }
  };

  const applyPlatformOrderSnapshot = (
    orderId: string,
    platformOrder: PlatformShipperOrder,
    overrides: Partial<RecentOrder> = {},
    syncStateOverride?: RecentOrder['syncState'],
  ) => {
    const platformRecentOrder = mapPlatformOrderToRecentOrder(platformOrder);

    setOrders(currentOrders => {
      const nextOrders = currentOrders.map(currentOrder =>
        currentOrder.id === orderId
          ? {
              ...mergePlatformOrderWithLocalRuntimeState(
                platformRecentOrder,
                currentOrder,
              ),
              ...overrides,
              ...(syncStateOverride ? { syncState: syncStateOverride } : {}),
            }
          : currentOrder,
      );
      persistRuntimeState({ nextOrders });
      return nextOrders;
    });
    setSelectedOrderId(currentSelectedOrderId =>
      currentSelectedOrderId === orderId
        ? platformRecentOrder.id
        : currentSelectedOrderId,
    );

    return platformRecentOrder;
  };

  const refreshPlatformOrderAfterMutationFailure = async (
    orderId: string,
    platformOrderId: string,
    successMessage: string,
    failureMessage: string,
  ) => {
    if (!platformOrderApi) {
      updateOrder(orderId, {
        syncState: createFailedOrderSyncState(
          failureMessage,
          'refresh',
          nowRef.current,
        ),
      });
      return;
    }

    try {
      const latestPlatformOrder = await platformOrderApi.getOrder(platformOrderId);

      applyPlatformOrderSnapshot(
        orderId,
        latestPlatformOrder,
        {},
        createSyncedOrderSyncState(successMessage, 'refresh', nowRef.current),
      );
    } catch {
      updateOrder(orderId, {
        syncState: createFailedOrderSyncState(
          failureMessage,
          'refresh',
          nowRef.current,
        ),
      });
    }
  };

  const handlePlatformOrderMutationFailure = async ({
    error,
    order,
    operation,
    message,
    mutationContext,
    changes,
  }: {
    error: unknown;
    order: RecentOrder;
    operation: PlatformOrderMutationOperation;
    message: string;
    mutationContext: OrderMutationContext;
    changes?: Partial<RecentOrder>;
  }) => {
    const failureAction = getOrderMutationFailureAction(error);

    if (
      failureAction === 'refresh' &&
      order.platformOrderId
    ) {
      await refreshPlatformOrderAfterMutationFailure(
        order.id,
        order.platformOrderId,
        '平台订单已被其他操作更新，已刷新最新详情，请重新发起操作。',
        '平台订单已被其他操作更新，刷新最新详情失败，请重试刷新后重新发起操作。',
      );
      return;
    }

    if (
      failureAction === 'reinitiate' &&
      order.platformOrderId
    ) {
      await refreshPlatformOrderAfterMutationFailure(
        order.id,
        order.platformOrderId,
        '当前重试凭证已失效，已刷新最新详情，请重新发起操作。',
        '当前重试凭证已失效，刷新最新详情失败，请重试刷新后重新发起操作。',
      );
      return;
    }

    updateOrder(order.id, {
      ...(changes ?? {}),
      syncState: createFailedOrderMutationSyncState(
        message,
        operation,
        mutationContext,
        nowRef.current,
      ),
    });
  };

  const handleAuthenticated = (
    tokens?: PlatformAuthTokens,
    user?: PlatformAuthenticatedUser,
  ) => {
    saveAuthSession(now, tokens);
    setAuthenticatedUser(user);
    syncPlatformAuthenticatedProfile(user);
    const nextUserType = user?.userType ?? 'shipper';
    if (nextUserType === 'driver') {
      goDriverHome();
      return;
    }

    openHome();
    refreshPlatformMessages();
  };

  const handleOnboardingFinished = () => {
    saveOnboardingCompleted(now);
    goAuth();
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
    setAuthenticatedUser(undefined);
    setNetworkNotice('');
    goAuth();
  };

  const openNetworkError = () => {
    setNetworkNotice('');
    goNetworkError();
  };

  const retryNetworkCheck = () => {
    setNetworkNotice('网络已恢复到本地演示状态，本地 API 重试队列已清空');
    openHome();
  };

  const openOrderDetail = (
    orderId: string,
    returnTarget: OrderDetailReturnTarget = 'home',
  ) => {
    const matchedOrder = orders.find(
      order => order.id === orderId || order.platformOrderId === orderId,
    );
    const resolvedOrderId = matchedOrder?.id ?? orderId;
    setSelectedOrderId(resolvedOrderId);
    goOrderDetail(returnTarget);
    refreshPlatformOrderDetail(resolvedOrderId);
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
    goOrders('all');
    refreshPlatformOrders({ page: 1, pageSize: 20 });
  };

  const openOrdersWithFilter = (filter: OrderListFilter) => {
    goOrders(filter);
    refreshPlatformOrders(createPlatformOrderListQuery(filter));
  };

  const canOpenOrderDraft = () => {
    const notice = getIdentityPublishGateNotice(
      getProfileLocalState().identityVerification,
    );

    if (notice) {
      setDraftGateNotice(notice);
      navigateHome();
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
      goOrderDraft();
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
      goOrderDraft();
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
          goOrderDraft();
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
          goOrderDraft();
          return;
        }

        setDraftConflictPlatformPrefill(undefined);
        setDraftConflictNoticeText('');
        setDraftPrefill(savedDraft);
        goOrderDraft();
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
        goOrderDraft();
      });
  };

  const openDraftWithPrefill = (prefill?: DraftOrderPrefill) => {
    if (!canOpenOrderDraft()) {
      return;
    }

    setDraftConflictPlatformPrefill(undefined);
    setDraftConflictNoticeText('');
    setDraftPrefill(prefill);
    goOrderDraft();
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
    goOrderDraft();
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
      goOrders();
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
      const mutationContext =
        previousOrder?.platformOrderId
          ? createOrderMutationContext(
              previousOrder.updatedAtIso ?? previousOrder.createdAtIso,
            )
          : undefined;
      const localOrderChanges = createOrderUpdateFromDraft(
        draftOrder,
        now,
        mutationContext ? { mutationContext } : undefined,
      );

      if (
        previousOrder &&
        platformOrderApi &&
        getAuthSessionSnapshot()?.accessToken &&
        previousOrder.platformOrderId &&
        mutationContext
      ) {
        const editedLocalOrder = {
          ...previousOrder,
          ...localOrderChanges,
        };

        try {
          const platformOrder = await platformOrderApi.updateOrder(
            previousOrder.platformOrderId,
            {
              ...createPlatformCreateOrderRequest(draftOrder, editedLocalOrder),
              baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
            },
            mutationContext.idempotencyKey,
          );
          const updatedOrder = applyPlatformOrderSnapshot(
            editingOrderId,
            platformOrder,
          );
          syncLocalCouponUsage(draftOrder, updatedOrder.id, previousOrder.couponId);
          removeSavedDraft();
          setDraftConflictPlatformPrefill(undefined);
          setDraftPrefill(undefined);
          setSelectedOrderId(updatedOrder.id);
          goOrderDetail('home');
          return;
        } catch (error) {
          const failureAction = getOrderMutationFailureAction(error);

          await handlePlatformOrderMutationFailure({
            error,
            order: previousOrder,
            operation: 'update',
            message: '平台订单修改失败，已保留本地修改记录。',
            mutationContext,
            changes: localOrderChanges,
          });

          if (failureAction === 'retry') {
            syncLocalCouponUsage(
              draftOrder,
              editingOrderId,
              previousOrder.couponId,
            );
          }
          removeSavedDraft();
          setDraftConflictPlatformPrefill(undefined);
          setDraftPrefill(undefined);
          setSelectedOrderId(editingOrderId);
          goOrderDetail('home');
          return;
        }
      }

      if (
        previousOrder &&
        platformOrderApi &&
        previousOrder.platformOrderId &&
        !getAuthSessionSnapshot()?.accessToken &&
        mutationContext
      ) {
        updateOrder(editingOrderId, {
          ...localOrderChanges,
          syncState: createFailedOrderMutationSyncState(
            '平台订单修改需要重新登录后再同步。',
            'update',
            mutationContext,
            nowRef.current,
          ),
        });
        syncLocalCouponUsage(draftOrder, editingOrderId, previousOrder.couponId);
        removeSavedDraft();
        setDraftConflictPlatformPrefill(undefined);
        setDraftPrefill(undefined);
        setSelectedOrderId(editingOrderId);
        goOrderDetail('home');
        return;
      }

      updateOrder(editingOrderId, localOrderChanges);
      syncLocalCouponUsage(draftOrder, editingOrderId, previousOrder?.couponId);
      removeSavedDraft();
      setDraftConflictPlatformPrefill(undefined);
      setDraftPrefill(undefined);
      setSelectedOrderId(editingOrderId);
      goOrderDetail('home');
      return;
    }

    const createContext = createOrderCreateContext();
    const localOrder = createLocalOrder(draftOrder, orders, now, {
      createContext,
    });
    const hasPlatformAccessToken = Boolean(
      getAuthSessionSnapshot()?.accessToken,
    );
    const pendingOrder =
      platformOrderApi && !hasPlatformAccessToken
        ? {
            ...localOrder,
            syncState: createFailedOrderSyncState(
              '平台订单发布需要重新登录后再同步。',
              'create',
              nowRef.current,
              { createContext },
            ),
          }
        : localOrder;
    const durableOrders = [pendingOrder, ...orders];

    setOrders(durableOrders);
    syncLocalCouponUsage(draftOrder, pendingOrder.id);
    removeSavedDraft();
    setDraftConflictPlatformPrefill(undefined);
    setDraftPrefill(undefined);
    setSelectedOrderId(pendingOrder.id);
    goOrderDetail('home');

    try {
      await saveAppRuntimeStateDurably({
        orders: durableOrders,
        messages,
      });
    } catch {
      const failedOrder = {
        ...pendingOrder,
        syncState: createFailedOrderSyncState(
          '本地订单安全保存失败，未发送平台发布请求。',
          'create',
          nowRef.current,
          { createContext },
        ),
      };
      const failedOrders = [failedOrder, ...orders];

      setOrders(failedOrders);
      saveAppRuntimeState({ orders: failedOrders, messages });
      return;
    }

    let order = pendingOrder;
    let shouldRefreshAfterCreateFailure = false;

    if (platformOrderApi && hasPlatformAccessToken) {
      try {
        const platformOrder = await platformOrderApi.createOrder(
          createPlatformCreateOrderRequest(draftOrder, localOrder),
          createContext.idempotencyKey,
        );

        order = mergePlatformOrderWithLocalRuntimeState(
          mapPlatformOrderToRecentOrder(platformOrder),
          localOrder,
        );
      } catch (error) {
        const failure = createPlatformOrderCreateFailure(
          error,
          createContext,
          nowRef.current,
          '平台订单接口不可用，已保留本地待同步订单。',
        );

        shouldRefreshAfterCreateFailure = failure.shouldRefresh;
        order = {
          ...localOrder,
          syncState: failure.syncState,
        };
      }

      setOrders(currentOrders => {
        const nextOrders = currentOrders.map(currentOrder =>
          currentOrder.id === localOrder.id ? order : currentOrder,
        );
        persistRuntimeState({ nextOrders });
        return nextOrders;
      });
      if (order.id !== localOrder.id) {
        syncLocalCouponUsage(draftOrder, order.id);
        setSelectedOrderId(currentSelectedOrderId =>
          currentSelectedOrderId === localOrder.id
            ? order.id
            : currentSelectedOrderId,
        );
      }
      if (shouldRefreshAfterCreateFailure) {
        refreshPlatformOrders({ page: 1, pageSize: 20 });
      }
    }
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

    const retryOperation = order.syncState?.operation;
    const retryCreateContext: OrderCreateIdempotencyContext | undefined =
      retryOperation === 'create' ? order.syncState?.createContext : undefined;
    const retryMutationContext =
      order.platformOrderId && isPlatformOrderMutationOperation(retryOperation)
        ? getOrderMutationRetryContext(order)
        : undefined;

    if (retryOperation === 'create' && order.syncState?.retryBlocked) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      updateOrder(order.id, {
        syncState:
          retryMutationContext && retryOperation
            ? createFailedOrderMutationSyncState(
                '平台订单重试需要重新登录后再同步。',
                retryOperation,
                retryMutationContext,
                nowRef.current,
              )
            : retryOperation === 'create' && retryCreateContext
              ? createFailedOrderSyncState(
                  '平台订单重试需要重新登录后再同步。',
                  'create',
                  nowRef.current,
                  { createContext: retryCreateContext },
                )
            : createFailedOrderSyncState(
                '平台订单重试需要重新登录后再同步。',
                retryOperation ?? 'local',
                nowRef.current,
              ),
      });
      return;
    }

    if (retryOperation === 'create' && !retryCreateContext) {
      updateOrder(order.id, {
        syncState: createFailedOrderSyncState(
          '旧创建记录缺少安全重试凭证，已刷新平台订单，请人工确认后作为新订单发布。',
          'create',
          nowRef.current,
          { retryBlocked: true },
        ),
      });
      refreshPlatformOrders({ page: 1, pageSize: 20 });
      return;
    }

    if (order.syncState?.operation === 'refresh' && order.platformOrderId) {
      platformOrderApi
        .getOrder(order.platformOrderId)
        .then(platformOrder => {
          applyPlatformOrderSnapshot(order.id, platformOrder);
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

    if (
      order.syncState?.operation === 'update' &&
      order.platformOrderId &&
      retryMutationContext
    ) {
      platformOrderApi
        .updateOrder(
          order.platformOrderId,
          {
            ...createPlatformCreateOrderRequestFromRecentOrder(order),
            baseUpdatedAtIso: retryMutationContext.baseUpdatedAtIso,
          },
          retryMutationContext.idempotencyKey,
        )
        .then(platformOrder => {
          applyPlatformOrderSnapshot(order.id, platformOrder);
        })
        .catch(error => {
          handlePlatformOrderMutationFailure({
            error,
            order,
            operation: 'update',
            message: '平台订单修改重试失败，已继续保留本地修改记录。',
            mutationContext: retryMutationContext,
          }).catch(() => undefined);
        });
      return;
    }

    if (
      order.syncState?.operation === 'cancel' &&
      order.platformOrderId &&
      order.cancellation &&
      retryMutationContext
    ) {
      platformOrderApi
        .cancelOrder(
          order.platformOrderId,
          {
            reasonText: order.cancellation.reasonText,
            description: optionalText(order.cancellation.description),
            baseUpdatedAtIso: retryMutationContext.baseUpdatedAtIso,
          },
          retryMutationContext.idempotencyKey,
        )
        .then(platformOrder => {
          applyPlatformOrderSnapshot(order.id, platformOrder, {
            cancellation: order.cancellation,
          });
        })
        .catch(error => {
          handlePlatformOrderMutationFailure({
            error,
            order,
            operation: 'cancel',
            message: '平台订单取消重试失败，已继续保留本地取消记录。',
            mutationContext: retryMutationContext,
          }).catch(() => undefined);
        });
      return;
    }

    if (
      order.syncState?.operation === 'complete' &&
      order.platformOrderId &&
      retryMutationContext
    ) {
      platformOrderApi
        .completeOrder(
          order.platformOrderId,
          {
            baseUpdatedAtIso: retryMutationContext.baseUpdatedAtIso,
          },
          retryMutationContext.idempotencyKey,
        )
        .then(platformOrder => {
          applyPlatformOrderSnapshot(order.id, platformOrder);
        })
        .catch(error => {
          handlePlatformOrderMutationFailure({
            error,
            order,
            operation: 'complete',
            message: '平台订单确认送达重试失败，已继续保留本地完成记录。',
            mutationContext: retryMutationContext,
          }).catch(() => undefined);
        });
      return;
    }

    if (
      order.syncState?.operation === 'status' &&
      order.platformOrderId &&
      isPlatformOrderAdvanceStatus(order.status) &&
      retryMutationContext
    ) {
      platformOrderApi
        .advanceOrderStatus(
          order.platformOrderId,
          {
            baseUpdatedAtIso: retryMutationContext.baseUpdatedAtIso,
            nextStatus: order.status,
          },
          retryMutationContext.idempotencyKey,
        )
        .then(platformOrder => {
          applyPlatformOrderSnapshot(order.id, platformOrder);
        })
        .catch(error => {
          handlePlatformOrderMutationFailure({
            error,
            order,
            operation: 'status',
            message: '平台订单状态推进重试失败，已继续保留本地状态变更。',
            mutationContext: retryMutationContext,
          }).catch(() => undefined);
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

    if (retryOperation !== 'create' || !retryCreateContext) {
      updateOrder(order.id, {
        syncState: createFailedOrderSyncState(
          '当前同步记录不支持自动创建重试，请重新发起操作。',
          retryOperation ?? 'local',
          nowRef.current,
        ),
      });
      return;
    }

    platformOrderApi
      .createOrder(
        createPlatformCreateOrderRequestFromRecentOrder(order),
        retryCreateContext.idempotencyKey,
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
      .catch(error => {
        const failure = createPlatformOrderCreateFailure(
          error,
          retryCreateContext,
          nowRef.current,
          '平台订单同步重试失败，已继续保留本地待同步订单。',
        );

        updateOrder(order.id, {
          syncState: failure.syncState,
        });
        if (failure.shouldRefresh) {
          refreshPlatformOrders({ page: 1, pageSize: 20 });
        }
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
    mutationContext?: OrderMutationContext,
  ) => {
    updateOrder(order.id, {
      ...changes,
      syncState:
        mutationContext && isPlatformOrderMutationOperation(operation)
          ? createFailedOrderMutationSyncState(
              `平台订单${actionText}需要重新登录后再同步。`,
              operation,
              mutationContext,
              nowRef.current,
            )
          : createFailedOrderSyncState(
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
    const mutationContext = createOrderMutationContext(
      order.updatedAtIso ?? order.createdAtIso,
    );

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localStatusChanges,
        'status',
        '状态推进',
        mutationContext,
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
      .advanceOrderStatus(
        order.platformOrderId,
        {
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
          nextStatus: progressAction.nextStatus,
        },
        mutationContext.idempotencyKey,
      )
      .then(platformOrder => {
        applyPlatformOrderSnapshot(order.id, platformOrder);
      })
      .catch(error => {
        handlePlatformOrderMutationFailure({
          error,
          order,
          operation: 'status',
          message: '平台订单状态推进失败，已保留本地状态变更。',
          mutationContext,
          changes: localStatusChanges,
        }).catch(() => undefined);
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
    const mutationContext = createOrderMutationContext(
      order.updatedAtIso ?? order.createdAtIso,
    );

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localCancellationChanges,
        'cancel',
        '取消',
        mutationContext,
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
      .cancelOrder(
        order.platformOrderId,
        {
          reasonText: cancellation.reasonText,
          description: optionalText(cancellation.description),
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
        },
        mutationContext.idempotencyKey,
      )
      .then(platformOrder => {
        applyPlatformOrderSnapshot(order.id, platformOrder, {
          cancellation,
        });
      })
      .catch(error => {
        handlePlatformOrderMutationFailure({
          error,
          order,
          operation: 'cancel',
          message: '平台订单取消失败，已保留本地取消记录。',
          mutationContext,
          changes: localCancellationChanges,
        }).catch(() => undefined);
      });
  };

  const completeOrderFromDetail = (order: RecentOrder) => {
    const localCompletionChanges: Partial<RecentOrder> = {
      status: 'completed',
      updatedAtText: '订单已完成 · 刚刚',
      updatedAtIso: new Date(nowRef.current).toISOString(),
    };
    const mutationContext = createOrderMutationContext(
      order.updatedAtIso ?? order.createdAtIso,
    );

    if (isPlatformOrderActionMissingAuth(order)) {
      keepPlatformOrderActionQueuedUntilLogin(
        order,
        localCompletionChanges,
        'complete',
        '确认送达',
        mutationContext,
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
      .completeOrder(
        order.platformOrderId,
        {
          baseUpdatedAtIso: mutationContext.baseUpdatedAtIso,
        },
        mutationContext.idempotencyKey,
      )
      .then(platformOrder => {
        applyPlatformOrderSnapshot(order.id, platformOrder);
      })
      .catch(error => {
        handlePlatformOrderMutationFailure({
          error,
          order,
          operation: 'complete',
          message: '平台订单确认送达失败，已保留本地完成记录。',
          mutationContext,
          changes: localCompletionChanges,
        }).catch(() => undefined);
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

    if (platformMessagesApi && getAuthSessionSnapshot()?.accessToken) {
      platformMessagesApi.markMessageRead(messageId).catch(() => undefined);
    }
  };

  const markAllMessagesRead = () => {
    if (!messages.some(message => message.unread)) {
      return;
    }

    setMessages(currentMessages => {
      const nextMessages = currentMessages.map(message =>
        message.unread ? { ...message, unread: false } : message,
      );
      persistRuntimeState({ nextMessages });
      return nextMessages;
    });

    if (platformMessagesApi && getAuthSessionSnapshot()?.accessToken) {
      platformMessagesApi.markAllMessagesRead().catch(() => undefined);
    }
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
            platformMapsApi={platformMapsApi}
            driverAccountId={authenticatedUser?.id}
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
            platformOrderApi={platformOrderApi}
            platformPaymentApi={platformPaymentApi}
            platformMapsApi={platformMapsApi}
            platformPaymentSdk={paymentSdk}
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
            onMarkAllMessagesRead={markAllMessagesRead}
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

export default App;

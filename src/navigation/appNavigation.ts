import { useCallback, useReducer } from 'react';

import type {
  HomeSupportView,
  OrderDetailReturnTarget,
  OrderListFilter,
  RootScreen,
} from '../types';

/**
 * 顶层导航状态机。
 *
 * 之前 App.tsx 用散落的 `setScreen`/`setInitialOrderFilter`/
 * `setOrderDetailReturnTarget`/`setHomeInitialSupportView` 直接切屏，转场规则
 * 埋在各处回调里。这里把这 4 个纯导航状态收敛成一个纯 reducer + 语义化转场，
 * 既可单测，也为将来替换成 React Navigation 留出清晰的迁移边界。
 *
 * 注意：selectedOrderId 与订单数据流（临时 id → 平台 id 的重映射）耦合较深，
 * 仍留在 App 里，不进本状态机。
 */
export type AppNavigationState = {
  screen: RootScreen;
  orderListFilter: OrderListFilter;
  orderDetailReturnTarget: OrderDetailReturnTarget;
  homeSupportView: HomeSupportView;
};

export type AppNavigationAction =
  | { type: 'RESET'; screen: RootScreen }
  | { type: 'GO_ONBOARDING' }
  | { type: 'GO_AUTH' }
  | { type: 'GO_DRIVER_HOME' }
  | { type: 'GO_HOME'; supportView?: HomeSupportView }
  | { type: 'GO_NETWORK_ERROR' }
  | { type: 'GO_ORDER_DRAFT' }
  | { type: 'GO_ORDERS'; filter?: OrderListFilter }
  | { type: 'GO_ORDER_DETAIL'; returnTarget: OrderDetailReturnTarget };

export const initialAppNavigationState: AppNavigationState = {
  screen: 'auth',
  orderListFilter: 'all',
  orderDetailReturnTarget: 'home',
  homeSupportView: 'home',
};

export function appNavigationReducer(
  state: AppNavigationState,
  action: AppNavigationAction,
): AppNavigationState {
  switch (action.type) {
    case 'RESET':
      return { ...state, screen: action.screen };
    case 'GO_ONBOARDING':
      return { ...state, screen: 'onboarding' };
    case 'GO_AUTH':
      // 退出登录/引导完成回到认证页时，一并复位客服视图。
      return { ...state, screen: 'auth', homeSupportView: 'home' };
    case 'GO_DRIVER_HOME':
      return { ...state, screen: 'driver-home' };
    case 'GO_HOME':
      return {
        ...state,
        screen: 'home',
        homeSupportView: action.supportView ?? 'home',
      };
    case 'GO_NETWORK_ERROR':
      return { ...state, screen: 'network-error' };
    case 'GO_ORDER_DRAFT':
      return { ...state, screen: 'order-draft' };
    case 'GO_ORDERS':
      return {
        ...state,
        screen: 'orders',
        // 无 filter（例如从订单详情返回列表）时保留当前筛选。
        orderListFilter: action.filter ?? state.orderListFilter,
      };
    case 'GO_ORDER_DETAIL':
      return {
        ...state,
        screen: 'order-detail',
        orderDetailReturnTarget: action.returnTarget,
        homeSupportView:
          action.returnTarget === 'messages'
            ? 'messages'
            : action.returnTarget === 'home'
              ? 'home'
              : state.homeSupportView,
      };
    default:
      return state;
  }
}

export function useAppNavigation() {
  const [state, dispatch] = useReducer(
    appNavigationReducer,
    initialAppNavigationState,
  );

  const reset = useCallback(
    (screen: RootScreen) => dispatch({ type: 'RESET', screen }),
    [],
  );
  const goOnboarding = useCallback(
    () => dispatch({ type: 'GO_ONBOARDING' }),
    [],
  );
  const goAuth = useCallback(() => dispatch({ type: 'GO_AUTH' }), []);
  const goDriverHome = useCallback(
    () => dispatch({ type: 'GO_DRIVER_HOME' }),
    [],
  );
  const goHome = useCallback(
    (supportView?: HomeSupportView) =>
      dispatch({ type: 'GO_HOME', supportView }),
    [],
  );
  const goNetworkError = useCallback(
    () => dispatch({ type: 'GO_NETWORK_ERROR' }),
    [],
  );
  const goOrderDraft = useCallback(
    () => dispatch({ type: 'GO_ORDER_DRAFT' }),
    [],
  );
  const goOrders = useCallback(
    (filter?: OrderListFilter) => dispatch({ type: 'GO_ORDERS', filter }),
    [],
  );
  const goOrderDetail = useCallback(
    (returnTarget: OrderDetailReturnTarget = 'home') =>
      dispatch({ type: 'GO_ORDER_DETAIL', returnTarget }),
    [],
  );

  return {
    screen: state.screen,
    orderListFilter: state.orderListFilter,
    orderDetailReturnTarget: state.orderDetailReturnTarget,
    homeSupportView: state.homeSupportView,
    reset,
    goOnboarding,
    goAuth,
    goDriverHome,
    goHome,
    goNetworkError,
    goOrderDraft,
    goOrders,
    goOrderDetail,
  };
}

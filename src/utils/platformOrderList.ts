import type { OrderListFilter, OrderSyncOperation, RecentOrder } from '../types';
import type { PlatformListShipperOrdersQuery } from '../services/platformOrderApi';

/**
 * 平台订单列表相关的纯 helper 与状态谓词。
 *
 * 原先散落在 App.tsx 底部，负责把本地筛选映射成平台列表查询、分页合并去重、
 * 判断订单当前的同步操作类型等。抽出来便于独立单测，App.tsx 只留状态编排。
 */

export function createPlatformOrderListQuery(
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

export function normalizePlatformOrderListQuery(
  query: PlatformListShipperOrdersQuery,
): PlatformListShipperOrdersQuery {
  return {
    ...query,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

export function mergeRecentOrdersById(
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

export function shouldKeepLocalCreateOrderInPlatformList(order: RecentOrder) {
  return (
    !order.platformOrderId &&
    order.syncState?.operation === 'create' &&
    order.syncState.status !== 'synced'
  );
}

export function findLocalOrderForPlatformOrder(
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

export function isPlatformOrderAdvanceStatus(
  status: RecentOrder['status'],
): status is 'loading' | 'transporting' | 'confirming' {
  return (
    status === 'loading' ||
    status === 'transporting' ||
    status === 'confirming'
  );
}

export type PlatformOrderMutationOperation = Extract<
  OrderSyncOperation,
  'update' | 'cancel' | 'complete' | 'status' | 'acceptQuote'
>;

export function isPlatformOrderMutationOperation(
  operation: OrderSyncOperation | undefined,
): operation is PlatformOrderMutationOperation {
  return (
    operation === 'update' ||
    operation === 'cancel' ||
    operation === 'complete' ||
    operation === 'status' ||
    operation === 'acceptQuote'
  );
}

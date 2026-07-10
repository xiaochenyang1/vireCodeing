import type { FrequentRoute } from '../types';
import {
  createPendingHomeSyncState,
  type HomeSyncState,
} from './homeLocalState';

export type FrequentRouteDraft = Omit<
  FrequentRoute,
  'id' | 'lastUsedText' | 'lastUsedIso'
>;

export type FrequentRouteChange = {
  routes: FrequentRoute[];
  syncState: HomeSyncState;
};

export function createLocalFrequentRoute(
  routes: FrequentRoute[],
  route: FrequentRouteDraft,
  now = Date.now(),
): FrequentRoute {
  return {
    ...route,
    id: createNextLocalRouteId(routes),
    lastUsedText: '刚刚添加',
    lastUsedIso: new Date(now).toISOString(),
  };
}

export function updateFrequentRoute(
  routes: FrequentRoute[],
  routeId: string,
  routeUpdates: FrequentRouteDraft,
) {
  return routes.map(route =>
    route.id === routeId ? { ...route, ...routeUpdates } : route,
  );
}

export function moveFrequentRoute(
  routes: FrequentRoute[],
  routeId: string,
  direction: 'up' | 'down',
) {
  const routeIndex = routes.findIndex(route => route.id === routeId);
  const nextIndex = direction === 'up' ? routeIndex - 1 : routeIndex + 1;

  if (routeIndex < 0 || nextIndex < 0 || nextIndex >= routes.length) {
    return routes;
  }

  const reorderedRoutes = [...routes];
  [reorderedRoutes[routeIndex], reorderedRoutes[nextIndex]] = [
    reorderedRoutes[nextIndex],
    reorderedRoutes[routeIndex],
  ];

  return reorderedRoutes;
}

export function deleteFrequentRoute(routes: FrequentRoute[], routeId: string) {
  return routes.filter(route => route.id !== routeId);
}

export function createAddFrequentRouteChange(
  routes: FrequentRoute[],
  route: FrequentRouteDraft,
  now = Date.now(),
): FrequentRouteChange {
  return {
    routes: [...routes, createLocalFrequentRoute(routes, route, now)],
    syncState: createPendingHomeSyncState(undefined, now),
  };
}

export function createUpdateFrequentRouteChange(
  routes: FrequentRoute[],
  routeId: string,
  routeUpdates: FrequentRouteDraft,
  now = Date.now(),
): FrequentRouteChange {
  return {
    routes: updateFrequentRoute(routes, routeId, routeUpdates),
    syncState: createPendingHomeSyncState(undefined, now),
  };
}

export function createMoveFrequentRouteChange(
  routes: FrequentRoute[],
  routeId: string,
  direction: 'up' | 'down',
  now = Date.now(),
): FrequentRouteChange | undefined {
  const reorderedRoutes = moveFrequentRoute(routes, routeId, direction);

  if (reorderedRoutes === routes) {
    return undefined;
  }

  return {
    routes: reorderedRoutes,
    syncState: createPendingHomeSyncState(undefined, now),
  };
}

export function createDeleteFrequentRouteChange(
  routes: FrequentRoute[],
  routeId: string,
  now = Date.now(),
): FrequentRouteChange {
  return {
    routes: deleteFrequentRoute(routes, routeId),
    syncState: createPendingHomeSyncState(undefined, now),
  };
}

function createNextLocalRouteId(routes: FrequentRoute[]) {
  const localIndexes = routes
    .map(route => route.id.match(/^route-local-(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(value => Number(value));
  const nextIndexFromLocalIds =
    localIndexes.length > 0 ? Math.max(...localIndexes) + 1 : 1;
  const nextIndex = Math.max(routes.length + 1, nextIndexFromLocalIds);

  return `route-local-${nextIndex}`;
}

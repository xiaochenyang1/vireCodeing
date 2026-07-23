import { frequentRoutes, shipperSummary } from '../data/mockData';
import type { FrequentRoute, SupportTicket } from '../types';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const HOME_LOCAL_STATE_VERSION = 1;
const HOME_LOCAL_STATE_STORAGE_KEY = '@vireCodeing/home-local-state';

type HomeLocalStateSnapshot = {
  version: number;
  state: HomeLocalState;
};

export type HomeLocalState = {
  selectedCity: string;
  routes: FrequentRoute[];
  supportTickets: SupportTicket[];
  syncState?: HomeSyncState;
};

export type HomeSyncStatus = 'pending' | 'synced' | 'failed';

export type HomeSyncQueueItem = {
  id: string;
  titleText: string;
  statusText: string;
  updatedAtText: string;
  updatedAtIso?: string;
  noteText: string;
};

export type HomeRouteConflictFieldKey = 'name' | 'from' | 'to';

export type HomeRouteConflictFieldItem = {
  id: string;
  routeId: string;
  fieldKey: HomeRouteConflictFieldKey;
  fieldLabel: string;
  localValue: string;
  platformValue: string;
};

export type HomeSyncState = {
  status: HomeSyncStatus;
  message: string;
  updatedAtText: string;
  updatedAtIso?: string;
  platformUpdatedAtIso?: string;
  platformRouteIds?: string[];
  conflictSummaryText?: string;
  conflictRouteItems?: FrequentRoute[];
  conflictRouteFieldItems?: HomeRouteConflictFieldItem[];
  conflictDeletedRouteItems?: FrequentRoute[];
  queueItems?: HomeSyncQueueItem[];
};

let homeLocalStateSnapshot: HomeLocalStateSnapshot | undefined;

function createDefaultHomeLocalState(): HomeLocalState {
  return {
    selectedCity: shipperSummary.city,
    routes: cloneData(frequentRoutes),
    supportTickets: [],
    syncState: createSyncedHomeSyncState(
      '本地常用路线已初始化，等待平台常用路线同步。',
    ),
  };
}

export function createPendingHomeSyncState(
  message = '常用路线已在本地更新，等待平台常用路线同步。',
  now = Date.now(),
): HomeSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'pending',
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      createHomeSyncQueueItem(
        '待同步',
        '常用路线已保留在本地，待平台常用路线同步。',
        updatedAtIso,
      ),
    ],
  };
}

export function createSyncedHomeSyncState(
  message = '本地常用路线已记录，等待平台常用路线同步。',
  now = Date.now(),
): HomeSyncState {
  return {
    status: 'synced',
    message,
    updatedAtText: '刚刚',
    updatedAtIso: new Date(now).toISOString(),
    queueItems: [],
  };
}

export function createFailedHomeSyncState(
  message = '常用路线同步失败，等待本地重试。',
  now = Date.now(),
): HomeSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'failed',
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      createHomeSyncQueueItem(
        '同步失败',
        '常用路线同步未完成，已保留本地常用路线队列。',
        updatedAtIso,
      ),
    ],
  };
}

function createHomeSyncQueueItem(
  statusText: string,
  noteText: string,
  updatedAtIso: string,
): HomeSyncQueueItem {
  return {
    id: 'route-local-change',
    titleText: '常用路线变更',
    statusText,
    updatedAtText: '刚刚',
    updatedAtIso,
    noteText,
  };
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneHomeLocalState(state: HomeLocalState): HomeLocalState {
  const defaultState = createDefaultHomeLocalState();

  return {
    selectedCity: state.selectedCity,
    routes: cloneData(state.routes),
    supportTickets: cloneData(state.supportTickets ?? []),
    syncState: cloneData(state.syncState ?? defaultState.syncState),
  };
}

function isValidSnapshot(
  snapshot: HomeLocalStateSnapshot | undefined,
): snapshot is HomeLocalStateSnapshot {
  return (
    Boolean(snapshot) &&
    snapshot?.version === HOME_LOCAL_STATE_VERSION &&
    typeof snapshot.state?.selectedCity === 'string' &&
    Array.isArray(snapshot.state?.routes)
  );
}

export async function hydrateHomeLocalState() {
  const storedSnapshot = await readJsonStorage<HomeLocalStateSnapshot>(
    HOME_LOCAL_STATE_STORAGE_KEY,
  );

  if (!isValidSnapshot(storedSnapshot)) {
    homeLocalStateSnapshot = {
      version: HOME_LOCAL_STATE_VERSION,
      state: createDefaultHomeLocalState(),
    };
    await removeStorageItem(HOME_LOCAL_STATE_STORAGE_KEY);
    return;
  }

  homeLocalStateSnapshot = {
    version: storedSnapshot.version,
    state: cloneHomeLocalState(storedSnapshot.state),
  };
}

export function getHomeLocalState() {
  if (!isValidSnapshot(homeLocalStateSnapshot)) {
    homeLocalStateSnapshot = {
      version: HOME_LOCAL_STATE_VERSION,
      state: createDefaultHomeLocalState(),
    };
  }

  return cloneHomeLocalState(homeLocalStateSnapshot.state);
}

export function saveHomeLocalState(state: HomeLocalState) {
  homeLocalStateSnapshot = {
    version: HOME_LOCAL_STATE_VERSION,
    state: cloneHomeLocalState(state),
  };
  fireAndForget(
    writeJsonStorage(HOME_LOCAL_STATE_STORAGE_KEY, homeLocalStateSnapshot),
  );
}

export function clearHomeLocalState() {
  homeLocalStateSnapshot = undefined;
  fireAndForget(removeStorageItem(HOME_LOCAL_STATE_STORAGE_KEY));
}

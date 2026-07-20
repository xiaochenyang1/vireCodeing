import { messageCenterItems, orderListOrders } from '../data/mockData';
import type { MessageCenterItem, RecentOrder } from '../types';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const APP_RUNTIME_STATE_VERSION = 1;
const APP_RUNTIME_STATE_STORAGE_KEY = '@vireCodeing/app-runtime-state';

type AppRuntimeStateSnapshot = {
  version: number;
  state: AppRuntimeState;
};

export type AppRuntimeState = {
  orders: RecentOrder[];
  messages: MessageCenterItem[];
};

let appRuntimeStateSnapshot: AppRuntimeStateSnapshot | undefined;

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultAppRuntimeState(): AppRuntimeState {
  return {
    orders: cloneData(orderListOrders),
    messages: cloneData(messageCenterItems),
  };
}

function isValidSnapshot(
  snapshot: AppRuntimeStateSnapshot | undefined,
): snapshot is AppRuntimeStateSnapshot {
  return (
    Boolean(snapshot) &&
    snapshot?.version === APP_RUNTIME_STATE_VERSION &&
    Array.isArray(snapshot.state?.orders) &&
    Array.isArray(snapshot.state?.messages)
  );
}

export async function hydrateAppRuntimeState() {
  const storedSnapshot = await readJsonStorage<AppRuntimeStateSnapshot>(
    APP_RUNTIME_STATE_STORAGE_KEY,
  );

  if (!isValidSnapshot(storedSnapshot)) {
    appRuntimeStateSnapshot = {
      version: APP_RUNTIME_STATE_VERSION,
      state: createDefaultAppRuntimeState(),
    };
    await removeStorageItem(APP_RUNTIME_STATE_STORAGE_KEY);
    return;
  }

  appRuntimeStateSnapshot = {
    version: storedSnapshot.version,
    state: cloneData(storedSnapshot.state),
  };
}

export function getAppRuntimeState() {
  if (!isValidSnapshot(appRuntimeStateSnapshot)) {
    appRuntimeStateSnapshot = {
      version: APP_RUNTIME_STATE_VERSION,
      state: createDefaultAppRuntimeState(),
    };
  }

  return cloneData(appRuntimeStateSnapshot.state);
}

export function saveAppRuntimeState(state: AppRuntimeState) {
  appRuntimeStateSnapshot = createAppRuntimeStateSnapshot(state);
  fireAndForget(
    writeJsonStorage(APP_RUNTIME_STATE_STORAGE_KEY, appRuntimeStateSnapshot),
  );
}

export async function saveAppRuntimeStateDurably(state: AppRuntimeState) {
  appRuntimeStateSnapshot = createAppRuntimeStateSnapshot(state);
  await writeJsonStorage(APP_RUNTIME_STATE_STORAGE_KEY, appRuntimeStateSnapshot);
}

function createAppRuntimeStateSnapshot(
  state: AppRuntimeState,
): AppRuntimeStateSnapshot {
  return {
    version: APP_RUNTIME_STATE_VERSION,
    state: cloneData(state),
  };
}

export function clearAppRuntimeState() {
  appRuntimeStateSnapshot = undefined;
  fireAndForget(removeStorageItem(APP_RUNTIME_STATE_STORAGE_KEY));
}

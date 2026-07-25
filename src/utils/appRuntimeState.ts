import { messageCenterItems, orderListOrders } from '../data/mockData';
import type { MessageCenterItem, RecentOrder } from '../types';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';
import { sortMessageCenterItems } from './platformMessages';

const APP_RUNTIME_STATE_VERSION = 1;
const APP_RUNTIME_STATE_STORAGE_KEY = '@vireCodeing/app-runtime-state';

type AppRuntimeStateSnapshot = {
  version: number;
  state: AppRuntimeState;
};

export type AppRuntimeState = {
  orders: RecentOrder[];
  messages: MessageCenterItem[];
  messageUnreadCount: number;
};

let appRuntimeStateSnapshot: AppRuntimeStateSnapshot | undefined;
const localMessageDefaultsById = new Map(
  messageCenterItems.map(item => [item.id, item]),
);

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultAppRuntimeState(): AppRuntimeState {
  const messages = normalizeMessages(cloneData(messageCenterItems));

  return {
    orders: cloneData(orderListOrders),
    messages,
    messageUnreadCount: countUnreadMessages(messages),
  };
}

function isValidSnapshot(
  snapshot: AppRuntimeStateSnapshot | undefined,
): snapshot is AppRuntimeStateSnapshot {
  return (
    Boolean(snapshot) &&
    snapshot?.version === APP_RUNTIME_STATE_VERSION &&
    Array.isArray(snapshot.state?.orders) &&
    Array.isArray(snapshot.state?.messages) &&
    (snapshot.state?.messageUnreadCount === undefined ||
      (Number.isInteger(snapshot.state.messageUnreadCount) &&
        snapshot.state.messageUnreadCount >= 0))
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
    state: normalizeAppRuntimeState(storedSnapshot.state),
  };
}

export function getAppRuntimeState() {
  if (!isValidSnapshot(appRuntimeStateSnapshot)) {
    appRuntimeStateSnapshot = {
      version: APP_RUNTIME_STATE_VERSION,
      state: createDefaultAppRuntimeState(),
    };
  }

  return normalizeAppRuntimeState(appRuntimeStateSnapshot.state);
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
    state: normalizeAppRuntimeState(state),
  };
}

export function clearAppRuntimeState() {
  appRuntimeStateSnapshot = undefined;
  fireAndForget(removeStorageItem(APP_RUNTIME_STATE_STORAGE_KEY));
}

function normalizeAppRuntimeState(
  state: Pick<AppRuntimeState, 'orders' | 'messages'> &
    Partial<Pick<AppRuntimeState, 'messageUnreadCount'>>,
) {
  const messages = normalizeMessages(state.messages);

  return cloneData({
    orders: state.orders,
    messages,
    messageUnreadCount:
      typeof state.messageUnreadCount === 'number' &&
      Number.isInteger(state.messageUnreadCount) &&
      state.messageUnreadCount >= 0
        ? state.messageUnreadCount
        : countUnreadMessages(messages),
  });
}

function countUnreadMessages(messages: MessageCenterItem[]) {
  return messages.filter(message => message.unread).length;
}

function normalizeMessages(messages: MessageCenterItem[]) {
  return sortMessageCenterItems(
    messages.map(message => {
      const localDefault = localMessageDefaultsById.get(message.id);

      if (!localDefault) {
        return message;
      }

      return {
        ...message,
        createdAtIso: message.createdAtIso ?? localDefault.createdAtIso,
        updatedAtIso: message.updatedAtIso ?? localDefault.updatedAtIso,
      };
    }),
  );
}

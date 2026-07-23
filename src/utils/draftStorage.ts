import type { DraftOrderPrefill } from '../types';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const DRAFT_STORAGE_VERSION = 1;
const DRAFT_STORAGE_KEY = '@vireCodeing/draft-storage';
const DRAFT_EXPIRES_IN_MS = 24 * 60 * 60 * 1000;

export type DraftSyncStatus = 'pending' | 'synced' | 'failed';

export type DraftSyncQueueItem = {
  id: string;
  titleText: string;
  statusText: string;
  updatedAtText: string;
  updatedAtIso?: string;
  noteText: string;
};

export type DraftSyncState = {
  status: DraftSyncStatus;
  message: string;
  updatedAtText: string;
  updatedAtIso?: string;
  platformUpdatedAtIso?: string;
  queueItems?: DraftSyncQueueItem[];
};

type DraftStorageSnapshot = {
  version: number;
  savedAt: number;
  draft: DraftOrderPrefill;
  syncState?: DraftSyncState;
};

let storedDraftSnapshot: DraftStorageSnapshot | undefined;

export function createPendingDraftSyncState(
  message = '草稿已在本地更新，等待平台草稿同步。',
  now = Date.now(),
  platformUpdatedAtIso?: string,
): DraftSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'pending',
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    platformUpdatedAtIso,
    queueItems: [
      createDraftSyncQueueItem(
        '待同步',
        '草稿已保留在本地，待平台草稿同步。',
        updatedAtIso,
      ),
    ],
  };
}

export function createSyncedDraftSyncState(
  message = '本地草稿已记录，等待平台草稿同步。',
  now = Date.now(),
): DraftSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'synced',
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    platformUpdatedAtIso: updatedAtIso,
    queueItems: [],
  };
}

export function createFailedDraftSyncState(
  message = '草稿同步失败，等待本地重试。',
  now = Date.now(),
  platformUpdatedAtIso?: string,
): DraftSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'failed',
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    platformUpdatedAtIso,
    queueItems: [
      createDraftSyncQueueItem(
        '同步失败',
        '草稿同步未完成，已保留本地草稿队列。',
        updatedAtIso,
      ),
    ],
  };
}

function createDraftSyncQueueItem(
  statusText: string,
  noteText: string,
  updatedAtIso: string,
): DraftSyncQueueItem {
  return {
    id: 'draft-local-change',
    titleText: '发单草稿变更',
    statusText,
    updatedAtText: '刚刚',
    updatedAtIso,
    noteText,
  };
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDraft(draft: DraftOrderPrefill): DraftOrderPrefill {
  return cloneData(draft);
}

function cloneSnapshot(snapshot: DraftStorageSnapshot): DraftStorageSnapshot {
  return {
    version: snapshot.version,
    savedAt: snapshot.savedAt,
    draft: cloneDraft(snapshot.draft),
    syncState: cloneData(snapshot.syncState ?? createSyncedDraftSyncState()),
  };
}

function isValidSnapshot(
  snapshot: DraftStorageSnapshot | undefined,
): snapshot is DraftStorageSnapshot {
  return (
    Boolean(snapshot) &&
    snapshot?.version === DRAFT_STORAGE_VERSION &&
    typeof snapshot.savedAt === 'number' &&
    Boolean(snapshot.draft) &&
    typeof snapshot.draft === 'object'
  );
}

function isExpiredSnapshot(snapshot: DraftStorageSnapshot, now: number) {
  return now - snapshot.savedAt > DRAFT_EXPIRES_IN_MS;
}

function clearStoredDraftSnapshot() {
  storedDraftSnapshot = undefined;
  return removeStorageItem(DRAFT_STORAGE_KEY);
}

export async function hydrateDraftStorage(now = Date.now()) {
  const storedSnapshot = await readJsonStorage<DraftStorageSnapshot>(
    DRAFT_STORAGE_KEY,
  );

  if (
    !isValidSnapshot(storedSnapshot) ||
    isExpiredSnapshot(storedSnapshot, now)
  ) {
    await clearStoredDraftSnapshot();
    return;
  }

  storedDraftSnapshot = cloneSnapshot(storedSnapshot);
}

export function getSavedDraft(now = Date.now()) {
  if (
    !isValidSnapshot(storedDraftSnapshot) ||
    isExpiredSnapshot(storedDraftSnapshot, now)
  ) {
    fireAndForget(clearStoredDraftSnapshot());
    return undefined;
  }

  return cloneDraft(storedDraftSnapshot.draft);
}

export function saveDraft(
  draft: DraftOrderPrefill,
  now = Date.now(),
  syncState: DraftSyncState = createPendingDraftSyncState(
    undefined,
    now,
    getKnownPlatformDraftUpdatedAtIso(storedDraftSnapshot?.syncState),
  ),
) {
  storedDraftSnapshot = {
    version: DRAFT_STORAGE_VERSION,
    savedAt: now,
    draft: cloneDraft(draft),
    syncState: cloneData(syncState),
  };
  fireAndForget(writeJsonStorage(DRAFT_STORAGE_KEY, storedDraftSnapshot));
  return cloneSnapshot(storedDraftSnapshot);
}

export function clearSavedDraft() {
  storedDraftSnapshot = undefined;
  fireAndForget(removeStorageItem(DRAFT_STORAGE_KEY));
}

export function markSavedDraftSynced(
  syncState?: DraftSyncState,
  now = Date.now(),
) {
  if (!isValidSnapshot(storedDraftSnapshot)) {
    return undefined;
  }

  const nextSyncState = syncState ?? createSyncedDraftSyncState(undefined, now);

  storedDraftSnapshot = {
    ...storedDraftSnapshot,
    syncState: cloneData(nextSyncState),
  };
  fireAndForget(writeJsonStorage(DRAFT_STORAGE_KEY, storedDraftSnapshot));

  return cloneSnapshot(storedDraftSnapshot);
}

export function markSavedDraftFailed(
  syncState?: DraftSyncState,
  now = Date.now(),
) {
  if (!isValidSnapshot(storedDraftSnapshot)) {
    return undefined;
  }

  const nextSyncState = syncState ?? createFailedDraftSyncState(undefined, now);

  storedDraftSnapshot = {
    ...storedDraftSnapshot,
    syncState: cloneData(nextSyncState),
  };
  fireAndForget(writeJsonStorage(DRAFT_STORAGE_KEY, storedDraftSnapshot));

  return cloneSnapshot(storedDraftSnapshot);
}

export function rememberSavedDraftPlatformUpdatedAtIso(
  platformUpdatedAtIso: string,
) {
  if (!isValidSnapshot(storedDraftSnapshot)) {
    return undefined;
  }

  const currentSyncState =
    storedDraftSnapshot.syncState ?? createPendingDraftSyncState();

  storedDraftSnapshot = {
    ...storedDraftSnapshot,
    syncState: {
      ...cloneData(currentSyncState),
      platformUpdatedAtIso,
    },
  };
  fireAndForget(writeJsonStorage(DRAFT_STORAGE_KEY, storedDraftSnapshot));

  return cloneSnapshot(storedDraftSnapshot);
}

export function getDraftStorageSnapshot() {
  return isValidSnapshot(storedDraftSnapshot)
    ? cloneSnapshot(storedDraftSnapshot)
    : undefined;
}

export function replaceDraftStorageSnapshotForTest(
  snapshot: DraftStorageSnapshot,
) {
  storedDraftSnapshot = cloneSnapshot(snapshot);
}

function getKnownPlatformDraftUpdatedAtIso(syncState?: DraftSyncState) {
  return syncState?.platformUpdatedAtIso ??
    (syncState?.status === 'synced' ? syncState.updatedAtIso : undefined);
}

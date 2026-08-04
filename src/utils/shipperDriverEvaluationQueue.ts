import type { PlatformSubmitShipperOrderEvaluationRequest } from '../services/platformOrderApi';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const QUEUE_VERSION = 1;
const LEGACY_STORAGE_KEY = '@vireCodeing/shipper-driver-evaluation-queue';
const STORAGE_KEY_PREFIX = LEGACY_STORAGE_KEY;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storageTails = new Map<string, Promise<void>>();

export type ShipperDriverEvaluationQueueItem = {
  shipperAccountId: string;
  idempotencyKey: string;
  localOrderId: string;
  platformOrderId: string;
  orderNo: string;
  request: PlatformSubmitShipperOrderEvaluationRequest;
};

export type ShipperDriverEvaluationQueue = Record<
  string,
  ShipperDriverEvaluationQueueItem
>;

export function areShipperDriverEvaluationRequestsEqual(
  left: PlatformSubmitShipperOrderEvaluationRequest | undefined,
  right: PlatformSubmitShipperOrderEvaluationRequest | undefined,
) {
  return (
    left !== undefined &&
    right !== undefined &&
    left.rating === right.rating &&
    left.content === right.content &&
    (left.anonymous ?? false) === (right.anonymous ?? false) &&
    left.photoCount === right.photoCount &&
    areStringArraysEqual(left.tags, right.tags) &&
    areStringArraysEqual(left.photoFileIds ?? [], right.photoFileIds ?? [])
  );
}

export function omitShipperDriverEvaluationQueueItem(
  queue: ShipperDriverEvaluationQueue,
  expectedItem: ShipperDriverEvaluationQueueItem,
) {
  const currentItem = queue[expectedItem.localOrderId];

  if (
    !currentItem ||
    currentItem.shipperAccountId !== expectedItem.shipperAccountId ||
    currentItem.idempotencyKey !== expectedItem.idempotencyKey ||
    currentItem.localOrderId !== expectedItem.localOrderId ||
    currentItem.platformOrderId !== expectedItem.platformOrderId ||
    currentItem.orderNo !== expectedItem.orderNo ||
    !areShipperDriverEvaluationRequestsEqual(
      currentItem.request,
      expectedItem.request,
    )
  ) {
    return queue;
  }

  const nextQueue = { ...queue };
  delete nextQueue[expectedItem.localOrderId];
  return nextQueue;
}

type QueueSnapshot = {
  version: number;
  queue: ShipperDriverEvaluationQueue;
};

export async function hydrateShipperDriverEvaluationQueue(
  shipperAccountId: string,
) {
  const normalizedAccountId = normalizeShipperAccountId(shipperAccountId);
  const storageKey =
    createShipperDriverEvaluationQueueStorageKey(normalizedAccountId);

  return enqueueStorageOperation(storageKey, async () => {
    await removeStorageItem(LEGACY_STORAGE_KEY);
    const snapshot = await readJsonStorage<QueueSnapshot>(storageKey);

    if (!isValidSnapshot(snapshot, normalizedAccountId)) {
      await removeStorageItem(storageKey);
      return {};
    }

    return cloneQueue(snapshot.queue);
  });
}

export function saveShipperDriverEvaluationQueue(
  shipperAccountId: string,
  queue: ShipperDriverEvaluationQueue,
): Promise<void> {
  const normalizedAccountId = normalizeShipperAccountId(shipperAccountId);
  const storageKey =
    createShipperDriverEvaluationQueueStorageKey(normalizedAccountId);

  if (!isValidQueue(queue, normalizedAccountId)) {
    throw new Error('Shipper driver evaluation queue is invalid');
  }

  const snapshot = Object.keys(queue).length
    ? { version: QUEUE_VERSION, queue: cloneQueue(queue) }
    : undefined;

  return enqueueStorageOperation(storageKey, async () => {
    await removeStorageItem(LEGACY_STORAGE_KEY);
    if (!snapshot) {
      await removeStorageItem(storageKey);
      return;
    }
    await writeJsonStorage(storageKey, snapshot);
  });
}

function enqueueStorageOperation<T>(
  storageKey: string,
  operation: () => Promise<T>,
) {
  const previousTail = storageTails.get(storageKey) ?? Promise.resolve();
  const result = previousTail.catch(() => undefined).then(operation);
  const nextTail = result.then(
    () => undefined,
    () => undefined,
  );
  storageTails.set(storageKey, nextTail);
  fireAndForget(
    nextTail.then(() => {
      if (storageTails.get(storageKey) === nextTail) {
        storageTails.delete(storageKey);
      }
    }),
  );
  return result;
}

function isValidSnapshot(
  snapshot: QueueSnapshot | undefined,
  shipperAccountId: string,
): snapshot is QueueSnapshot {
  return (
    snapshot !== undefined &&
    snapshot.version === QUEUE_VERSION &&
    isValidQueue(snapshot.queue, shipperAccountId)
  );
}

function isValidQueue(
  value: unknown,
  shipperAccountId: string,
): value is ShipperDriverEvaluationQueue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        isValidQueueItem(item, shipperAccountId) && key === item.localOrderId,
    )
  );
}

function isValidQueueItem(
  value: unknown,
  shipperAccountId: string,
): value is ShipperDriverEvaluationQueueItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as ShipperDriverEvaluationQueueItem;
  return (
    item.shipperAccountId === shipperAccountId &&
    UUID_V4_PATTERN.test(item.idempotencyKey ?? '') &&
    isNormalizedNonEmptyString(item.localOrderId) &&
    isNormalizedNonEmptyString(item.platformOrderId) &&
    isNormalizedNonEmptyString(item.orderNo) &&
    isValidRequest(item.request)
  );
}

function isValidRequest(
  value: unknown,
): value is PlatformSubmitShipperOrderEvaluationRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as PlatformSubmitShipperOrderEvaluationRequest;
  const photoFileIds = request.photoFileIds;

  return (
    Number.isInteger(request.rating) &&
    request.rating >= 1 &&
    request.rating <= 5 &&
    Array.isArray(request.tags) &&
    request.tags.length >= 1 &&
    request.tags.length <= 6 &&
    request.tags.every(
      tag =>
        isNormalizedNonEmptyString(tag) &&
        tag.length <= 40 &&
        !tag.includes('；'),
    ) &&
    new Set(request.tags).size === request.tags.length &&
    isNormalizedNonEmptyString(request.content) &&
    request.content.length >= 6 &&
    request.content.length <= 200 &&
    (request.anonymous === undefined ||
      typeof request.anonymous === 'boolean') &&
    Number.isInteger(request.photoCount) &&
    request.photoCount! >= 0 &&
    request.photoCount! <= 6 &&
    (photoFileIds === undefined ||
      (Array.isArray(photoFileIds) &&
        photoFileIds.length >= 1 &&
        photoFileIds.length <= 6 &&
        photoFileIds.every(isNormalizedNonEmptyString) &&
        new Set(photoFileIds).size === photoFileIds.length)) &&
    (photoFileIds === undefined || request.photoCount === photoFileIds.length)
  );
}

function createShipperDriverEvaluationQueueStorageKey(accountId: string) {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(
    normalizeShipperAccountId(accountId),
  )}`;
}

function normalizeShipperAccountId(shipperAccountId: string) {
  if (typeof shipperAccountId !== 'string') {
    throw new Error('shipperAccountId is required');
  }
  const normalized = shipperAccountId.trim();
  if (!normalized) {
    throw new Error('shipperAccountId is required');
  }
  return normalized;
}

function isNormalizedNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim() === value && value.length > 0
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function cloneQueue(queue: ShipperDriverEvaluationQueue) {
  return Object.fromEntries(
    Object.entries(queue).map(([key, item]) => [
      key,
      {
        ...item,
        request: {
          ...item.request,
          tags: [...item.request.tags],
          ...(item.request.photoFileIds
            ? { photoFileIds: [...item.request.photoFileIds] }
            : {}),
        },
      },
    ]),
  );
}

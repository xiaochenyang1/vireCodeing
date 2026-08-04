import type { PlatformDriverEvaluateShipperRequest } from '../services/platformDriverOrderApi';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const DRIVER_SHIPPER_EVALUATION_QUEUE_VERSION = 1;
const LEGACY_DRIVER_SHIPPER_EVALUATION_QUEUE_STORAGE_KEY =
  '@vireCodeing/driver-shipper-evaluation-queue';
const DRIVER_SHIPPER_EVALUATION_QUEUE_STORAGE_KEY_PREFIX =
  LEGACY_DRIVER_SHIPPER_EVALUATION_QUEUE_STORAGE_KEY;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const driverShipperEvaluationQueueStorageTails = new Map<
  string,
  Promise<void>
>();

export type DriverShipperEvaluationQueueItem = {
  driverAccountId: string;
  idempotencyKey: string;
  orderId: string;
  orderNo: string;
  request: PlatformDriverEvaluateShipperRequest;
};

export type DriverShipperEvaluationQueue = Record<
  string,
  DriverShipperEvaluationQueueItem
>;

export function areDriverShipperEvaluationRequestsEqual(
  left: PlatformDriverEvaluateShipperRequest | undefined,
  right: PlatformDriverEvaluateShipperRequest | undefined,
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

export function omitDriverShipperEvaluationQueueItem(
  queue: DriverShipperEvaluationQueue,
  expectedItem: DriverShipperEvaluationQueueItem,
) {
  const currentItem = queue[expectedItem.orderId];

  if (
    !currentItem ||
    currentItem.driverAccountId !== expectedItem.driverAccountId ||
    currentItem.idempotencyKey !== expectedItem.idempotencyKey ||
    currentItem.orderId !== expectedItem.orderId ||
    currentItem.orderNo !== expectedItem.orderNo ||
    !areDriverShipperEvaluationRequestsEqual(
      currentItem.request,
      expectedItem.request,
    )
  ) {
    return queue;
  }

  const nextQueue = { ...queue };
  delete nextQueue[expectedItem.orderId];
  return nextQueue;
}

type DriverShipperEvaluationQueueSnapshot = {
  version: number;
  queue: DriverShipperEvaluationQueue;
};

export async function hydrateDriverShipperEvaluationQueue(
  driverAccountId: string,
) {
  const normalizedDriverAccountId = normalizeDriverAccountId(driverAccountId);
  const storageKey = createDriverShipperEvaluationQueueStorageKey(
    normalizedDriverAccountId,
  );

  return enqueueDriverShipperEvaluationQueueStorageOperation(
    storageKey,
    async () => {
      await removeStorageItem(
        LEGACY_DRIVER_SHIPPER_EVALUATION_QUEUE_STORAGE_KEY,
      );
      const storedSnapshot =
        await readJsonStorage<DriverShipperEvaluationQueueSnapshot>(storageKey);

      if (!isValidSnapshot(storedSnapshot, normalizedDriverAccountId)) {
        await removeStorageItem(storageKey);
        return {};
      }

      return cloneQueue(storedSnapshot.queue);
    },
  );
}

export function saveDriverShipperEvaluationQueue(
  driverAccountId: string,
  queue: DriverShipperEvaluationQueue,
): Promise<void> {
  const normalizedDriverAccountId = normalizeDriverAccountId(driverAccountId);
  const storageKey = createDriverShipperEvaluationQueueStorageKey(
    normalizedDriverAccountId,
  );

  if (!isValidQueue(queue, normalizedDriverAccountId)) {
    throw new Error('Driver shipper evaluation queue is invalid');
  }

  const snapshot = Object.keys(queue).length
    ? {
        version: DRIVER_SHIPPER_EVALUATION_QUEUE_VERSION,
        queue: cloneQueue(queue),
      }
    : undefined;

  return enqueueDriverShipperEvaluationQueueStorageOperation(
    storageKey,
    async () => {
      await removeStorageItem(
        LEGACY_DRIVER_SHIPPER_EVALUATION_QUEUE_STORAGE_KEY,
      );

      if (!snapshot) {
        await removeStorageItem(storageKey);
        return;
      }

      await writeJsonStorage(storageKey, snapshot);
    },
  );
}

function enqueueDriverShipperEvaluationQueueStorageOperation<T>(
  storageKey: string,
  operation: () => Promise<T>,
) {
  const previousTail =
    driverShipperEvaluationQueueStorageTails.get(storageKey) ??
    Promise.resolve();
  const result = previousTail.catch(() => undefined).then(operation);
  const nextTail = result.then(
    () => undefined,
    () => undefined,
  );

  driverShipperEvaluationQueueStorageTails.set(storageKey, nextTail);
  fireAndForget(
    nextTail.then(() => {
      if (
        driverShipperEvaluationQueueStorageTails.get(storageKey) === nextTail
      ) {
        driverShipperEvaluationQueueStorageTails.delete(storageKey);
      }
    }),
  );

  return result;
}

function isValidSnapshot(
  snapshot: DriverShipperEvaluationQueueSnapshot | undefined,
  driverAccountId: string,
): snapshot is DriverShipperEvaluationQueueSnapshot {
  return (
    snapshot !== undefined &&
    snapshot.version === DRIVER_SHIPPER_EVALUATION_QUEUE_VERSION &&
    isValidQueue(snapshot.queue, driverAccountId)
  );
}

function isValidQueue(
  value: unknown,
  driverAccountId: string,
): value is DriverShipperEvaluationQueue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        isValidQueueItem(item, driverAccountId) && key === item.orderId,
    )
  );
}

function isValidQueueItem(
  value: unknown,
  driverAccountId: string,
): value is DriverShipperEvaluationQueueItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as DriverShipperEvaluationQueueItem;

  return (
    item.driverAccountId === driverAccountId &&
    UUID_V4_PATTERN.test(item.idempotencyKey ?? '') &&
    isNormalizedNonEmptyString(item.orderId) &&
    isNormalizedNonEmptyString(item.orderNo) &&
    isValidRequest(item.request)
  );
}

function isValidRequest(
  value: unknown,
): value is PlatformDriverEvaluateShipperRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as PlatformDriverEvaluateShipperRequest;
  const tags = request.tags;
  const photoFileIds = request.photoFileIds;

  return (
    Number.isInteger(request.rating) &&
    request.rating >= 1 &&
    request.rating <= 5 &&
    Array.isArray(tags) &&
    tags.length >= 1 &&
    tags.length <= 6 &&
    tags.every(
      tag =>
        isNormalizedNonEmptyString(tag) &&
        tag.length <= 40 &&
        !tag.includes('；'),
    ) &&
    new Set(tags).size === tags.length &&
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
    request.photoCount === (photoFileIds?.length ?? 0)
  );
}

function createDriverShipperEvaluationQueueStorageKey(driverAccountId: string) {
  return `${DRIVER_SHIPPER_EVALUATION_QUEUE_STORAGE_KEY_PREFIX}:${encodeURIComponent(
    normalizeDriverAccountId(driverAccountId),
  )}`;
}

function normalizeDriverAccountId(driverAccountId: string) {
  if (typeof driverAccountId !== 'string') {
    throw new Error('driverAccountId is required');
  }

  const normalizedDriverAccountId = driverAccountId.trim();

  if (!normalizedDriverAccountId) {
    throw new Error('driverAccountId is required');
  }

  return normalizedDriverAccountId;
}

function isNormalizedNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value === value.trim()
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function cloneQueue(queue: DriverShipperEvaluationQueue) {
  return JSON.parse(JSON.stringify(queue)) as DriverShipperEvaluationQueue;
}

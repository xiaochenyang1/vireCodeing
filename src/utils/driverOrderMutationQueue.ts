import type {
  PlatformDriverAcceptOrderRequest,
  PlatformDriverAdvanceOrderStatusRequest,
} from '../services/platformDriverOrderApi';
import type { OrderMutationContext } from '../types';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const DRIVER_ORDER_MUTATION_QUEUE_VERSION = 1;
const DRIVER_ORDER_MUTATION_QUEUE_STORAGE_KEY_PREFIX =
  '@vireCodeing/driver-order-mutation-queue';
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DriverAcceptOrderMutationQueueItem = {
  operation: 'accept';
  driverAccountId: string;
  orderId: string;
  orderNo: string;
  request: PlatformDriverAcceptOrderRequest;
  mutationContext: OrderMutationContext;
};

type DriverAdvanceOrderMutationQueueItem = {
  operation: 'status';
  driverAccountId: string;
  orderId: string;
  orderNo: string;
  request: PlatformDriverAdvanceOrderStatusRequest;
  mutationContext: OrderMutationContext;
};

export type DriverOrderMutationQueueItem =
  | DriverAcceptOrderMutationQueueItem
  | DriverAdvanceOrderMutationQueueItem;

export type DriverOrderMutationQueue = Record<
  string,
  DriverOrderMutationQueueItem
>;

type DriverOrderMutationQueueSnapshot = {
  version: number;
  queue: DriverOrderMutationQueue;
};

export function createDriverOrderMutationQueueKey(
  operation: DriverOrderMutationQueueItem['operation'],
  orderId: string,
) {
  return `${operation}:${orderId}`;
}

export async function hydrateDriverOrderMutationQueue(driverAccountId: string) {
  const normalizedDriverAccountId = normalizeDriverAccountId(driverAccountId);
  const storageKey = createDriverOrderMutationStorageKey(
    normalizedDriverAccountId,
  );
  const storedSnapshot = await readJsonStorage<DriverOrderMutationQueueSnapshot>(
    storageKey,
  );

  if (!isValidSnapshot(storedSnapshot, normalizedDriverAccountId)) {
    await removeStorageItem(storageKey);
    return {};
  }

  return cloneQueue(storedSnapshot.queue);
}

export function saveDriverOrderMutationQueue(
  driverAccountId: string,
  queue: DriverOrderMutationQueue,
) {
  const storageKey = createDriverOrderMutationStorageKey(driverAccountId);

  if (Object.keys(queue).length === 0) {
    fireAndForget(removeStorageItem(storageKey));
    return;
  }

  fireAndForget(
    writeJsonStorage(storageKey, {
      version: DRIVER_ORDER_MUTATION_QUEUE_VERSION,
      queue: cloneQueue(queue),
    }),
  );
}

function isValidSnapshot(
  snapshot: DriverOrderMutationQueueSnapshot | undefined,
  driverAccountId: string,
): snapshot is DriverOrderMutationQueueSnapshot {
  return (
    snapshot !== undefined &&
    snapshot.version === DRIVER_ORDER_MUTATION_QUEUE_VERSION &&
    isValidQueue(snapshot.queue, driverAccountId)
  );
}

function isValidQueue(
  value: unknown,
  driverAccountId: string,
): value is DriverOrderMutationQueue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        isValidQueueItem(item, driverAccountId) &&
        key === createDriverOrderMutationQueueKey(item.operation, item.orderId),
    )
  );
}

function isValidQueueItem(
  value: unknown,
  driverAccountId: string,
): value is DriverOrderMutationQueueItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as DriverOrderMutationQueueItem;
  const request = item.request as Record<string, unknown> | undefined;

  if (
    (item.operation !== 'accept' && item.operation !== 'status') ||
    item.driverAccountId !== driverAccountId ||
    !item.orderId?.trim() ||
    !item.orderNo?.trim() ||
    !UUID_V4_PATTERN.test(item.mutationContext?.idempotencyKey ?? '') ||
    !isIsoDateTime(item.mutationContext?.baseUpdatedAtIso) ||
    !request ||
    request.baseUpdatedAtIso !== item.mutationContext.baseUpdatedAtIso
  ) {
    return false;
  }

  if (item.operation === 'accept') {
    return request.noteText === undefined || typeof request.noteText === 'string';
  }

  return (
    (request.nextStatus === 'transporting' ||
      request.nextStatus === 'confirming') &&
    (request.receiptPhotoFileIds === undefined ||
      (Array.isArray(request.receiptPhotoFileIds) &&
        request.receiptPhotoFileIds.every(fileId =>
          Boolean(typeof fileId === 'string' && fileId.trim()),
        )))
  );
}

function createDriverOrderMutationStorageKey(driverAccountId: string) {
  return `${DRIVER_ORDER_MUTATION_QUEUE_STORAGE_KEY_PREFIX}:${encodeURIComponent(
    normalizeDriverAccountId(driverAccountId),
  )}`;
}

function normalizeDriverAccountId(driverAccountId: string) {
  const normalizedDriverAccountId = driverAccountId.trim();

  if (!normalizedDriverAccountId) {
    throw new Error('driverAccountId is required');
  }

  return normalizedDriverAccountId;
}

function isIsoDateTime(value: unknown) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function cloneQueue(queue: DriverOrderMutationQueue) {
  return JSON.parse(JSON.stringify(queue)) as DriverOrderMutationQueue;
}

import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const DRIVER_EVALUATION_REPLY_QUEUE_VERSION = 3;
const LEGACY_DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY =
  '@vireCodeing/driver-evaluation-reply-queue';
const DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY_PREFIX =
  LEGACY_DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY;
const ISO_DATE_TIME_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const driverEvaluationReplyQueueStorageTails = new Map<string, Promise<void>>();

export type DriverEvaluationReplyQueueItem = {
  driverAccountId: string;
  idempotencyKey: string;
  orderId: string;
  orderNo: string;
  evaluationEventId: string;
  evaluationSubmittedAtIso: string;
  content: string;
};

export type DriverEvaluationReplyQueue = Record<
  string,
  DriverEvaluationReplyQueueItem
>;

type DriverEvaluationReplyQueueSnapshot = {
  version: number;
  queue: DriverEvaluationReplyQueue;
};

export async function hydrateDriverEvaluationReplyQueue(
  driverAccountId: string,
) {
  const normalizedDriverAccountId = normalizeDriverAccountId(driverAccountId);
  const storageKey = createDriverEvaluationReplyQueueStorageKey(
    normalizedDriverAccountId,
  );

  return enqueueDriverEvaluationReplyQueueStorageOperation(
    storageKey,
    async () => {
      await removeStorageItem(LEGACY_DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY);
      const storedSnapshot =
        await readJsonStorage<DriverEvaluationReplyQueueSnapshot>(storageKey);

      if (!isValidSnapshot(storedSnapshot, normalizedDriverAccountId)) {
        await removeStorageItem(storageKey);
        return {};
      }

      return cloneQueue(storedSnapshot.queue);
    },
  );
}

export function saveDriverEvaluationReplyQueue(
  driverAccountId: string,
  queue: DriverEvaluationReplyQueue,
): Promise<void> {
  const normalizedDriverAccountId = normalizeDriverAccountId(driverAccountId);
  const storageKey = createDriverEvaluationReplyQueueStorageKey(
    normalizedDriverAccountId,
  );

  if (!isValidQueue(queue, normalizedDriverAccountId)) {
    throw new Error('Driver evaluation reply queue is invalid');
  }

  const snapshot = Object.keys(queue).length
    ? {
        version: DRIVER_EVALUATION_REPLY_QUEUE_VERSION,
        queue: cloneQueue(queue),
      }
    : undefined;

  return enqueueDriverEvaluationReplyQueueStorageOperation(
    storageKey,
    async () => {
      await removeStorageItem(LEGACY_DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY);

      if (!snapshot) {
        await removeStorageItem(storageKey);
        return;
      }

      await writeJsonStorage(storageKey, snapshot);
    },
  );
}

function enqueueDriverEvaluationReplyQueueStorageOperation<T>(
  storageKey: string,
  operation: () => Promise<T>,
) {
  const previousTail =
    driverEvaluationReplyQueueStorageTails.get(storageKey) ?? Promise.resolve();
  const result = previousTail.catch(() => undefined).then(operation);
  const nextTail = result.then(
    () => undefined,
    () => undefined,
  );

  driverEvaluationReplyQueueStorageTails.set(storageKey, nextTail);
  fireAndForget(
    nextTail.then(() => {
      if (driverEvaluationReplyQueueStorageTails.get(storageKey) === nextTail) {
        driverEvaluationReplyQueueStorageTails.delete(storageKey);
      }
    }),
  );

  return result;
}

function isValidSnapshot(
  snapshot: DriverEvaluationReplyQueueSnapshot | undefined,
  driverAccountId: string,
): snapshot is DriverEvaluationReplyQueueSnapshot {
  return (
    snapshot !== undefined &&
    snapshot.version === DRIVER_EVALUATION_REPLY_QUEUE_VERSION &&
    isValidQueue(snapshot.queue, driverAccountId)
  );
}

function isValidQueue(
  value: unknown,
  driverAccountId: string,
): value is DriverEvaluationReplyQueue {
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
): value is DriverEvaluationReplyQueueItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as DriverEvaluationReplyQueueItem;

  return (
    item.driverAccountId === driverAccountId &&
    UUID_V4_PATTERN.test(item.idempotencyKey ?? '') &&
    isNonEmptyString(item.orderId) &&
    isNonEmptyString(item.orderNo) &&
    isNonEmptyString(item.evaluationEventId) &&
    isIsoDateTime(item.evaluationSubmittedAtIso) &&
    isNonEmptyString(item.content)
  );
}

function createDriverEvaluationReplyQueueStorageKey(driverAccountId: string) {
  return `${DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY_PREFIX}:${encodeURIComponent(
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

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && Boolean(value.trim());
}

function isIsoDateTime(value: unknown) {
  return (
    typeof value === 'string' &&
    ISO_DATE_TIME_WITH_OFFSET_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function cloneQueue(queue: DriverEvaluationReplyQueue) {
  return JSON.parse(JSON.stringify(queue)) as DriverEvaluationReplyQueue;
}

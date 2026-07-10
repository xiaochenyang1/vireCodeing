import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const DRIVER_EVALUATION_REPLY_QUEUE_VERSION = 1;
const DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY =
  '@vireCodeing/driver-evaluation-reply-queue';

export type DriverEvaluationReplyQueueItem = {
  orderId: string;
  orderNo: string;
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

export async function hydrateDriverEvaluationReplyQueue() {
  const storedSnapshot =
    await readJsonStorage<DriverEvaluationReplyQueueSnapshot>(
      DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY,
    );

  if (!isValidSnapshot(storedSnapshot)) {
    await removeStorageItem(DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY);
    return {};
  }

  return cloneQueue(storedSnapshot.queue);
}

export function saveDriverEvaluationReplyQueue(
  queue: DriverEvaluationReplyQueue,
) {
  if (Object.keys(queue).length === 0) {
    fireAndForget(removeStorageItem(DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY));
    return;
  }

  fireAndForget(
    writeJsonStorage(DRIVER_EVALUATION_REPLY_QUEUE_STORAGE_KEY, {
      version: DRIVER_EVALUATION_REPLY_QUEUE_VERSION,
      queue: cloneQueue(queue),
    }),
  );
}

function isValidSnapshot(
  snapshot: DriverEvaluationReplyQueueSnapshot | undefined,
): snapshot is DriverEvaluationReplyQueueSnapshot {
  return (
    snapshot !== undefined &&
    snapshot.version === DRIVER_EVALUATION_REPLY_QUEUE_VERSION &&
    isValidQueue(snapshot.queue)
  );
}

function isValidQueue(value: unknown): value is DriverEvaluationReplyQueue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isValidQueueItem)
  );
}

function isValidQueueItem(
  value: unknown,
): value is DriverEvaluationReplyQueueItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as DriverEvaluationReplyQueueItem).orderId === 'string' &&
    typeof (value as DriverEvaluationReplyQueueItem).orderNo === 'string' &&
    typeof (value as DriverEvaluationReplyQueueItem).content === 'string' &&
    Boolean((value as DriverEvaluationReplyQueueItem).orderId.trim()) &&
    Boolean((value as DriverEvaluationReplyQueueItem).orderNo.trim()) &&
    Boolean((value as DriverEvaluationReplyQueueItem).content.trim())
  );
}

function cloneQueue(queue: DriverEvaluationReplyQueue) {
  return JSON.parse(JSON.stringify(queue)) as DriverEvaluationReplyQueue;
}

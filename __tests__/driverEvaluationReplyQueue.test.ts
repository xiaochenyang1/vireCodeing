import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  hydrateDriverEvaluationReplyQueue,
  saveDriverEvaluationReplyQueue,
  type DriverEvaluationReplyQueue,
  type DriverEvaluationReplyQueueItem,
} from '../src/utils/driverEvaluationReplyQueue';

const legacyStorageKey = '@vireCodeing/driver-evaluation-reply-queue';
const asyncStorageSetItemMock = AsyncStorage.setItem as jest.Mock;
const asyncStorageRemoveItemMock = AsyncStorage.removeItem as jest.Mock;
const originalSetItemImplementation =
  asyncStorageSetItemMock.getMockImplementation();
const originalRemoveItemImplementation =
  asyncStorageRemoveItemMock.getMockImplementation();

describe('driver evaluation reply queue v3 storage', () => {
  beforeEach(async () => {
    asyncStorageSetItemMock.mockImplementation(originalSetItemImplementation);
    asyncStorageRemoveItemMock.mockImplementation(
      originalRemoveItemImplementation,
    );
    await AsyncStorage.clear();
  });

  afterEach(() => {
    asyncStorageSetItemMock.mockImplementation(originalSetItemImplementation);
    asyncStorageRemoveItemMock.mockImplementation(
      originalRemoveItemImplementation,
    );
  });

  it('persists and hydrates the complete evaluation identity for a driver', async () => {
    const queue = createQueue('driver-a', 'order-1');

    await expect(
      saveDriverEvaluationReplyQueue('driver-a', queue),
    ).resolves.toBeUndefined();

    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual(queue);
    await expect(
      AsyncStorage.getItem(createStorageKey('driver-a')),
    ).resolves.toBe(
      JSON.stringify({
        version: 3,
        queue,
      }),
    );
  });

  it('isolates persisted queues by normalized driver account id', async () => {
    const driverAQueue = createQueue('driver-a', 'order-a');
    const driverBQueue = createQueue('driver/b', 'order-b');

    await Promise.all([
      saveDriverEvaluationReplyQueue(' driver-a ', driverAQueue),
      saveDriverEvaluationReplyQueue('driver/b', driverBQueue),
    ]);

    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual(driverAQueue);
    await expect(
      hydrateDriverEvaluationReplyQueue('driver/b'),
    ).resolves.toEqual(driverBQueue);

    await saveDriverEvaluationReplyQueue('driver-a', {});

    await expect(
      AsyncStorage.getItem(createStorageKey('driver-a')),
    ).resolves.toBeNull();
    await expect(
      hydrateDriverEvaluationReplyQueue('driver/b'),
    ).resolves.toEqual(driverBQueue);
  });

  it('clears the unattributable global v1 queue without migrating it', async () => {
    await AsyncStorage.setItem(
      legacyStorageKey,
      JSON.stringify({
        version: 1,
        queue: {
          'order-legacy': {
            orderId: 'order-legacy',
            orderNo: 'HY202607090001',
            content: '旧队列不能猜测司机归属。',
          },
        },
      }),
    );

    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual({});
    await expect(AsyncStorage.getItem(legacyStorageKey)).resolves.toBeNull();
    await expect(
      AsyncStorage.getItem(createStorageKey('driver-a')),
    ).resolves.toBeNull();
  });

  it('clears an account-scoped v2 queue without inventing an idempotency key', async () => {
    const storageKey = createStorageKey('driver-a');
    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        queue: {
          'order-legacy': {
            driverAccountId: 'driver-a',
            orderId: 'order-legacy',
            orderNo: 'HY202607090002',
            evaluationEventId: 'evaluation-order-legacy',
            evaluationSubmittedAtIso: '2026-08-03T08:00:00.000Z',
            content: '旧队列没有可安全恢复的幂等键。',
          },
        },
      }),
    );

    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual({});
    await expect(AsyncStorage.getItem(storageKey)).resolves.toBeNull();
  });

  it.each([
    ['invalid json', '{broken'],
    ['wrong version', JSON.stringify({ version: 1, queue: {} })],
    ['array queue', JSON.stringify({ version: 3, queue: [] })],
    [
      'mismatched queue key',
      createStoredSnapshot('driver-a', 'order-1', {
        queueKey: 'order-other',
      }),
    ],
    ['mismatched driver account', createStoredSnapshot('driver-b', 'order-1')],
    [
      'missing evaluation event id',
      createStoredSnapshot('driver-a', 'order-1', {
        item: { evaluationEventId: '' },
      }),
    ],
    [
      'missing idempotency key',
      createStoredSnapshot('driver-a', 'order-1', {
        item: { idempotencyKey: undefined },
      }),
    ],
    [
      'malformed idempotency key',
      createStoredSnapshot('driver-a', 'order-1', {
        item: { idempotencyKey: 'not-a-uuid' },
      }),
    ],
    [
      'non-v4 idempotency key',
      createStoredSnapshot('driver-a', 'order-1', {
        item: { idempotencyKey: '550e8400-e29b-11d4-a716-446655440000' },
      }),
    ],
    [
      'invalid evaluation timestamp',
      createStoredSnapshot('driver-a', 'order-1', {
        item: { evaluationSubmittedAtIso: 'not-a-date' },
      }),
    ],
    [
      'blank content',
      createStoredSnapshot('driver-a', 'order-1', {
        item: { content: '   ' },
      }),
    ],
  ])('clears damaged account storage: %s', async (_caseName, storedValue) => {
    const storageKey = createStorageKey('driver-a');
    await AsyncStorage.setItem(storageKey, storedValue);

    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual({});
    await expect(AsyncStorage.getItem(storageKey)).resolves.toBeNull();
  });

  it('rejects invalid driver ids and invalid queues before persisting', async () => {
    expect(() => saveDriverEvaluationReplyQueue('   ', {})).toThrow(
      'driverAccountId is required',
    );
    expect(() =>
      saveDriverEvaluationReplyQueue(
        'driver-a',
        createQueue('driver-b', 'order-1'),
      ),
    ).toThrow('Driver evaluation reply queue is invalid');
    expect(() =>
      saveDriverEvaluationReplyQueue('driver-a', {
        'order-1': {
          ...createQueueItem('driver-a', 'order-1'),
          idempotencyKey: '550e8400-e29b-11d4-a716-446655440000',
        },
      }),
    ).toThrow('Driver evaluation reply queue is invalid');
    await expect(hydrateDriverEvaluationReplyQueue('   ')).rejects.toThrow(
      'driverAccountId is required',
    );
    await expect(AsyncStorage.getAllKeys()).resolves.toEqual([]);
  });

  it('serializes a delayed save before a later removal for the same driver', async () => {
    const storageKey = createStorageKey('driver-a');
    const writeStarted = createDeferred<void>();
    const releaseWrite = createDeferred<void>();
    asyncStorageSetItemMock.mockImplementationOnce(async (key, value) => {
      writeStarted.resolve();
      await releaseWrite.promise;
      await originalSetItemImplementation?.(key, value);
    });

    const delayedSave = saveDriverEvaluationReplyQueue(
      'driver-a',
      createQueue('driver-a', 'order-1'),
    );
    await writeStarted.promise;

    const removalCountBefore = (
      AsyncStorage.removeItem as jest.Mock
    ).mock.calls.filter(([key]) => key === storageKey).length;
    const laterRemoval = saveDriverEvaluationReplyQueue('driver-a', {});
    expect(
      (AsyncStorage.removeItem as jest.Mock).mock.calls.filter(
        ([key]) => key === storageKey,
      ),
    ).toHaveLength(removalCountBefore);

    releaseWrite.resolve();
    await Promise.all([delayedSave, laterRemoval]);

    await expect(AsyncStorage.getItem(storageKey)).resolves.toBeNull();
  });

  it('finishes invalid snapshot cleanup before a concurrent save', async () => {
    const storageKey = createStorageKey('driver-a');
    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify({ version: 1, queue: {} }),
    );

    const cleanupStarted = createDeferred<void>();
    const releaseCleanup = createDeferred<void>();
    let shouldDelayCleanup = true;
    asyncStorageRemoveItemMock.mockImplementation(async key => {
      if (key === storageKey && shouldDelayCleanup) {
        shouldDelayCleanup = false;
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }

      await originalRemoveItemImplementation?.(key);
    });
    const setItemCallCountBefore = asyncStorageSetItemMock.mock.calls.length;

    const hydration = hydrateDriverEvaluationReplyQueue('driver-a');
    await cleanupStarted.promise;

    const queue = createQueue('driver-a', 'order-1');
    const concurrentSave = saveDriverEvaluationReplyQueue('driver-a', queue);
    await flushMicrotasks();
    expect(asyncStorageSetItemMock).toHaveBeenCalledTimes(
      setItemCallCountBefore,
    );

    releaseCleanup.resolve();
    await expect(hydration).resolves.toEqual({});
    await expect(concurrentSave).resolves.toBeUndefined();
    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual(queue);
  });

  it('rejects failed writes and continues later operations for that driver', async () => {
    const writeError = new Error('AsyncStorage write failed');
    asyncStorageSetItemMock.mockRejectedValueOnce(writeError);

    await expect(
      saveDriverEvaluationReplyQueue(
        'driver-a',
        createQueue('driver-a', 'order-failed'),
      ),
    ).rejects.toBe(writeError);

    const recoveredQueue = createQueue('driver-a', 'order-recovered');
    await expect(
      saveDriverEvaluationReplyQueue('driver-a', recoveredQueue),
    ).resolves.toBeUndefined();
    await expect(
      hydrateDriverEvaluationReplyQueue('driver-a'),
    ).resolves.toEqual(recoveredQueue);
  });
});

function createQueue(
  driverAccountId: string,
  orderId: string,
): DriverEvaluationReplyQueue {
  return {
    [orderId]: createQueueItem(driverAccountId, orderId),
  };
}

function createQueueItem(
  driverAccountId: string,
  orderId: string,
): DriverEvaluationReplyQueueItem {
  return {
    driverAccountId,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    orderId,
    orderNo: `HY-${orderId}`,
    evaluationEventId: `evaluation-${orderId}`,
    evaluationSubmittedAtIso: '2026-08-03T08:00:00.000Z',
    content: '服务已确认，谢谢认可。',
  };
}

function createStoredSnapshot(
  driverAccountId: string,
  orderId: string,
  options: {
    queueKey?: string;
    item?: Partial<DriverEvaluationReplyQueueItem>;
  } = {},
) {
  const queueKey = options.queueKey ?? orderId;

  return JSON.stringify({
    version: 3,
    queue: {
      [queueKey]: {
        ...createQueueItem(driverAccountId, orderId),
        ...options.item,
      },
    },
  });
}

function createStorageKey(driverAccountId: string) {
  return `${legacyStorageKey}:${encodeURIComponent(driverAccountId.trim())}`;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  areDriverShipperEvaluationRequestsEqual,
  hydrateDriverShipperEvaluationQueue,
  omitDriverShipperEvaluationQueueItem,
  saveDriverShipperEvaluationQueue,
  type DriverShipperEvaluationQueue,
  type DriverShipperEvaluationQueueItem,
} from '../src/utils/driverShipperEvaluationQueue';

const legacyStorageKey = '@vireCodeing/driver-shipper-evaluation-queue';
const asyncStorageSetItemMock = AsyncStorage.setItem as jest.Mock;
const asyncStorageRemoveItemMock = AsyncStorage.removeItem as jest.Mock;
const originalSetItemImplementation =
  asyncStorageSetItemMock.getMockImplementation();
const originalRemoveItemImplementation =
  asyncStorageRemoveItemMock.getMockImplementation();

describe('driver shipper evaluation queue v1 storage', () => {
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

  it('persists the complete normalized request and isolates driver accounts', async () => {
    const driverAQueue = createQueue('driver-a', 'order-a');
    const driverBQueue = createQueue('driver/b', 'order-b');

    await Promise.all([
      saveDriverShipperEvaluationQueue(' driver-a ', driverAQueue),
      saveDriverShipperEvaluationQueue('driver/b', driverBQueue),
    ]);

    await expect(
      hydrateDriverShipperEvaluationQueue('driver-a'),
    ).resolves.toEqual(driverAQueue);
    await expect(
      hydrateDriverShipperEvaluationQueue('driver/b'),
    ).resolves.toEqual(driverBQueue);
    await expect(
      AsyncStorage.getItem(createStorageKey('driver-a')),
    ).resolves.toBe(JSON.stringify({ version: 1, queue: driverAQueue }));

    await saveDriverShipperEvaluationQueue('driver-a', {});

    await expect(
      AsyncStorage.getItem(createStorageKey('driver-a')),
    ).resolves.toBeNull();
    await expect(
      hydrateDriverShipperEvaluationQueue('driver/b'),
    ).resolves.toEqual(driverBQueue);
  });

  it('clears an unattributable global queue instead of migrating it', async () => {
    await AsyncStorage.setItem(
      legacyStorageKey,
      JSON.stringify({ version: 1, queue: createQueue('driver-a', 'order-a') }),
    );

    await expect(
      hydrateDriverShipperEvaluationQueue('driver-a'),
    ).resolves.toEqual({});
    await expect(AsyncStorage.getItem(legacyStorageKey)).resolves.toBeNull();
  });

  it.each([
    ['invalid json', '{broken'],
    ['wrong version', JSON.stringify({ version: 2, queue: {} })],
    ['array queue', JSON.stringify({ version: 1, queue: [] })],
    [
      'mismatched queue key',
      createStoredSnapshot('driver-a', 'order-a', {
        queueKey: 'order-other',
      }),
    ],
    ['mismatched driver', createStoredSnapshot('driver-b', 'order-a')],
    [
      'missing idempotency key',
      createStoredSnapshot('driver-a', 'order-a', {
        item: { idempotencyKey: '' },
      }),
    ],
    [
      'malformed request',
      createStoredSnapshot('driver-a', 'order-a', {
        item: {
          request: {
            ...createQueueItem('driver-a', 'order-a').request,
            photoCount: 2,
          },
        },
      }),
    ],
    [
      'unnormalized request',
      createStoredSnapshot('driver-a', 'order-a', {
        item: {
          request: {
            ...createQueueItem('driver-a', 'order-a').request,
            tags: ['communication', ' communication '],
          },
        },
      }),
    ],
    [
      'oversized tag',
      createStoredSnapshot('driver-a', 'order-a', {
        item: {
          request: {
            ...createQueueItem('driver-a', 'order-a').request,
            tags: ['x'.repeat(41)],
          },
        },
      }),
    ],
    [
      'reserved tag delimiter',
      createStoredSnapshot('driver-a', 'order-a', {
        item: {
          request: {
            ...createQueueItem('driver-a', 'order-a').request,
            tags: ['communication；loading'],
          },
        },
      }),
    ],
  ])('clears damaged account storage: %s', async (_caseName, value) => {
    const storageKey = createStorageKey('driver-a');
    await AsyncStorage.setItem(storageKey, value);

    await expect(
      hydrateDriverShipperEvaluationQueue('driver-a'),
    ).resolves.toEqual({});
    await expect(AsyncStorage.getItem(storageKey)).resolves.toBeNull();
  });

  it('rejects invalid account ids and queues before persisting', async () => {
    expect(() => saveDriverShipperEvaluationQueue('   ', {})).toThrow(
      'driverAccountId is required',
    );
    expect(() =>
      saveDriverShipperEvaluationQueue(
        'driver-a',
        createQueue('driver-b', 'order-a'),
      ),
    ).toThrow('Driver shipper evaluation queue is invalid');
    await expect(hydrateDriverShipperEvaluationQueue('   ')).rejects.toThrow(
      'driverAccountId is required',
    );
  });

  it('serializes a delayed save before a later removal', async () => {
    const storageKey = createStorageKey('driver-a');
    const writeStarted = createDeferred<void>();
    const releaseWrite = createDeferred<void>();
    asyncStorageSetItemMock.mockImplementationOnce(async (key, value) => {
      writeStarted.resolve();
      await releaseWrite.promise;
      await originalSetItemImplementation?.(key, value);
    });

    const delayedSave = saveDriverShipperEvaluationQueue(
      'driver-a',
      createQueue('driver-a', 'order-a'),
    );
    await writeStarted.promise;
    const laterRemoval = saveDriverShipperEvaluationQueue('driver-a', {});

    releaseWrite.resolve();
    await Promise.all([delayedSave, laterRemoval]);
    await expect(AsyncStorage.getItem(storageKey)).resolves.toBeNull();
  });

  it('continues later operations after a failed write', async () => {
    asyncStorageSetItemMock.mockRejectedValueOnce(
      new Error('AsyncStorage write failed'),
    );

    await expect(
      saveDriverShipperEvaluationQueue(
        'driver-a',
        createQueue('driver-a', 'order-failed'),
      ),
    ).rejects.toThrow('AsyncStorage write failed');

    const recoveredQueue = createQueue('driver-a', 'order-recovered');
    await expect(
      saveDriverShipperEvaluationQueue('driver-a', recoveredQueue),
    ).resolves.toBeUndefined();
    await expect(
      hydrateDriverShipperEvaluationQueue('driver-a'),
    ).resolves.toEqual(recoveredQueue);
  });

  it('removes only the exact queued request identity', () => {
    const item = createQueueItem('driver-a', 'order-a');
    const queue = { [item.orderId]: item };

    expect(
      omitDriverShipperEvaluationQueueItem(queue, {
        ...item,
        idempotencyKey: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      }),
    ).toBe(queue);
    expect(
      omitDriverShipperEvaluationQueueItem(queue, {
        ...item,
        request: { ...item.request, tags: [...item.request.tags].reverse() },
      }),
    ).toBe(queue);
    expect(omitDriverShipperEvaluationQueueItem(queue, item)).toEqual({});
  });

  it('treats omitted and false anonymous flags as the same normalized request', () => {
    const request = createQueueItem('driver-a', 'order-a').request;

    expect(
      areDriverShipperEvaluationRequestsEqual(
        { ...request, anonymous: undefined },
        { ...request, anonymous: false },
      ),
    ).toBe(true);
  });
});

function createQueue(
  driverAccountId: string,
  orderId: string,
): DriverShipperEvaluationQueue {
  return { [orderId]: createQueueItem(driverAccountId, orderId) };
}

function createQueueItem(
  driverAccountId: string,
  orderId: string,
): DriverShipperEvaluationQueueItem {
  return {
    driverAccountId,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    orderId,
    orderNo: `HY-${orderId}`,
    request: {
      rating: 5,
      tags: ['communication', 'loading'],
      content: 'The shipper coordinated the loading clearly.',
      anonymous: true,
      photoCount: 1,
      photoFileIds: ['file-evaluation-1'],
    },
  };
}

function createStoredSnapshot(
  driverAccountId: string,
  orderId: string,
  options: {
    queueKey?: string;
    item?: Partial<DriverShipperEvaluationQueueItem>;
  } = {},
) {
  return JSON.stringify({
    version: 1,
    queue: {
      [options.queueKey ?? orderId]: {
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
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

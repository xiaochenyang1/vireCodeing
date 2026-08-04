import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  areShipperDriverEvaluationRequestsEqual,
  hydrateShipperDriverEvaluationQueue,
  omitShipperDriverEvaluationQueueItem,
  saveShipperDriverEvaluationQueue,
  type ShipperDriverEvaluationQueue,
  type ShipperDriverEvaluationQueueItem,
} from '../src/utils/shipperDriverEvaluationQueue';

const legacyStorageKey = '@vireCodeing/shipper-driver-evaluation-queue';
const asyncStorageSetItemMock = AsyncStorage.setItem as jest.Mock;
const originalSetItemImplementation =
  asyncStorageSetItemMock.getMockImplementation();

describe('shipper driver evaluation queue v1 storage', () => {
  beforeEach(async () => {
    asyncStorageSetItemMock.mockImplementation(originalSetItemImplementation);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    asyncStorageSetItemMock.mockImplementation(originalSetItemImplementation);
  });

  it('persists complete requests and isolates accounts', async () => {
    const accountA = createQueue('shipper-a', 'local-a', 'platform-a');
    const accountB = createQueue('shipper/b', 'local-b', 'platform-b');

    await Promise.all([
      saveShipperDriverEvaluationQueue('shipper-a', accountA),
      saveShipperDriverEvaluationQueue('shipper/b', accountB),
    ]);

    await expect(
      hydrateShipperDriverEvaluationQueue('shipper-a'),
    ).resolves.toEqual(accountA);
    await expect(
      hydrateShipperDriverEvaluationQueue('shipper/b'),
    ).resolves.toEqual(accountB);
    await expect(
      AsyncStorage.getItem(`${legacyStorageKey}:shipper-a`),
    ).resolves.toBe(JSON.stringify({ version: 1, queue: accountA }));
  });

  it('clears the legacy global queue without migrating it', async () => {
    await AsyncStorage.setItem(
      legacyStorageKey,
      JSON.stringify({
        version: 1,
        queue: createQueue('shipper-a', 'local-a', 'platform-a'),
      }),
    );

    await expect(
      hydrateShipperDriverEvaluationQueue('shipper-a'),
    ).resolves.toEqual({});
    await expect(AsyncStorage.getItem(legacyStorageKey)).resolves.toBeNull();
  });

  it('rejects invalid queues before persistence', async () => {
    expect(() => saveShipperDriverEvaluationQueue(' ', {})).toThrow(
      'shipperAccountId is required',
    );
    expect(() =>
      saveShipperDriverEvaluationQueue('shipper-a', {
        ...createQueue('shipper-b', 'local-a', 'platform-a'),
      }),
    ).toThrow('Shipper driver evaluation queue is invalid');
  });

  it('removes only the exact request identity', () => {
    const item = createQueueItem('shipper-a', 'local-a', 'platform-a');
    const queue = { [item.localOrderId]: item };

    expect(
      omitShipperDriverEvaluationQueueItem(queue, {
        ...item,
        idempotencyKey: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      }),
    ).toBe(queue);
    expect(
      omitShipperDriverEvaluationQueueItem(queue, {
        ...item,
        platformOrderId: 'platform-other',
      }),
    ).toBe(queue);
    expect(omitShipperDriverEvaluationQueueItem(queue, item)).toEqual({});
  });

  it('serializes a delayed save before a later removal', async () => {
    const writeStarted = createDeferred<void>();
    const releaseWrite = createDeferred<void>();
    asyncStorageSetItemMock.mockImplementationOnce(async (key, value) => {
      writeStarted.resolve();
      await releaseWrite.promise;
      await originalSetItemImplementation?.(key, value);
    });

    const delayedSave = saveShipperDriverEvaluationQueue(
      'shipper-a',
      createQueue('shipper-a', 'local-a', 'platform-a'),
    );
    await writeStarted.promise;
    const laterRemoval = saveShipperDriverEvaluationQueue('shipper-a', {});

    releaseWrite.resolve();
    await Promise.all([delayedSave, laterRemoval]);
    await expect(
      AsyncStorage.getItem(`${legacyStorageKey}:shipper-a`),
    ).resolves.toBeNull();
  });

  it('treats omitted and false anonymous flags as equal', () => {
    const request = createQueueItem(
      'shipper-a',
      'local-a',
      'platform-a',
    ).request;
    expect(
      areShipperDriverEvaluationRequestsEqual(
        { ...request, anonymous: undefined },
        { ...request, anonymous: false },
      ),
    ).toBe(true);
  });
});

function createQueue(
  shipperAccountId: string,
  localOrderId: string,
  platformOrderId: string,
): ShipperDriverEvaluationQueue {
  return {
    [localOrderId]: createQueueItem(
      shipperAccountId,
      localOrderId,
      platformOrderId,
    ),
  };
}

function createQueueItem(
  shipperAccountId: string,
  localOrderId: string,
  platformOrderId: string,
): ShipperDriverEvaluationQueueItem {
  return {
    shipperAccountId,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    localOrderId,
    platformOrderId,
    orderNo: `HY-${localOrderId}`,
    request: {
      rating: 5,
      tags: ['准时送达', '服务好'],
      content: '司机服务细致，整体运输体验很好',
      anonymous: true,
      photoCount: 1,
      photoFileIds: ['file-evaluation-1'],
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

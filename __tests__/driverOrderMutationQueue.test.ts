import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  hydrateDriverOrderMutationQueue,
  saveDriverOrderMutationQueue,
  type DriverOrderMutationQueue,
} from '../src/utils/driverOrderMutationQueue';

describe('driver order mutation queue account isolation', () => {
  it('stores and hydrates retry items only for the matching driver account', async () => {
    await AsyncStorage.clear();
    const driverAQueue: DriverOrderMutationQueue = {
      'accept:order-1': {
        operation: 'accept',
        driverAccountId: 'driver-a',
        orderId: 'order-1',
        orderNo: 'HY202607140001',
        request: {
          baseUpdatedAtIso: '2026-07-14T01:00:00.000Z',
          noteText: '马上到',
        },
        mutationContext: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
          baseUpdatedAtIso: '2026-07-14T01:00:00.000Z',
        },
      },
    };
    const driverBQueue: DriverOrderMutationQueue = {
      'status:order-2': {
        operation: 'status',
        driverAccountId: 'driver-b',
        orderId: 'order-2',
        orderNo: 'HY202607140002',
        request: {
          baseUpdatedAtIso: '2026-07-14T02:00:00.000Z',
          nextStatus: 'confirming',
        },
        mutationContext: {
          idempotencyKey: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
          baseUpdatedAtIso: '2026-07-14T02:00:00.000Z',
        },
      },
    };

    saveDriverOrderMutationQueue('driver-a', driverAQueue);
    saveDriverOrderMutationQueue('driver-b', driverBQueue);
    await Promise.resolve();

    await expect(hydrateDriverOrderMutationQueue('driver-a')).resolves.toEqual(
      driverAQueue,
    );
    await expect(hydrateDriverOrderMutationQueue('driver-b')).resolves.toEqual(
      driverBQueue,
    );
  });
});

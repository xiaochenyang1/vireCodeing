import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAppRuntimeState,
  getAppRuntimeState,
  hydrateAppRuntimeState,
  saveAppRuntimeStateDurably,
  type AppRuntimeState,
} from '../src/utils/appRuntimeState';

const runtimeState: AppRuntimeState = {
  orders: [
    {
      id: 'HYLOCAL001',
      status: 'waiting',
      from: '宝安仓',
      to: '南山门店',
      cargoType: '数码',
      weightText: '1.8 吨',
      vehicleRequirement: '中型货车',
      priceText: '￥760',
      updatedAtText: '刚刚发布',
      syncState: {
        status: 'pending',
        operation: 'create',
        message: '等待同步',
        updatedAtText: '刚刚',
        createContext: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
    },
  ],
  messages: [],
  messageUnreadCount: 0,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  clearAppRuntimeState();
  await Promise.resolve();
  jest.clearAllMocks();
});

test('awaits a durable runtime snapshot and restores the create context', async () => {
  await saveAppRuntimeStateDurably(runtimeState);
  await hydrateAppRuntimeState();

  expect(getAppRuntimeState()).toEqual(runtimeState);
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});

test('propagates a durable runtime storage failure', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('storage failed'),
  );

  await expect(saveAppRuntimeStateDurably(runtimeState)).rejects.toThrow(
    'storage failed',
  );
});

test('hydrates legacy runtime snapshots by rebuilding the unread count', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: runtimeState.orders,
        messages: [
          {
            id: 'message-1',
            category: 'system',
            title: '系统通知',
            content: '请更新应用',
            timeText: '刚刚',
            unread: true,
          },
          {
            id: 'message-2',
            category: 'order',
            title: '订单更新',
            content: '订单已接单',
            timeText: '1 小时前',
            unread: false,
          },
        ],
      },
    }),
  );

  await hydrateAppRuntimeState();

  expect(getAppRuntimeState().messageUnreadCount).toBe(1);
});

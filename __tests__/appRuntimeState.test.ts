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

test('hydrates legacy local messages by backfilling structured timestamps and sorting newest first', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: runtimeState.orders,
        messages: [
          {
            id: 'message-finance-1',
            category: 'finance',
            title: '财务到账提醒',
            content: '异常赔付已打入司机钱包，可在收支明细中查看。',
            timeText: '昨天 10:15',
            unread: false,
          },
          {
            id: 'message-quote-1',
            category: 'order',
            title: '司机报价提醒',
            content:
              '订单 HY20260622001 收到 2 个司机报价，请尽快选择合适司机。',
            timeText: '10 分钟前',
            unread: true,
          },
          {
            id: 'message-system-1',
            category: 'system',
            title: '系统通知',
            content: '平台已为已认证货主开放本地发单演示能力。',
            timeText: '今天 09:30',
            unread: true,
          },
          {
            id: 'message-service-1',
            category: 'service',
            title: '客服处理进度',
            content: '运输异常提交后，客服将在 24 小时内跟进处理。',
            timeText: '昨天 18:00',
            unread: false,
          },
        ],
      },
    }),
  );

  await hydrateAppRuntimeState();

  expect(getAppRuntimeState()).toMatchObject({
    messageUnreadCount: 2,
    messages: [
      {
        id: 'message-quote-1',
        createdAtIso: '2026-06-22T09:50:00+08:00',
      },
      {
        id: 'message-system-1',
        createdAtIso: '2026-06-22T09:30:00+08:00',
      },
      {
        id: 'message-service-1',
        createdAtIso: '2026-06-21T18:00:00+08:00',
      },
      {
        id: 'message-finance-1',
        createdAtIso: '2026-06-21T10:15:00+08:00',
      },
    ],
  });
});

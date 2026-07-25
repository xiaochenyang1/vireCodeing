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

test('hydrates legacy local orders by backfilling structured timestamps and sorting newest first', async () => {
  await AsyncStorage.setItem(
    '@vireCodeing/app-runtime-state',
    JSON.stringify({
      version: 1,
      state: {
        orders: [
          {
            id: 'HY20260619005',
            status: 'cancelled',
            from: '光明区公明仓库',
            to: '龙华区民治门店',
            cargoType: '日用品',
            weightText: '800 kg',
            vehicleRequirement: '小货车',
            priceText: '￥260',
            updatedAtText: '已取消 · 2 天前',
          },
          {
            id: 'HY20260622001',
            status: 'waiting',
            from: '宝安区福永物流园',
            to: '南山区科技园门店',
            cargoType: '建材',
            weightText: '2.5 吨',
            quantityText: '16 件',
            vehicleRequirement: '中型货车',
            priceText: '￥680',
            updatedAtText: '10 分钟前发布',
            pickupTimeText: '今天 16:30',
          },
          {
            id: 'HY20260620003',
            status: 'confirming',
            from: '盐田港仓储中心',
            to: '罗湖区翠竹门店',
            cargoType: '食品',
            weightText: '1.2 吨',
            vehicleRequirement: '小货车',
            priceText: '￥310',
            updatedAtText: '等待确认送达',
            pickupTimeText: '昨天 10:00',
          },
          {
            id: 'HY20260621008',
            status: 'transporting',
            from: '龙岗区坂田工厂',
            to: '福田区车公庙展厅',
            cargoType: '家电',
            weightText: '36 件',
            vehicleRequirement: '厢式货车',
            priceText: '￥520',
            updatedAtText: '预计 18:20 到达',
            pickupTimeText: '今天 13:00',
          },
        ],
        messages: [],
        messageUnreadCount: 0,
      },
    }),
  );

  await hydrateAppRuntimeState();

  expect(getAppRuntimeState().orders).toMatchObject([
    {
      id: 'HY20260622001',
      createdAtIso: '2026-06-26T15:20:00+08:00',
      updatedAtIso: '2026-06-26T15:50:00+08:00',
      pickupTimeIso: '2026-06-26T16:30:00+08:00',
    },
    {
      id: 'HY20260621008',
      createdAtIso: '2026-06-26T12:40:00+08:00',
      updatedAtIso: '2026-06-26T13:20:00+08:00',
      pickupTimeIso: '2026-06-26T13:00:00+08:00',
    },
    {
      id: 'HY20260620003',
      createdAtIso: '2026-06-25T09:20:00+08:00',
      updatedAtIso: '2026-06-25T10:40:00+08:00',
      pickupTimeIso: '2026-06-25T10:00:00+08:00',
    },
    {
      id: 'HY20260619005',
      createdAtIso: '2026-06-24T08:30:00+08:00',
      updatedAtIso: '2026-06-24T09:10:00+08:00',
    },
  ]);
});

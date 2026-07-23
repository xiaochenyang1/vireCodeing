import {
  createAddFrequentRouteChange,
  createDeleteFrequentRouteChange,
  createLocalFrequentRoute,
  createMoveFrequentRouteChange,
  createUpdateFrequentRouteChange,
  deleteFrequentRoute,
  moveFrequentRoute,
  updateFrequentRoute,
} from '../src/utils/homeRoutes';
import type { FrequentRoute } from '../src/types';

afterEach(() => {
  jest.restoreAllMocks();
});

const routes: FrequentRoute[] = [
  {
    id: 'route-1',
    name: '宝安仓库 → 南山门店',
    from: '宝安区航城仓库',
    to: '南山区科技园门店',
    lastUsedText: '昨天使用',
  },
  {
    id: 'route-local-4',
    name: '番禺仓库 → 天河门店',
    from: '番禺区南村仓库',
    to: '天河区体育西门店',
    lastUsedText: '刚刚添加',
  },
  {
    id: 'route-local-2',
    name: '佛山仓库 → 越秀门店',
    from: '佛山仓库',
    to: '越秀门店',
    lastUsedText: '刚刚添加',
  },
];

test('creates a local frequent route with a non-colliding local id', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(
    createLocalFrequentRoute(routes, {
      name: '东莞仓库 → 深圳门店',
      from: '东莞仓库',
      to: '深圳门店',
    }),
  ).toEqual({
    id: 'route-local-5',
    name: '东莞仓库 → 深圳门店',
    from: '东莞仓库',
    to: '深圳门店',
    lastUsedText: '刚刚添加',
    lastUsedIso: expectedIso,
  });

  dateNowSpy.mockRestore();
});

test('updates a frequent route without changing other route records', () => {
  expect(
    updateFrequentRoute(routes, 'route-local-4', {
      name: '番禺仓库 → 珠江新城',
      from: '番禺区南村仓库',
      to: '珠江新城门店',
    }),
  ).toEqual([
    routes[0],
    {
      ...routes[1],
      name: '番禺仓库 → 珠江新城',
      from: '番禺区南村仓库',
      to: '珠江新城门店',
    },
    routes[2],
  ]);
});

test('moves a frequent route within list bounds', () => {
  expect(moveFrequentRoute(routes, 'route-local-4', 'down')).toEqual([
    routes[0],
    routes[2],
    routes[1],
  ]);

  expect(moveFrequentRoute(routes, 'route-1', 'up')).toBe(routes);
});

test('deletes a frequent route by id', () => {
  expect(deleteFrequentRoute(routes, 'route-local-2')).toEqual([
    routes[0],
    routes[1],
  ]);
});

test('creates an add-route change with pending route sync state', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(
    createAddFrequentRouteChange(routes, {
      name: '东莞仓库 → 深圳门店',
      from: '东莞仓库',
      to: '深圳门店',
    }),
  ).toEqual({
    routes: [
      ...routes,
      {
        id: 'route-local-5',
        name: '东莞仓库 → 深圳门店',
        from: '东莞仓库',
        to: '深圳门店',
        lastUsedText: '刚刚添加',
        lastUsedIso: expectedIso,
      },
    ],
    syncState: {
      status: 'pending',
      message: '常用路线已在本地更新，等待平台常用路线同步。',
      updatedAtText: '刚刚',
      updatedAtIso: expectedIso,
      queueItems: [
        {
          id: 'route-local-change',
          titleText: '常用路线变更',
          statusText: '待同步',
          updatedAtText: '刚刚',
          updatedAtIso: expectedIso,
          noteText: '常用路线已保留在本地，待平台常用路线同步。',
        },
      ],
    },
  });

  dateNowSpy.mockRestore();
});

test('creates an update-route change with pending route sync state', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(
    createUpdateFrequentRouteChange(routes, 'route-local-4', {
      name: '番禺仓库 → 珠江新城',
      from: '番禺区南村仓库',
      to: '珠江新城门店',
    }),
  ).toEqual({
    routes: [
      routes[0],
      {
        ...routes[1],
        name: '番禺仓库 → 珠江新城',
        from: '番禺区南村仓库',
        to: '珠江新城门店',
      },
      routes[2],
    ],
    syncState: {
      status: 'pending',
      message: '常用路线已在本地更新，等待平台常用路线同步。',
      updatedAtText: '刚刚',
      updatedAtIso: expectedIso,
      queueItems: [
        {
          id: 'route-local-change',
          titleText: '常用路线变更',
          statusText: '待同步',
          updatedAtText: '刚刚',
          updatedAtIso: expectedIso,
          noteText: '常用路线已保留在本地，待平台常用路线同步。',
        },
      ],
    },
  });

  dateNowSpy.mockRestore();
});

test('creates a move-route change only when route order changes', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(createMoveFrequentRouteChange(routes, 'route-1', 'up')).toBeUndefined();
  expect(createMoveFrequentRouteChange(routes, 'route-local-4', 'down')).toEqual({
    routes: [routes[0], routes[2], routes[1]],
    syncState: {
      status: 'pending',
      message: '常用路线已在本地更新，等待平台常用路线同步。',
      updatedAtText: '刚刚',
      updatedAtIso: expectedIso,
      queueItems: [
        {
          id: 'route-local-change',
          titleText: '常用路线变更',
          statusText: '待同步',
          updatedAtText: '刚刚',
          updatedAtIso: expectedIso,
          noteText: '常用路线已保留在本地，待平台常用路线同步。',
        },
      ],
    },
  });

  dateNowSpy.mockRestore();
});

test('creates a delete-route change with pending route sync state', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(createDeleteFrequentRouteChange(routes, 'route-local-2')).toEqual({
    routes: [routes[0], routes[1]],
    syncState: {
      status: 'pending',
      message: '常用路线已在本地更新，等待平台常用路线同步。',
      updatedAtText: '刚刚',
      updatedAtIso: expectedIso,
      queueItems: [
        {
          id: 'route-local-change',
          titleText: '常用路线变更',
          statusText: '待同步',
          updatedAtText: '刚刚',
          updatedAtIso: expectedIso,
          noteText: '常用路线已保留在本地，待平台常用路线同步。',
        },
      ],
    },
  });

  dateNowSpy.mockRestore();
});

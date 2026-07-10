import {
  createHomeRouteChangeStatePatch,
  createHomeCitySelectionChange,
  createHomeLocalStateSnapshot,
  createHomeSupportTicketStatePatch,
  createHomeSyncStatePatch,
  createHomeSupportBackHomeChange,
  createHomeSupportViewChange,
  createHomeRouteAddedState,
  createHomeRouteMovedState,
  createHomeRouteSyncFailedState,
  createHomeRouteSyncRetriedState,
  createHomeSupportTicketStatusUpdatedState,
  createHomeSupportTicketSubmittedState,
  getHomeCityOptions,
  getHomeSummaryMetrics,
  getOrderListFilterForSummaryStatus,
} from '../src/utils/homeDashboard';
import type { FrequentRoute, SupportTicket } from '../src/types';
import type { HomeSyncState } from '../src/utils/homeLocalState';

test('returns local home city options', () => {
  expect(getHomeCityOptions()).toEqual([
    { id: 'shenzhen', label: '深圳' },
    { id: 'guangzhou', label: '广州' },
    { id: 'dongguan', label: '东莞' },
    { id: 'foshan', label: '佛山' },
  ]);
});

test('returns home summary metrics from current order and route counts', () => {
  expect(
    getHomeSummaryMetrics({
      orderCount: 4,
      routeCount: 3,
    }),
  ).toEqual([
    { label: '本月发单', value: '4 单' },
    { label: '常用路线', value: '3 条' },
    { label: '综合信用', value: '96 分' },
  ]);
});

test('maps home order summary statuses to order list filters', () => {
  expect(getOrderListFilterForSummaryStatus('waiting')).toBe('waiting');
  expect(getOrderListFilterForSummaryStatus('transporting')).toBe('active');
  expect(getOrderListFilterForSummaryStatus('confirming')).toBe('confirming');
  expect(getOrderListFilterForSummaryStatus('completed')).toBe('completed');
});

test('creates a home city selection change for local persistence and notice text', () => {
  expect(createHomeCitySelectionChange('广州')).toEqual({
    selectedCity: '广州',
    showCitySelector: false,
    notice: '已切换城市：广州',
  });
});

test('merges home local state snapshots without mutating the current state', () => {
  const currentRoute: FrequentRoute = {
    id: 'route-1',
    name: '宝安仓库到南山门店',
    from: '宝安仓库',
    to: '南山门店',
    lastUsedText: '昨天使用',
  };
  const nextRoute: FrequentRoute = {
    id: 'route-local-3',
    name: '番禺仓库到天河门店',
    from: '番禺仓库',
    to: '天河门店',
    lastUsedText: '刚刚添加',
  };
  const supportTicket: SupportTicket = {
    id: 'support-ticket-1',
    channelName: '发票问题',
    description: '需要补开发票',
    statusText: '已受理',
    createdAtText: '刚刚',
    statusHistory: [],
  };
  const syncState: HomeSyncState = {
    status: 'pending',
    message: '等待真实路线 API 接入后同步。',
    updatedAtText: '刚刚',
    queueItems: [],
  };
  const currentState = {
    selectedCity: '深圳',
    routes: [currentRoute],
    supportTickets: [supportTicket],
    syncState,
  };

  const nextState = createHomeLocalStateSnapshot(currentState, {
    selectedCity: '广州',
    routes: [currentRoute, nextRoute],
  });

  expect(nextState).toEqual({
    selectedCity: '广州',
    routes: [currentRoute, nextRoute],
    supportTickets: [supportTicket],
    syncState,
  });
  expect(currentState.selectedCity).toBe('深圳');
  expect(currentState.routes).toEqual([currentRoute]);
});

test('creates home support view changes for navigation sections', () => {
  expect(createHomeSupportViewChange('messages')).toEqual({
    supportView: 'messages',
  });
  expect(createHomeSupportViewChange('help')).toEqual({
    supportView: 'help',
  });
  expect(createHomeSupportBackHomeChange()).toEqual({
    supportView: 'home',
  });
});

test('creates home local state patches from route and sync changes', () => {
  const routes: FrequentRoute[] = [
    {
      id: 'route-local-1',
      name: '宝安仓库到南山门店',
      from: '宝安仓库',
      to: '南山门店',
      lastUsedText: '刚刚添加',
    },
  ];
  const syncState: HomeSyncState = {
    status: 'pending',
    message: '常用路线已在本地更新，等待真实路线 API 接入后同步。',
    updatedAtText: '刚刚',
    queueItems: [],
  };

  expect(
    createHomeRouteChangeStatePatch({
      routes,
      syncState,
    }),
  ).toEqual({
    routes,
    syncState,
  });
  expect(createHomeSyncStatePatch(syncState)).toEqual({
    syncState,
  });
});

test('creates home local state patches from support ticket changes', () => {
  const supportTickets: SupportTicket[] = [
    {
      id: 'support-ticket-1',
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
      statusText: '待客服跟进',
      createdAtText: '刚刚提交',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '刚刚提交',
        },
      ],
    },
  ];

  expect(
    createHomeSupportTicketStatePatch({
      supportTickets,
    }),
  ).toEqual({
    supportTickets,
  });
});

test('creates next home state when adding a frequent route', () => {
  const now = new Date('2026-06-30T05:00:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const supportTicket: SupportTicket = {
    id: 'support-ticket-1',
    channelName: '投诉建议',
    description: '司机沟通不及时，希望客服协助跟进',
    statusText: '待客服跟进',
    createdAtText: '刚刚提交',
    statusHistory: [],
  };
  const currentState = {
    selectedCity: '深圳',
    routes: [
      {
        id: 'route-local-3',
        name: '宝安仓库到南山门店',
        from: '宝安仓库',
        to: '南山门店',
        lastUsedText: '昨天使用',
      },
    ],
    supportTickets: [supportTicket],
    syncState: undefined,
  };

  const nextState = createHomeRouteAddedState(
    currentState,
    {
      name: '番禺仓库到天河门店',
      from: '番禺仓库',
      to: '天河门店',
    },
    now,
  );

  expect(nextState).toMatchObject({
    selectedCity: '深圳',
    supportTickets: [supportTicket],
    syncState: {
      status: 'pending',
      updatedAtIso: expectedIso,
    },
  });
  expect(nextState.routes).toEqual([
    currentState.routes[0],
    {
      id: 'route-local-4',
      name: '番禺仓库到天河门店',
      from: '番禺仓库',
      to: '天河门店',
      lastUsedText: '刚刚添加',
      lastUsedIso: expectedIso,
    },
  ]);
  expect(nextState.syncState?.queueItems?.[0].updatedAtIso).toBe(expectedIso);
});

test('creates next home state for route sync retry and failure', () => {
  const now = new Date('2026-06-30T05:10:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const currentState = {
    selectedCity: '深圳',
    routes: [
      {
        id: 'route-local-1',
        name: '宝安仓库到南山门店',
        from: '宝安仓库',
        to: '南山门店',
        lastUsedText: '昨天使用',
      },
    ],
    supportTickets: [],
    syncState: undefined,
  };

  expect(createHomeRouteSyncRetriedState(currentState, now)).toEqual({
    ...currentState,
    syncState: {
      status: 'synced',
      message: '本地常用路线已记录，等待真实路线 API 接入。',
      updatedAtText: '刚刚',
      updatedAtIso: expectedIso,
      queueItems: [],
    },
  });
  expect(createHomeRouteSyncFailedState(currentState, now)).toMatchObject({
    ...currentState,
    syncState: {
      status: 'failed',
      updatedAtIso: expectedIso,
    },
  });
  expect(
    createHomeRouteSyncFailedState(currentState, now).syncState?.queueItems?.[0]
      .updatedAtIso,
  ).toBe(expectedIso);
});

test('creates next home state for valid route moves and ignores invalid moves', () => {
  const now = new Date('2026-06-30T05:20:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const currentState = {
    selectedCity: '深圳',
    routes: [
      {
        id: 'route-local-1',
        name: '宝安仓库到南山门店',
        from: '宝安仓库',
        to: '南山门店',
        lastUsedText: '昨天使用',
      },
      {
        id: 'route-local-2',
        name: '龙岗仓库到福田门店',
        from: '龙岗仓库',
        to: '福田门店',
        lastUsedText: '今天使用',
      },
    ],
    supportTickets: [],
    syncState: undefined,
  };

  const movedState = createHomeRouteMovedState(
    currentState,
    'route-local-2',
    'up',
    now,
  );

  expect(movedState?.routes.map(route => route.id)).toEqual([
    'route-local-2',
    'route-local-1',
  ]);
  expect(movedState?.syncState?.status).toBe('pending');
  expect(movedState?.syncState?.updatedAtIso).toBe(expectedIso);
  expect(
    createHomeRouteMovedState(currentState, 'route-local-1', 'up', now),
  ).toBeUndefined();
});

test('creates next home state when submitting and updating support tickets', () => {
  const now = new Date('2026-06-30T05:30:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const currentState = {
    selectedCity: '深圳',
    routes: [],
    supportTickets: [
      {
        id: 'support-ticket-3',
        channelName: '发票问题',
        description: '需要补开发票',
        statusText: '待客服跟进',
        createdAtText: '刚刚提交',
        statusHistory: [],
      },
    ],
    syncState: undefined,
  };

  const submittedState = createHomeSupportTicketSubmittedState(
    currentState,
    {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    },
    now,
  );

  expect(submittedState).toMatchObject({
    selectedCity: '深圳',
    routes: [],
    syncState: undefined,
  });
  expect(submittedState.supportTickets[0]).toMatchObject({
    id: 'support-ticket-4',
    channelName: '投诉建议',
    createdAtIso: expectedIso,
  });
  expect(
    submittedState.supportTickets[0].statusHistory?.[0].timestampIso,
  ).toBe(expectedIso);

  const updatedState = createHomeSupportTicketStatusUpdatedState(
    submittedState,
    'support-ticket-4',
    '已受理',
    {
      actionText: '客服已受理',
      timestampText: '刚刚受理',
    },
    now,
  );

  expect(updatedState.supportTickets[0]).toMatchObject({
    id: 'support-ticket-4',
    statusText: '已受理',
  });
  expect(updatedState.supportTickets[0].statusHistory?.[1]).toEqual({
    actionText: '客服已受理',
    timestampText: '刚刚受理',
    timestampIso: expectedIso,
  });
});

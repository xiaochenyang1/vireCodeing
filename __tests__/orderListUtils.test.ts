import type { RecentOrder } from '../src/types';
import {
  extractOrderDayNumbers,
  filterOrdersBySearchKeyword,
  filterOrdersByStatus,
  getFilteredOrders,
  matchesOrderTimeFilter,
  parseCustomDateRange,
  validateCustomDateRange,
} from '../src/utils/orderList';

const now = new Date(2026, 5, 30, 10, 0, 0).getTime();

function localDayNumber(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / 24 / 60 / 60 / 1000);
}

function createOrder(overrides: Partial<RecentOrder>): RecentOrder {
  return {
    id: 'HY20260630001',
    status: 'waiting',
    from: '深圳南山科技园',
    to: '广州天河体育中心',
    cargoType: '电子产品',
    weightText: '2 吨',
    vehicleRequirement: '厢式货车',
    priceText: '￥1800',
    updatedAtText: '今天 10:00',
    ...overrides,
  };
}

test('filters order list by status including active transport statuses', () => {
  const orders = [
    createOrder({ id: 'waiting', status: 'waiting' }),
    createOrder({ id: 'loading', status: 'loading' }),
    createOrder({ id: 'transporting', status: 'transporting' }),
    createOrder({ id: 'confirming', status: 'confirming' }),
    createOrder({ id: 'completed', status: 'completed' }),
    createOrder({ id: 'cancelled', status: 'cancelled' }),
  ];

  expect(filterOrdersByStatus(orders, 'all').map(order => order.id)).toEqual([
    'waiting',
    'loading',
    'transporting',
    'confirming',
    'completed',
    'cancelled',
  ]);
  expect(filterOrdersByStatus(orders, 'active').map(order => order.id)).toEqual([
    'loading',
    'transporting',
  ]);
  expect(
    filterOrdersByStatus(orders, 'cancelled').map(order => order.id),
  ).toEqual(['cancelled']);
});

test('matches local time filters from existing order time copy', () => {
  const currentOrder = createOrder({ updatedAtText: '3 分钟前' });
  const oldOrder = createOrder({ updatedAtText: '昨天 18:00' });
  const lastWeekOrder = createOrder({ updatedAtText: '上周三更新' });
  const lastMonthOrder = createOrder({ updatedAtText: '上月已取消' });

  expect(matchesOrderTimeFilter(currentOrder, 'today', now, emptyRange)).toBe(
    true,
  );
  expect(matchesOrderTimeFilter(oldOrder, 'today', now, emptyRange)).toBe(false);
  expect(matchesOrderTimeFilter(currentOrder, 'history', now, emptyRange)).toBe(
    false,
  );
  expect(matchesOrderTimeFilter(oldOrder, 'history', now, emptyRange)).toBe(
    true,
  );
  expect(matchesOrderTimeFilter(oldOrder, 'week', now, emptyRange)).toBe(true);
  expect(matchesOrderTimeFilter(lastWeekOrder, 'week', now, emptyRange)).toBe(
    false,
  );
  expect(matchesOrderTimeFilter(lastMonthOrder, 'week', now, emptyRange)).toBe(
    false,
  );
});

test('prefers structured order dates over local time copy for time filters', () => {
  const structurallyOldOrder = createOrder({
    updatedAtText: '今天 10:00',
    pickupTimeText: '今天 16:00',
    updatedAtIso: '2026-06-25T10:00:00+08:00',
    pickupTimeIso: '2026-06-25T16:00:00+08:00',
  } as Partial<RecentOrder>);

  expect(
    matchesOrderTimeFilter(structurallyOldOrder, 'today', now, emptyRange),
  ).toBe(false);
  expect(
    matchesOrderTimeFilter(structurallyOldOrder, 'history', now, emptyRange),
  ).toBe(true);
  expect(
    extractOrderDayNumbers(structurallyOldOrder, now),
  ).toEqual([localDayNumber(2026, 6, 25)]);
});

test('matches custom date range only when a valid local range is complete', () => {
  const inRangeOrder = createOrder({ updatedAtText: '昨天 18:00' });
  const outOfRangeOrder = createOrder({
    updatedAtText: '上周三更新',
    pickupTimeText: '2026-07-02 09:30',
  });
  const range = {
    startDateText: '2026-06-29',
    endDateText: '2026-07-01',
  };

  expect(matchesOrderTimeFilter(inRangeOrder, 'custom', now, range)).toBe(true);
  expect(matchesOrderTimeFilter(outOfRangeOrder, 'custom', now, range)).toBe(
    false,
  );
  expect(
    matchesOrderTimeFilter(outOfRangeOrder, 'custom', now, {
      startDateText: '2026-06-29',
      endDateText: '',
    }),
  ).toBe(true);
});

test('validates custom date input copy for incomplete, invalid and reversed ranges', () => {
  expect(validateCustomDateRange(emptyRange)).toBe('');
  expect(
    validateCustomDateRange({
      startDateText: '2026-06-29',
      endDateText: '',
    }),
  ).toBe('自定义日期请按 YYYY-MM-DD 填写完整开始和结束日期。');
  expect(
    validateCustomDateRange({
      startDateText: '2026-02-30',
      endDateText: '2026-03-01',
    }),
  ).toBe('自定义日期请按 YYYY-MM-DD 填写完整开始和结束日期。');
  expect(
    validateCustomDateRange({
      startDateText: '2026-07-02',
      endDateText: '2026-07-01',
    }),
  ).toBe('开始日期不能晚于结束日期。');
  expect(
    validateCustomDateRange({
      startDateText: '2026-06-29',
      endDateText: '2026-07-01',
    }),
  ).toBe('');
});

test('parses trimmed custom date range into local day numbers', () => {
  expect(
    parseCustomDateRange({
      startDateText: ' 2026-06-29 ',
      endDateText: '2026-07-01',
    }),
  ).toEqual({
    startDayNumber: localDayNumber(2026, 6, 29),
    endDayNumber: localDayNumber(2026, 7, 1),
  });
  expect(
    parseCustomDateRange({
      startDateText: '2026/06/29',
      endDateText: '2026-07-01',
    }),
  ).toBeUndefined();
});

test('extracts local day numbers from relative and absolute order time copy', () => {
  const dayNumbers = extractOrderDayNumbers(
    createOrder({
      updatedAtText: '2 天前 · 2026-06-30 · 刚刚更新',
      pickupTimeText: '明天 09:30 · 后天 10:00 · 昨天装货 · 2026-07-05',
    }),
    now,
  );

  expect(dayNumbers).toHaveLength(6);
  expect(dayNumbers).toEqual(
    expect.arrayContaining([
      localDayNumber(2026, 6, 28),
      localDayNumber(2026, 6, 29),
      localDayNumber(2026, 6, 30),
      localDayNumber(2026, 7, 1),
      localDayNumber(2026, 7, 2),
      localDayNumber(2026, 7, 5),
    ]),
  );
});

test('filters orders by keyword across id, address, cargo, vehicle and driver', () => {
  const orders = [
    createOrder({
      id: 'HY-A',
      from: '深圳南山科技园',
      vehicleLengthText: '4.2 米',
      vehicleExtraRequirementsText: '需要尾板',
    }),
    createOrder({
      id: 'HY-B',
      to: '佛山顺德仓',
      cargoType: '冷链食品',
    }),
    createOrder({
      id: 'HY-C',
      driverInfo: {
        driverId: 'driver-1',
        driverName: '王师傅',
        driverPhone: '13800000000',
        ratingText: '4.9 分',
        vehicleText: '厢式货车',
        plateNumber: '粤B12345',
        completedOrdersText: '320 单',
      },
    }),
  ];

  expect(filterOrdersBySearchKeyword(orders, '尾板').map(order => order.id)).toEqual([
    'HY-A',
  ]);
  expect(filterOrdersBySearchKeyword(orders, '顺德').map(order => order.id)).toEqual([
    'HY-B',
  ]);
  expect(
    filterOrdersBySearchKeyword(orders, '王师傅').map(order => order.id),
  ).toEqual(['HY-C']);
});

test('combines status, time and keyword filters for the order list', () => {
  const orders = [
    createOrder({
      id: 'HY-A',
      status: 'loading',
      updatedAtText: '今天 09:00',
      cargoType: '电子产品',
    }),
    createOrder({
      id: 'HY-B',
      status: 'transporting',
      updatedAtText: '上周三更新',
      cargoType: '电子产品',
    }),
    createOrder({
      id: 'HY-C',
      status: 'completed',
      updatedAtText: '今天 08:00',
      cargoType: '家具',
    }),
  ];

  expect(
    getFilteredOrders({
      orders,
      statusFilter: 'active',
      timeFilter: 'today',
      customDateRange: emptyRange,
      searchKeyword: '电子',
      now,
    }).map(order => order.id),
  ).toEqual(['HY-A']);
});

const emptyRange = {
  startDateText: '',
  endDateText: '',
};

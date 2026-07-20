import {
  filterSpendingRecords,
  getSpendingTotals,
  matchesSpendingTimeFilter,
  type ProfileSpendingRecordItem,
} from '../src/utils/profileSpending';
import type { RecentOrder } from '../src/types';
import { createSpendingRecords } from '../src/screens/profile/profileRecordUtils';

function createRecord(
  overrides: Partial<ProfileSpendingRecordItem>,
): ProfileSpendingRecordItem {
  return {
    id: 'spending-1',
    statusText: '已完成',
    amountValue: 100,
    timeBucket: 'recent',
    ...overrides,
  };
}

test('matches spending records by local time bucket', () => {
  expect(matchesSpendingTimeFilter('recent', 'all')).toBe(true);
  expect(matchesSpendingTimeFilter('history', 'all')).toBe(true);
  expect(matchesSpendingTimeFilter('recent', 'recent')).toBe(true);
  expect(matchesSpendingTimeFilter('history', 'recent')).toBe(false);
  expect(matchesSpendingTimeFilter('history', 'history')).toBe(true);
  expect(matchesSpendingTimeFilter('recent', 'history')).toBe(false);
});

test('filters spending records by status and time bucket', () => {
  const records = [
    createRecord({ id: 'completed-recent', statusText: '已完成' }),
    createRecord({
      id: 'completed-history',
      statusText: '已完成',
      timeBucket: 'history',
    }),
    createRecord({ id: 'active-recent', statusText: '运输中' }),
    createRecord({ id: 'refund-recent', statusText: '退款中' }),
    createRecord({ id: 'waiting-recent', statusText: '待接单' }),
  ];

  expect(
    filterSpendingRecords(records, 'completed', 'all').map(item => item.id),
  ).toEqual(['completed-recent', 'completed-history']);
  expect(
    filterSpendingRecords(records, 'completed', 'recent').map(item => item.id),
  ).toEqual(['completed-recent']);
  expect(
    filterSpendingRecords(records, 'active', 'all').map(item => item.id),
  ).toEqual(['active-recent']);
  expect(
    filterSpendingRecords(records, 'refund', 'all').map(item => item.id),
  ).toEqual(['refund-recent']);
  expect(filterSpendingRecords(records, 'all', 'history').map(item => item.id))
    .toEqual(['completed-history']);
});

test('prefers structured spending occurrence dates over local time buckets', () => {
  const now = new Date('2026-06-30T08:00:00+08:00').getTime();
  const records = [
    createRecord({
      id: 'old-structured',
      occurredAtIso: '2026-05-10T12:00:00+08:00',
      timeBucket: 'recent',
    }),
    createRecord({
      id: 'recent-structured',
      occurredAtIso: '2026-06-25T12:00:00+08:00',
      timeBucket: 'history',
    }),
  ];

  expect(
    filterSpendingRecords(records, 'all', 'recent', now).map(item => item.id),
  ).toEqual(['recent-structured']);
  expect(
    filterSpendingRecords(records, 'all', 'history', now).map(item => item.id),
  ).toEqual(['old-structured']);
});

test('creates local spending records with structured occurrence time from orders', () => {
  const records = createSpendingRecords([
    createOrder({
      id: 'HYLOCAL888',
      updatedAtIso: '2026-06-30T08:00:00+08:00',
      updatedAtText: '订单已完成 · 刚刚',
    }),
  ]);

  expect(records.find(item => item.orderId === 'HYLOCAL888')).toMatchObject({
    occurredAtIso: '2026-06-30T08:00:00+08:00',
    timeBucket: 'recent',
  });
});

test('uses payable amount for couponed spending records', () => {
  const records = createSpendingRecords([
    createOrder({
      id: 'HYCOUPON001',
      priceText: '￥760',
      originalPriceText: '￥760',
      couponTitleText: '满 300 减 30',
      couponDiscountText: '-￥30',
      payablePriceText: '￥730',
    }),
  ]);

  expect(records.find(item => item.orderId === 'HYCOUPON001')).toMatchObject({
    amountValue: 730,
    amountText: '￥730',
    settlementText: '司机收入：￥730',
    originalPriceText: '￥760',
    couponTitleText: '满 300 减 30',
    couponDiscountText: '-￥30',
    payablePriceText: '￥730',
  });
});

test('summarizes completed, active escrow and refund spending totals', () => {
  const records = [
    createRecord({ id: 'completed-a', statusText: '已完成', amountValue: 100 }),
    createRecord({ id: 'completed-b', statusText: '已完成', amountValue: 20.5 }),
    createRecord({ id: 'active', statusText: '运输中', amountValue: 300 }),
    createRecord({ id: 'refund-a', statusText: '退款中', amountValue: 80 }),
    createRecord({ id: 'refund-b', statusText: '取消退款', amountValue: 15 }),
    createRecord({ id: 'waiting', statusText: '待接单', amountValue: 999 }),
  ];

  expect(getSpendingTotals(records)).toEqual({
    completedTotal: 120.5,
    activeTotal: 300,
    refundTotal: 95,
  });
});

test('uses status categories for platform spending filters and totals', () => {
  const records = [
    createRecord({
      id: 'active-loading',
      statusText: '待装货',
      amountValue: 200,
      statusCategory: 'active',
    }),
    createRecord({
      id: 'active-confirming',
      statusText: '待确认',
      amountValue: 120,
      statusCategory: 'active',
    }),
    createRecord({
      id: 'completed-platform',
      statusText: '已完成',
      amountValue: 88,
      statusCategory: 'completed',
    }),
    createRecord({
      id: 'refund-platform',
      statusText: '退款中',
      amountValue: 66,
      statusCategory: 'refund',
    }),
  ];

  expect(
    filterSpendingRecords(records, 'active', 'all').map(item => item.id),
  ).toEqual(['active-loading', 'active-confirming']);
  expect(getSpendingTotals(records)).toEqual({
    completedTotal: 88,
    activeTotal: 320,
    refundTotal: 66,
  });
});

test('maps platform payment, settlement and refund facts without order-status guesses', () => {
  const records = createSpendingRecords([], {
    platformOnly: true,
    platformRecords: [
      {
        orderId: 'order-settled-1',
        orderNo: 'HY202607150001',
        status: 'completed',
        paymentMethod: 'online',
        paymentStatus: 'settled',
        paymentChannel: 'alipay',
        paymentOrderStatus: 'settled',
        amountCents: 31000,
        occurredAtIso: '2026-07-15T08:10:00.000Z',
        paidAtIso: '2026-07-15T08:00:00.000Z',
        settledAtIso: '2026-07-15T08:10:00.000Z',
        routeText: '宝安仓 → 南山门店',
      },
      {
        orderId: 'order-refunded-1',
        orderNo: 'HY202607150002',
        status: 'cancelled',
        paymentMethod: 'online',
        paymentStatus: 'refunded',
        paymentChannel: 'wechat',
        paymentOrderStatus: 'refunded',
        refundStatus: 'succeeded',
        amountCents: 31000,
        refundAmountCents: 3000,
        occurredAtIso: '2026-07-15T09:00:00.000Z',
        paidAtIso: '2026-07-15T08:20:00.000Z',
        settledAtIso: '2026-07-15T08:30:00.000Z',
        refundedAtIso: '2026-07-15T09:00:00.000Z',
        routeText: '龙岗仓 → 福田门店',
      },
    ] as never,
  });

  expect(records[0]).toMatchObject({
    methodText: '在线支付 · 支付宝',
    statusText: '已结算',
    paymentTimeText: '支付时间：2026-07-15 16:00',
    paymentStatusText: '资金状态：已结算',
    settlementText: '结算金额：￥310',
    flowText: '资金依据：平台支付与结算记录',
    statusCategory: 'completed',
  });
  expect(records[1]).toMatchObject({
    methodText: '在线支付 · 微信支付',
    statusText: '已退款',
    paymentTimeText: '支付时间：2026-07-15 16:20',
    paymentStatusText: '退款状态：已退款',
    settlementText: '退款金额：￥30',
    flowText: '资金依据：平台支付与退款记录',
    statusCategory: 'refund',
  });
  expect(records.map(record => record.flowText).join(' ')).not.toContain(
    '待接入',
  );
});

test('uses order financial facts when falling back to local spending records', () => {
  const records = createSpendingRecords([
    createOrder({
      id: 'HYPLATFORMFALLBACK001',
      paymentMethod: 'online',
      paymentStatus: 'settled',
      paymentChannel: 'wechat',
      paymentSettledAtIso: '2026-07-15T08:10:00.000Z',
      updatedAtIso: '2026-07-15T08:10:00.000Z',
      updatedAtText: '平台已同步',
    }),
  ]);

  expect(
    records.find(item => item.orderId === 'HYPLATFORMFALLBACK001'),
  ).toMatchObject({
    methodText: '在线支付 · 微信支付',
    statusText: '已结算',
    paymentTimeText: '结算时间：2026-07-15 16:10',
    paymentStatusText: '资金状态：已结算',
    settlementText: '结算金额：￥100',
    flowText: '资金依据：订单服务端支付与结算状态',
    statusCategory: 'completed',
  });
  expect(records.map(record => record.flowText).join(' ')).not.toContain(
    '本地演示',
  );
});

function createOrder(overrides: Partial<RecentOrder>): RecentOrder {
  return {
    id: 'HYLOCAL001',
    status: 'completed',
    from: '深圳南山仓',
    to: '广州天河店',
    cargoType: '建材',
    weightText: '2 吨',
    vehicleRequirement: '中型货车',
    priceText: '￥100',
    paymentMethodText: '在线支付',
    updatedAtText: '订单已完成 · 刚刚',
    ...overrides,
  };
}

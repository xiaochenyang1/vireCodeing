import {
  createAcceptanceSettingsRequest,
  createDriverAdvanceSuccessNotice,
  createDriverOrderHallNotice,
  createDriverWithdrawalRequest,
  createQuoteRequest,
  createShipperEvaluationRequest,
  filterDriverOrderHallOrders,
  formatDriverCurrency,
  formatDriverIncomeTime,
  getCertificationStatusText,
  getDriverAcceptanceVehicleTypesText,
  getDriverAdvanceButtonText,
  getDriverExecutionReceiptFileIds,
  getDriverOrderActionFailureNotice,
  getDriverReceiptUploadButtonText,
  getDriverStatusText,
  getDriverWithdrawalStatusText,
  getLatestDriverEvaluationReply,
  getNextDriverStatus,
  hasDriverEvaluationSubmitted,
  omitDriverEvaluationReplyQueueItem,
  upsertOrder,
} from '../src/screens/driver-home/driverHomeUtils';
import { PlatformApiError } from '../src/services/platformApiClient';
import type {
  PlatformDriverAcceptanceSettings,
} from '../src/services/platformDriverOrderApi';
import type { PlatformShipperOrder } from '../src/services/platformOrderApi';

const order = (overrides: Partial<PlatformShipperOrder> = {}): PlatformShipperOrder =>
  ({
    id: 'order-1',
    status: 'waiting',
    vehicleRequirement: 'mini-truck',
    events: [],
    ...overrides,
  }) as PlatformShipperOrder;

const acceptance = (
  overrides: Partial<PlatformDriverAcceptanceSettings> = {},
): PlatformDriverAcceptanceSettings =>
  ({
    driverId: 'd1',
    isOnline: true,
    maxDistanceKm: 50,
    vehicleTypePreferences: [],
    createdAtIso: '2026-07-10T00:00:00.000Z',
    updatedAtIso: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }) as PlatformDriverAcceptanceSettings;

test('builds a quote request only for valid amounts and arrival text', () => {
  expect(
    createQuoteRequest({ quoteText: ' 88 ', arrivalText: ' 45 分钟 ', noteText: ' 带尾板 ' }),
  ).toEqual({ quoteCents: 8800, arrivalText: '45 分钟', noteText: '带尾板' });

  expect(
    createQuoteRequest({ quoteText: '0', arrivalText: '45 分钟', noteText: '' }),
  ).toBeUndefined();
  expect(
    createQuoteRequest({ quoteText: '88', arrivalText: '  ', noteText: '' }),
  ).toBeUndefined();
});

test('validates acceptance settings bounds and dedupe', () => {
  expect(
    createAcceptanceSettingsRequest({
      isOnline: true,
      maxDistanceKmText: '50',
      vehicleTypePreferences: ['a', 'b'],
    }),
  ).toEqual({ isOnline: true, maxDistanceKm: 50, vehicleTypePreferences: ['a', 'b'] });

  expect(
    createAcceptanceSettingsRequest({
      isOnline: true,
      maxDistanceKmText: '0',
      vehicleTypePreferences: [],
    }),
  ).toBeUndefined();
  expect(
    createAcceptanceSettingsRequest({
      isOnline: true,
      maxDistanceKmText: '50',
      vehicleTypePreferences: ['a', 'a'],
    }),
  ).toBeUndefined();
});

test('validates a driver withdrawal request', () => {
  expect(
    createDriverWithdrawalRequest({
      amountText: '100',
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '6222 0000 1111 2222',
    }),
  ).toEqual({
    amountCents: 10000,
    bankAccountName: '李师傅',
    bankName: '招商银行',
    bankAccountNo: '6222000011112222',
  });

  expect(
    createDriverWithdrawalRequest({
      amountText: '100',
      bankAccountName: '李',
      bankName: '招商银行',
      bankAccountNo: '6222000011112222',
    }),
  ).toBeUndefined();
  expect(
    createDriverWithdrawalRequest({
      amountText: '100',
      bankAccountName: '李师傅',
      bankName: '招商银行',
      bankAccountNo: '123',
    }),
  ).toBeUndefined();
});

test('parses shipper evaluation tags and enforces content bounds', () => {
  expect(
    createShipperEvaluationRequest({
      ratingText: '5',
      tagsText: '沟通顺畅、装卸高效，沟通顺畅',
      content: '货主配合很好',
      anonymous: true,
    }),
  ).toEqual({
    rating: 5,
    tags: ['沟通顺畅', '装卸高效'],
    content: '货主配合很好',
    anonymous: true,
  });

  expect(
    createShipperEvaluationRequest({
      ratingText: '5',
      tagsText: '好',
      content: '短',
      anonymous: false,
    }),
  ).toBeUndefined();
});

test('upserts driver orders by id (prepend new, replace existing)', () => {
  const base = [order({ id: 'a' })];
  expect(upsertOrder(base, order({ id: 'b' })).map(o => o.id)).toEqual(['b', 'a']);
  expect(
    upsertOrder(base, order({ id: 'a', status: 'loading' }))[0].status,
  ).toBe('loading');
});

test('derives next status and button/receipt labels', () => {
  expect(getNextDriverStatus('loading')).toBe('transporting');
  expect(getNextDriverStatus('transporting')).toBe('confirming');
  expect(getNextDriverStatus('completed')).toBeUndefined();
  expect(getDriverAdvanceButtonText('loading')).toBe('确认发车');
  expect(getDriverAdvanceButtonText('transporting')).toBe('确认到达');
  expect(getDriverAdvanceButtonText('completed')).toBe('暂无可推进状态');
  expect(getDriverReceiptUploadButtonText('loading')).toBe('上传装货凭证');
  expect(getDriverReceiptUploadButtonText('transporting')).toBe('上传到达凭证');
});

test('maps status/certification/withdrawal texts and advance notices', () => {
  expect(getDriverStatusText('confirming')).toBe('待货主确认');
  expect(getCertificationStatusText('approved')).toBe('已通过');
  expect(getCertificationStatusText(undefined)).toBe('未加载');
  expect(getDriverWithdrawalStatusText('paid')).toBe('已打款');
  expect(createDriverAdvanceSuccessNotice('transporting')).toBe('司机已确认发车。');
  expect(createDriverAdvanceSuccessNotice('confirming')).toBe(
    '司机已确认到达，等待货主确认。',
  );
});

test('formats driver currency and income time', () => {
  expect(formatDriverCurrency(12345)).toBe('￥123.45');
  expect(formatDriverIncomeTime('2026-07-10T08:30:45.000Z')).toBe(
    '2026-07-10 08:30',
  );
});

test('filters the order hall by vehicle preferences and builds the notice', () => {
  const orders = [
    order({ id: 'a', vehicleRequirement: 'mini-truck' }),
    order({ id: 'b', vehicleRequirement: 'box-truck' }),
  ];

  expect(
    filterDriverOrderHallOrders(orders, acceptance({ vehicleTypePreferences: ['box-truck'] })).map(
      o => o.id,
    ),
  ).toEqual(['b']);
  // No preferences → all orders.
  expect(filterDriverOrderHallOrders(orders, acceptance())).toHaveLength(2);

  expect(createDriverOrderHallNotice(orders, acceptance({ isOnline: false }))).toBe(
    '当前处于离线接单，可查看订单但无法报价或接单。',
  );
  expect(
    createDriverOrderHallNotice(orders, acceptance({ vehicleTypePreferences: ['crane'] })),
  ).toBe('当前接单车型下暂无匹配订单。');
  expect(createDriverOrderHallNotice([], acceptance())).toBe('暂无可接订单。');
});

test('formats acceptance vehicle types with fallback to raw id', () => {
  expect(getDriverAcceptanceVehicleTypesText([])).toBe('不限');
  expect(getDriverAcceptanceVehicleTypesText(['unknown-type'])).toBe(
    'unknown-type',
  );
});

test('reads order events for evaluation state and latest reply', () => {
  const evaluated = order({
    events: [
      { id: 'e1', eventType: 'evaluation_submitted', createdAtIso: '2026-07-10T00:00:00.000Z' },
      { id: 'e2', eventType: 'evaluation_replied', noteText: '早', createdAtIso: '2026-07-10T01:00:00.000Z' },
      { id: 'e3', eventType: 'evaluation_replied', noteText: '晚', createdAtIso: '2026-07-10T02:00:00.000Z' },
    ],
  } as never);

  expect(hasDriverEvaluationSubmitted(evaluated)).toBe(true);
  expect(hasDriverEvaluationSubmitted(order())).toBe(false);
  expect(getLatestDriverEvaluationReply(evaluated)?.noteText).toBe('晚');
});

test('omits a driver evaluation reply queue item immutably', () => {
  const queue = {
    'order-1': { orderId: 'order-1', orderNo: 'HY1', content: 'x' },
    'order-2': { orderId: 'order-2', orderNo: 'HY2', content: 'y' },
  };

  const next = omitDriverEvaluationReplyQueueItem(queue, 'order-1');
  expect(next['order-1']).toBeUndefined();
  expect(next['order-2']).toBeDefined();
  expect(queue['order-1']).toBeDefined();
});

test('maps driver action failures to friendly notices', () => {
  expect(
    getDriverOrderActionFailureNotice(
      new PlatformApiError('offline', 'DRIVER_ACCEPTANCE_OFFLINE', 409),
      'fallback',
    ),
  ).toBe('当前处于离线接单，请先打开接单开关。');
  expect(
    getDriverOrderActionFailureNotice(
      new PlatformApiError('cert', 'DRIVER_CERTIFICATION_REQUIRED', 403),
      'fallback',
    ),
  ).toBe('司机实名和车辆认证通过后才能接单。');
  expect(getDriverOrderActionFailureNotice(new Error('x'), 'fallback')).toBe(
    'fallback',
  );
});

test('selects execution receipt file ids by current status', () => {
  const proofs = {
    'order-1': {
      transportingReceiptFileIds: ['load-1'],
      confirmingReceiptFileIds: ['arrive-1'],
    },
  };

  expect(getDriverExecutionReceiptFileIds(proofs, 'order-1', 'loading')).toEqual([
    'load-1',
  ]);
  expect(
    getDriverExecutionReceiptFileIds(proofs, 'order-1', 'transporting'),
  ).toEqual(['arrive-1']);
  expect(getDriverExecutionReceiptFileIds(proofs, 'order-1', 'confirming')).toEqual(
    [],
  );
  expect(getDriverExecutionReceiptFileIds(proofs, 'missing', 'loading')).toEqual(
    [],
  );
});

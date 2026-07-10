import type { RecentOrder } from '../src/types';
import {
  createLocalReceivedEvaluationRecordsFromPlatformSnapshot,
  createLocalEvaluationRecordsFromPlatformSnapshot,
  createEvaluationRecords,
  filterEvaluationRecords,
  type ProfileEvaluationRecordItem,
} from '../src/utils/profileEvaluations';

function createEvaluationRecord(
  overrides: Partial<ProfileEvaluationRecordItem>,
): ProfileEvaluationRecordItem {
  return {
    id: 'evaluation-a',
    orderId: 'HY-A',
    driverName: '李师傅',
    ratingText: '5 星',
    content: '服务不错',
    photoText: '',
    timeText: '刚刚提交',
    driverReplyText: '',
    driverReplyTimeText: '',
    ...overrides,
  };
}

function createOrder(overrides: Partial<RecentOrder>): RecentOrder {
  return {
    id: 'HY20260630001',
    status: 'completed',
    from: '深圳南山科技园',
    to: '广州天河体育中心',
    cargoType: '电子产品',
    weightText: '2 吨',
    vehicleRequirement: '厢式货车',
    priceText: '￥1800',
    updatedAtText: '订单已完成 · 今天 12:00',
    ...overrides,
  };
}

test('filters profile evaluation records by high and lower rating levels', () => {
  const records = [
    createEvaluationRecord({ id: 'five', ratingText: '5 星' }),
    createEvaluationRecord({ id: 'four', ratingText: '4 星' }),
    createEvaluationRecord({ id: 'three', ratingText: '3 星' }),
  ];

  expect(filterEvaluationRecords(records, 'all').map(item => item.id)).toEqual([
    'five',
    'four',
    'three',
  ]);
  expect(filterEvaluationRecords(records, 'high').map(item => item.id)).toEqual([
    'five',
  ]);
  expect(filterEvaluationRecords(records, 'lower').map(item => item.id)).toEqual([
    'four',
    'three',
  ]);
});

test('creates local profile evaluation records from evaluated orders before mock records', () => {
  const records = createEvaluationRecords([
    createOrder({
      id: 'HY-EVALUATED',
      driverInfo: {
        driverId: 'driver-1',
        driverName: '王师傅',
        driverPhone: '13800000000',
        ratingText: '4.8 分',
        vehicleText: '厢式货车',
        plateNumber: '粤B12345',
        completedOrdersText: '320 单',
      },
      evaluation: {
        rating: 4,
        tags: ['沟通顺畅'],
        content: '沟通很顺畅，整体不错。',
        photoCount: 2,
      },
    }),
  ]);

  expect(records[0]).toEqual({
    id: 'evaluation-local-HY-EVALUATED',
    orderId: 'HY-EVALUATED',
    driverName: '王师傅',
    ratingText: '4 星',
    content: '沟通很顺畅，整体不错。',
    photoText: '图片凭证 2 张',
    timeText: '刚刚提交',
    driverReplyText: '',
    driverReplyTimeText: '',
  });
  expect(records.some(item => item.id === 'evaluation-1')).toBe(true);
});

test('uses anonymous copy and unknown driver fallback for local evaluation records', () => {
  const [anonymousRecord, unknownDriverRecord] = createEvaluationRecords([
    createOrder({
      id: 'HY-ANON',
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '准时送达，匿名展示。',
        anonymous: true,
      },
    }),
    createOrder({
      id: 'HY-UNKNOWN',
      evaluation: {
        rating: 3,
        tags: ['服务一般'],
        content: '司机信息缺失时也要有兜底。',
      },
    }),
  ]);

  expect(anonymousRecord.driverName).toBe('匿名评价');
  expect(anonymousRecord.photoText).toBe('');
  expect(unknownDriverRecord.driverName).toBe('未知司机');
});

test('creates local profile evaluation records from platform snapshot', () => {
  const records = createLocalEvaluationRecordsFromPlatformSnapshot({
    shipperId: 'shipper-1',
    items: [
      {
        id: 'evaluation-platform-1',
        orderId: 'order-platform-1',
        orderNo: 'HY202607090001',
        driverName: '平台司机 driver-1',
        rating: 5,
        tags: ['准时送达', '服务好'],
        content: '平台评价内容',
        anonymous: false,
        photoCount: 2,
        photoFileIds: ['file-eval-1', 'file-eval-2'],
        submittedAtIso: '2026-07-09T09:00:00.000Z',
      },
      {
        id: 'evaluation-platform-anonymous',
        orderId: 'order-platform-2',
        orderNo: 'HY202607090002',
        driverName: '平台司机 driver-2',
        rating: 4,
        tags: ['沟通顺畅'],
        content: '匿名平台评价内容',
        anonymous: true,
        photoCount: 0,
        submittedAtIso: '2026-07-09T08:00:00.000Z',
        driverReplyText: '感谢反馈',
        driverReplyAtIso: '2026-07-09T08:30:00.000Z',
      },
    ],
  });

  expect(records).toEqual([
    {
      id: 'evaluation-platform-evaluation-platform-1',
      orderId: 'HY202607090001',
      driverName: '平台司机 driver-1',
      ratingText: '5 星',
      content: '平台评价内容',
      photoText: '图片凭证 2 张',
      timeText: '平台提交：2026-07-09 09:00',
      driverReplyText: '',
      driverReplyTimeText: '',
    },
    {
      id: 'evaluation-platform-evaluation-platform-anonymous',
      orderId: 'HY202607090002',
      driverName: '匿名评价',
      ratingText: '4 星',
      content: '匿名平台评价内容',
      photoText: '',
      timeText: '平台提交：2026-07-09 08:00',
      driverReplyText: '感谢反馈',
      driverReplyTimeText: '2026-07-09 08:30',
    },
  ]);
});

test('creates local received evaluation records from platform snapshot', () => {
  const records = createLocalReceivedEvaluationRecordsFromPlatformSnapshot({
    shipperId: 'shipper-1',
    items: [
      {
        id: 'received-platform-1',
        orderId: 'order-platform-1',
        orderNo: 'HY202607090003',
        driverName: '平台司机 driver-1',
        rating: 5,
        tags: ['沟通顺畅'],
        content: '货主配合很好',
        anonymous: false,
        submittedAtIso: '2026-07-09T10:00:00.000Z',
      },
      {
        id: 'received-platform-anonymous',
        orderId: 'order-platform-2',
        orderNo: 'HY202607090004',
        driverName: '平台司机 driver-2',
        rating: 4,
        tags: ['付款及时'],
        content: '匿名司机评价内容',
        anonymous: true,
        submittedAtIso: '2026-07-09T09:30:00.000Z',
      },
    ],
  });

  expect(records).toEqual([
    {
      id: 'received-evaluation-platform-received-platform-1',
      orderId: 'HY202607090003',
      driverName: '平台司机 driver-1',
      ratingText: '5 星',
      content: '货主配合很好',
      photoText: '',
      timeText: '司机评价：2026-07-09 10:00',
      driverReplyText: '',
      driverReplyTimeText: '',
    },
    {
      id: 'received-evaluation-platform-received-platform-anonymous',
      orderId: 'HY202607090004',
      driverName: '匿名司机评价',
      ratingText: '4 星',
      content: '匿名司机评价内容',
      photoText: '',
      timeText: '司机评价：2026-07-09 09:30',
      driverReplyText: '',
      driverReplyTimeText: '',
    },
  ]);
});

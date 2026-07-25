import type { RecentOrder } from '../src/types';
import {
  createLocalReceivedEvaluationRecordsFromPlatformSnapshot,
  createLocalEvaluationRecordsFromPlatformSnapshot,
  createLocalEvaluationRecordsFromPlatformSnapshots,
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
    direction: 'shipper_to_driver',
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
        submittedAtText: '2026-07-15 16:00',
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
    timeText: '2026-07-15 16:00',
    driverReplyText: '',
    driverReplyTimeText: '',
    direction: 'shipper_to_driver',
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

test('includes local driver-to-shipper evaluations in profile records', () => {
  const records = createEvaluationRecords([
    createOrder({
      id: 'HY-RECEIVED',
      driverInfo: {
        driverId: 'driver-2',
        driverName: '赵师傅',
        driverPhone: '13800000001',
        ratingText: '4.9 分',
        vehicleText: '高栏车',
        plateNumber: '粤B54321',
        completedOrdersText: '420 单',
      },
      shipperEvaluation: {
        rating: 5,
        tags: ['沟通顺畅'],
        content: '货主配合高效，现场衔接顺畅。',
        submittedAtText: '2026-07-16 10:30',
        photoCount: 1,
        photoFiles: [
          {
            fileId: 'file-shipper-evaluation-1',
            fileName: '司机评价图片凭证 1',
            purpose: 'evaluation',
            status: 'uploaded',
            publicUrl:
              'https://cdn.example.com/file-shipper-evaluation-1.png',
          },
        ],
      },
    }),
  ]);

  expect(records[0]).toEqual({
    id: 'received-evaluation-local-HY-RECEIVED',
    orderId: 'HY-RECEIVED',
    driverName: '赵师傅',
    ratingText: '5 星',
    content: '货主配合高效，现场衔接顺畅。',
    photoText: '图片凭证 1 张',
    timeText: '司机评价：2026-07-16 10:30',
    driverReplyText: '',
    driverReplyTimeText: '',
    direction: 'driver_to_shipper',
    photoFiles: [
      {
        fileId: 'file-shipper-evaluation-1',
        fileName: '司机评价图片凭证 1',
        purpose: 'evaluation',
        status: 'uploaded',
        publicUrl:
          'https://cdn.example.com/file-shipper-evaluation-1.png',
      },
    ],
  });
});

test('sorts local evaluation records by submittedAtIso descending before mock items', () => {
  const records = createEvaluationRecords([
    createOrder({
      id: 'HY-OLDER',
      updatedAtIso: '2026-07-15T08:00:00.000Z',
      evaluation: {
        rating: 4,
        tags: ['沟通顺畅'],
        content: '较早提交的货主评价。',
        submittedAtIso: '2026-07-15T08:00:00.000Z',
        submittedAtText: '2026-07-15 16:00',
      },
    }),
    createOrder({
      id: 'HY-NEWER',
      updatedAtIso: '2026-07-16T02:30:00.000Z',
      shipperEvaluation: {
        rating: 5,
        tags: ['沟通顺畅'],
        content: '更新提交的司机评价货主记录。',
        submittedAtIso: '2026-07-16T02:30:00.000Z',
        submittedAtText: '2026-07-16 10:30',
      },
    }),
  ]);

  expect(records[0]).toMatchObject({
    id: 'received-evaluation-local-HY-NEWER',
    timeText: '司机评价：2026-07-16 10:30',
  });
  expect(records[1]).toMatchObject({
    id: 'evaluation-local-HY-OLDER',
    timeText: '2026-07-15 16:00',
  });
  expect(records[2].id).toBe('evaluation-1');
});

test('sorts local profile evaluation records from platform snapshot by submitted time', () => {
  const records = createLocalEvaluationRecordsFromPlatformSnapshot({
    shipperId: 'shipper-1',
    items: [
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
      timeText: '平台提交：2026-07-09 17:00',
      driverReplyText: '',
      driverReplyTimeText: '',
      direction: 'shipper_to_driver',
      photoFiles: [
        {
          fileId: 'file-eval-1',
          fileName: '评价图片凭证 1',
          purpose: 'evaluation',
          status: 'uploaded',
        },
        {
          fileId: 'file-eval-2',
          fileName: '评价图片凭证 2',
          purpose: 'evaluation',
          status: 'uploaded',
        },
      ],
    },
    {
      id: 'evaluation-platform-evaluation-platform-anonymous',
      orderId: 'HY202607090002',
      driverName: '匿名评价',
      ratingText: '4 星',
      content: '匿名平台评价内容',
      photoText: '',
      timeText: '平台提交：2026-07-09 16:00',
      driverReplyText: '感谢反馈',
      driverReplyTimeText: '2026-07-09 16:30',
      direction: 'shipper_to_driver',
    },
  ]);
});

test('sorts local received evaluation records from platform snapshot by submitted time', () => {
  const records = createLocalReceivedEvaluationRecordsFromPlatformSnapshot({
    shipperId: 'shipper-1',
    items: [
      {
        id: 'received-platform-anonymous',
        orderId: 'order-platform-2',
        orderNo: 'HY202607090004',
        driverName: '平台司机 driver-2',
        rating: 4,
        tags: ['付款及时'],
        content: '匿名司机评价内容',
        anonymous: true,
        photoCount: 0,
        submittedAtIso: '2026-07-09T09:30:00.000Z',
      },
      {
        id: 'received-platform-1',
        orderId: 'order-platform-1',
        orderNo: 'HY202607090003',
        driverName: '平台司机 driver-1',
        rating: 5,
        tags: ['沟通顺畅'],
        content: '货主配合很好',
        anonymous: false,
        photoCount: 1,
        photoFileIds: ['file-received-1'],
        submittedAtIso: '2026-07-09T10:00:00.000Z',
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
      photoText: '图片凭证 1 张',
      timeText: '司机评价：2026-07-09 18:00',
      driverReplyText: '',
      driverReplyTimeText: '',
      direction: 'driver_to_shipper',
      photoFiles: [
        {
          fileId: 'file-received-1',
          fileName: '司机评价图片凭证 1',
          purpose: 'evaluation',
          status: 'uploaded',
        },
      ],
    },
    {
      id: 'received-evaluation-platform-received-platform-anonymous',
      orderId: 'HY202607090004',
      driverName: '匿名司机评价',
      ratingText: '4 星',
      content: '匿名司机评价内容',
      photoText: '',
      timeText: '司机评价：2026-07-09 17:30',
      driverReplyText: '',
      driverReplyTimeText: '',
      direction: 'driver_to_shipper',
    },
  ]);
});

test('merges platform sent and received evaluation records by submitted time', () => {
  const records = createLocalEvaluationRecordsFromPlatformSnapshots(
    {
      shipperId: 'shipper-1',
      items: [
        {
          id: 'evaluation-platform-older',
          orderId: 'order-platform-1',
          orderNo: 'HY202607090001',
          driverName: '平台司机 driver-1',
          rating: 4,
          tags: ['沟通顺畅'],
          content: '较早的货主评价',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-09T08:00:00.000Z',
        },
        {
          id: 'evaluation-platform-newer',
          orderId: 'order-platform-2',
          orderNo: 'HY202607090002',
          driverName: '平台司机 driver-2',
          rating: 5,
          tags: ['服务好'],
          content: '较新的货主评价',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-09T09:00:00.000Z',
        },
      ],
    },
    {
      shipperId: 'shipper-1',
      items: [
        {
          id: 'received-platform-newest',
          orderId: 'order-platform-3',
          orderNo: 'HY202607090003',
          driverName: '平台司机 driver-3',
          rating: 5,
          tags: ['配合高效'],
          content: '最新的司机评价货主记录',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-09T10:00:00.000Z',
        },
        {
          id: 'received-platform-mid',
          orderId: 'order-platform-4',
          orderNo: 'HY202607090004',
          driverName: '平台司机 driver-4',
          rating: 4,
          tags: ['沟通顺畅'],
          content: '中间时间的司机评价货主记录',
          anonymous: true,
          photoCount: 0,
          submittedAtIso: '2026-07-09T08:30:00.000Z',
        },
      ],
    },
  );

  expect(records.map(item => item.id)).toEqual([
    'received-evaluation-platform-received-platform-newest',
    'evaluation-platform-evaluation-platform-newer',
    'received-evaluation-platform-received-platform-mid',
    'evaluation-platform-evaluation-platform-older',
  ]);
});

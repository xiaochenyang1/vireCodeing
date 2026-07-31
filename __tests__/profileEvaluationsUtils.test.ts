import type { RecentOrder } from '../src/types';
import {
  applySubmittedEvaluationAppeal,
  canSubmitEvaluationAppeal,
  createLocalReceivedEvaluationRecordsFromPlatformSnapshot,
  createLocalEvaluationRecordsFromPlatformSnapshot,
  createLocalEvaluationRecordsFromPlatformSnapshots,
  createEvaluationRecords,
  filterEvaluationRecords,
  getEvaluationAppealStatusText,
  hydrateProfileEvaluationRecords,
  mergeEvaluationAppealCases,
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
  expect(filterEvaluationRecords(records, 'high').map(item => item.id)).toEqual(
    ['five'],
  );
  expect(
    filterEvaluationRecords(records, 'lower').map(item => item.id),
  ).toEqual(['four', 'three']);
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
            publicUrl: 'https://cdn.example.com/file-shipper-evaluation-1.png',
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
        publicUrl: 'https://cdn.example.com/file-shipper-evaluation-1.png',
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
      platformOrderId: 'order-platform-1',
      platformEvaluationId: 'evaluation-platform-1',
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
      platformOrderId: 'order-platform-2',
      platformEvaluationId: 'evaluation-platform-anonymous',
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
      platformOrderId: 'order-platform-1',
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
      platformOrderId: 'order-platform-2',
    },
  ]);
});

test('hydrates received evaluation attachments through order participant access', async () => {
  const getOrderAttachmentPreview = jest.fn().mockResolvedValue({
    fileId: 'file-received-1',
    previewUrl: 'https://cdn.example.com/received-preview.jpg',
    previewExpiresAtIso: '2026-07-31T09:00:00.000Z',
  });
  const getFileMetadata = jest.fn();
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
        photoCount: 1,
        photoFileIds: ['file-received-1'],
        submittedAtIso: '2026-07-09T10:00:00.000Z',
      },
    ],
  });

  const hydrated = await hydrateProfileEvaluationRecords(
    [
      records[0],
      {
        ...records[0],
        id: 'received-platform-copy',
        photoFiles: records[0].photoFiles?.map(file => ({
          ...file,
          fileName: '同文件的另一处展示名',
        })),
      },
    ],
    {
      getOrderAttachmentPreview,
      getFileMetadata,
    },
  );

  expect(getOrderAttachmentPreview).toHaveBeenCalledWith(
    'order-platform-1',
    'file-received-1',
  );
  expect(getOrderAttachmentPreview).toHaveBeenCalledTimes(1);
  expect(getFileMetadata).not.toHaveBeenCalled();
  expect(hydrated[0].photoFiles?.[0]).toMatchObject({
    fileId: 'file-received-1',
    status: 'uploaded',
    publicUrl: 'https://cdn.example.com/received-preview.jpg',
  });
  expect(hydrated[1].photoFiles?.[0].fileName).toBe('同文件的另一处展示名');
});

test('falls back to owner metadata when order attachment hydration fails', async () => {
  const getOrderAttachmentPreview = jest
    .fn()
    .mockRejectedValue(new Error('legacy order reference missing'));
  const getFileMetadata = jest.fn().mockResolvedValue({
    id: 'file-authored-1',
    ownerUserId: 'shipper-1',
    purpose: 'evaluation',
    objectKey: 'shipper-1/evaluation/file-authored-1.jpg',
    status: 'uploaded',
    publicUrl: 'https://cdn.example.com/authored-preview.jpg',
    createdAtIso: '2026-07-31T08:00:00.000Z',
  });
  const records = createLocalEvaluationRecordsFromPlatformSnapshot({
    shipperId: 'shipper-1',
    items: [
      {
        id: 'authored-platform-1',
        orderId: 'order-platform-1',
        orderNo: 'HY202607090003',
        driverName: '平台司机 driver-1',
        rating: 5,
        tags: ['准时送达'],
        content: '服务很好',
        anonymous: false,
        photoCount: 1,
        photoFileIds: ['file-authored-1'],
        submittedAtIso: '2026-07-09T10:00:00.000Z',
      },
    ],
  });

  const hydrated = await hydrateProfileEvaluationRecords(records, {
    getOrderAttachmentPreview,
    getFileMetadata,
  });

  expect(getFileMetadata).toHaveBeenCalledWith('file-authored-1');
  expect(hydrated[0].photoFiles?.[0].publicUrl).toBe(
    'https://cdn.example.com/authored-preview.jpg',
  );
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

test('merges hidden appeal cases into evaluation records and preserves appeal fields', () => {
  const records = createLocalEvaluationRecordsFromPlatformSnapshots(
    {
      shipperId: 'shipper-1',
      items: [
        {
          id: 'evaluation-visible',
          orderId: 'order-1',
          orderNo: 'HY-1',
          driverName: '李师傅',
          rating: 5,
          tags: [],
          content: '可见评价',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-22T08:00:00.000Z',
        },
      ],
    },
    {
      shipperId: 'shipper-1',
      items: [],
    },
  );

  const merged = mergeEvaluationAppealCases(records, {
    userId: 'shipper-1',
    items: [
      {
        id: 'evaluation-visible',
        orderId: 'order-1',
        orderNo: 'HY-1',
        direction: 'shipper_to_driver',
        reviewerUserId: 'shipper-1',
        reviewerName: '货主',
        revieweeUserId: 'driver-1',
        revieweeName: '李师傅',
        rating: 5,
        tags: [],
        content: '可见评价',
        anonymous: false,
        photoCount: 0,
        submittedAtIso: '2026-07-22T08:00:00.000Z',
        moderationStatus: 'hidden',
        moderationVersion: 2,
        appealStatus: 'requested',
        latestAppeal: {
          id: 'appeal-1',
          evaluationId: 'evaluation-visible',
          appellantUserId: 'shipper-1',
          status: 'requested',
          version: 1,
          reason: '内容被误隐藏，请复核',
          moderationVersion: 2,
          submittedAtIso: '2026-07-22T09:00:00.000Z',
        },
      },
      {
        id: 'evaluation-hidden-only',
        orderId: 'order-2',
        orderNo: 'HY-2',
        direction: 'shipper_to_driver',
        reviewerUserId: 'shipper-1',
        reviewerName: '货主',
        revieweeUserId: 'driver-2',
        revieweeName: '王师傅',
        rating: 3,
        tags: [],
        content: '仅申诉列表可见的隐藏评价',
        anonymous: false,
        photoCount: 0,
        submittedAtIso: '2026-07-22T07:00:00.000Z',
        moderationStatus: 'hidden',
        moderationVersion: 1,
        appealStatus: 'none',
      },
    ],
  });

  expect(merged[0]).toMatchObject({
    platformEvaluationId: 'evaluation-hidden-only',
    moderationStatus: 'hidden',
    moderationVersion: 1,
    appealStatus: 'none',
  });
  expect(merged[1]).toMatchObject({
    platformEvaluationId: 'evaluation-visible',
    moderationStatus: 'hidden',
    moderationVersion: 2,
    appealStatus: 'requested',
    appealReason: '内容被误隐藏，请复核',
  });
});

test('only hidden evaluations without open appeals can be appealed', () => {
  expect(
    canSubmitEvaluationAppeal(
      createEvaluationRecord({
        platformEvaluationId: 'evaluation-1',
        moderationStatus: 'hidden',
        moderationVersion: 2,
        appealStatus: 'none',
      }),
    ),
  ).toBe(true);
  expect(
    canSubmitEvaluationAppeal(
      createEvaluationRecord({
        platformEvaluationId: 'evaluation-1',
        moderationStatus: 'hidden',
        moderationVersion: 2,
        appealStatus: 'rejected',
      }),
    ),
  ).toBe(true);
  expect(
    canSubmitEvaluationAppeal(
      createEvaluationRecord({
        platformEvaluationId: 'evaluation-1',
        moderationStatus: 'hidden',
        moderationVersion: 2,
        appealStatus: 'requested',
      }),
    ),
  ).toBe(false);
  expect(
    canSubmitEvaluationAppeal(
      createEvaluationRecord({
        platformEvaluationId: 'evaluation-1',
        moderationStatus: 'visible',
        moderationVersion: 2,
        appealStatus: 'none',
      }),
    ),
  ).toBe(false);
  expect(getEvaluationAppealStatusText('requested')).toBe('申诉处理中');
  expect(
    applySubmittedEvaluationAppeal(
      createEvaluationRecord({
        platformEvaluationId: 'evaluation-1',
        moderationStatus: 'hidden',
        moderationVersion: 2,
        appealStatus: 'none',
      }),
      {
        reason: '请恢复展示该评价',
        moderationVersion: 2,
      },
    ),
  ).toMatchObject({
    appealStatus: 'requested',
    appealReason: '请恢复展示该评价',
    moderationVersion: 2,
  });
});

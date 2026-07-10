import { InMemoryProfileEvaluationsRepository } from './profile-evaluations.repository';
import { ProfileEvaluationsService } from './profile-evaluations.service';

describe('ProfileEvaluationsService', () => {
  it('returns current shipper evaluation records derived from order events', async () => {
    const repository = new InMemoryProfileEvaluationsRepository({
      orders: [
        createOrder({
          id: 'order-latest',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090002',
          events: [
            createEvent({
              id: 'accepted-latest',
              actorUserId: 'driver-9',
              eventType: 'driver_accepted',
              noteText: JSON.stringify({
                noteText: '司机接单',
                driverSnapshot: {
                  driverName: '李师傅',
                },
              }),
              createdAtIso: '2026-07-09T07:30:00.000Z',
            }),
            createEvent({
              id: 'evaluation-latest',
              actorUserId: 'shipper-1',
              eventType: 'evaluation_submitted',
              noteText:
                '5 星：准时送达、服务好；匿名评价；图片凭证 2 张；司机服务细致；交付顺畅',
              attachmentFileIds: ['file-eval-1', 'file-eval-2'],
              createdAtIso: '2026-07-09T09:00:00.000Z',
            }),
          ],
        }),
        createOrder({
          id: 'order-older',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090001',
          events: [
            createEvent({
              id: 'evaluation-older',
              actorUserId: 'shipper-1',
              eventType: 'evaluation_submitted',
              noteText: '4 星：沟通顺畅；整体不错',
              createdAtIso: '2026-07-09T08:00:00.000Z',
            }),
          ],
        }),
        createOrder({
          id: 'order-other-shipper',
          shipperId: 'shipper-2',
          orderNo: 'HY202607090099',
          events: [
            createEvent({
              id: 'evaluation-other',
              actorUserId: 'shipper-2',
              eventType: 'evaluation_submitted',
              noteText: '5 星：准时；不应该出现在 shipper-1 快照里',
              createdAtIso: '2026-07-09T10:00:00.000Z',
            }),
          ],
        }),
      ],
    });
    const service = new ProfileEvaluationsService(repository);

    await expect(service.listRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'evaluation-latest',
          orderId: 'order-latest',
          orderNo: 'HY202607090002',
          driverName: '李师傅',
          rating: 5,
          tags: ['准时送达', '服务好'],
          content: '司机服务细致；交付顺畅',
          anonymous: true,
          photoCount: 2,
          photoFileIds: ['file-eval-1', 'file-eval-2'],
          submittedAtIso: '2026-07-09T09:00:00.000Z',
        },
        {
          id: 'evaluation-older',
          orderId: 'order-older',
          orderNo: 'HY202607090001',
          driverName: '未知司机',
          rating: 4,
          tags: ['沟通顺畅'],
          content: '整体不错',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-09T08:00:00.000Z',
        },
      ],
    });
  });

  it('skips malformed evaluation event notes instead of leaking broken records', async () => {
    const repository = new InMemoryProfileEvaluationsRepository({
      orders: [
        createOrder({
          shipperId: 'shipper-1',
          events: [
            createEvent({
              id: 'bad-evaluation',
              eventType: 'evaluation_submitted',
              noteText: '评价格式乱了',
            }),
          ],
        }),
      ],
    });
    const service = new ProfileEvaluationsService(repository);

    await expect(service.listRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [],
    });
  });

  it('includes the latest driver reply after the shipper evaluation', async () => {
    const repository = new InMemoryProfileEvaluationsRepository({
      orders: [
        createOrder({
          id: 'order-replied',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090003',
          events: [
            createEvent({
              id: 'accepted',
              actorUserId: 'driver-1',
              eventType: 'driver_accepted',
              noteText: JSON.stringify({
                noteText: '司机接单',
                driverSnapshot: {
                  driverName: '王师傅',
                },
              }),
              createdAtIso: '2026-07-09T07:30:00.000Z',
            }),
            createEvent({
              id: 'early-reply',
              actorUserId: 'driver-1',
              eventType: 'evaluation_replied',
              noteText: '这条早于评价，不应展示',
              createdAtIso: '2026-07-09T07:45:00.000Z',
            }),
            createEvent({
              id: 'evaluation',
              actorUserId: 'shipper-1',
              eventType: 'evaluation_submitted',
              noteText: '5 星：准时送达；服务细致',
              createdAtIso: '2026-07-09T08:00:00.000Z',
            }),
            createEvent({
              id: 'other-driver-reply',
              actorUserId: 'driver-2',
              eventType: 'evaluation_replied',
              noteText: '不应串到 driver-1 的评价',
              createdAtIso: '2026-07-09T08:10:00.000Z',
            }),
            createEvent({
              id: 'first-reply',
              actorUserId: 'driver-1',
              eventType: 'evaluation_replied',
              noteText: '谢谢认可。',
              createdAtIso: '2026-07-09T08:20:00.000Z',
            }),
            createEvent({
              id: 'latest-reply',
              actorUserId: 'driver-1',
              eventType: 'evaluation_replied',
              noteText: '谢谢认可，后续继续保持。',
              createdAtIso: '2026-07-09T08:30:00.000Z',
            }),
          ],
        }),
      ],
    });
    const service = new ProfileEvaluationsService(repository);

    await expect(service.listRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'evaluation',
          orderId: 'order-replied',
          orderNo: 'HY202607090003',
          driverName: '王师傅',
          rating: 5,
          tags: ['准时送达'],
          content: '服务细致',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-09T08:00:00.000Z',
          driverReplyText: '谢谢认可，后续继续保持。',
          driverReplyAtIso: '2026-07-09T08:30:00.000Z',
        },
      ],
    });
  });

  it('falls back to the latest driver quote snapshot when accepted event keeps legacy plain text', async () => {
    const repository = new InMemoryProfileEvaluationsRepository({
      orders: [
        createOrder({
          id: 'order-quote-fallback',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090010',
          events: [
            createEvent({
              id: 'quote',
              actorUserId: 'driver-6',
              eventType: 'driver_quote_submitted',
              noteText: JSON.stringify({
                quoteCents: 86000,
                arrivalText: '40 分钟到达',
                driverSnapshot: {
                  driverName: '陈师傅',
                },
              }),
              createdAtIso: '2026-07-09T07:00:00.000Z',
            }),
            createEvent({
              id: 'accepted',
              actorUserId: 'driver-6',
              eventType: 'driver_accepted',
              noteText: '司机接单',
              createdAtIso: '2026-07-09T07:20:00.000Z',
            }),
            createEvent({
              id: 'evaluation',
              actorUserId: 'shipper-1',
              eventType: 'evaluation_submitted',
              noteText: '5 星：沟通顺畅；整体配合很好',
              createdAtIso: '2026-07-09T08:00:00.000Z',
            }),
          ],
        }),
      ],
    });
    const service = new ProfileEvaluationsService(repository);

    await expect(service.listRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'evaluation',
          orderId: 'order-quote-fallback',
          orderNo: 'HY202607090010',
          driverName: '陈师傅',
          rating: 5,
          tags: ['沟通顺畅'],
          content: '整体配合很好',
          anonymous: false,
          photoCount: 0,
          submittedAtIso: '2026-07-09T08:00:00.000Z',
        },
      ],
    });
  });

  it('returns current shipper received evaluation records derived from driver events', async () => {
    const repository = new InMemoryProfileEvaluationsRepository({
      orders: [
        createOrder({
          id: 'order-received-latest',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090004',
          events: [
            createEvent({
              id: 'accepted-received-latest',
              actorUserId: 'driver-9',
              eventType: 'driver_accepted',
              noteText: JSON.stringify({
                noteText: '司机接单',
                driverSnapshot: {
                  driverName: '赵师傅',
                },
              }),
              createdAtIso: '2026-07-09T09:30:00.000Z',
            }),
            createEvent({
              id: 'received-latest',
              actorUserId: 'driver-9',
              eventType: 'shipper_evaluation_submitted',
              noteText: '5 星：沟通顺畅、装卸高效；货主配合很好',
              createdAtIso: '2026-07-09T10:00:00.000Z',
            }),
          ],
        }),
        createOrder({
          id: 'order-received-anonymous',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090003',
          events: [
            createEvent({
              id: 'quote-received-anonymous',
              actorUserId: 'driver-8',
              eventType: 'driver_quote_submitted',
              noteText: JSON.stringify({
                quoteCents: 79000,
                arrivalText: '35 分钟到达',
                driverSnapshot: {
                  driverName: '孙师傅',
                },
              }),
              createdAtIso: '2026-07-09T08:30:00.000Z',
            }),
            createEvent({
              id: 'received-anonymous',
              actorUserId: 'driver-8',
              eventType: 'shipper_evaluation_submitted',
              noteText: '4 星：付款及时；匿名评价；整体合作顺畅',
              createdAtIso: '2026-07-09T09:00:00.000Z',
            }),
          ],
        }),
        createOrder({
          id: 'order-other-shipper',
          shipperId: 'shipper-2',
          orderNo: 'HY202607090099',
          events: [
            createEvent({
              id: 'received-other',
              actorUserId: 'driver-7',
              eventType: 'shipper_evaluation_submitted',
              noteText: '5 星：沟通顺畅；不应该出现在 shipper-1 快照里',
              createdAtIso: '2026-07-09T11:00:00.000Z',
            }),
          ],
        }),
      ],
    });
    const service = new ProfileEvaluationsService(repository);

    await expect(service.listReceivedRecords('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'received-latest',
          orderId: 'order-received-latest',
          orderNo: 'HY202607090004',
          driverName: '赵师傅',
          rating: 5,
          tags: ['沟通顺畅', '装卸高效'],
          content: '货主配合很好',
          anonymous: false,
          submittedAtIso: '2026-07-09T10:00:00.000Z',
        },
        {
          id: 'received-anonymous',
          orderId: 'order-received-anonymous',
          orderNo: 'HY202607090003',
          driverName: '孙师傅',
          rating: 4,
          tags: ['付款及时'],
          content: '整体合作顺畅',
          anonymous: true,
          submittedAtIso: '2026-07-09T09:00:00.000Z',
        },
      ],
    });
  });

  it('returns admin evaluation audit records for both evaluation directions', async () => {
    const repository = new InMemoryProfileEvaluationsRepository({
      orders: [
        createOrder({
          id: 'order-audit-1',
          shipperId: 'shipper-1',
          orderNo: 'HY202607090005',
          events: [
            createEvent({
              id: 'accepted-audit',
              actorUserId: 'driver-1',
              eventType: 'driver_accepted',
              noteText: JSON.stringify({
                noteText: '司机接单',
                driverSnapshot: {
                  driverName: '李师傅',
                },
              }),
              createdAtIso: '2026-07-09T07:30:00.000Z',
            }),
            createEvent({
              id: 'shipper-to-driver',
              actorUserId: 'shipper-1',
              eventType: 'evaluation_submitted',
              noteText: '5 星：准时送达；司机服务细致',
              attachmentFileIds: ['file-eval-1'],
              createdAtIso: '2026-07-09T09:00:00.000Z',
            }),
            createEvent({
              id: 'driver-to-shipper',
              actorUserId: 'driver-1',
              eventType: 'shipper_evaluation_submitted',
              noteText: '4 星：沟通顺畅；货主配合装卸',
              createdAtIso: '2026-07-09T10:00:00.000Z',
            }),
          ],
        }),
      ],
    });
    const service = new ProfileEvaluationsService(repository);

    await expect(service.listAdminEvaluationAudits({ page: 1, pageSize: 20 }))
      .resolves.toEqual({
        items: [
          {
            id: 'driver-to-shipper',
            orderId: 'order-audit-1',
            orderNo: 'HY202607090005',
            direction: 'driver_to_shipper',
            reviewerUserId: 'driver-1',
            reviewerName: '李师傅',
            revieweeUserId: 'shipper-1',
            revieweeName: '平台货主 shipper-1',
            rating: 4,
            tags: ['沟通顺畅'],
            content: '货主配合装卸',
            anonymous: false,
            photoCount: 0,
            submittedAtIso: '2026-07-09T10:00:00.000Z',
          },
          {
            id: 'shipper-to-driver',
            orderId: 'order-audit-1',
            orderNo: 'HY202607090005',
            direction: 'shipper_to_driver',
            reviewerUserId: 'shipper-1',
            reviewerName: '平台货主 shipper-1',
            revieweeUserId: 'driver-1',
            revieweeName: '李师傅',
            rating: 5,
            tags: ['准时送达'],
            content: '司机服务细致',
            anonymous: false,
            photoCount: 1,
            photoFileIds: ['file-eval-1'],
            submittedAtIso: '2026-07-09T09:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      });
  });
});

function createOrder(
  overrides: Partial<{
    id: string;
    shipperId: string;
    orderNo: string;
    events: ReturnType<typeof createEvent>[];
  }>,
) {
  return {
    id: 'order-1',
    shipperId: 'shipper-1',
    orderNo: 'HY202607090001',
    events: [],
    ...overrides,
  };
}

function createEvent(
  overrides: Partial<{
    id: string;
    actorUserId: string;
    eventType: string;
    noteText: string;
    attachmentFileIds: string[];
    createdAtIso: string;
  }>,
) {
  return {
    id: 'event-1',
    actorUserId: 'shipper-1',
    eventType: 'evaluation_submitted',
    noteText: '5 星：准时；服务不错',
    createdAtIso: '2026-07-09T08:00:00.000Z',
    ...overrides,
  };
}

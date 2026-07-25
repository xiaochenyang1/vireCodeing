import {
  mapPlatformInboxMessagesToLocal,
  sortMessageCenterItemsChronologically,
} from '../src/utils/platformMessages';

describe('mapPlatformInboxMessagesToLocal', () => {
  it('maps platform inbox messages into local message center items ordered by latest creation time', () => {
    const items = mapPlatformInboxMessagesToLocal(
      [
        {
          id: 'msg-2',
          userId: 'shipper-1',
          audience: 'shipper',
          category: 'finance',
          title: '异常赔付已执行',
          content: '赔付已执行到账。',
          unread: false,
          createdAtIso: '2026-07-21T09:00:00.000Z',
          updatedAtIso: '2026-07-21T09:00:00.000Z',
        },
        {
          id: 'msg-1',
          userId: 'shipper-1',
          audience: 'shipper',
          category: 'order',
          title: '订单发布成功',
          content: '订单已发布，等待司机接单。',
          orderId: 'order-1',
          orderNo: 'HY20260721001',
          unread: true,
          createdAtIso: '2026-07-21T10:00:00.000Z',
          updatedAtIso: '2026-07-21T10:00:00.000Z',
        },
      ],
      new Date('2026-07-21T10:05:00.000Z'),
    );

    expect(items).toEqual([
      {
        id: 'msg-1',
        category: 'order',
        title: '订单发布成功',
        content: '订单已发布，等待司机接单。（订单 HY20260721001）',
        timeText: '5 分钟前',
        unread: true,
        createdAtIso: '2026-07-21T10:00:00.000Z',
        updatedAtIso: '2026-07-21T10:00:00.000Z',
        platformOrderId: 'order-1',
        orderNo: 'HY20260721001',
      },
      {
        id: 'msg-2',
        category: 'finance',
        title: '异常赔付已执行',
        content: '赔付已执行到账。',
        timeText: '1 小时前',
        unread: false,
        createdAtIso: '2026-07-21T09:00:00.000Z',
        updatedAtIso: '2026-07-21T09:00:00.000Z',
      },
    ]);
  });

  it('sorts mapped message items chronologically when a chat view needs oldest first', () => {
    const items = sortMessageCenterItemsChronologically([
      {
        id: 'msg-latest',
        category: 'service',
        title: '较新的消息',
        content: '第二条',
        timeText: '5 分钟前',
        unread: true,
        createdAtIso: '2026-07-21T10:00:00.000Z',
        updatedAtIso: '2026-07-21T10:00:00.000Z',
      },
      {
        id: 'msg-older',
        category: 'service',
        title: '较早的消息',
        content: '第一条',
        timeText: '1 小时前',
        unread: false,
        createdAtIso: '2026-07-21T09:00:00.000Z',
        updatedAtIso: '2026-07-21T09:00:00.000Z',
      },
    ]);

    expect(items.map(item => item.id)).toEqual(['msg-older', 'msg-latest']);
  });
});

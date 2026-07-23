import {
  inferSupportTicketMode,
  mergeSupportTicketsWithLocalFallback,
  mapPlatformSupportTicketToLocal,
  mapPlatformSupportTicketsToLocal,
} from '../src/utils/platformSupportTickets';

describe('platform support tickets utils', () => {
  const platformTicket = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    shipperId: 'shipper-1',
    channelName: '投诉建议',
    description: '司机沟通不及时，希望客服协助跟进',
    status: 'processing' as const,
    statusHistory: [
      {
        actionText: '工单已提交',
        timestampIso: '2026-07-22T08:30:00.000Z',
      },
      {
        actionText: '客服已受理',
        timestampIso: '2026-07-22T09:30:00.000Z',
      },
    ],
    createdAtIso: '2026-07-22T08:30:00.000Z',
    updatedAtIso: '2026-07-22T09:30:00.000Z',
  };

  test('maps a platform support ticket to the local help center model', () => {
    expect(
      mapPlatformSupportTicketToLocal(
        platformTicket,
        new Date('2026-07-22T10:30:00.000Z'),
      ),
    ).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
      statusText: '客服已受理',
      createdAtText: '2 小时前',
      createdAtIso: '2026-07-22T08:30:00.000Z',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '2 小时前',
          timestampIso: '2026-07-22T08:30:00.000Z',
        },
        {
          actionText: '客服已受理',
          timestampText: '1 小时前',
          timestampIso: '2026-07-22T09:30:00.000Z',
        },
      ],
    });
  });

  test('maps a platform support ticket created just now to submitted copy', () => {
    expect(
      mapPlatformSupportTicketToLocal(
        {
          ...platformTicket,
          status: 'pending',
          createdAtIso: '2026-07-22T10:30:00.000Z',
          statusHistory: [
            {
              actionText: '工单已提交',
              timestampIso: '2026-07-22T10:30:00.000Z',
            },
          ],
        },
        new Date('2026-07-22T10:30:20.000Z'),
      ),
    ).toMatchObject({
      statusText: '待客服跟进',
      createdAtText: '刚刚提交',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '刚刚提交',
        },
      ],
    });
  });

  test('maps lists and infers local/platform modes', () => {
    const platformTickets = mapPlatformSupportTicketsToLocal([platformTicket]);

    expect(platformTickets).toHaveLength(1);
    expect(inferSupportTicketMode(platformTickets)).toBe('platform');
    expect(
      inferSupportTicketMode([
        ...platformTickets,
        {
          id: 'support-ticket-1',
          channelName: '投诉建议',
          description: '本地兜底工单',
          statusText: '待客服跟进',
          createdAtText: '刚刚提交',
        },
      ]),
    ).toBe('platform');
    expect(
      inferSupportTicketMode([
        {
          ...platformTickets[0],
          id: 'support-ticket-1',
        },
      ]),
    ).toBe('local');
    expect(inferSupportTicketMode([])).toBe('local');
  });

  test('preserves local fallback tickets when platform tickets are refreshed', () => {
    const platformTickets = mapPlatformSupportTicketsToLocal([platformTicket]);

    expect(
      mergeSupportTicketsWithLocalFallback(platformTickets, [
        {
          id: 'support-ticket-3',
          channelName: '投诉建议',
          description: '本地兜底工单',
          statusText: '待客服跟进',
          createdAtText: '刚刚提交',
          createdAtIso: '2026-07-22T10:20:00.000Z',
          statusHistory: [
            {
              actionText: '工单已提交',
              timestampText: '刚刚提交',
              timestampIso: '2026-07-22T10:20:00.000Z',
            },
          ],
        },
      ]),
    ).toMatchObject([
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
      },
      {
        id: 'support-ticket-3',
        description: '本地兜底工单',
      },
    ]);
  });
});

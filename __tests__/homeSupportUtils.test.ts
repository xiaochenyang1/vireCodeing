import {
  appendSupportTicketStatus,
  createAddSupportTicketChange,
  createLocalSupportTicket,
  createUpdateSupportTicketStatusChange,
  getMessageOrderId,
} from '../src/utils/homeSupport';
import type { SupportTicket } from '../src/types';

afterEach(() => {
  jest.restoreAllMocks();
});

test('extracts order id from order message content', () => {
  expect(getMessageOrderId('订单 HY20260630001 已由司机接单')).toBe(
    'HY20260630001',
  );
  expect(getMessageOrderId('系统通知：暂无关联订单')).toBeUndefined();
});

test('creates local support ticket with initial history record', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(
    createLocalSupportTicket({
      currentTicketCount: 2,
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    }),
  ).toEqual({
    id: 'support-ticket-3',
    channelName: '投诉建议',
    description: '司机沟通不及时，希望客服协助跟进',
    statusText: '待客服跟进',
    createdAtText: '刚刚提交',
    createdAtIso: expectedIso,
    statusHistory: [
      {
        actionText: '工单已提交',
        timestampText: '刚刚提交',
        timestampIso: expectedIso,
      },
    ],
  });

  dateNowSpy.mockRestore();
});

test('appends local support ticket status history without mutating other tickets', () => {
  const tickets: SupportTicket[] = [
    {
      id: 'support-ticket-1',
      channelName: '投诉建议',
      description: '司机临时改价',
      statusText: '待客服跟进',
      createdAtText: '刚刚提交',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '刚刚提交',
        },
      ],
    },
    {
      id: 'support-ticket-2',
      channelName: '在线客服',
      description: '咨询发票',
      statusText: '已处理',
      createdAtText: '昨天',
    },
  ];

  expect(
    appendSupportTicketStatus(tickets, 'support-ticket-1', '客服已受理', {
      actionText: '客服已受理',
      timestampText: '刚刚',
    }),
  ).toEqual([
    {
      id: 'support-ticket-1',
      channelName: '投诉建议',
      description: '司机临时改价',
      statusText: '客服已受理',
      createdAtText: '刚刚提交',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampText: '刚刚提交',
        },
        {
          actionText: '客服已受理',
          timestampText: '刚刚',
        },
      ],
    },
    tickets[1],
  ]);
});

test('creates an add-ticket change and avoids existing local ticket ids', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
  const tickets: SupportTicket[] = [
    {
      id: 'support-ticket-1',
      channelName: '投诉建议',
      description: '司机临时改价',
      statusText: '待客服跟进',
      createdAtText: '刚刚提交',
    },
    {
      id: 'support-ticket-4',
      channelName: '在线客服',
      description: '咨询发票',
      statusText: '已处理',
      createdAtText: '昨天',
    },
  ];

  expect(
    createAddSupportTicketChange(tickets, {
      channelName: '投诉建议',
      description: '装货现场联系不上司机，请客服介入',
    }),
  ).toEqual({
    supportTickets: [
      {
        id: 'support-ticket-5',
        channelName: '投诉建议',
        description: '装货现场联系不上司机，请客服介入',
        statusText: '待客服跟进',
        createdAtText: '刚刚提交',
        createdAtIso: expectedIso,
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampText: '刚刚提交',
            timestampIso: expectedIso,
          },
        ],
      },
      ...tickets,
    ],
  });

  dateNowSpy.mockRestore();
});

test('creates an update-ticket change with appended processing history', () => {
  const now = new Date('2026-06-30T03:15:00.000Z').getTime();
  const expectedIso = new Date(now).toISOString();
  const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
  const tickets: SupportTicket[] = [
    {
      id: 'support-ticket-1',
      channelName: '投诉建议',
      description: '司机临时改价',
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
    createUpdateSupportTicketStatusChange(
      tickets,
      'support-ticket-1',
      '客服已受理',
      {
        actionText: '客服已受理',
        timestampText: '刚刚',
      },
    ),
  ).toEqual({
    supportTickets: [
      {
        ...tickets[0],
        statusText: '客服已受理',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampText: '刚刚提交',
          },
          {
            actionText: '客服已受理',
            timestampText: '刚刚',
            timestampIso: expectedIso,
          },
        ],
      },
    ],
  });

  dateNowSpy.mockRestore();
});

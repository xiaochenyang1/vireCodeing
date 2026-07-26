import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  AdminSupportTicketsController,
  SupportTicketsController,
} from './support-tickets.controller';
import type { SupportTicketOverdueEscalationService } from './support-ticket-overdue-escalation.service';
import type { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsController', () => {
  it('lists the current shipper support tickets', async () => {
    const service = {
      listSupportTickets: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [
          {
            id: 'ticket-1',
            shipperId: 'shipper-1',
            channelName: '投诉建议',
            description: '司机沟通不及时，希望客服协助跟进',
            status: 'pending',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
            ],
            sla: {
              policyKey: 'support_ticket_default_v1',
              stage: 'first_response',
              status: 'within_target',
              targetAtIso: '2026-07-22T09:00:00.000Z',
              remainingMinutes: 30,
            },
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:30:00.000Z',
          },
        ],
      }),
    } as unknown as SupportTicketsService;
    const controller = new SupportTicketsController(service);

    await expect(
      controller.listSupportTickets(createRequest('shipper-1')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        items: [
          {
            id: 'ticket-1',
            channelName: '投诉建议',
            sla: {
              stage: 'first_response',
            },
          },
        ],
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.listSupportTickets).toHaveBeenCalledWith('shipper-1');
  });

  it('creates the current shipper support ticket', async () => {
    const service = {
      createSupportTicket: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'pending',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampIso: '2026-07-22T08:30:00.000Z',
          },
        ],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'first_response',
          status: 'within_target',
          targetAtIso: '2026-07-22T09:00:00.000Z',
          remainingMinutes: 30,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:30:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new SupportTicketsController(service);
    const body = {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    };

    await expect(
      controller.createSupportTicket(createRequest('shipper-1'), body),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        channelName: '投诉建议',
        sla: {
          stage: 'first_response',
        },
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.createSupportTicket).toHaveBeenCalledWith('shipper-1', body);
  });

  it('rejects non-shipper users before listing support tickets', async () => {
    const service = {
      listSupportTickets: jest.fn(),
    } as unknown as SupportTicketsService;
    const controller = new SupportTicketsController(service);

    await expect(
      controller.listSupportTickets(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.listSupportTickets).not.toHaveBeenCalled();
  });

  it('lists admin support tickets with filters', async () => {
    const service = {
      listSupportTicketsForAdmin: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'ticket-1',
            shipperId: 'shipper-1',
            channelName: '投诉建议',
            description: '司机沟通不及时，希望客服协助跟进',
            status: 'processing',
            statusHistory: [],
            sla: {
              policyKey: 'support_ticket_default_v1',
              stage: 'resolution',
              status: 'within_target',
              targetAtIso: '2026-07-23T08:35:00.000Z',
              remainingMinutes: 1440,
            },
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:35:00.000Z',
          },
        ],
        page: 2,
        pageSize: 10,
        total: 21,
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );

    await expect(
      controller.listSupportTickets(createRequest('admin-1', 'admin'), {
        page: '2',
        pageSize: '10',
        status: 'processing',
        slaStatus: 'within_target',
        claimStatus: 'claimed',
        claimedByAdminUserId: 'admin-1',
        keyword: '投诉',
      }),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        page: 2,
        pageSize: 10,
        total: 21,
        items: [
          {
            id: 'ticket-1',
            status: 'processing',
            sla: {
              stage: 'resolution',
            },
          },
        ],
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.listSupportTicketsForAdmin).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: 'processing',
      slaStatus: 'within_target',
      claimStatus: 'claimed',
      claimedByAdminUserId: 'admin-1',
      keyword: '投诉',
    });
  });

  it('gets an admin support ticket detail', async () => {
    const service = {
      getSupportTicketForAdmin: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'processing',
        statusHistory: [
          {
            actionText: '客服已受理',
            timestampIso: '2026-07-22T08:35:00.000Z',
            fromStatus: 'pending',
            toStatus: 'processing',
            operatorUserId: 'admin-1',
            content: '已联系货主核实问题，转客服受理跟进。',
          },
        ],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'resolution',
          status: 'within_target',
          targetAtIso: '2026-07-23T08:35:00.000Z',
          remainingMinutes: 1440,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:35:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );

    await expect(
      controller.getSupportTicket(createRequest('admin-1', 'admin'), 'ticket-1'),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        status: 'processing',
        sla: {
          stage: 'resolution',
        },
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.getSupportTicketForAdmin).toHaveBeenCalledWith('ticket-1');
  });

  it('processes an admin support ticket', async () => {
    const service = {
      processSupportTicket: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'processing',
        statusHistory: [],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'resolution',
          status: 'within_target',
          targetAtIso: '2026-07-23T08:35:00.000Z',
          remainingMinutes: 1440,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:35:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );
    const body = {
      baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
      content: '已联系货主核实问题，转客服受理跟进。',
    };

    await expect(
      controller.processSupportTicket(
        createRequest('admin-1', 'admin'),
        'ticket-1',
        body,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        status: 'processing',
        sla: {
          stage: 'resolution',
        },
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.processSupportTicket).toHaveBeenCalledWith(
      'admin-1',
      'ticket-1',
      body,
    );
  });

  it('claims an admin support ticket', async () => {
    const service = {
      claimSupportTicket: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'processing',
        claimedByAdminUserId: 'admin-1',
        claimedAtIso: '2026-07-22T08:36:00.000Z',
        claimNote: '当前客服接手跟进。',
        statusHistory: [],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'resolution',
          status: 'within_target',
          targetAtIso: '2026-07-23T08:35:00.000Z',
          remainingMinutes: 1439,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:36:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );
    const body = {
      baseUpdatedAtIso: '2026-07-22T08:35:00.000Z',
      content: ' 当前客服接手跟进。 ',
    };

    await expect(
      controller.claimSupportTicket(
        createRequest('admin-1', 'admin'),
        'ticket-1',
        body,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        claimedByAdminUserId: 'admin-1',
        claimNote: '当前客服接手跟进。',
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.claimSupportTicket).toHaveBeenCalledWith(
      'admin-1',
      'ticket-1',
      {
        baseUpdatedAtIso: '2026-07-22T08:35:00.000Z',
        content: '当前客服接手跟进。',
      },
    );
  });

  it('assigns or transfers an admin support ticket to a specific administrator', async () => {
    const service = {
      assignSupportTicket: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'processing',
        claimedByAdminUserId: 'admin-2',
        claimedAtIso: '2026-07-22T08:37:00.000Z',
        claimNote: '白班客服接手继续跟进。',
        statusHistory: [],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'resolution',
          status: 'within_target',
          targetAtIso: '2026-07-23T08:35:00.000Z',
          remainingMinutes: 1438,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:37:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );
    const body = {
      baseUpdatedAtIso: '2026-07-22T08:36:00.000Z',
      targetAdminUserId: ' admin-2 ',
      content: ' 白班客服接手继续跟进。 ',
    };

    await expect(
      controller.assignSupportTicket(
        createRequest('admin-1', 'admin'),
        'ticket-1',
        body,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        claimedByAdminUserId: 'admin-2',
        claimNote: '白班客服接手继续跟进。',
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.assignSupportTicket).toHaveBeenCalledWith(
      'admin-1',
      'ticket-1',
      {
        baseUpdatedAtIso: '2026-07-22T08:36:00.000Z',
        targetAdminUserId: 'admin-2',
        content: '白班客服接手继续跟进。',
      },
    );
  });

  it('releases an admin support ticket claim', async () => {
    const service = {
      unclaimSupportTicket: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'processing',
        statusHistory: [
          {
            actionText: '客服已释放认领',
            timestampIso: '2026-07-22T08:38:00.000Z',
            operatorUserId: 'admin-1',
            content: '当前班次切换，工单先回到公共队列。',
          },
        ],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'resolution',
          status: 'within_target',
          targetAtIso: '2026-07-23T08:35:00.000Z',
          remainingMinutes: 1437,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:38:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );
    const body = {
      baseUpdatedAtIso: '2026-07-22T08:36:00.000Z',
      content: ' 当前班次切换，工单先回到公共队列。 ',
    };

    const result = await controller.unclaimSupportTicket(
      createRequest('admin-1', 'admin'),
      'ticket-1',
      body,
    );

    expect(result).toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        status: 'processing',
      },
      requestId: 'req_support_tickets_test',
    });
    expect(result.data).not.toHaveProperty('claimedByAdminUserId');
    expect(result.data).not.toHaveProperty('claimNote');
    expect(service.unclaimSupportTicket).toHaveBeenCalledWith(
      'admin-1',
      'ticket-1',
      {
        baseUpdatedAtIso: '2026-07-22T08:36:00.000Z',
        content: '当前班次切换，工单先回到公共队列。',
      },
    );
  });

  it('resolves an admin support ticket', async () => {
    const service = {
      resolveSupportTicket: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
        status: 'resolved',
        statusHistory: [],
        sla: {
          policyKey: 'support_ticket_default_v1',
          stage: 'resolution',
          status: 'resolved_within_target',
          targetAtIso: '2026-07-23T08:35:00.000Z',
          remainingMinutes: 1435,
        },
        createdAtIso: '2026-07-22T08:30:00.000Z',
        updatedAtIso: '2026-07-22T08:40:00.000Z',
      }),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );
    const body = {
      baseUpdatedAtIso: '2026-07-22T08:35:00.000Z',
      content: '问题已确认并处理完成，通知货主查看结果。',
    };

    await expect(
      controller.resolveSupportTicket(
        createRequest('admin-1', 'admin'),
        'ticket-1',
        body,
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'ticket-1',
        status: 'resolved',
        sla: {
          stage: 'resolution',
        },
      },
      requestId: 'req_support_tickets_test',
    });
    expect(service.resolveSupportTicket).toHaveBeenCalledWith(
      'admin-1',
      'ticket-1',
      body,
    );
  });

  it('rejects non-admin users before listing admin support tickets', async () => {
    const service = {
      listSupportTicketsForAdmin: jest.fn(),
    } as unknown as SupportTicketsService;
    const controller = new AdminSupportTicketsController(
      service,
      createOverdueEscalationService(),
    );

    await expect(
      controller.listSupportTickets(createRequest('shipper-1'), {}),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.listSupportTicketsForAdmin).not.toHaveBeenCalled();
  });

  it('runs overdue escalation sweep for admin support tickets', async () => {
    const overdueEscalationService = createOverdueEscalationService({
      sweepOverdueTickets: jest.fn().mockResolvedValue({
        trigger: 'admin',
        triggeredAtIso: '2026-07-22T10:00:00.000Z',
        scannedCount: 3,
        overdueCount: 2,
        escalatedCount: 2,
        skippedCount: 0,
        conflictCount: 0,
        escalatedTicketIds: ['ticket-1', 'ticket-2'],
      }),
    });
    const controller = new AdminSupportTicketsController(
      {} as SupportTicketsService,
      overdueEscalationService,
    );

    await expect(
      controller.sweepOverdueSupportTickets(createRequest('admin-1', 'admin')),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        trigger: 'admin',
        overdueCount: 2,
        escalatedCount: 2,
        escalatedTicketIds: ['ticket-1', 'ticket-2'],
      },
      requestId: 'req_support_tickets_test',
    });
    expect(overdueEscalationService.sweepOverdueTickets).toHaveBeenCalledWith(
      'admin',
    );
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_support_tickets_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}

function createOverdueEscalationService(
  overrides: Partial<
    Pick<SupportTicketOverdueEscalationService, 'sweepOverdueTickets'>
  > = {},
): SupportTicketOverdueEscalationService {
  return {
    sweepOverdueTickets: jest.fn(),
    ...overrides,
  } as unknown as SupportTicketOverdueEscalationService;
}

import { ApiErrorCode, BusinessError } from '../common/errors';
import type { NotificationsService } from '../notifications/notifications.service';
import { InMemorySupportTicketsRepository } from './support-tickets.repository';
import { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsService', () => {
  const now = new Date('2026-07-22T08:30:00.000Z');

  type NotificationsServiceMock = {
    notifySupportTicketEvent: jest.MockedFunction<
      NotificationsService['notifySupportTicketEvent']
    >;
  };

  function createNotificationsServiceMock(): NotificationsServiceMock {
    return {
      notifySupportTicketEvent: jest.fn().mockResolvedValue(undefined),
    } as NotificationsServiceMock;
  }

  function createService() {
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const notificationsService = createNotificationsServiceMock();

    return {
      notificationsService,
      service: new SupportTicketsService(
        repository,
        () => now,
        notificationsService as unknown as NotificationsService,
      ),
    };
  }

  it('returns an empty ticket list for the current shipper when no tickets exist', async () => {
    const { service } = createService();

    await expect(service.listSupportTickets('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [],
    });
  });

  it('creates a new pending support ticket with initial history', async () => {
    const { service } = createService();

    await expect(
      service.createSupportTicket('shipper-1', {
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
      }),
    ).resolves.toEqual({
      id: 'support-ticket-platform-1',
      shipperId: 'shipper-1',
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: now.toISOString(),
        },
      ],
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'first_response',
        status: 'within_target',
        targetAtIso: '2026-07-22T09:00:00.000Z',
        remainingMinutes: 30,
      },
      createdAtIso: now.toISOString(),
      updatedAtIso: now.toISOString(),
    });
  });

  it('keeps support tickets isolated by shipper id and sorted newest first', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '第一张工单',
    });
    currentTime = new Date('2026-07-22T08:35:00.000Z');
    await service.createSupportTicket('shipper-1', {
      channelName: '在线客服',
      description: '第二张工单',
    });
    await service.createSupportTicket('shipper-2', {
      channelName: '售后服务',
      description: '其他货主工单',
    });

    await expect(service.listSupportTickets('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        expect.objectContaining({
          id: 'support-ticket-platform-2',
          description: '第二张工单',
        }),
        expect.objectContaining({
          id: 'support-ticket-platform-1',
          description: '第一张工单',
        }),
      ],
    });
    await expect(service.listSupportTickets('shipper-2')).resolves.toEqual({
      shipperId: 'shipper-2',
      items: [
        expect.objectContaining({
          id: 'support-ticket-platform-3',
          description: '其他货主工单',
        }),
      ],
    });
  });

  it('moves recently updated support tickets to the top of the shipper list', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const notificationsService = createNotificationsServiceMock();
    const service = new SupportTicketsService(
      repository,
      () => currentTime,
      notificationsService as unknown as NotificationsService,
    );

    const first = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '较早提交的工单',
    });
    currentTime = new Date('2026-07-22T08:35:00.000Z');
    await service.createSupportTicket('shipper-1', {
      channelName: '订单咨询',
      description: '较晚提交但未更新的工单',
    });

    currentTime = new Date('2026-07-22T08:40:00.000Z');
    await service.processSupportTicket('admin-1', first.id, {
      baseUpdatedAtIso: first.updatedAtIso,
      content: '已联系货主核实问题，转客服受理跟进。',
    });

    await expect(service.listSupportTickets('shipper-1')).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        expect.objectContaining({
          id: first.id,
          status: 'processing',
          sla: expect.objectContaining({
            stage: 'resolution',
            status: 'within_target',
          }),
          updatedAtIso: '2026-07-22T08:40:00.000Z',
        }),
        expect.objectContaining({
          id: 'support-ticket-platform-2',
          status: 'pending',
          sla: expect.objectContaining({
            stage: 'first_response',
            status: 'within_target',
          }),
          updatedAtIso: '2026-07-22T08:35:00.000Z',
        }),
      ],
    });
  });

  it('lets admin process and resolve support tickets with transition history', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const notificationsService = createNotificationsServiceMock();
    const service = new SupportTicketsService(
      repository,
      () => currentTime,
      notificationsService as unknown as NotificationsService,
    );

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:35:00.000Z');
    const processing = await service.processSupportTicket(
      'admin-1',
      created.id,
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '已联系货主核实问题，转客服受理跟进。',
      },
    );

    expect(processing).toMatchObject({
      id: created.id,
      status: 'processing',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'resolution',
        status: 'within_target',
        targetAtIso: '2026-07-23T08:35:00.000Z',
        remainingMinutes: 1440,
      },
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: created.createdAtIso,
        },
        {
          actionText: '客服已受理',
          fromStatus: 'pending',
          toStatus: 'processing',
          operatorUserId: 'admin-1',
          content: '已联系货主核实问题，转客服受理跟进。',
        },
      ],
      updatedAtIso: '2026-07-22T08:35:00.000Z',
    });

    currentTime = new Date('2026-07-22T08:40:00.000Z');
    await expect(
      service.resolveSupportTicket('admin-1', created.id, {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '问题已确认并处理完成，通知货主查看结果。',
      }),
    ).resolves.toMatchObject({
      id: created.id,
      status: 'resolved',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'resolution',
        status: 'resolved_within_target',
        targetAtIso: '2026-07-23T08:35:00.000Z',
        remainingMinutes: 1435,
      },
      statusHistory: expect.arrayContaining([
        expect.objectContaining({
          actionText: '客服已处理',
          fromStatus: 'processing',
          toStatus: 'resolved',
          operatorUserId: 'admin-1',
          content: '问题已确认并处理完成，通知货主查看结果。',
        }),
      ]),
      updatedAtIso: '2026-07-22T08:40:00.000Z',
    });
    expect(notificationsService.notifySupportTicketEvent).toHaveBeenNthCalledWith(
      1,
      {
        event: 'support_ticket_processing',
        ticketId: created.id,
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        content: '已联系货主核实问题，转客服受理跟进。',
      },
    );
    expect(notificationsService.notifySupportTicketEvent).toHaveBeenNthCalledWith(
      2,
      {
        event: 'support_ticket_resolved',
        ticketId: created.id,
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        content: '问题已确认并处理完成，通知货主查看结果。',
      },
    );
  });

  it('claims an open support ticket and surfaces the latest claim snapshot', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const notificationsService = createNotificationsServiceMock();
    const service = new SupportTicketsService(
      repository,
      () => currentTime,
      notificationsService as unknown as NotificationsService,
    );

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:36:00.000Z');
    await expect(
      service.claimSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '夜班客服先认领跟进。',
      }),
    ).resolves.toMatchObject({
      id: created.id,
      status: 'pending',
      claimedByAdminUserId: 'admin-2',
      claimedAtIso: '2026-07-22T08:36:00.000Z',
      claimNote: '夜班客服先认领跟进。',
      statusHistory: expect.arrayContaining([
        expect.objectContaining({
          actionText: '客服已认领',
          operatorUserId: 'admin-2',
          content: '夜班客服先认领跟进。',
        }),
      ]),
      updatedAtIso: '2026-07-22T08:36:00.000Z',
    });

    await expect(service.getSupportTicketForAdmin(created.id)).resolves.toMatchObject({
      id: created.id,
      claimedByAdminUserId: 'admin-2',
      claimNote: '夜班客服先认领跟进。',
    });
    expect(notificationsService.notifySupportTicketEvent).not.toHaveBeenCalled();
  });

  it('rejects claiming a resolved support ticket', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:35:00.000Z');
    const processing = await service.processSupportTicket(
      'admin-1',
      created.id,
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '已联系货主核实问题，转客服受理跟进。',
      },
    );

    currentTime = new Date('2026-07-22T08:40:00.000Z');
    const resolved = await service.resolveSupportTicket(
      'admin-1',
      created.id,
      {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '问题已确认并处理完成，通知货主查看结果。',
      },
    );

    await expect(
      service.claimSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: resolved.updatedAtIso,
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      ),
    );
  });

  it('lets the current claimer release an open support ticket and clears the claim snapshot', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:36:00.000Z');
    const claimed = await service.claimSupportTicket('admin-2', created.id, {
      baseUpdatedAtIso: created.updatedAtIso,
      content: '夜班客服先认领跟进。',
    });

    currentTime = new Date('2026-07-22T08:38:00.000Z');
    await expect(
      service.unclaimSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
        content: '当前班次切换，先释放给公共队列。',
      }),
    ).resolves.toMatchObject({
      id: created.id,
      status: 'pending',
      statusHistory: expect.arrayContaining([
        expect.objectContaining({
          actionText: '客服已释放认领',
          operatorUserId: 'admin-2',
          content: '当前班次切换，先释放给公共队列。',
        }),
      ]),
      updatedAtIso: '2026-07-22T08:38:00.000Z',
    });

    await expect(
      service.getSupportTicketForAdmin(created.id),
    ).resolves.not.toHaveProperty('claimedByAdminUserId');
    await expect(
      service.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 5,
        claimStatus: 'unclaimed',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: created.id,
        }),
      ],
      page: 1,
      pageSize: 5,
      total: 1,
    });
  });

  it('rejects releasing an unclaimed support ticket or a ticket claimed by another admin', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    await expect(
      service.unclaimSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: created.updatedAtIso,
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单尚未被认领，无需释放认领',
      ),
    );

    currentTime = new Date('2026-07-22T08:36:00.000Z');
    const claimed = await service.claimSupportTicket('admin-2', created.id, {
      baseUpdatedAtIso: created.updatedAtIso,
      content: '夜班客服先认领跟进。',
    });

    await expect(
      service.unclaimSupportTicket('admin-3', created.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前管理员不是该工单的认领人，不能释放认领',
      ),
    );
  });

  it('does not reset the resolution SLA anchor when a processing ticket is claimed', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '订单咨询',
      description: '咨询订单签收问题',
    });

    currentTime = new Date('2026-07-22T08:35:00.000Z');
    const processing = await service.processSupportTicket(
      'admin-1',
      created.id,
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '已联系货主核实问题，转客服受理跟进。',
      },
    );

    currentTime = new Date('2026-07-22T09:00:00.000Z');
    const claimed = await service.claimSupportTicket('admin-2', created.id, {
      baseUpdatedAtIso: processing.updatedAtIso,
      content: '夜班客服接手继续跟进。',
    });

    expect(claimed).toMatchObject({
      id: created.id,
      status: 'processing',
      claimedByAdminUserId: 'admin-2',
      claimNote: '夜班客服接手继续跟进。',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'resolution',
        status: 'within_target',
        targetAtIso: '2026-07-23T08:35:00.000Z',
        remainingMinutes: 1415,
      },
    });

    currentTime = new Date('2026-07-23T08:40:00.000Z');
    await expect(
      service.resolveSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: claimed.updatedAtIso,
        content: '问题已确认并处理完成，通知货主查看结果。',
      }),
    ).resolves.toMatchObject({
      status: 'resolved',
      claimedByAdminUserId: 'admin-2',
      claimNote: '夜班客服接手继续跟进。',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'resolution',
        status: 'resolved_overdue',
        targetAtIso: '2026-07-23T08:35:00.000Z',
        overdueMinutes: 5,
      },
    });
  });

  it('keeps support ticket transitions successful when notification delivery fails', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const notificationsService = createNotificationsServiceMock();
    notificationsService.notifySupportTicketEvent.mockRejectedValue(
      new Error('push unavailable'),
    );
    const service = new SupportTicketsService(
      repository,
      () => currentTime,
      notificationsService as unknown as NotificationsService,
    );

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:35:00.000Z');
    await expect(
      service.processSupportTicket('admin-1', created.id, {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '已联系货主核实问题，转客服受理跟进。',
      }),
    ).resolves.toMatchObject({
      id: created.id,
      status: 'processing',
      sla: {
        stage: 'resolution',
        status: 'within_target',
        targetAtIso: '2026-07-23T08:35:00.000Z',
        remainingMinutes: 1440,
      },
      updatedAtIso: '2026-07-22T08:35:00.000Z',
    });
    await expect(service.getSupportTicketForAdmin(created.id)).resolves.toMatchObject({
      status: 'processing',
      sla: expect.objectContaining({
        stage: 'resolution',
        status: 'within_target',
      }),
      statusHistory: expect.arrayContaining([
        expect.objectContaining({
          actionText: '客服已受理',
          operatorUserId: 'admin-1',
        }),
      ]),
    });
    expect(notificationsService.notifySupportTicketEvent).toHaveBeenCalledWith({
      event: 'support_ticket_processing',
      ticketId: created.id,
      shipperId: 'shipper-1',
      channelName: '投诉建议',
      content: '已联系货主核实问题，转客服受理跟进。',
    });
  });

  it('derives overdue first-response and resolution SLA snapshots', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T09:10:00.000Z');
    await expect(service.getSupportTicketForAdmin(created.id)).resolves.toMatchObject({
      id: created.id,
      status: 'pending',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'first_response',
        status: 'overdue',
        targetAtIso: '2026-07-22T09:00:00.000Z',
        overdueMinutes: 10,
      },
    });

    currentTime = new Date('2026-07-22T09:15:00.000Z');
    const processing = await service.processSupportTicket(
      'admin-1',
      created.id,
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '已联系货主核实问题，转客服受理跟进。',
      },
    );

    expect(processing).toMatchObject({
      status: 'processing',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'resolution',
        status: 'within_target',
        targetAtIso: '2026-07-23T09:15:00.000Z',
        remainingMinutes: 1440,
      },
    });

    currentTime = new Date('2026-07-23T10:30:00.000Z');
    await expect(
      service.resolveSupportTicket('admin-1', created.id, {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '问题已确认并处理完成，通知货主查看结果。',
      }),
    ).resolves.toMatchObject({
      status: 'resolved',
      sla: {
        policyKey: 'support_ticket_default_v1',
        stage: 'resolution',
        status: 'resolved_overdue',
        targetAtIso: '2026-07-23T09:15:00.000Z',
        overdueMinutes: 75,
      },
    });
  });

  it('filters admin support tickets by derived sla status before paging', async () => {
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(
      repository,
      () => new Date('2026-07-22T08:30:00.000Z'),
    );

    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '首响仍在时限内的工单',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T08:20:00.000Z',
        },
      ],
      createdAtIso: '2026-07-22T08:20:00.000Z',
      updatedAtIso: '2026-07-22T08:20:00.000Z',
    });
    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '首响已经超时的工单',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T07:50:00.000Z',
        },
      ],
      createdAtIso: '2026-07-22T07:50:00.000Z',
      updatedAtIso: '2026-07-22T07:50:00.000Z',
    });
    await repository.createSupportTicket('shipper-2', {
      channelName: '订单咨询',
      description: '处理中的时限内工单',
      status: 'processing',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T08:00:00.000Z',
        },
        {
          actionText: '客服已受理',
          timestampIso: '2026-07-22T08:05:00.000Z',
          fromStatus: 'pending',
          toStatus: 'processing',
          operatorUserId: 'admin-1',
          content: '已联系货主核实问题。',
        },
      ],
      createdAtIso: '2026-07-22T08:00:00.000Z',
      updatedAtIso: '2026-07-22T08:05:00.000Z',
    });
    await repository.createSupportTicket('shipper-2', {
      channelName: '订单咨询',
      description: '处理中的超时工单',
      status: 'processing',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-21T06:50:00.000Z',
        },
        {
          actionText: '客服已受理',
          timestampIso: '2026-07-21T07:00:00.000Z',
          fromStatus: 'pending',
          toStatus: 'processing',
          operatorUserId: 'admin-1',
          content: '已受理并等待处理。',
        },
      ],
      createdAtIso: '2026-07-21T06:50:00.000Z',
      updatedAtIso: '2026-07-21T07:00:00.000Z',
    });

    await expect(
      service.listSupportTicketsForAdmin({
        page: 2,
        pageSize: 1,
        slaStatus: 'overdue',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'support-ticket-platform-4',
          status: 'processing',
          sla: {
            policyKey: 'support_ticket_default_v1',
            stage: 'resolution',
            status: 'overdue',
            targetAtIso: '2026-07-22T07:00:00.000Z',
            overdueMinutes: 90,
          },
        }),
      ],
      page: 2,
      pageSize: 1,
      total: 2,
    });

    await expect(
      service.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 20,
        status: 'processing',
        slaStatus: 'overdue',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'support-ticket-platform-4',
          status: 'processing',
          sla: expect.objectContaining({
            status: 'overdue',
          }),
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('filters admin support tickets by derived claim status before paging', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const first = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '还未认领的工单',
    });
    currentTime = new Date('2026-07-22T08:32:00.000Z');
    const second = await service.createSupportTicket('shipper-2', {
      channelName: '订单咨询',
      description: 'admin-2 认领的工单',
    });
    currentTime = new Date('2026-07-22T08:34:00.000Z');
    await service.claimSupportTicket('admin-2', second.id, {
      baseUpdatedAtIso: second.updatedAtIso,
      content: '夜班客服先认领跟进。',
    });
    currentTime = new Date('2026-07-22T08:36:00.000Z');
    const third = await service.createSupportTicket('shipper-3', {
      channelName: '售后服务',
      description: 'admin-3 认领的工单',
    });
    currentTime = new Date('2026-07-22T08:38:00.000Z');
    await service.claimSupportTicket('admin-3', third.id, {
      baseUpdatedAtIso: third.updatedAtIso,
      content: '白班客服接手跟进。',
    });

    await expect(
      service.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 5,
        claimStatus: 'claimed',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: third.id,
          claimedByAdminUserId: 'admin-3',
        }),
        expect.objectContaining({
          id: second.id,
          claimedByAdminUserId: 'admin-2',
        }),
      ],
      page: 1,
      pageSize: 5,
      total: 2,
    });

    await expect(
      service.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 5,
        claimStatus: 'unclaimed',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: first.id,
        }),
      ],
      page: 1,
      pageSize: 5,
      total: 1,
    });

    await expect(
      service.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 5,
        claimedByAdminUserId: 'admin-2',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: second.id,
          claimedByAdminUserId: 'admin-2',
        }),
      ],
      page: 1,
      pageSize: 5,
      total: 1,
    });
  });

  it('rejects admin support ticket transitions when the ticket state no longer matches', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:35:00.000Z');
    const processing = await service.processSupportTicket(
      'admin-1',
      created.id,
      {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '已联系货主核实问题，转客服受理跟进。',
      },
    );

    await expect(
      service.processSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: processing.updatedAtIso,
        content: '重复受理不应成功。',
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      ),
    );
  });

  it('rejects stale admin support ticket transition baselines', async () => {
    let currentTime = new Date('2026-07-22T08:30:00.000Z');
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });
    const service = new SupportTicketsService(repository, () => currentTime);

    const created = await service.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });

    currentTime = new Date('2026-07-22T08:35:00.000Z');
    await service.processSupportTicket('admin-1', created.id, {
      baseUpdatedAtIso: created.updatedAtIso,
      content: '已联系货主核实问题，转客服受理跟进。',
    });

    await expect(
      service.resolveSupportTicket('admin-2', created.id, {
        baseUpdatedAtIso: created.updatedAtIso,
        content: '使用旧版本时间尝试直接完结。',
      }),
    ).rejects.toMatchObject(
      new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_CONFLICT,
        '帮助中心工单已被其他管理员更新，请刷新后重试',
      ),
    );
  });
});

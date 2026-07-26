import {
  InMemorySupportTicketsRepository,
  type SupportTicketsRepository,
} from './support-tickets.repository';
import { SupportTicketOverdueEscalationService } from './support-ticket-overdue-escalation.service';

describe('SupportTicketOverdueEscalationService', () => {
  it('escalates overdue pending and processing tickets with system audit history', async () => {
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `ticket-${++sequence}`;
      })(),
    });
    const notificationsService = {
      notifySupportTicketEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SupportTicketOverdueEscalationService(
      repository,
      () => new Date('2026-07-22T10:00:00.000Z'),
      notificationsService,
    );

    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '首响已超时工单',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T09:00:00.000Z',
        },
      ],
      createdAtIso: '2026-07-22T09:00:00.000Z',
      updatedAtIso: '2026-07-22T09:00:00.000Z',
    });
    await repository.createSupportTicket('shipper-2', {
      channelName: '订单咨询',
      description: '解决已超时工单',
      status: 'processing',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-21T07:00:00.000Z',
        },
        {
          actionText: '客服已受理',
          timestampIso: '2026-07-21T08:00:00.000Z',
          fromStatus: 'pending',
          toStatus: 'processing',
          operatorUserId: 'admin-1',
          content: '已受理并持续跟进。',
        },
      ],
      createdAtIso: '2026-07-21T07:00:00.000Z',
      updatedAtIso: '2026-07-21T08:00:00.000Z',
    });
    await repository.createSupportTicket('shipper-3', {
      channelName: '售后服务',
      description: '仍在时限内工单',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T09:50:00.000Z',
        },
      ],
      createdAtIso: '2026-07-22T09:50:00.000Z',
      updatedAtIso: '2026-07-22T09:50:00.000Z',
    });

    await expect(service.sweepOverdueTickets('admin')).resolves.toEqual({
      trigger: 'admin',
      triggeredAtIso: '2026-07-22T10:00:00.000Z',
      scannedCount: 3,
      overdueCount: 2,
      escalatedCount: 2,
      skippedCount: 0,
      conflictCount: 0,
      escalatedTicketIds: expect.arrayContaining(['ticket-1', 'ticket-2']),
    });

    await expect(repository.findSupportTicketById('ticket-1')).resolves.toEqual(
      expect.objectContaining({
        status: 'pending',
        updatedAtIso: '2026-07-22T10:00:00.000Z',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({
            actionText: '工单超时已升级',
            operatorUserId: 'system:auto-escalation:first_response',
            content:
              '系统检测到投诉建议工单首响 SLA 已超时 30 分钟，已自动升级给值班客服跟进。',
          }),
        ]),
      }),
    );
    await expect(repository.findSupportTicketById('ticket-2')).resolves.toEqual(
      expect.objectContaining({
        status: 'processing',
        updatedAtIso: '2026-07-22T10:00:00.000Z',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({
            actionText: '工单超时已升级',
            operatorUserId: 'system:auto-escalation:resolution',
            content:
              '系统检测到订单咨询工单解决 SLA 已超时 120 分钟，已自动升级给值班客服继续处理。',
          }),
        ]),
      }),
    );
    expect(notificationsService.notifySupportTicketEvent).toHaveBeenNthCalledWith(
      1,
      {
        event: 'support_ticket_overdue_escalated',
        ticketId: 'ticket-1',
        shipperId: 'shipper-1',
        channelName: '投诉建议',
        stage: 'first_response',
        overdueMinutes: 30,
      },
    );
    expect(notificationsService.notifySupportTicketEvent).toHaveBeenNthCalledWith(
      2,
      {
        event: 'support_ticket_overdue_escalated',
        ticketId: 'ticket-2',
        shipperId: 'shipper-2',
        channelName: '订单咨询',
        stage: 'resolution',
        overdueMinutes: 120,
      },
    );
  });

  it('does not append duplicate escalation history for the same overdue stage', async () => {
    const repository = new InMemorySupportTicketsRepository({
      createId: () => 'ticket-1',
    });
    const service = new SupportTicketOverdueEscalationService(
      repository,
      () => new Date('2026-07-22T10:00:00.000Z'),
    );

    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '首响已超时工单',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T09:00:00.000Z',
        },
      ],
      createdAtIso: '2026-07-22T09:00:00.000Z',
      updatedAtIso: '2026-07-22T09:00:00.000Z',
    });

    await service.sweepOverdueTickets('admin');

    await expect(service.sweepOverdueTickets('scheduler')).resolves.toEqual({
      trigger: 'scheduler',
      triggeredAtIso: '2026-07-22T10:00:00.000Z',
      scannedCount: 1,
      overdueCount: 1,
      escalatedCount: 0,
      skippedCount: 1,
      conflictCount: 0,
      escalatedTicketIds: [],
    });
    await expect(repository.findSupportTicketById('ticket-1')).resolves.toEqual(
      expect.objectContaining({
        statusHistory: [
          expect.objectContaining({ actionText: '工单已提交' }),
          expect.objectContaining({
            actionText: '工单超时已升级',
            operatorUserId: 'system:auto-escalation:first_response',
          }),
        ],
      }),
    );
  });

  it('counts concurrent conflicts without failing the whole sweep', async () => {
    const repository = {
      listSupportTicketsForAdminMatching: jest.fn().mockResolvedValue([
        {
          id: 'ticket-1',
          shipperId: 'shipper-1',
          channelName: '投诉建议',
          description: '首响已超时工单',
          status: 'pending',
          statusHistory: [
            {
              actionText: '工单已提交',
              timestampIso: '2026-07-22T09:00:00.000Z',
            },
          ],
          createdAtIso: '2026-07-22T09:00:00.000Z',
          updatedAtIso: '2026-07-22T09:00:00.000Z',
        },
      ]),
      appendSupportTicketHistoryItem: jest.fn().mockResolvedValue('conflict'),
    } as unknown as SupportTicketsRepository;
    const service = new SupportTicketOverdueEscalationService(
      repository,
      () => new Date('2026-07-22T10:00:00.000Z'),
    );

    await expect(service.sweepOverdueTickets('admin')).resolves.toEqual({
      trigger: 'admin',
      triggeredAtIso: '2026-07-22T10:00:00.000Z',
      scannedCount: 1,
      overdueCount: 1,
      escalatedCount: 0,
      skippedCount: 0,
      conflictCount: 1,
      escalatedTicketIds: [],
    });
  });

  it('does not fail the sweep when overdue escalation notifications fail', async () => {
    const repository = new InMemorySupportTicketsRepository({
      createId: () => 'ticket-1',
    });
    const notificationsService = {
      notifySupportTicketEvent: jest
        .fn()
        .mockRejectedValue(new Error('push failed')),
    };
    const service = new SupportTicketOverdueEscalationService(
      repository,
      () => new Date('2026-07-22T10:00:00.000Z'),
      notificationsService,
    );

    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '首响已超时工单',
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T09:00:00.000Z',
        },
      ],
      createdAtIso: '2026-07-22T09:00:00.000Z',
      updatedAtIso: '2026-07-22T09:00:00.000Z',
    });

    await expect(service.sweepOverdueTickets('admin')).resolves.toMatchObject({
      escalatedCount: 1,
      conflictCount: 0,
    });
    expect(notificationsService.notifySupportTicketEvent).toHaveBeenCalledTimes(
      1,
    );
    await expect(repository.findSupportTicketById('ticket-1')).resolves.toEqual(
      expect.objectContaining({
        statusHistory: expect.arrayContaining([
          expect.objectContaining({ actionText: '工单超时已升级' }),
        ]),
      }),
    );
  });
});

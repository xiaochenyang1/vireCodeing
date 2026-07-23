import { ApiErrorCode, BusinessError } from '../common/errors';
import { InMemorySupportTicketsRepository } from './support-tickets.repository';
import { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsService', () => {
  const now = new Date('2026-07-22T08:30:00.000Z');

  function createService() {
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `support-ticket-platform-${++sequence}`;
      })(),
    });

    return {
      service: new SupportTicketsService(repository, () => now),
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

  it('lets admin process and resolve support tickets with transition history', async () => {
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

    expect(processing).toMatchObject({
      id: created.id,
      status: 'processing',
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

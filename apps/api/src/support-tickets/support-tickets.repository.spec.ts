import {
  InMemorySupportTicketsRepository,
  PrismaSupportTicketsRepository,
  type PrismaSupportTicketRecord,
  type PrismaSupportTicketsClient,
} from './support-tickets.repository';

describe('InMemorySupportTicketsRepository', () => {
  it('lists admin support tickets with status filtering and pagination', async () => {
    const repository = new InMemorySupportTicketsRepository({
      createId: (() => {
        let sequence = 0;

        return () => `ticket-${++sequence}`;
      })(),
    });

    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '第一张待跟进工单',
      status: 'pending',
      statusHistory: [],
      createdAtIso: '2026-07-22T08:30:00.000Z',
      updatedAtIso: '2026-07-22T08:30:00.000Z',
    });
    await repository.createSupportTicket('shipper-2', {
      channelName: '订单咨询',
      description: '第二张处理中工单',
      status: 'processing',
      statusHistory: [],
      createdAtIso: '2026-07-22T08:35:00.000Z',
      updatedAtIso: '2026-07-22T08:35:00.000Z',
    });
    await repository.createSupportTicket('shipper-1', {
      channelName: '投诉建议',
      description: '第三张处理中工单',
      status: 'processing',
      statusHistory: [],
      createdAtIso: '2026-07-22T08:40:00.000Z',
      updatedAtIso: '2026-07-22T08:40:00.000Z',
    });

    await expect(
      repository.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 1,
        status: 'processing',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ticket-3',
          shipperId: 'shipper-1',
          status: 'processing',
        }),
      ],
      page: 1,
      pageSize: 1,
      total: 2,
    });

    await expect(
      repository.listSupportTicketsForAdmin({
        page: 1,
        pageSize: 20,
        keyword: 'shipper-2',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ticket-2',
          shipperId: 'shipper-2',
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
});

describe('PrismaSupportTicketsRepository', () => {
  type MockPrismaSupportTicketsClient = {
    shipperSupportTicket: {
      findMany: jest.MockedFunction<
        PrismaSupportTicketsClient['shipperSupportTicket']['findMany']
      >;
      create: jest.MockedFunction<
        PrismaSupportTicketsClient['shipperSupportTicket']['create']
      >;
      count: jest.MockedFunction<
        PrismaSupportTicketsClient['shipperSupportTicket']['count']
      >;
      findUnique: jest.MockedFunction<
        PrismaSupportTicketsClient['shipperSupportTicket']['findUnique']
      >;
      updateMany: jest.MockedFunction<
        PrismaSupportTicketsClient['shipperSupportTicket']['updateMany']
      >;
    };
  };

  function createPrismaClient(): MockPrismaSupportTicketsClient {
    return {
      shipperSupportTicket: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
  }

  it('maps admin support ticket list records from Prisma', async () => {
    const prisma = createPrismaClient();
    prisma.shipperSupportTicket.findMany.mockResolvedValue([
      createPrismaRecord({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        status: 'processing',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampIso: '2026-07-22T08:30:00.000Z',
          },
          {
            actionText: '客服已受理',
            timestampIso: '2026-07-22T08:35:00.000Z',
            fromStatus: 'pending',
            toStatus: 'processing',
            operatorUserId: 'admin-1',
            content: '已联系货主核实问题，转客服受理跟进。',
          },
        ],
        createdAt: new Date('2026-07-22T08:30:00.000Z'),
        updatedAt: new Date('2026-07-22T08:35:00.000Z'),
      }),
    ]);
    prisma.shipperSupportTicket.count.mockResolvedValue(1);
    const repository = new PrismaSupportTicketsRepository(
      prisma as unknown as PrismaSupportTicketsClient,
      {
        createId: () => 'ticket-created',
      },
    );

    await expect(
      repository.listSupportTicketsForAdmin({
        page: 2,
        pageSize: 10,
        status: 'processing',
        keyword: '投诉',
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'ticket-1',
          shipperId: 'shipper-1',
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
          status: 'processing',
          statusHistory: [
            {
              actionText: '工单已提交',
              timestampIso: '2026-07-22T08:30:00.000Z',
            },
            {
              actionText: '客服已受理',
              timestampIso: '2026-07-22T08:35:00.000Z',
              fromStatus: 'pending',
              toStatus: 'processing',
              operatorUserId: 'admin-1',
              content: '已联系货主核实问题，转客服受理跟进。',
            },
          ],
          createdAtIso: '2026-07-22T08:30:00.000Z',
          updatedAtIso: '2026-07-22T08:35:00.000Z',
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
    });
    expect(prisma.shipperSupportTicket.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            id: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
          {
            shipperId: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
          {
            channelName: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
        ],
        status: 'processing',
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(prisma.shipperSupportTicket.count).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            id: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
          {
            shipperId: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
          {
            channelName: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: '投诉',
              mode: 'insensitive',
            },
          },
        ],
        status: 'processing',
      },
    });
  });

  it('transitions admin support tickets with optimistic concurrency', async () => {
    const prisma = createPrismaClient();
    prisma.shipperSupportTicket.findUnique.mockResolvedValue(
      createPrismaRecord({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        status: 'pending',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampIso: '2026-07-22T08:30:00.000Z',
          },
        ],
        createdAt: new Date('2026-07-22T08:30:00.000Z'),
        updatedAt: new Date('2026-07-22T08:30:00.000Z'),
      }),
    );
    prisma.shipperSupportTicket.updateMany.mockResolvedValue({ count: 1 });
    const repository = new PrismaSupportTicketsRepository(
      prisma as unknown as PrismaSupportTicketsClient,
    );

    await expect(
      repository.transitionSupportTicket(
        'ticket-1',
        'admin-1',
        'pending',
        'processing',
        {
          baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
          content: '已联系货主核实问题，转客服受理跟进。',
          actionText: '客服已受理',
          updatedAtIso: '2026-07-22T08:35:00.000Z',
        },
      ),
    ).resolves.toEqual({
      id: 'ticket-1',
      shipperId: 'shipper-1',
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
      status: 'processing',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: '2026-07-22T08:30:00.000Z',
        },
        {
          actionText: '客服已受理',
          timestampIso: '2026-07-22T08:35:00.000Z',
          fromStatus: 'pending',
          toStatus: 'processing',
          operatorUserId: 'admin-1',
          content: '已联系货主核实问题，转客服受理跟进。',
        },
      ],
      createdAtIso: '2026-07-22T08:30:00.000Z',
      updatedAtIso: '2026-07-22T08:35:00.000Z',
    });
    expect(prisma.shipperSupportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-1',
        status: 'pending',
        updatedAt: new Date('2026-07-22T08:30:00.000Z'),
      },
      data: {
        status: 'processing',
        statusHistory: [
          {
            actionText: '工单已提交',
            timestampIso: '2026-07-22T08:30:00.000Z',
          },
          {
            actionText: '客服已受理',
            timestampIso: '2026-07-22T08:35:00.000Z',
            fromStatus: 'pending',
            toStatus: 'processing',
            operatorUserId: 'admin-1',
            content: '已联系货主核实问题，转客服受理跟进。',
          },
        ],
        updatedAt: new Date('2026-07-22T08:35:00.000Z'),
      },
    });
  });

  it('returns conflict before updating when admin support ticket baseline is stale', async () => {
    const prisma = createPrismaClient();
    prisma.shipperSupportTicket.findUnique.mockResolvedValue(
      createPrismaRecord({
        id: 'ticket-1',
        shipperId: 'shipper-1',
        status: 'processing',
        statusHistory: [],
        createdAt: new Date('2026-07-22T08:30:00.000Z'),
        updatedAt: new Date('2026-07-22T08:35:00.000Z'),
      }),
    );
    const repository = new PrismaSupportTicketsRepository(
      prisma as unknown as PrismaSupportTicketsClient,
    );

    await expect(
      repository.transitionSupportTicket(
        'ticket-1',
        'admin-1',
        'processing',
        'resolved',
        {
          baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
          content: '使用旧版本时间直接完结。',
          actionText: '客服已处理',
          updatedAtIso: '2026-07-22T08:40:00.000Z',
        },
      ),
    ).resolves.toBe('conflict');
    expect(prisma.shipperSupportTicket.updateMany).not.toHaveBeenCalled();
  });
});

function createPrismaRecord(
  overrides: Partial<PrismaSupportTicketRecord>,
): PrismaSupportTicketRecord {
  return {
    id: 'ticket-1',
    shipperId: 'shipper-1',
    channelName: '投诉建议',
    description: '司机沟通不及时，希望客服协助跟进',
    status: 'pending',
    statusHistory: [],
    createdAt: new Date('2026-07-22T08:30:00.000Z'),
    updatedAt: new Date('2026-07-22T08:30:00.000Z'),
    ...overrides,
  };
}

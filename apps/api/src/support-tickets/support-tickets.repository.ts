import { randomUUID } from 'crypto';
import type {
  AdminSupportTicketListQuery,
  AdminSupportTicketListRecord,
  CreateShipperSupportTicketRecordInput,
  ShipperSupportTicketRecord,
  ShipperSupportTicketStatus,
  ShipperSupportTicketStatusHistoryItem,
  TransitionShipperSupportTicketRecordInput,
} from './dto';

export type SupportTicketTransitionResult =
  | ShipperSupportTicketRecord
  | 'not-found'
  | 'conflict'
  | 'state-invalid';

export interface SupportTicketsRepository {
  listSupportTicketsByShipperId(
    shipperId: string,
  ): Promise<ShipperSupportTicketRecord[]>;
  createSupportTicket(
    shipperId: string,
    input: CreateShipperSupportTicketRecordInput,
  ): Promise<ShipperSupportTicketRecord>;
  listSupportTicketsForAdmin(
    query: AdminSupportTicketListQuery,
  ): Promise<AdminSupportTicketListRecord>;
  findSupportTicketById(
    ticketId: string,
  ): Promise<ShipperSupportTicketRecord | null>;
  transitionSupportTicket(
    ticketId: string,
    adminUserId: string,
    expectedStatus: ShipperSupportTicketStatus,
    nextStatus: ShipperSupportTicketStatus,
    input: TransitionShipperSupportTicketRecordInput,
  ): Promise<SupportTicketTransitionResult>;
}

export class InMemorySupportTicketsRepository
  implements SupportTicketsRepository
{
  private readonly tickets = new Map<string, ShipperSupportTicketRecord[]>();
  private readonly createId: () => string;

  constructor(options: { createId?: () => string } = {}) {
    this.createId = options.createId ?? randomUUID;
  }

  async listSupportTicketsByShipperId(shipperId: string) {
    return sortTicketsByCreatedAtDesc(this.tickets.get(shipperId) ?? []).map(
      copySupportTicket,
    );
  }

  async createSupportTicket(
    shipperId: string,
    input: CreateShipperSupportTicketRecordInput,
  ) {
    const createdTicket: ShipperSupportTicketRecord = {
      id: this.createId(),
      shipperId,
      channelName: input.channelName,
      description: input.description,
      status: input.status,
      statusHistory: input.statusHistory,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
    const currentTickets = this.tickets.get(shipperId) ?? [];

    this.tickets.set(shipperId, [createdTicket, ...currentTickets]);

    return copySupportTicket(createdTicket);
  }

  async listSupportTicketsForAdmin(query: AdminSupportTicketListQuery) {
    const allTickets = sortTicketsByCreatedAtDesc(
      [...this.tickets.values()].flatMap(items => items),
    ).filter(ticket => matchesAdminSupportTicketQuery(ticket, query));
    const startIndex = (query.page - 1) * query.pageSize;

    return {
      items: allTickets
        .slice(startIndex, startIndex + query.pageSize)
        .map(copySupportTicket),
      page: query.page,
      pageSize: query.pageSize,
      total: allTickets.length,
    };
  }

  async findSupportTicketById(ticketId: string) {
    for (const tickets of this.tickets.values()) {
      const ticket = tickets.find(item => item.id === ticketId);

      if (ticket) {
        return copySupportTicket(ticket);
      }
    }

    return null;
  }

  async transitionSupportTicket(
    ticketId: string,
    adminUserId: string,
    expectedStatus: ShipperSupportTicketStatus,
    nextStatus: ShipperSupportTicketStatus,
    input: TransitionShipperSupportTicketRecordInput,
  ) {
    for (const [shipperId, tickets] of this.tickets.entries()) {
      const ticketIndex = tickets.findIndex(ticket => ticket.id === ticketId);

      if (ticketIndex === -1) {
        continue;
      }

      const currentTicket = tickets[ticketIndex];

      if (currentTicket.status !== expectedStatus) {
        return 'state-invalid';
      }

      if (!isSameInstant(currentTicket.updatedAtIso, input.baseUpdatedAtIso)) {
        return 'conflict';
      }

      const updatedTicket: ShipperSupportTicketRecord = {
        ...currentTicket,
        status: nextStatus,
        statusHistory: [
          ...currentTicket.statusHistory,
          createAdminSupportTicketHistoryItem(
            adminUserId,
            expectedStatus,
            nextStatus,
            input,
          ),
        ],
        updatedAtIso: input.updatedAtIso,
      };

      const nextTickets = [...tickets];
      nextTickets[ticketIndex] = updatedTicket;
      this.tickets.set(shipperId, nextTickets);

      return copySupportTicket(updatedTicket);
    }

    return 'not-found';
  }
}

export type PrismaSupportTicketRecord = {
  id: string;
  shipperId: string;
  channelName: string;
  description: string;
  status: ShipperSupportTicketStatus;
  statusHistory: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaSupportTicketsClient = {
  shipperSupportTicket: {
    findMany(args: {
      where: unknown;
      orderBy: { createdAt: 'desc' };
      skip?: number;
      take?: number;
    }): Promise<PrismaSupportTicketRecord[]>;
    create(args: {
      data: {
        id: string;
        shipperId: string;
        channelName: string;
        description: string;
        status: ShipperSupportTicketStatus;
        statusHistory: ShipperSupportTicketStatusHistoryItem[];
        createdAt: Date;
        updatedAt: Date;
      };
    }): Promise<PrismaSupportTicketRecord>;
    count(args: { where: unknown }): Promise<number>;
    findUnique(args: {
      where: { id: string };
    }): Promise<PrismaSupportTicketRecord | null>;
    updateMany(args: {
      where: {
        id: string;
        status: ShipperSupportTicketStatus;
        updatedAt: Date;
      };
      data: {
        status: ShipperSupportTicketStatus;
        statusHistory: ShipperSupportTicketStatusHistoryItem[];
        updatedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
};

export class PrismaSupportTicketsRepository
  implements SupportTicketsRepository
{
  private readonly createId: () => string;

  constructor(
    private readonly prisma: PrismaSupportTicketsClient,
    options: { createId?: () => string } = {},
  ) {
    this.createId = options.createId ?? randomUUID;
  }

  async listSupportTicketsByShipperId(shipperId: string) {
    const tickets = await this.prisma.shipperSupportTicket.findMany({
      where: { shipperId },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map(mapPrismaSupportTicket);
  }

  async createSupportTicket(
    shipperId: string,
    input: CreateShipperSupportTicketRecordInput,
  ) {
    const ticket = await this.prisma.shipperSupportTicket.create({
      data: {
        id: this.createId(),
        shipperId,
        channelName: input.channelName,
        description: input.description,
        status: input.status,
        statusHistory: input.statusHistory,
        createdAt: new Date(input.createdAtIso),
        updatedAt: new Date(input.updatedAtIso),
      },
    });

    return mapPrismaSupportTicket(ticket);
  }

  async listSupportTicketsForAdmin(query: AdminSupportTicketListQuery) {
    const where = createAdminSupportTicketWhere(query);
    const [tickets, total] = await Promise.all([
      this.prisma.shipperSupportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.shipperSupportTicket.count({ where }),
    ]);

    return {
      items: tickets.map(mapPrismaSupportTicket),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findSupportTicketById(ticketId: string) {
    const ticket = await this.prisma.shipperSupportTicket.findUnique({
      where: { id: ticketId },
    });

    return ticket ? mapPrismaSupportTicket(ticket) : null;
  }

  async transitionSupportTicket(
    ticketId: string,
    adminUserId: string,
    expectedStatus: ShipperSupportTicketStatus,
    nextStatus: ShipperSupportTicketStatus,
    input: TransitionShipperSupportTicketRecordInput,
  ) {
    const currentTicket = await this.prisma.shipperSupportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!currentTicket) {
      return 'not-found';
    }

    if (currentTicket.status !== expectedStatus) {
      return 'state-invalid';
    }

    if (
      !isSameInstant(currentTicket.updatedAt.toISOString(), input.baseUpdatedAtIso)
    ) {
      return 'conflict';
    }

    const statusHistory = [
      ...toStatusHistory(currentTicket.statusHistory),
      createAdminSupportTicketHistoryItem(
        adminUserId,
        expectedStatus,
        nextStatus,
        input,
      ),
    ];
    const updatedAt = new Date(input.updatedAtIso);
    const updateResult = await this.prisma.shipperSupportTicket.updateMany({
      where: {
        id: ticketId,
        status: expectedStatus,
        updatedAt: new Date(input.baseUpdatedAtIso),
      },
      data: {
        status: nextStatus,
        statusHistory,
        updatedAt,
      },
    });

    if (updateResult.count === 0) {
      return 'conflict';
    }

    return {
      id: currentTicket.id,
      shipperId: currentTicket.shipperId,
      channelName: currentTicket.channelName,
      description: currentTicket.description,
      status: nextStatus,
      statusHistory,
      createdAtIso: currentTicket.createdAt.toISOString(),
      updatedAtIso: updatedAt.toISOString(),
    };
  }
}

function mapPrismaSupportTicket(
  ticket: PrismaSupportTicketRecord,
): ShipperSupportTicketRecord {
  return {
    id: ticket.id,
    shipperId: ticket.shipperId,
    channelName: ticket.channelName,
    description: ticket.description,
    status: ticket.status,
    statusHistory: toStatusHistory(ticket.statusHistory),
    createdAtIso: ticket.createdAt.toISOString(),
    updatedAtIso: ticket.updatedAt.toISOString(),
  };
}

function toStatusHistory(value: unknown): ShipperSupportTicketStatusHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!isPlainObject(item)) {
      return [];
    }

    if (
      typeof item.actionText !== 'string' ||
      typeof item.timestampIso !== 'string'
    ) {
      return [];
    }

    return [
      {
        actionText: item.actionText,
        timestampIso: item.timestampIso,
        ...(isSupportTicketStatus(item.fromStatus)
          ? { fromStatus: item.fromStatus }
          : {}),
        ...(isSupportTicketStatus(item.toStatus)
          ? { toStatus: item.toStatus }
          : {}),
        ...(typeof item.operatorUserId === 'string'
          ? { operatorUserId: item.operatorUserId }
          : {}),
        ...(typeof item.content === 'string' ? { content: item.content } : {}),
      },
    ];
  });
}

function copySupportTicket(
  ticket: ShipperSupportTicketRecord,
): ShipperSupportTicketRecord {
  return {
    ...ticket,
    statusHistory: ticket.statusHistory.map(historyItem => ({ ...historyItem })),
  };
}

function sortTicketsByCreatedAtDesc(tickets: ShipperSupportTicketRecord[]) {
  return [...tickets].sort((left, right) => {
    const leftTimestamp = Date.parse(left.createdAtIso);
    const rightTimestamp = Date.parse(right.createdAtIso);

    return rightTimestamp - leftTimestamp;
  });
}

function matchesAdminSupportTicketQuery(
  ticket: ShipperSupportTicketRecord,
  query: AdminSupportTicketListQuery,
) {
  if (query.status && ticket.status !== query.status) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  const keyword = query.keyword.trim().toLowerCase();

  return [
    ticket.id,
    ticket.shipperId,
    ticket.channelName,
    ticket.description,
  ].some(value => value.toLowerCase().includes(keyword));
}

function createAdminSupportTicketWhere(query: AdminSupportTicketListQuery) {
  if (!query.keyword) {
    return query.status ? { status: query.status } : {};
  }

  const keywordCondition = {
    contains: query.keyword,
    mode: 'insensitive' as const,
  };
  const where = {
    OR: [
      { id: keywordCondition },
      { shipperId: keywordCondition },
      { channelName: keywordCondition },
      { description: keywordCondition },
    ],
  };

  return query.status
    ? {
        ...where,
        status: query.status,
      }
    : where;
}

function createAdminSupportTicketHistoryItem(
  adminUserId: string,
  fromStatus: ShipperSupportTicketStatus,
  toStatus: ShipperSupportTicketStatus,
  input: TransitionShipperSupportTicketRecordInput,
): ShipperSupportTicketStatusHistoryItem {
  return {
    actionText: input.actionText,
    timestampIso: input.updatedAtIso,
    fromStatus,
    toStatus,
    operatorUserId: adminUserId,
    content: input.content,
  };
}

function isSameInstant(leftIso: string, rightIso: string) {
  const leftTimestamp = Date.parse(leftIso);
  const rightTimestamp = Date.parse(rightIso);

  if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp)) {
    return leftIso === rightIso;
  }

  return leftTimestamp === rightTimestamp;
}

function isSupportTicketStatus(
  value: unknown,
): value is ShipperSupportTicketStatus {
  return value === 'pending' || value === 'processing' || value === 'resolved';
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

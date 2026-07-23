import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AdminSupportTicketListQuery,
  CreateShipperSupportTicketRequest,
  UpdateShipperSupportTicketRequest,
  ShipperSupportTicketListRecord,
  ShipperSupportTicketStatus,
} from './dto';
import type { SupportTicketsRepository } from './support-tickets.repository';

export class SupportTicketsService {
  constructor(
    private readonly repository: SupportTicketsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listSupportTickets(shipperId: string): Promise<ShipperSupportTicketListRecord> {
    return {
      shipperId,
      items: await this.repository.listSupportTicketsByShipperId(shipperId),
    };
  }

  async listSupportTicketsForAdmin(query: AdminSupportTicketListQuery) {
    return this.repository.listSupportTicketsForAdmin(query);
  }

  async getSupportTicketForAdmin(ticketId: string) {
    const ticket = await this.repository.findSupportTicketById(ticketId);

    if (!ticket) {
      throw notFoundError();
    }

    return ticket;
  }

  async createSupportTicket(
    shipperId: string,
    input: CreateShipperSupportTicketRequest,
  ) {
    const createdAtIso = this.now().toISOString();

    return this.repository.createSupportTicket(shipperId, {
      channelName: input.channelName,
      description: input.description,
      status: 'pending',
      statusHistory: [
        {
          actionText: '工单已提交',
          timestampIso: createdAtIso,
        },
      ],
      createdAtIso,
      updatedAtIso: createdAtIso,
    });
  }

  async processSupportTicket(
    adminUserId: string,
    ticketId: string,
    input: UpdateShipperSupportTicketRequest,
  ) {
    return this.transitionSupportTicket(
      adminUserId,
      ticketId,
      'pending',
      'processing',
      '客服已受理',
      input,
    );
  }

  async resolveSupportTicket(
    adminUserId: string,
    ticketId: string,
    input: UpdateShipperSupportTicketRequest,
  ) {
    return this.transitionSupportTicket(
      adminUserId,
      ticketId,
      'processing',
      'resolved',
      '客服已处理',
      input,
    );
  }

  private async transitionSupportTicket(
    adminUserId: string,
    ticketId: string,
    expectedStatus: ShipperSupportTicketStatus,
    nextStatus: ShipperSupportTicketStatus,
    actionText: string,
    input: UpdateShipperSupportTicketRequest,
  ) {
    const updatedAtIso = createTransitionUpdatedAtIso(
      input.baseUpdatedAtIso,
      this.now().toISOString(),
    );
    const result = await this.repository.transitionSupportTicket(
      ticketId,
      adminUserId,
      expectedStatus,
      nextStatus,
      {
        ...input,
        actionText,
        updatedAtIso,
      },
    );

    if (result === 'not-found') {
      throw notFoundError();
    }

    if (result === 'state-invalid') {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      );
    }

    if (result === 'conflict') {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_CONFLICT,
        '帮助中心工单已被其他管理员更新，请刷新后重试',
      );
    }

    return result;
  }
}

function createTransitionUpdatedAtIso(baseUpdatedAtIso: string, nowIso: string) {
  const baseTimestamp = Date.parse(baseUpdatedAtIso);
  const nowTimestamp = Date.parse(nowIso);

  if (Number.isNaN(baseTimestamp) || Number.isNaN(nowTimestamp)) {
    return nowIso;
  }

  return new Date(Math.max(baseTimestamp + 1, nowTimestamp)).toISOString();
}

function notFoundError() {
  return new BusinessError(
    ApiErrorCode.SUPPORT_TICKET_NOT_FOUND,
    '帮助中心工单不存在',
  );
}

import { ApiErrorCode, BusinessError } from '../common/errors';
import type { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminSupportTicketListRecord,
  AdminSupportTicketListQuery,
  AdminSupportTicketMatchQuery,
  AssignSupportTicketRequest,
  ClaimSupportTicketRequest,
  CreateShipperSupportTicketRequest,
  ShipperSupportTicketRecord,
  UpdateShipperSupportTicketRequest,
  ShipperSupportTicketListRecord,
  ShipperSupportTicketStatus,
} from './dto';
import {
  createSupportTicketAssignHistoryItem,
  createSupportTicketClaimHistoryItem,
  createSupportTicketTakeoverHistoryItem,
  createSupportTicketUnclaimHistoryItem,
  createSupportTicketUpdatedAtIso,
  mapSupportTicketWithSla,
} from './support-ticket-helpers';
import type { SupportTicketsRepository } from './support-tickets.repository';

export class SupportTicketsService {
  constructor(
    private readonly repository: SupportTicketsRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly notificationsService?: NotificationsService,
  ) {}

  async listSupportTickets(shipperId: string): Promise<ShipperSupportTicketListRecord> {
    const currentTime = this.now();

    return {
      shipperId,
      items: (await this.repository.listSupportTicketsByShipperId(shipperId)).map(
        ticket => mapSupportTicketWithSla(ticket, currentTime),
      ),
    };
  }

  async listSupportTicketsForAdmin(query: AdminSupportTicketListQuery) {
    const currentTime = this.now();

    if (query.slaStatus || query.claimStatus || query.claimedByAdminUserId) {
      const filteredItems = (
        await this.repository.listSupportTicketsForAdminMatching(
          toAdminSupportTicketMatchQuery(query),
        )
      )
        .map(ticket => mapSupportTicketWithSla(ticket, currentTime))
        .filter(ticket => matchesSupportTicketClaimFilters(ticket, query))
        .filter(
          ticket =>
            query.slaStatus === undefined ||
            ticket.sla?.status === query.slaStatus,
        );

      return createAdminSupportTicketPage(
        filteredItems,
        query.page,
        query.pageSize,
      );
    }

    const result = await this.repository.listSupportTicketsForAdmin(query);

    return {
      ...result,
      items: result.items.map(ticket =>
        mapSupportTicketWithSla(ticket, currentTime),
      ),
    };
  }

  async getSupportTicketForAdmin(ticketId: string) {
    const ticket = await this.repository.findSupportTicketById(ticketId);

    if (!ticket) {
      throw notFoundError();
    }

    return mapSupportTicketWithSla(ticket, this.now());
  }

  async createSupportTicket(
    shipperId: string,
    input: CreateShipperSupportTicketRequest,
  ) {
    const createdAtIso = this.now().toISOString();

    return mapSupportTicketWithSla(
      await this.repository.createSupportTicket(shipperId, {
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
      }),
      this.now(),
    );
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

  async claimSupportTicket(
    adminUserId: string,
    ticketId: string,
    input: ClaimSupportTicketRequest,
  ) {
    const ticket = await this.repository.findSupportTicketById(ticketId);

    if (!ticket) {
      throw notFoundError();
    }

    if (ticket.status !== 'pending' && ticket.status !== 'processing') {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      );
    }

    const currentSnapshot = mapSupportTicketWithSla(ticket, this.now());

    if (currentSnapshot.claimedByAdminUserId === adminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前管理员已经是该工单的认领人，无需重复认领',
      );
    }

    if (currentSnapshot.claimedByAdminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单已被其他客服认领，请使用强制接管流程',
      );
    }

    const updatedAtIso = createSupportTicketUpdatedAtIso(
      input.baseUpdatedAtIso,
      this.now().toISOString(),
    );
    const result = await this.repository.appendSupportTicketHistoryItem(
      ticketId,
      ticket.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        updatedAtIso,
        historyItem: createSupportTicketClaimHistoryItem(
          adminUserId,
          updatedAtIso,
          input.content,
        ),
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

    return mapSupportTicketWithSla(result, this.now());
  }

  async takeoverSupportTicket(
    adminUserId: string,
    ticketId: string,
    input: ClaimSupportTicketRequest,
  ) {
    const ticket = await this.repository.findSupportTicketById(ticketId);

    if (!ticket) {
      throw notFoundError();
    }

    if (ticket.status !== 'pending' && ticket.status !== 'processing') {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      );
    }

    const currentSnapshot = mapSupportTicketWithSla(ticket, this.now());

    if (!currentSnapshot.claimedByAdminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单尚未被认领，无法强制接管',
      );
    }

    if (currentSnapshot.claimedByAdminUserId === adminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前管理员已经是该工单的认领人，无需强制接管',
      );
    }

    const updatedAtIso = createSupportTicketUpdatedAtIso(
      input.baseUpdatedAtIso,
      this.now().toISOString(),
    );
    const result = await this.repository.appendSupportTicketHistoryItem(
      ticketId,
      ticket.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        updatedAtIso,
        historyItem: createSupportTicketTakeoverHistoryItem(
          adminUserId,
          currentSnapshot.claimedByAdminUserId,
          updatedAtIso,
          input.content,
        ),
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

    return mapSupportTicketWithSla(result, this.now());
  }

  async assignSupportTicket(
    adminUserId: string,
    ticketId: string,
    input: AssignSupportTicketRequest,
  ) {
    const ticket = await this.repository.findSupportTicketById(ticketId);

    if (!ticket) {
      throw notFoundError();
    }

    if (ticket.status !== 'pending' && ticket.status !== 'processing') {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      );
    }

    const currentSnapshot = mapSupportTicketWithSla(ticket, this.now());

    if (currentSnapshot.claimedByAdminUserId === input.targetAdminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单已在目标客服名下，无需重复指派',
      );
    }

    const assignmentMode = currentSnapshot.claimedByAdminUserId
      ? 'transfer'
      : 'assign';

    if (
      assignmentMode === 'transfer' &&
      currentSnapshot.claimedByAdminUserId !== adminUserId
    ) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前管理员不是该工单的认领人，不能转派给其他客服',
      );
    }

    const updatedAtIso = createSupportTicketUpdatedAtIso(
      input.baseUpdatedAtIso,
      this.now().toISOString(),
    );
    const result = await this.repository.appendSupportTicketHistoryItem(
      ticketId,
      ticket.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        updatedAtIso,
        historyItem: createSupportTicketAssignHistoryItem(
          adminUserId,
          input.targetAdminUserId,
          updatedAtIso,
          assignmentMode,
          input.content,
        ),
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

    return mapSupportTicketWithSla(result, this.now());
  }

  async unclaimSupportTicket(
    adminUserId: string,
    ticketId: string,
    input: ClaimSupportTicketRequest,
  ) {
    const ticket = await this.repository.findSupportTicketById(ticketId);

    if (!ticket) {
      throw notFoundError();
    }

    if (ticket.status !== 'pending' && ticket.status !== 'processing') {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单状态不允许执行该操作',
      );
    }

    const currentSnapshot = mapSupportTicketWithSla(ticket, this.now());

    if (!currentSnapshot.claimedByAdminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前帮助中心工单尚未被认领，无需释放认领',
      );
    }

    if (currentSnapshot.claimedByAdminUserId !== adminUserId) {
      throw new BusinessError(
        ApiErrorCode.SUPPORT_TICKET_STATE_INVALID,
        '当前管理员不是该工单的认领人，不能释放认领',
      );
    }

    const updatedAtIso = createSupportTicketUpdatedAtIso(
      input.baseUpdatedAtIso,
      this.now().toISOString(),
    );
    const result = await this.repository.appendSupportTicketHistoryItem(
      ticketId,
      ticket.status,
      {
        baseUpdatedAtIso: input.baseUpdatedAtIso,
        updatedAtIso,
        historyItem: createSupportTicketUnclaimHistoryItem(
          adminUserId,
          updatedAtIso,
          input.content,
        ),
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

    return mapSupportTicketWithSla(result, this.now());
  }

  private async transitionSupportTicket(
    adminUserId: string,
    ticketId: string,
    expectedStatus: ShipperSupportTicketStatus,
    nextStatus: ShipperSupportTicketStatus,
    actionText: string,
    input: UpdateShipperSupportTicketRequest,
  ) {
    const updatedAtIso = createSupportTicketUpdatedAtIso(
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

    await this.safeNotifySupportTicketEvent({
      event:
        nextStatus === 'processing'
          ? 'support_ticket_processing'
          : 'support_ticket_resolved',
      ticketId: result.id,
      shipperId: result.shipperId,
      channelName: result.channelName,
      content: input.content,
    });

    return mapSupportTicketWithSla(result, this.now());
  }

  private async safeNotifySupportTicketEvent(input: {
    event: 'support_ticket_processing' | 'support_ticket_resolved';
    ticketId: string;
    shipperId: string;
    channelName: string;
    content?: string;
  }) {
    if (!this.notificationsService) {
      return;
    }

    try {
      await this.notificationsService.notifySupportTicketEvent(input);
    } catch {
      // Inbox/push is best-effort and must not break support ticket workflows.
    }
  }
}

function notFoundError() {
  return new BusinessError(
    ApiErrorCode.SUPPORT_TICKET_NOT_FOUND,
    '帮助中心工单不存在',
  );
}

function toAdminSupportTicketMatchQuery(
  query: AdminSupportTicketListQuery,
): AdminSupportTicketMatchQuery {
  return {
    status: query.status,
    keyword: query.keyword,
  };
}

function createAdminSupportTicketPage(
  items: ShipperSupportTicketRecord[],
  page: number,
  pageSize: number,
): AdminSupportTicketListRecord {
  const startIndex = (page - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function matchesSupportTicketClaimFilters(
  ticket: ShipperSupportTicketRecord,
  query: AdminSupportTicketListQuery,
) {
  if (
    query.claimStatus === 'claimed' &&
    !ticket.claimedByAdminUserId
  ) {
    return false;
  }

  if (
    query.claimStatus === 'unclaimed' &&
    ticket.claimedByAdminUserId
  ) {
    return false;
  }

  if (
    query.claimedByAdminUserId &&
    ticket.claimedByAdminUserId !== query.claimedByAdminUserId
  ) {
    return false;
  }

  return true;
}

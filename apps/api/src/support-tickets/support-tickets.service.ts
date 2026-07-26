import { ApiErrorCode, BusinessError } from '../common/errors';
import type { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminSupportTicketListQuery,
  CreateShipperSupportTicketRequest,
  ShipperSupportTicketRecord,
  UpdateShipperSupportTicketRequest,
  ShipperSupportTicketListRecord,
  ShipperSupportTicketSlaSnapshot,
  ShipperSupportTicketStatus,
  ShipperSupportTicketStatusHistoryItem,
} from './dto';
import type { SupportTicketsRepository } from './support-tickets.repository';

const SUPPORT_TICKET_SLA_POLICY_KEY = 'support_ticket_default_v1';
const SUPPORT_TICKET_FIRST_RESPONSE_TARGET_MS = 30 * 60 * 1000;
const SUPPORT_TICKET_RESOLUTION_TARGET_MS = 24 * 60 * 60 * 1000;
const MILLIS_PER_MINUTE = 60 * 1000;

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

function mapSupportTicketWithSla(
  ticket: ShipperSupportTicketRecord,
  now: Date,
): ShipperSupportTicketRecord {
  return {
    ...ticket,
    sla: buildSupportTicketSlaSnapshot(ticket, now),
  };
}

function buildSupportTicketSlaSnapshot(
  ticket: ShipperSupportTicketRecord,
  now: Date,
): ShipperSupportTicketSlaSnapshot {
  if (ticket.status === 'pending') {
    const targetTimestamp =
      parseTimestamp(ticket.createdAtIso, now.getTime()) +
      SUPPORT_TICKET_FIRST_RESPONSE_TARGET_MS;

    return buildOpenSupportTicketSla(
      'first_response',
      targetTimestamp,
      now.getTime(),
    );
  }

  const resolutionAnchorTimestamp = parseTimestamp(
    findSupportTicketStatusTransitionIso(
      ticket.statusHistory,
      'processing',
      ticket.updatedAtIso,
    ),
    parseTimestamp(ticket.updatedAtIso, now.getTime()),
  );
  const targetTimestamp =
    resolutionAnchorTimestamp + SUPPORT_TICKET_RESOLUTION_TARGET_MS;

  if (ticket.status === 'resolved') {
    return buildResolvedSupportTicketSla(
      targetTimestamp,
      parseTimestamp(ticket.updatedAtIso, now.getTime()),
    );
  }

  return buildOpenSupportTicketSla('resolution', targetTimestamp, now.getTime());
}

function buildOpenSupportTicketSla(
  stage: ShipperSupportTicketSlaSnapshot['stage'],
  targetTimestamp: number,
  evaluationTimestamp: number,
): ShipperSupportTicketSlaSnapshot {
  if (evaluationTimestamp > targetTimestamp) {
    return {
      policyKey: SUPPORT_TICKET_SLA_POLICY_KEY,
      stage,
      status: 'overdue',
      targetAtIso: new Date(targetTimestamp).toISOString(),
      overdueMinutes: calculateSlaMinutes(
        evaluationTimestamp - targetTimestamp,
      ),
    };
  }

  return {
    policyKey: SUPPORT_TICKET_SLA_POLICY_KEY,
    stage,
    status: 'within_target',
    targetAtIso: new Date(targetTimestamp).toISOString(),
    remainingMinutes: calculateSlaMinutes(
      targetTimestamp - evaluationTimestamp,
    ),
  };
}

function buildResolvedSupportTicketSla(
  targetTimestamp: number,
  resolvedTimestamp: number,
): ShipperSupportTicketSlaSnapshot {
  if (resolvedTimestamp > targetTimestamp) {
    return {
      policyKey: SUPPORT_TICKET_SLA_POLICY_KEY,
      stage: 'resolution',
      status: 'resolved_overdue',
      targetAtIso: new Date(targetTimestamp).toISOString(),
      overdueMinutes: calculateSlaMinutes(
        resolvedTimestamp - targetTimestamp,
      ),
    };
  }

  return {
    policyKey: SUPPORT_TICKET_SLA_POLICY_KEY,
    stage: 'resolution',
    status: 'resolved_within_target',
    targetAtIso: new Date(targetTimestamp).toISOString(),
    remainingMinutes: calculateSlaMinutes(
      targetTimestamp - resolvedTimestamp,
    ),
  };
}

function findSupportTicketStatusTransitionIso(
  statusHistory: ShipperSupportTicketStatusHistoryItem[],
  toStatus: ShipperSupportTicketStatus,
  fallbackIso: string,
) {
  for (let index = statusHistory.length - 1; index >= 0; index -= 1) {
    if (statusHistory[index]?.toStatus === toStatus) {
      return statusHistory[index].timestampIso;
    }
  }

  return fallbackIso;
}

function parseTimestamp(value: string | undefined, fallback: number) {
  const timestamp = Date.parse(value ?? '');

  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function calculateSlaMinutes(deltaMs: number) {
  return Math.max(0, Math.ceil(deltaMs / MILLIS_PER_MINUTE));
}

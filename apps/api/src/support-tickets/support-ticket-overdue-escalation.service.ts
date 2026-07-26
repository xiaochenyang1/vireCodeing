import { Injectable } from '@nestjs/common';
import type {
  ShipperSupportTicketRecord,
  ShipperSupportTicketSlaSnapshot,
  SupportTicketOverdueEscalationSweepResult,
  SupportTicketOverdueEscalationSweepTrigger,
} from './dto';
import {
  buildSupportTicketSlaSnapshot,
  createSupportTicketUpdatedAtIso,
} from './support-ticket-helpers';
import type { SupportTicketsRepository } from './support-tickets.repository';

const SUPPORT_TICKET_AUTO_ESCALATION_ACTION_TEXT = '工单超时已升级';

@Injectable()
export class SupportTicketOverdueEscalationService {
  constructor(
    private readonly repository: SupportTicketsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sweepOverdueTickets(
    trigger: SupportTicketOverdueEscalationSweepTrigger,
  ): Promise<SupportTicketOverdueEscalationSweepResult> {
    const triggeredAt = this.now();
    const triggeredAtIso = triggeredAt.toISOString();
    const openTickets = (
      await this.repository.listSupportTicketsForAdminMatching({})
    ).filter(ticket => ticket.status !== 'resolved');
    const overdueTickets = openTickets
      .map(ticket => ({
        ticket,
        sla: buildSupportTicketSlaSnapshot(ticket, triggeredAt),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          ticket: ShipperSupportTicketRecord;
          sla: ShipperSupportTicketSlaSnapshot & { status: 'overdue' };
        } => candidate.sla.status === 'overdue',
      );
    const result: SupportTicketOverdueEscalationSweepResult = {
      trigger,
      triggeredAtIso,
      scannedCount: openTickets.length,
      overdueCount: overdueTickets.length,
      escalatedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      escalatedTicketIds: [],
    };

    for (const { ticket, sla } of overdueTickets) {
      if (hasSupportTicketAutoEscalation(ticket, sla.stage)) {
        result.skippedCount += 1;
        continue;
      }

      const appendResult = await this.repository.appendSupportTicketHistoryItem(
        ticket.id,
        ticket.status,
        {
          baseUpdatedAtIso: ticket.updatedAtIso,
          updatedAtIso: createSupportTicketUpdatedAtIso(
            ticket.updatedAtIso,
            triggeredAtIso,
          ),
          historyItem: createSupportTicketAutoEscalationHistoryItem(
            ticket,
            sla,
            triggeredAtIso,
          ),
        },
      );

      if (appendResult === 'not-found' || appendResult === 'conflict') {
        result.conflictCount += 1;
        continue;
      }

      if (appendResult === 'state-invalid') {
        result.skippedCount += 1;
        continue;
      }

      result.escalatedCount += 1;
      result.escalatedTicketIds.push(appendResult.id);
    }

    return result;
  }
}

function hasSupportTicketAutoEscalation(
  ticket: ShipperSupportTicketRecord,
  stage: ShipperSupportTicketSlaSnapshot['stage'],
) {
  return ticket.statusHistory.some(
    historyItem =>
      historyItem.actionText === SUPPORT_TICKET_AUTO_ESCALATION_ACTION_TEXT &&
      historyItem.operatorUserId ===
        createSupportTicketAutoEscalationOperatorUserId(stage),
  );
}

function createSupportTicketAutoEscalationHistoryItem(
  ticket: ShipperSupportTicketRecord,
  sla: ShipperSupportTicketSlaSnapshot & { status: 'overdue' },
  timestampIso: string,
) {
  const overdueMinutes = typeof sla.overdueMinutes === 'number' ? sla.overdueMinutes : 0;

  return {
    actionText: SUPPORT_TICKET_AUTO_ESCALATION_ACTION_TEXT,
    timestampIso,
    operatorUserId: createSupportTicketAutoEscalationOperatorUserId(sla.stage),
    content:
      sla.stage === 'first_response'
        ? `系统检测到${ticket.channelName}工单首响 SLA 已超时 ${overdueMinutes} 分钟，已自动升级给值班客服跟进。`
        : `系统检测到${ticket.channelName}工单解决 SLA 已超时 ${overdueMinutes} 分钟，已自动升级给值班客服继续处理。`,
  };
}

function createSupportTicketAutoEscalationOperatorUserId(
  stage: ShipperSupportTicketSlaSnapshot['stage'],
) {
  return `system:auto-escalation:${stage}`;
}

import type {
  ShipperSupportTicketRecord,
  ShipperSupportTicketSlaSnapshot,
  ShipperSupportTicketStatusHistoryItem,
} from './dto';

export const SUPPORT_TICKET_SLA_POLICY_KEY = 'support_ticket_default_v1';
const SUPPORT_TICKET_FIRST_RESPONSE_TARGET_MS = 30 * 60 * 1000;
const SUPPORT_TICKET_RESOLUTION_TARGET_MS = 24 * 60 * 60 * 1000;
const MILLIS_PER_MINUTE = 60 * 1000;

export function mapSupportTicketWithSla(
  ticket: ShipperSupportTicketRecord,
  now: Date,
): ShipperSupportTicketRecord {
  return {
    ...ticket,
    sla: buildSupportTicketSlaSnapshot(ticket, now),
  };
}

export function buildSupportTicketSlaSnapshot(
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

export function createSupportTicketUpdatedAtIso(
  baseUpdatedAtIso: string,
  nowIso: string,
) {
  const baseTimestamp = Date.parse(baseUpdatedAtIso);
  const nowTimestamp = Date.parse(nowIso);

  if (Number.isNaN(baseTimestamp) || Number.isNaN(nowTimestamp)) {
    return nowIso;
  }

  return new Date(Math.max(baseTimestamp + 1, nowTimestamp)).toISOString();
}

export function findSupportTicketStatusTransitionIso(
  statusHistory: ShipperSupportTicketStatusHistoryItem[],
  nextStatus: 'processing',
  fallbackIso: string,
) {
  for (let index = statusHistory.length - 1; index >= 0; index -= 1) {
    const historyItem = statusHistory[index];

    if (historyItem.toStatus === nextStatus) {
      return historyItem.timestampIso;
    }
  }

  return fallbackIso;
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

function calculateSlaMinutes(durationMs: number) {
  return Math.max(0, Math.ceil(durationMs / MILLIS_PER_MINUTE));
}

function parseTimestamp(value: string, fallbackTimestamp: number) {
  const parsedTimestamp = Date.parse(value);

  return Number.isNaN(parsedTimestamp) ? fallbackTimestamp : parsedTimestamp;
}

import type {
  ShipperSupportTicketRecord,
  ShipperSupportTicketSlaSnapshot,
  ShipperSupportTicketStatusHistoryItem,
} from './dto';

export const SUPPORT_TICKET_SLA_POLICY_KEY = 'support_ticket_default_v1';
const SUPPORT_TICKET_FIRST_RESPONSE_TARGET_MS = 30 * 60 * 1000;
const SUPPORT_TICKET_RESOLUTION_TARGET_MS = 24 * 60 * 60 * 1000;
const MILLIS_PER_MINUTE = 60 * 1000;
const SUPPORT_TICKET_CLAIM_ACTION_TEXT = '客服已认领';
const SUPPORT_TICKET_DEFAULT_CLAIM_NOTE = '当前客服已认领并接手跟进。';

export function mapSupportTicketWithSla(
  ticket: ShipperSupportTicketRecord,
  now: Date,
): ShipperSupportTicketRecord {
  return {
    ...ticket,
    ...buildSupportTicketClaimSnapshot(ticket.statusHistory),
    sla: buildSupportTicketSlaSnapshot(ticket, now),
  };
}

export function createSupportTicketClaimHistoryItem(
  adminUserId: string,
  timestampIso: string,
  content?: string,
): ShipperSupportTicketStatusHistoryItem {
  return {
    actionText: SUPPORT_TICKET_CLAIM_ACTION_TEXT,
    timestampIso,
    operatorUserId: adminUserId,
    content: createSupportTicketClaimContent(content),
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

export function createSupportTicketClaimContent(content?: string) {
  const normalizedNote = content?.trim();

  return normalizedNote && normalizedNote.length > 0
    ? normalizedNote
    : SUPPORT_TICKET_DEFAULT_CLAIM_NOTE;
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

function buildSupportTicketClaimSnapshot(
  statusHistory: ShipperSupportTicketStatusHistoryItem[],
) {
  for (let index = statusHistory.length - 1; index >= 0; index -= 1) {
    const historyItem = statusHistory[index];

    if (
      !historyItem ||
      historyItem.actionText !== SUPPORT_TICKET_CLAIM_ACTION_TEXT ||
      typeof historyItem.operatorUserId !== 'string'
    ) {
      continue;
    }

    return {
      claimedByAdminUserId: historyItem.operatorUserId,
      claimedAtIso: historyItem.timestampIso,
      claimNote: extractSupportTicketClaimNote(historyItem.content),
    };
  }

  return {};
}

function extractSupportTicketClaimNote(content: string | undefined) {
  const normalizedNote = content?.trim();

  return normalizedNote && normalizedNote.length > 0
    ? normalizedNote
    : undefined;
}

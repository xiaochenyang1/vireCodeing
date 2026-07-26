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
const SUPPORT_TICKET_UNCLAIM_ACTION_TEXT = '客服已释放认领';
const SUPPORT_TICKET_ASSIGN_ACTION_TEXT = '客服已指派';
const SUPPORT_TICKET_TRANSFER_ACTION_TEXT = '客服已转派';
const SUPPORT_TICKET_DEFAULT_CLAIM_NOTE = '当前客服已认领并接手跟进。';
const SUPPORT_TICKET_DEFAULT_UNCLAIM_NOTE =
  '当前客服已释放认领，工单回到未认领队列。';
const SUPPORT_TICKET_DEFAULT_ASSIGN_NOTE = '当前工单已指派给指定客服跟进。';
const SUPPORT_TICKET_DEFAULT_TRANSFER_NOTE =
  '当前工单已转派给指定客服继续跟进。';
const SUPPORT_TICKET_ASSIGN_CONTENT_PREFIX = '指派给 ';
const SUPPORT_TICKET_TRANSFER_CONTENT_PREFIX = '转派给 ';

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

export function createSupportTicketUnclaimHistoryItem(
  adminUserId: string,
  timestampIso: string,
  content?: string,
): ShipperSupportTicketStatusHistoryItem {
  return {
    actionText: SUPPORT_TICKET_UNCLAIM_ACTION_TEXT,
    timestampIso,
    operatorUserId: adminUserId,
    content: createSupportTicketUnclaimContent(content),
  };
}

export function createSupportTicketAssignHistoryItem(
  adminUserId: string,
  targetAdminUserId: string,
  timestampIso: string,
  mode: 'assign' | 'transfer',
  content?: string,
): ShipperSupportTicketStatusHistoryItem {
  return {
    actionText:
      mode === 'assign'
        ? SUPPORT_TICKET_ASSIGN_ACTION_TEXT
        : SUPPORT_TICKET_TRANSFER_ACTION_TEXT,
    timestampIso,
    operatorUserId: adminUserId,
    content: createSupportTicketAssignContent(
      targetAdminUserId,
      mode,
      content,
    ),
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

export function createSupportTicketUnclaimContent(content?: string) {
  const normalizedNote = content?.trim();

  return normalizedNote && normalizedNote.length > 0
    ? normalizedNote
    : SUPPORT_TICKET_DEFAULT_UNCLAIM_NOTE;
}

export function createSupportTicketAssignContent(
  targetAdminUserId: string,
  mode: 'assign' | 'transfer',
  content?: string,
) {
  const normalizedNote = content?.trim();
  const normalizedTargetAdminUserId = targetAdminUserId.trim();

  return `${
    mode === 'assign'
      ? SUPPORT_TICKET_ASSIGN_CONTENT_PREFIX
      : SUPPORT_TICKET_TRANSFER_CONTENT_PREFIX
  }${normalizedTargetAdminUserId}：${
    normalizedNote && normalizedNote.length > 0
      ? normalizedNote
      : mode === 'assign'
        ? SUPPORT_TICKET_DEFAULT_ASSIGN_NOTE
        : SUPPORT_TICKET_DEFAULT_TRANSFER_NOTE
  }`;
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
      historyItem &&
      historyItem.actionText === SUPPORT_TICKET_UNCLAIM_ACTION_TEXT
    ) {
      return {};
    }

    const assignedSnapshot =
      buildSupportTicketAssignedSnapshotFromHistoryItem(historyItem);

    if (assignedSnapshot) {
      return {
        claimedByAdminUserId: assignedSnapshot.targetAdminUserId,
        claimedAtIso: historyItem.timestampIso,
        claimNote: assignedSnapshot.note,
      };
    }

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

function buildSupportTicketAssignedSnapshotFromHistoryItem(
  historyItem: ShipperSupportTicketStatusHistoryItem | undefined,
) {
  if (!historyItem) {
    return null;
  }

  const contentPrefix =
    historyItem.actionText === SUPPORT_TICKET_ASSIGN_ACTION_TEXT
      ? SUPPORT_TICKET_ASSIGN_CONTENT_PREFIX
      : historyItem.actionText === SUPPORT_TICKET_TRANSFER_ACTION_TEXT
        ? SUPPORT_TICKET_TRANSFER_CONTENT_PREFIX
        : null;

  if (!contentPrefix || typeof historyItem.content !== 'string') {
    return null;
  }

  const remainder = historyItem.content.slice(contentPrefix.length);
  const separatorIndex = findSupportTicketAssignmentSeparatorIndex(remainder);
  const rawTargetAdminUserId =
    separatorIndex === -1 ? remainder : remainder.slice(0, separatorIndex);
  const targetAdminUserId = rawTargetAdminUserId.trim();

  if (targetAdminUserId.length === 0) {
    return null;
  }

  const note =
    separatorIndex === -1
      ? undefined
      : remainder.slice(separatorIndex + 1).trim() || undefined;

  return {
    targetAdminUserId,
    note,
  };
}

function findSupportTicketAssignmentSeparatorIndex(content: string) {
  const chineseSeparatorIndex = content.indexOf('：');

  if (chineseSeparatorIndex !== -1) {
    return chineseSeparatorIndex;
  }

  return content.indexOf(':');
}

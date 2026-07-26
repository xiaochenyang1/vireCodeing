import type {
  OrderExceptionCaseActionRecord,
  OrderExceptionCaseRecord,
  OrderExceptionCaseSlaSnapshot,
  OrderExceptionCaseSlaStage,
  OrderExceptionCaseStatus,
} from './dto';

export const EXCEPTION_CASE_SLA_POLICY_KEY = 'exception_case_default_v1';
const EXCEPTION_CASE_ACCEPTANCE_TARGET_MS = 15 * 60 * 1000;
const EXCEPTION_CASE_RESOLUTION_TARGET_MS = 4 * 60 * 60 * 1000;
const MILLIS_PER_MINUTE = 60 * 1000;
const EXCEPTION_CASE_CLAIM_CONTENT_PREFIX = '客服认领：';
const EXCEPTION_CASE_UNCLAIM_CONTENT_PREFIX = '客服释放认领：';
const EXCEPTION_CASE_ASSIGN_CONTENT_PREFIX = '客服指派给 ';
const EXCEPTION_CASE_TRANSFER_CONTENT_PREFIX = '客服转派给 ';
const EXCEPTION_CASE_DEFAULT_CLAIM_NOTE = '当前客服已认领并接手跟进。';
const EXCEPTION_CASE_DEFAULT_UNCLAIM_NOTE =
  '当前客服已释放认领，工单回到未认领队列。';
const EXCEPTION_CASE_DEFAULT_ASSIGN_NOTE =
  '当前异常工单已指派给指定客服跟进。';
const EXCEPTION_CASE_DEFAULT_TRANSFER_NOTE =
  '当前异常工单已转派给指定客服继续跟进。';

export function mapOrderExceptionCaseListWithSla(
  result: { items: OrderExceptionCaseRecord[]; total: number },
  now: Date,
) {
  return {
    ...result,
    items: result.items.map(exceptionCase =>
      mapOrderExceptionCaseWithSla(exceptionCase, now),
    ),
  };
}

export function mapOrderExceptionCaseWithSla(
  exceptionCase: OrderExceptionCaseRecord,
  now: Date,
): OrderExceptionCaseRecord {
  return {
    ...exceptionCase,
    ...buildOrderExceptionCaseClaimSnapshot(exceptionCase.actions),
    sla: buildOrderExceptionCaseSlaSnapshot(exceptionCase, now),
  };
}

export function createOrderExceptionCaseClaimContent(content?: string) {
  const normalizedNote = content?.trim();

  return `${EXCEPTION_CASE_CLAIM_CONTENT_PREFIX}${
    normalizedNote && normalizedNote.length > 0
      ? normalizedNote
      : EXCEPTION_CASE_DEFAULT_CLAIM_NOTE
  }`;
}

export function createOrderExceptionCaseUnclaimContent(content?: string) {
  const normalizedNote = content?.trim();

  return `${EXCEPTION_CASE_UNCLAIM_CONTENT_PREFIX}${
    normalizedNote && normalizedNote.length > 0
      ? normalizedNote
      : EXCEPTION_CASE_DEFAULT_UNCLAIM_NOTE
  }`;
}

export function createOrderExceptionCaseAssignContent(
  targetAdminUserId: string,
  mode: 'assign' | 'transfer',
  content?: string,
) {
  const normalizedNote = content?.trim();
  const normalizedTargetAdminUserId = targetAdminUserId.trim();

  return `${
    mode === 'assign'
      ? EXCEPTION_CASE_ASSIGN_CONTENT_PREFIX
      : EXCEPTION_CASE_TRANSFER_CONTENT_PREFIX
  }${normalizedTargetAdminUserId}：${
    normalizedNote && normalizedNote.length > 0
      ? normalizedNote
      : mode === 'assign'
        ? EXCEPTION_CASE_DEFAULT_ASSIGN_NOTE
        : EXCEPTION_CASE_DEFAULT_TRANSFER_NOTE
  }`;
}

export function buildOrderExceptionCaseSlaSnapshot(
  exceptionCase: OrderExceptionCaseRecord,
  now: Date,
): OrderExceptionCaseSlaSnapshot {
  if (exceptionCase.status === 'pending') {
    const targetTimestamp =
      parseTimestamp(exceptionCase.createdAtIso, now.getTime()) +
      EXCEPTION_CASE_ACCEPTANCE_TARGET_MS;

    return buildOpenOrderExceptionCaseSla(
      'acceptance',
      targetTimestamp,
      now.getTime(),
    );
  }

  const resolutionAnchorTimestamp = parseTimestamp(
    findOrderExceptionCaseTransitionIso(
      exceptionCase.actions,
      'processing',
      exceptionCase.updatedAtIso,
    ),
    parseTimestamp(exceptionCase.updatedAtIso, now.getTime()),
  );
  const targetTimestamp =
    resolutionAnchorTimestamp + EXCEPTION_CASE_RESOLUTION_TARGET_MS;

  if (
    exceptionCase.status === 'resolved' ||
    exceptionCase.status === 'closed'
  ) {
    return buildResolvedOrderExceptionCaseSla(
      targetTimestamp,
      parseTimestamp(
        exceptionCase.resolvedAtIso ??
          exceptionCase.closedAtIso ??
          exceptionCase.updatedAtIso,
        now.getTime(),
      ),
    );
  }

  return buildOpenOrderExceptionCaseSla(
    'resolution',
    targetTimestamp,
    now.getTime(),
  );
}

export function createOrderExceptionCaseAutoEscalationAdminUserId(
  stage: OrderExceptionCaseSlaStage,
) {
  return `system:auto-escalation:${stage}`;
}

export function isOrderExceptionCaseAutoEscalationAdminUserId(
  adminUserId: string | undefined,
  stage?: OrderExceptionCaseSlaStage,
) {
  if (typeof adminUserId !== 'string') {
    return false;
  }

  if (stage) {
    return (
      adminUserId === createOrderExceptionCaseAutoEscalationAdminUserId(stage)
    );
  }

  return adminUserId.startsWith('system:auto-escalation:');
}

export function isOrderExceptionCaseClaimContent(content: string | undefined) {
  return (
    typeof content === 'string' &&
    content.startsWith(EXCEPTION_CASE_CLAIM_CONTENT_PREFIX)
  );
}

export function isOrderExceptionCaseUnclaimContent(
  content: string | undefined,
) {
  return (
    typeof content === 'string' &&
    content.startsWith(EXCEPTION_CASE_UNCLAIM_CONTENT_PREFIX)
  );
}

export function isOrderExceptionCaseAssignContent(
  content: string | undefined,
) {
  return (
    typeof content === 'string' &&
    content.startsWith(EXCEPTION_CASE_ASSIGN_CONTENT_PREFIX)
  );
}

export function isOrderExceptionCaseTransferContent(
  content: string | undefined,
) {
  return (
    typeof content === 'string' &&
    content.startsWith(EXCEPTION_CASE_TRANSFER_CONTENT_PREFIX)
  );
}

function buildOpenOrderExceptionCaseSla(
  stage: OrderExceptionCaseSlaSnapshot['stage'],
  targetTimestamp: number,
  evaluationTimestamp: number,
): OrderExceptionCaseSlaSnapshot {
  if (evaluationTimestamp > targetTimestamp) {
    return {
      policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
      stage,
      status: 'overdue',
      targetAtIso: new Date(targetTimestamp).toISOString(),
      overdueMinutes: calculateSlaMinutes(
        evaluationTimestamp - targetTimestamp,
      ),
    };
  }

  return {
    policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
    stage,
    status: 'within_target',
    targetAtIso: new Date(targetTimestamp).toISOString(),
    remainingMinutes: calculateSlaMinutes(
      targetTimestamp - evaluationTimestamp,
    ),
  };
}

function buildResolvedOrderExceptionCaseSla(
  targetTimestamp: number,
  resolvedTimestamp: number,
): OrderExceptionCaseSlaSnapshot {
  if (resolvedTimestamp > targetTimestamp) {
    return {
      policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
      stage: 'resolution',
      status: 'resolved_overdue',
      targetAtIso: new Date(targetTimestamp).toISOString(),
      overdueMinutes: calculateSlaMinutes(
        resolvedTimestamp - targetTimestamp,
      ),
    };
  }

  return {
    policyKey: EXCEPTION_CASE_SLA_POLICY_KEY,
    stage: 'resolution',
    status: 'resolved_within_target',
    targetAtIso: new Date(targetTimestamp).toISOString(),
    remainingMinutes: calculateSlaMinutes(
      targetTimestamp - resolvedTimestamp,
    ),
  };
}

function findOrderExceptionCaseTransitionIso(
  actions: OrderExceptionCaseActionRecord[],
  toStatus: OrderExceptionCaseStatus,
  fallbackIso: string,
) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];

    if (
      action?.toStatus === toStatus &&
      !shouldIgnoreOrderExceptionCaseActionForSlaAnchor(action)
    ) {
      return action.createdAtIso;
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

function buildOrderExceptionCaseClaimSnapshot(
  actions: OrderExceptionCaseActionRecord[],
) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];

    if (
      !action ||
      isOrderExceptionCaseAutoEscalationAdminUserId(action.adminUserId)
    ) {
      continue;
    }

    if (isOrderExceptionCaseUnclaimContent(action.content)) {
      return {};
    }

    const assignedSnapshot = extractOrderExceptionCaseAssignedSnapshot(
      action.content,
    );

    if (assignedSnapshot) {
      return {
        claimedByAdminUserId: assignedSnapshot.targetAdminUserId,
        claimedAtIso: action.createdAtIso,
        claimNote: assignedSnapshot.note,
      };
    }

    if (!isOrderExceptionCaseClaimContent(action.content)) {
      continue;
    }

    return {
      claimedByAdminUserId: action.adminUserId,
      claimedAtIso: action.createdAtIso,
      claimNote: extractOrderExceptionCaseClaimNote(action.content),
    };
  }

  return {};
}

function extractOrderExceptionCaseClaimNote(content: string) {
  const normalizedNote = content
    .slice(EXCEPTION_CASE_CLAIM_CONTENT_PREFIX.length)
    .trim();

  return normalizedNote.length > 0 ? normalizedNote : undefined;
}

function shouldIgnoreOrderExceptionCaseActionForSlaAnchor(
  action: OrderExceptionCaseActionRecord,
) {
  return (
    isOrderExceptionCaseAutoEscalationAdminUserId(action.adminUserId) ||
    isOrderExceptionCaseClaimContent(action.content) ||
    isOrderExceptionCaseUnclaimContent(action.content) ||
    isOrderExceptionCaseAssignContent(action.content) ||
    isOrderExceptionCaseTransferContent(action.content)
  );
}

function extractOrderExceptionCaseAssignedSnapshot(content: string | undefined) {
  const contentPrefix = isOrderExceptionCaseAssignContent(content)
    ? EXCEPTION_CASE_ASSIGN_CONTENT_PREFIX
    : isOrderExceptionCaseTransferContent(content)
      ? EXCEPTION_CASE_TRANSFER_CONTENT_PREFIX
      : null;

  if (!contentPrefix || typeof content !== 'string') {
    return null;
  }

  const remainder = content.slice(contentPrefix.length);
  const separatorIndex = findOrderExceptionCaseAssignmentSeparatorIndex(
    remainder,
  );
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

function findOrderExceptionCaseAssignmentSeparatorIndex(content: string) {
  const chineseSeparatorIndex = content.indexOf('：');

  if (chineseSeparatorIndex !== -1) {
    return chineseSeparatorIndex;
  }

  return content.indexOf(':');
}

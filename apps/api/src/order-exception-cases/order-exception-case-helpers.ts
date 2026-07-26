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
    sla: buildOrderExceptionCaseSlaSnapshot(exceptionCase, now),
  };
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
      !isOrderExceptionCaseAutoEscalationAdminUserId(action.adminUserId)
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

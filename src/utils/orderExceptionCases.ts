import type {
  PlatformOrderExceptionCase,
  PlatformOrderExceptionCaseAction,
  PlatformOrderExceptionCaseCompensationStatus,
  PlatformOrderExceptionCaseCompensationTargetRole,
  PlatformOrderExceptionCaseSourceRole,
  PlatformOrderExceptionCaseStatus,
} from '../services/platformOrderApi';
import { formatPlatformIsoMinute } from './dateTime';

type OrderExceptionCaseSummarySnapshot = {
  caseNo: string;
  status: PlatformOrderExceptionCaseStatus;
  resolutionText?: string;
  compensationStatus?: PlatformOrderExceptionCaseCompensationStatus;
  compensationTargetRole?: PlatformOrderExceptionCaseCompensationTargetRole;
  compensationAmountCents?: number;
  compensationUpdatedAtIso?: string;
  appealStatus?: PlatformOrderExceptionCase['appealStatus'];
};

export function getOrderExceptionCaseStatusText(
  status: PlatformOrderExceptionCaseStatus,
) {
  const textByStatus: Record<PlatformOrderExceptionCaseStatus, string> = {
    pending: '待客服受理',
    processing: '处理中',
    resolved: '已解决',
    closed: '已关闭',
  };

  return textByStatus[status];
}

export function getOrderExceptionCaseSourceText(
  sourceRole: PlatformOrderExceptionCaseSourceRole,
) {
  return sourceRole === 'shipper' ? '货主上报' : '司机上报';
}

export function getOrderExceptionCaseCompensationStatusText(
  status: PlatformOrderExceptionCaseCompensationStatus,
) {
  const textByStatus: Record<
    PlatformOrderExceptionCaseCompensationStatus,
    string
  > = {
    not_required: '无需赔付',
    pending: '待赔付跟进',
    offline_completed: '线下已赔付',
    executed: '平台已赔付到账',
  };

  return textByStatus[status];
}

export function getOrderExceptionCaseAppealStatusText(
  status: NonNullable<PlatformOrderExceptionCase['appealStatus']>,
) {
  const textByStatus: Record<
    NonNullable<PlatformOrderExceptionCase['appealStatus']>,
    string
  > = {
    none: '未申诉',
    requested: '申诉处理中',
    rejected: '申诉已驳回',
    accepted: '申诉已受理',
  };

  return textByStatus[status];
}

export function canAppealOrderExceptionCase(
  exceptionCase: Pick<
    PlatformOrderExceptionCase,
    'status' | 'compensationStatus' | 'appealStatus'
  >,
) {
  if (exceptionCase.status !== 'resolved') {
    return false;
  }

  if (exceptionCase.compensationStatus === 'executed') {
    return false;
  }

  return (exceptionCase.appealStatus ?? 'none') === 'none';
}

export function getOrderExceptionCaseCompensationTargetText(
  targetRole: PlatformOrderExceptionCaseCompensationTargetRole,
) {
  return targetRole === 'shipper' ? '货主' : '司机';
}

export function getOrderExceptionCaseSummaryHeadline(
  exceptionCase: Pick<OrderExceptionCaseSummarySnapshot, 'caseNo' | 'status'>,
) {
  return `最新异常：${exceptionCase.caseNo} · ${getOrderExceptionCaseStatusText(
    exceptionCase.status,
  )}`;
}

export function getOrderExceptionCaseCompensationSummary(
  exceptionCase: Pick<
    PlatformOrderExceptionCase,
    | 'compensationStatus'
    | 'compensationTargetRole'
    | 'compensationAmountCents'
    | 'compensationUpdatedAtIso'
  >,
  options: {
    includeUpdatedAt?: boolean;
  } = {},
) {
  if (!exceptionCase.compensationStatus) {
    return undefined;
  }

  if (exceptionCase.compensationStatus === 'not_required') {
    return '赔付决议：无需赔付';
  }

  const summaryParts = [
    `赔付决议：${getOrderExceptionCaseCompensationStatusText(
      exceptionCase.compensationStatus,
    )}`,
  ];

  if (exceptionCase.compensationTargetRole) {
    summaryParts.push(
      `对象：${getOrderExceptionCaseCompensationTargetText(
        exceptionCase.compensationTargetRole,
      )}`,
    );
  }

  if (
    typeof exceptionCase.compensationAmountCents === 'number' &&
    Number.isInteger(exceptionCase.compensationAmountCents) &&
    exceptionCase.compensationAmountCents >= 0
  ) {
    summaryParts.push(
      `金额：${formatOrderExceptionCaseCompensationAmount(
        exceptionCase.compensationAmountCents,
      )}`,
    );
  }

  if (
    options.includeUpdatedAt !== false &&
    exceptionCase.compensationUpdatedAtIso
  ) {
    summaryParts.push(
      `更新时间：${formatOrderExceptionCaseTime(
        exceptionCase.compensationUpdatedAtIso,
      )}`,
    );
  }

  return summaryParts.join(' · ');
}

export function getOrderExceptionCaseLifecycleFacts(
  exceptionCase: Pick<
    PlatformOrderExceptionCase,
    | 'createdAtIso'
    | 'compensationExecutedAtIso'
    | 'appealRequestedAtIso'
    | 'resolvedAtIso'
    | 'closedAtIso'
  >,
) {
  return {
    createdAtText: formatPlatformIsoMinute(exceptionCase.createdAtIso),
    compensationExecutedAtText: formatOrderExceptionCaseTime(
      exceptionCase.compensationExecutedAtIso,
    ),
    appealRequestedAtText: formatOrderExceptionCaseTime(
      exceptionCase.appealRequestedAtIso,
    ),
    resolvedAtText: formatOrderExceptionCaseTime(exceptionCase.resolvedAtIso),
    closedAtText: formatOrderExceptionCaseTime(exceptionCase.closedAtIso),
  };
}

export function getOrderExceptionCaseSummaryText(
  exceptionCase: Pick<
    OrderExceptionCaseSummarySnapshot,
    | 'resolutionText'
    | 'compensationStatus'
    | 'compensationTargetRole'
    | 'compensationAmountCents'
    | 'compensationUpdatedAtIso'
  >,
  options: {
    includeUpdatedAt?: boolean;
  } = {
    includeUpdatedAt: false,
  },
) {
  return (
    getOrderExceptionCaseCompensationSummary(exceptionCase, options) ??
    (exceptionCase.resolutionText
      ? `处理结论：${exceptionCase.resolutionText}`
      : undefined)
  );
}

export function sortOrderExceptionCaseActions(
  actions: PlatformOrderExceptionCaseAction[],
) {
  return [...actions].sort((left, right) =>
    left.createdAtIso.localeCompare(right.createdAtIso),
  );
}

function getOrderExceptionCaseSortTimeValue(
  exceptionCase: PlatformOrderExceptionCase,
) {
  return exceptionCase.updatedAtIso ?? exceptionCase.createdAtIso;
}

export function sortOrderExceptionCases(
  cases: PlatformOrderExceptionCase[],
) {
  return [...cases].sort((left, right) => {
    const leftSortTime = getOrderExceptionCaseSortTimeValue(left);
    const rightSortTime = getOrderExceptionCaseSortTimeValue(right);

    if (leftSortTime !== rightSortTime) {
      return rightSortTime.localeCompare(leftSortTime);
    }

    return right.createdAtIso.localeCompare(left.createdAtIso);
  });
}

function formatOrderExceptionCaseCompensationAmount(amountCents: number) {
  return `￥${(amountCents / 100).toFixed(2)}`;
}

function formatOrderExceptionCaseTime(value?: string) {
  return value ? formatPlatformIsoMinute(value) : undefined;
}

import type {
  PlatformOrderExceptionCaseAction,
  PlatformOrderExceptionCaseSourceRole,
  PlatformOrderExceptionCaseStatus,
} from '../services/platformOrderApi';

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

export function sortOrderExceptionCaseActions(
  actions: PlatformOrderExceptionCaseAction[],
) {
  return [...actions].sort((left, right) =>
    left.createdAtIso.localeCompare(right.createdAtIso),
  );
}

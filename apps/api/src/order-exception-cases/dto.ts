export type OrderExceptionCaseStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'closed';

export type OrderExceptionCaseSourceRole = 'shipper' | 'driver';
export type OrderExceptionCaseCompensationStatus =
  | 'not_required'
  | 'pending'
  | 'offline_completed'
  | 'executed';
export type OrderExceptionCaseCompensationTargetRole =
  OrderExceptionCaseSourceRole;
export type OrderExceptionCaseAppealStatus =
  | 'none'
  | 'requested'
  | 'rejected'
  | 'accepted';

export type OrderExceptionCaseActionRecord = {
  id: string;
  adminUserId: string;
  fromStatus: OrderExceptionCaseStatus;
  toStatus: OrderExceptionCaseStatus;
  content: string;
  createdAtIso: string;
};

export type OrderExceptionCaseRecord = {
  id: string;
  caseNo: string;
  orderId: string;
  orderNo: string;
  sourceEventId: string;
  reporterUserId: string;
  sourceRole: OrderExceptionCaseSourceRole;
  typeLabel: string;
  description: string;
  attachmentFileIds: string[];
  status: OrderExceptionCaseStatus;
  resolutionText?: string;
  compensationStatus?: OrderExceptionCaseCompensationStatus;
  compensationTargetRole?: OrderExceptionCaseCompensationTargetRole;
  compensationAmountCents?: number;
  compensationUpdatedAtIso?: string;
  compensationTransactionId?: string;
  compensationExecutedAtIso?: string;
  appealStatus: OrderExceptionCaseAppealStatus;
  appealReason?: string;
  appealRequestedAtIso?: string;
  resolvedAtIso?: string;
  closedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
  actions: OrderExceptionCaseActionRecord[];
};

export type OrderExceptionCaseListQuery = {
  page: number;
  pageSize: number;
  status?: OrderExceptionCaseStatus;
  sourceRole?: OrderExceptionCaseSourceRole;
  keyword?: string;
  createdFromIso?: string;
  createdToIso?: string;
};

export type OrderExceptionCaseListResult = {
  items: OrderExceptionCaseRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type UpdateOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  content: string;
};

export type ResolveOrderExceptionCaseRequest = UpdateOrderExceptionCaseRequest & {
  compensationStatus: OrderExceptionCaseCompensationStatus;
  compensationTargetRole?: OrderExceptionCaseCompensationTargetRole;
  compensationAmountCents?: number;
};

export type ExecuteOrderExceptionCaseCompensationRequest = {
  baseUpdatedAtIso: string;
  idempotencyKey: string;
  content: string;
};

export type AppealOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  reason: string;
};

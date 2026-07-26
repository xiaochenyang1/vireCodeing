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
export type OrderExceptionCaseAppealDecision = Extract<
  OrderExceptionCaseAppealStatus,
  'rejected' | 'accepted'
>;
export type OrderExceptionCaseClaimStatus = 'claimed' | 'unclaimed';

export type OrderExceptionCaseSlaPolicyKey =
  'exception_case_default_v1';

export type OrderExceptionCaseSlaStage = 'acceptance' | 'resolution';

export type OrderExceptionCaseSlaStatus =
  | 'within_target'
  | 'overdue'
  | 'resolved_within_target'
  | 'resolved_overdue';

export type OrderExceptionCaseSlaSnapshot = {
  policyKey: OrderExceptionCaseSlaPolicyKey;
  stage: OrderExceptionCaseSlaStage;
  status: OrderExceptionCaseSlaStatus;
  targetAtIso: string;
  remainingMinutes?: number;
  overdueMinutes?: number;
};

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
  claimedByAdminUserId?: string;
  claimedAtIso?: string;
  claimNote?: string;
  resolvedAtIso?: string;
  closedAtIso?: string;
  sla?: OrderExceptionCaseSlaSnapshot;
  createdAtIso: string;
  updatedAtIso: string;
  actions: OrderExceptionCaseActionRecord[];
};

export type OrderExceptionCaseListQuery = {
  page: number;
  pageSize: number;
  status?: OrderExceptionCaseStatus;
  sourceRole?: OrderExceptionCaseSourceRole;
  compensationStatus?: OrderExceptionCaseCompensationStatus;
  appealStatus?: OrderExceptionCaseAppealStatus;
  slaStatus?: OrderExceptionCaseSlaStatus;
  claimStatus?: OrderExceptionCaseClaimStatus;
  claimedByAdminUserId?: string;
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

export type ClaimOrderExceptionCaseRequest = {
  baseUpdatedAtIso: string;
  content?: string;
};

export type OrderExceptionCaseOverdueEscalationSweepTrigger =
  | 'admin'
  | 'scheduler';

export type OrderExceptionCaseOverdueEscalationSweepResult = {
  trigger: OrderExceptionCaseOverdueEscalationSweepTrigger;
  triggeredAtIso: string;
  scannedCount: number;
  overdueCount: number;
  escalatedCount: number;
  skippedCount: number;
  conflictCount: number;
  escalatedCaseIds: string[];
};

export type ResolveOrderExceptionCaseRequest = UpdateOrderExceptionCaseRequest & {
  compensationStatus: OrderExceptionCaseCompensationStatus;
  appealDecision?: OrderExceptionCaseAppealDecision;
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

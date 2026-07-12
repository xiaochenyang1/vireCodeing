export type OrderExceptionCaseStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'closed';

export type OrderExceptionCaseSourceRole = 'shipper' | 'driver';

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

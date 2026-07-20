export type ShipperProfileEvaluationRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  driverName: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount: number;
  photoFileIds?: string[];
  submittedAtIso: string;
  driverReplyText?: string;
  driverReplyAtIso?: string;
};

export type ShipperProfileEvaluationSnapshot = {
  shipperId: string;
  items: ShipperProfileEvaluationRecord[];
};

export type ShipperReceivedEvaluationRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  driverName: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  submittedAtIso: string;
};

export type ShipperReceivedEvaluationSnapshot = {
  shipperId: string;
  items: ShipperReceivedEvaluationRecord[];
};

export type AdminEvaluationDirection =
  | 'shipper_to_driver'
  | 'driver_to_shipper';

export type AdminEvaluationAuditListQuery = {
  page: number;
  pageSize: number;
  direction?: AdminEvaluationDirection;
  rating?: number;
  keyword?: string;
};

export type AdminEvaluationAuditRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  direction: AdminEvaluationDirection;
  reviewerUserId: string;
  reviewerName: string;
  revieweeUserId: string;
  revieweeName: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount: number;
  photoFileIds?: string[];
  submittedAtIso: string;
};

export type AdminEvaluationAuditListResult = {
  items: AdminEvaluationAuditRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type ShipperProfileEvaluationOrderEventRecord = {
  id: string;
  actorUserId?: string;
  eventType: string;
  noteText?: string;
  attachmentFileIds?: string[];
  createdAtIso: string;
};

export type ShipperProfileEvaluationOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  events: ShipperProfileEvaluationOrderEventRecord[];
};

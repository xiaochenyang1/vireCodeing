import type { FileUploadRecord } from '../files/dto';

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
  photoCount: number;
  photoFileIds?: string[];
  submittedAtIso: string;
};

export type ShipperReceivedEvaluationSnapshot = {
  shipperId: string;
  items: ShipperReceivedEvaluationRecord[];
};

export type AdminEvaluationDirection =
  | 'shipper_to_driver'
  | 'driver_to_shipper';

export type AdminEvaluationModerationStatus = 'visible' | 'hidden';
export type EvaluationAppealStatus =
  | 'none'
  | 'requested'
  | 'accepted'
  | 'rejected';
export type EvaluationAppealDecision = Extract<
  EvaluationAppealStatus,
  'accepted' | 'rejected'
>;

export type AdminEvaluationModerationSnapshot = {
  status: AdminEvaluationModerationStatus;
  version: number;
  reason?: string;
  moderatedByAdminId?: string;
  moderatedAtIso?: string;
};

export type ModerateAdminEvaluationRequest = {
  status: AdminEvaluationModerationStatus;
  reason: string;
  baseModerationVersion: number;
};

export type AdminEvaluationModerationEventRecord = {
  id: string;
  evaluationId: string;
  adminUserId: string;
  fromStatus: AdminEvaluationModerationStatus;
  toStatus: AdminEvaluationModerationStatus;
  reason: string;
  fromVersion: number;
  toVersion: number;
  createdAtIso: string;
};

export type EvaluationAppealSnapshot = {
  id: string;
  evaluationId: string;
  appellantUserId: string;
  status: Exclude<EvaluationAppealStatus, 'none'>;
  version: number;
  reason: string;
  moderationVersion: number;
  submittedAtIso: string;
  resolutionReason?: string;
  resolvedByAdminId?: string;
  resolvedAtIso?: string;
};

export type EvaluationAppealEventRecord = {
  id: string;
  appealId: string;
  evaluationId: string;
  actorUserId: string;
  fromStatus?: Exclude<EvaluationAppealStatus, 'none'>;
  toStatus: Exclude<EvaluationAppealStatus, 'none'>;
  reason: string;
  fromVersion: number;
  toVersion: number;
  createdAtIso: string;
};

export type SubmitEvaluationAppealRequest = {
  reason: string;
  baseModerationVersion: number;
};

export type ResolveAdminEvaluationAppealRequest = {
  decision: EvaluationAppealDecision;
  reason: string;
  baseAppealVersion: number;
  baseModerationVersion: number;
};

export type AdminEvaluationAuditListQuery = {
  page: number;
  pageSize: number;
  direction?: AdminEvaluationDirection;
  moderationStatus?: AdminEvaluationModerationStatus;
  appealStatus?: EvaluationAppealStatus;
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
  moderationStatus: AdminEvaluationModerationStatus;
  moderationVersion: number;
  moderationReason?: string;
  moderatedByAdminId?: string;
  moderatedAtIso?: string;
  appealStatus: EvaluationAppealStatus;
  latestAppeal?: EvaluationAppealSnapshot;
};

export type EvaluationAppealCaseListResult = {
  userId: string;
  items: AdminEvaluationAuditRecord[];
};

export type AdminEvaluationAuditListResult = {
  items: AdminEvaluationAuditRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminEvaluationAuditAttachmentRecord = FileUploadRecord & {
  previewUrl?: string;
  previewExpiresAtIso?: string;
};

export type AdminEvaluationAuditAttachmentPreview = {
  evaluationId: string;
  orderId: string;
  orderNo: string;
  photoCount: number;
  items: AdminEvaluationAuditAttachmentRecord[];
  missingFileIds: string[];
};

export type ShipperProfileEvaluationOrderEventRecord = {
  id: string;
  actorUserId?: string;
  eventType: string;
  noteText?: string;
  attachmentFileIds?: string[];
  createdAtIso: string;
  evaluationModeration?: AdminEvaluationModerationSnapshot;
};

export type ShipperProfileEvaluationOrderRecord = {
  id: string;
  shipperId: string;
  orderNo: string;
  events: ShipperProfileEvaluationOrderEventRecord[];
};

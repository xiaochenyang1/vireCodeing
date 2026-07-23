export type FilePurpose =
  | 'avatar'
  | 'identity'
  | 'cargo'
  | 'exception'
  | 'evaluation'
  | 'receipt'
  | 'invoice';
export type FileStatus = 'pending' | 'uploaded' | 'rejected';

export type CreateFileUploadIntentRequest = {
  purpose: FilePurpose;
  fileName: string;
  contentType: string;
  byteSize: number;
};

export type ConfirmFileUploadedRequest = {
  publicUrl?: string;
  etag?: string;
  versionId?: string;
};

export type ConfirmStorageCallbackRequest = {
  fileId: string;
  objectKey: string;
  byteSize: number;
  contentType: string;
  etag?: string;
  versionId?: string;
  signature: string;
};

export type FileUploadRecord = {
  id: string;
  ownerUserId: string;
  purpose: FilePurpose;
  contentType: string;
  byteSize: number;
  objectKey: string;
  publicUrl?: string;
  etag?: string;
  versionId?: string;
  status: FileStatus;
  createdAtIso: string;
};

export type FileUploadIntent = FileUploadRecord & {
  uploadUrl: string;
  expiresAtIso: string;
};

export type ListFileMaintenanceFilesQuery = {
  status?: FileStatus;
  purpose?: FilePurpose;
  ownerUserId?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

export type FileMaintenanceReportQuery = {
  topOwnersLimit: number;
};

export type FileMaintenanceBatchGovernanceAction =
  | 'reject_pending'
  | 'delete_rejected_objects';

export type RunFileMaintenanceBatchGovernanceRequest = {
  action: FileMaintenanceBatchGovernanceAction;
  fileIds: string[];
};

export type FileMaintenanceListItem = FileUploadRecord & {
  isExpiredPending: boolean;
};

export type ListFileMaintenanceFilesResult = {
  items: FileMaintenanceListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type FileMaintenancePurposeBreakdownItem = {
  purpose: FilePurpose;
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredPendingCount: number;
};

export type FileMaintenanceTopOwnerItem = {
  ownerUserId: string;
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredPendingCount: number;
  latestCreatedAtIso: string;
};

export type FileMaintenanceReportData = {
  purposeBreakdown: FileMaintenancePurposeBreakdownItem[];
  topOwners: FileMaintenanceTopOwnerItem[];
};

export type RunFileMaintenanceBatchGovernanceResult = {
  action: FileMaintenanceBatchGovernanceAction;
  requestedCount: number;
  matchedCount: number;
  processedCount: number;
  skippedFileIds: string[];
  deletedObjectCount: number;
  failedObjectDeletionCount: number;
};

export type FileMaintenanceReportResult = FileMaintenanceReportData & {
  generatedAtIso: string;
  cutoffIso: string;
};

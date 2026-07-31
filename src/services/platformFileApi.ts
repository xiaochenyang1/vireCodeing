import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';
import type { ImagePreviewAccess } from '../utils/imagePreview';

export type PlatformFilePurpose =
  | 'avatar'
  | 'identity'
  | 'cargo'
  | 'exception'
  | 'evaluation'
  | 'receipt'
  | 'invoice';
export type PlatformFileStatus = 'pending' | 'uploaded' | 'rejected';

export type PlatformCreateFileUploadIntentRequest = {
  purpose: PlatformFilePurpose;
  fileName: string;
  contentType: string;
  byteSize: number;
};

export type PlatformConfirmFileUploadedRequest = {
  publicUrl?: string;
};

export type PlatformGetFilePreviewMetadataRequest = {
  expiresAtIso: string;
  signature: string;
};

export type PlatformFileUploadRecord = {
  id: string;
  ownerUserId: string;
  purpose: PlatformFilePurpose;
  objectKey: string;
  publicUrl?: string;
  previewUrl?: string;
  previewExpiresAtIso?: string;
  status: PlatformFileStatus;
  createdAtIso: string;
};

export type PlatformOrderAttachmentPreview = {
  fileId: string;
  previewUrl: string;
  previewExpiresAtIso: string;
};

export type PlatformFileUploadIntent = PlatformFileUploadRecord & {
  uploadUrl: string;
  expiresAtIso: string;
};

export type PlatformFileMaintenanceSummary = {
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredPendingCount: number;
  cutoffIso: string;
};

export type PlatformFileMaintenanceReportQuery = {
  topOwnersLimit?: number;
};

export type PlatformListFileMaintenanceFilesQuery = {
  status?: PlatformFileStatus;
  purpose?: PlatformFilePurpose;
  ownerUserId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type PlatformFileMaintenanceListItem = PlatformFileUploadRecord & {
  isExpiredPending: boolean;
};

export type PlatformListFileMaintenanceFilesResult = {
  items: PlatformFileMaintenanceListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformFileMaintenancePurposeBreakdownItem = {
  purpose: PlatformFilePurpose;
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredPendingCount: number;
};

export type PlatformFileMaintenanceTopOwnerItem = {
  ownerUserId: string;
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredPendingCount: number;
  latestCreatedAtIso: string;
};

export type PlatformFileMaintenanceReport = {
  purposeBreakdown: PlatformFileMaintenancePurposeBreakdownItem[];
  topOwners: PlatformFileMaintenanceTopOwnerItem[];
  generatedAtIso: string;
  cutoffIso: string;
};

export type PlatformRejectExpiredPendingFilesResult = {
  rejectedCount: number;
  deletedObjectCount: number;
  failedObjectDeletionCount: number;
  cutoffIso: string;
};

export type PlatformDeleteRejectedFileObjectsResult = {
  attemptedObjectCount: number;
  deletedObjectCount: number;
  failedObjectDeletionCount: number;
};

export type PlatformFileMaintenanceBatchGovernanceAction =
  | 'reject_pending'
  | 'delete_rejected_objects';

export type PlatformRunFileMaintenanceBatchGovernanceRequest = {
  action: PlatformFileMaintenanceBatchGovernanceAction;
  fileIds: string[];
};

export type PlatformRunFileMaintenanceBatchGovernanceResult = {
  action: PlatformFileMaintenanceBatchGovernanceAction;
  requestedCount: number;
  matchedCount: number;
  processedCount: number;
  skippedFileIds: string[];
  deletedObjectCount: number;
  failedObjectDeletionCount: number;
};

export type PlatformFileUploadConfirmationApi = {
  confirmUploaded: (
    fileId: string,
    request: PlatformConfirmFileUploadedRequest,
  ) => Promise<PlatformFileUploadRecord>;
  confirmLocalUploadTarget?: (
    uploadUrl: string,
  ) => Promise<PlatformFileUploadRecord>;
};

const allowedPurposes: PlatformFilePurpose[] = [
  'avatar',
  'identity',
  'cargo',
  'exception',
  'evaluation',
  'receipt',
  'invoice',
];
const allowedContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const allowedFileStatuses: PlatformFileStatus[] = [
  'pending',
  'uploaded',
  'rejected',
];
const maxUploadBytes = 10 * 1024 * 1024;
const FILE_MAINTENANCE_REQUEST_INVALID =
  'PLATFORM_FILE_MAINTENANCE_REQUEST_INVALID';

export function createPlatformFileApi(config: PlatformApiConfig) {
  return {
    async createUploadIntent(request: PlatformCreateFileUploadIntentRequest) {
      const normalizedRequest = normalizeCreateUploadIntentRequest(request);

      return platformPost<
        PlatformCreateFileUploadIntentRequest,
        PlatformFileUploadIntent
      >(config, '/files/upload-intents', normalizedRequest);
    },
    async confirmUploaded(
      fileId: string,
      request: PlatformConfirmFileUploadedRequest,
    ) {
      const normalizedFileId = normalizeFileId(fileId);
      const normalizedRequest = normalizeConfirmUploadedRequest(request);

      return platformPost<
        PlatformConfirmFileUploadedRequest,
        PlatformFileUploadRecord
      >(config, `/files/${normalizedFileId}/uploaded`, normalizedRequest);
    },
    async getFileMetadata(fileId: string) {
      const normalizedFileId = normalizeFileId(fileId);

      const file = await platformGet<PlatformFileUploadRecord>(
        config,
        `/files/${normalizedFileId}`,
      );

      const normalizedPreviewUrl = file.previewUrl?.trim();
      const previewUrl = normalizedPreviewUrl
        ? resolvePlatformFilePreviewUrl(normalizedPreviewUrl, config.baseUrl)
        : undefined;

      return previewUrl
        ? {
            ...file,
            previewUrl,
            publicUrl: previewUrl,
          }
        : file;
    },
    async getOrderAttachmentPreview(orderId: string, fileId: string) {
      const normalizedOrderId = normalizeOrderAttachmentOrderId(orderId);
      const normalizedFileId = normalizeFileId(fileId);
      const preview = await platformGet<PlatformOrderAttachmentPreview>(
        config,
        `/orders/${encodeURIComponent(
          normalizedOrderId,
        )}/attachments/${encodeURIComponent(normalizedFileId)}/preview`,
      );

      return {
        ...preview,
        previewUrl: resolvePlatformFilePreviewUrl(
          preview.previewUrl.trim(),
          config.baseUrl,
        ),
      };
    },
    async getOrderExceptionCaseAttachmentPreview(
      orderId: string,
      caseId: string,
      fileId: string,
    ) {
      const normalizedOrderId = normalizeOrderAttachmentOrderId(orderId);
      const normalizedCaseId = normalizeOrderExceptionCaseId(caseId);
      const normalizedFileId = normalizeFileId(fileId);
      const preview = await platformGet<PlatformOrderAttachmentPreview>(
        config,
        `/orders/${encodeURIComponent(
          normalizedOrderId,
        )}/exception-cases/${encodeURIComponent(
          normalizedCaseId,
        )}/attachments/${encodeURIComponent(normalizedFileId)}/preview`,
      );

      return {
        ...preview,
        previewUrl: resolvePlatformFilePreviewUrl(
          preview.previewUrl.trim(),
          config.baseUrl,
        ),
      };
    },
    async confirmLocalUploadTarget(uploadUrl: string) {
      const uploadPath = normalizeLocalUploadTargetPath(
        uploadUrl,
        config.baseUrl,
      );

      return platformPost<undefined, PlatformFileUploadRecord>(
        config,
        uploadPath,
        undefined,
      );
    },
    async getPreviewMetadata(
      objectKey: string,
      request: PlatformGetFilePreviewMetadataRequest,
    ) {
      const normalizedObjectKey = normalizePreviewObjectKey(objectKey);
      const normalizedRequest = normalizePreviewMetadataRequest(request);
      const query = new URLSearchParams(normalizedRequest);

      return platformGet<PlatformFileUploadRecord>(
        config,
        `/files/previews/${createObjectKeyPath(normalizedObjectKey)}?${query.toString()}`,
        { includeAuth: false },
      );
    },
    rejectExpiredPendingFiles() {
      return platformPost<undefined, PlatformRejectExpiredPendingFilesResult>(
        config,
        '/files/maintenance/reject-expired-pending',
        undefined,
      );
    },
    getFileMaintenanceSummary() {
      return platformGet<PlatformFileMaintenanceSummary>(
        config,
        '/files/maintenance/summary',
      );
    },
    async getFileMaintenanceReport(
      query: PlatformFileMaintenanceReportQuery = {},
    ) {
      return platformGet<PlatformFileMaintenanceReport>(
        config,
        createFileMaintenanceReportPath(
          normalizeFileMaintenanceReportQuery(query),
        ),
      );
    },
    async listFileMaintenanceFiles(
      query: PlatformListFileMaintenanceFilesQuery = {},
    ) {
      return platformGet<PlatformListFileMaintenanceFilesResult>(
        config,
        createFileMaintenanceFilesPath(
          normalizeListFileMaintenanceFilesQuery(query),
        ),
      );
    },
    async runFileMaintenanceBatchGovernance(
      request: PlatformRunFileMaintenanceBatchGovernanceRequest,
    ) {
      return platformPost<
        PlatformRunFileMaintenanceBatchGovernanceRequest,
        PlatformRunFileMaintenanceBatchGovernanceResult
      >(
        config,
        '/files/maintenance/batch-governance',
        normalizeRunFileMaintenanceBatchGovernanceRequest(request),
      );
    },
    deleteRejectedFileObjects() {
      return platformPost<undefined, PlatformDeleteRejectedFileObjectsResult>(
        config,
        '/files/maintenance/delete-rejected-objects',
        undefined,
      );
    },
  };
}

export async function refreshPlatformFilePreviewUrl(
  api: Pick<ReturnType<typeof createPlatformFileApi>, 'getFileMetadata'> &
    Partial<
      Pick<
        ReturnType<typeof createPlatformFileApi>,
        'getOrderAttachmentPreview' | 'getOrderExceptionCaseAttachmentPreview'
      >
    >,
  fileId: string,
  access?: ImagePreviewAccess,
) {
  const attachmentPreviewAvailable = access
    ? access.kind === 'exceptionCase'
      ? api.getOrderExceptionCaseAttachmentPreview
      : api.getOrderAttachmentPreview
    : undefined;

  if (access && !attachmentPreviewAvailable) {
    throw new PlatformApiError(
      'Platform order attachment preview API is unavailable',
      'ORDER_ATTACHMENT_PREVIEW_UNAVAILABLE',
      0,
    );
  }

  const file = !access
    ? await api.getFileMetadata(fileId)
    : access.kind === 'exceptionCase'
      ? await api.getOrderExceptionCaseAttachmentPreview!(
          access.orderId,
          access.caseId,
          fileId,
        )
      : await api.getOrderAttachmentPreview!(access.orderId, fileId);
  const previewUrl =
    file.previewUrl?.trim() ||
    ('publicUrl' in file ? file.publicUrl?.trim() : undefined);

  if (!previewUrl) {
    throw new PlatformApiError(
      'Platform file preview URL is missing',
      'FILE_PREVIEW_URL_MISSING',
      0,
    );
  }

  return {
    url: previewUrl,
    ...(file.previewExpiresAtIso
      ? { expiresAtIso: file.previewExpiresAtIso }
      : {}),
  };
}

export async function confirmPlatformFileUploadIntent(
  api: PlatformFileUploadConfirmationApi,
  intent: PlatformFileUploadIntent,
) {
  if (api.confirmLocalUploadTarget) {
    return api.confirmLocalUploadTarget(intent.uploadUrl);
  }

  return api.confirmUploaded(intent.id, {
    publicUrl: intent.publicUrl,
  });
}

function normalizeCreateUploadIntentRequest(
  request: PlatformCreateFileUploadIntentRequest,
): PlatformCreateFileUploadIntentRequest {
  if (!isPlainObject(request)) {
    throwInvalidUploadRequest('File upload request must be an object');
  }

  const fileName = normalizeRequiredString(
    request.fileName,
    120,
    'File name is invalid',
  );
  const contentType = normalizeRequiredString(
    request.contentType,
    80,
    'File content type is invalid',
  ).toLowerCase();

  if (!allowedPurposes.includes(request.purpose)) {
    throwInvalidUploadRequest('File purpose is invalid');
  }

  if (!allowedContentTypes.includes(contentType)) {
    throwInvalidUploadRequest('File content type is invalid');
  }

  if (
    typeof request.byteSize !== 'number' ||
    !Number.isInteger(request.byteSize) ||
    request.byteSize <= 0 ||
    request.byteSize > maxUploadBytes
  ) {
    throwInvalidUploadRequest('File byte size is invalid');
  }

  return {
    purpose: request.purpose,
    fileName,
    contentType,
    byteSize: request.byteSize,
  };
}

function normalizeConfirmUploadedRequest(
  request: PlatformConfirmFileUploadedRequest,
): PlatformConfirmFileUploadedRequest {
  if (!isPlainObject(request)) {
    throwInvalidUploadRequest('File uploaded request must be an object');
  }

  const publicUrl = normalizeOptionalTrimmedString(
    request.publicUrl,
    'File public url is invalid',
  );

  if (publicUrl !== undefined && !/^https?:\/\//.test(publicUrl)) {
    throwInvalidUploadRequest('File public url is invalid');
  }

  return publicUrl === undefined ? {} : { publicUrl };
}

function normalizeLocalUploadTargetPath(uploadUrl: unknown, baseUrl: string) {
  if (typeof uploadUrl !== 'string') {
    throwInvalidUploadTarget('File upload target is invalid');
  }

  const normalizedUploadUrl = uploadUrl.trim();

  if (normalizedUploadUrl === '') {
    throwInvalidUploadTarget('File upload target is invalid');
  }

  let parsedUploadUrl: URL;
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
    parsedUploadUrl = new URL(normalizedUploadUrl, ensureTrailingSlash(baseUrl));
  } catch {
    throwInvalidUploadTarget('File upload target is invalid');
  }

  const basePath = normalizeBasePath(parsedBaseUrl.pathname);
  const uploadPrefix = `${basePath}/files/uploads/`;

  if (
    parsedUploadUrl.origin !== parsedBaseUrl.origin ||
    parsedUploadUrl.search !== '' ||
    parsedUploadUrl.hash !== '' ||
    !parsedUploadUrl.pathname.startsWith(uploadPrefix)
  ) {
    throwInvalidUploadTarget('File upload target is invalid');
  }

  return parsedUploadUrl.pathname.slice(basePath.length);
}

function normalizePreviewMetadataRequest(
  request: PlatformGetFilePreviewMetadataRequest,
): PlatformGetFilePreviewMetadataRequest {
  if (!isPlainObject(request)) {
    throwInvalidPreviewRequest('File preview request must be an object');
  }

  return {
    expiresAtIso: normalizePreviewRequiredString(
      request.expiresAtIso,
      'File preview expiry is invalid',
    ),
    signature: normalizePreviewRequiredString(
      request.signature,
      'File preview signature is invalid',
    ),
  };
}

function normalizeFileMaintenanceReportQuery(
  query: PlatformFileMaintenanceReportQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidFileMaintenanceRequest(
      'File maintenance report query must be an object',
    );
  }

  const topOwnersLimit = query.topOwnersLimit ?? 5;

  if (
    !Number.isInteger(topOwnersLimit) ||
    topOwnersLimit < 1 ||
    topOwnersLimit > 20
  ) {
    throwInvalidFileMaintenanceRequest(
      'File maintenance topOwnersLimit is invalid',
    );
  }

  return {
    topOwnersLimit: String(topOwnersLimit),
  };
}

function normalizeListFileMaintenanceFilesQuery(
  query: PlatformListFileMaintenanceFilesQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidFileMaintenanceRequest(
      'File maintenance files query must be an object',
    );
  }

  const status = normalizeOptionalFileMaintenanceString(
    query.status,
    20,
    'File maintenance status is invalid',
  ) as PlatformFileStatus | undefined;
  const purpose = normalizeOptionalFileMaintenanceString(
    query.purpose,
    20,
    'File maintenance purpose is invalid',
  ) as PlatformFilePurpose | undefined;
  const ownerUserId = normalizeOptionalFileMaintenanceString(
    query.ownerUserId,
    120,
    'File maintenance ownerUserId is invalid',
  );
  const keyword = normalizeOptionalFileMaintenanceString(
    query.keyword,
    120,
    'File maintenance keyword is invalid',
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (status !== undefined && !allowedFileStatuses.includes(status)) {
    throwInvalidFileMaintenanceRequest('File maintenance status is invalid');
  }

  if (purpose !== undefined && !allowedPurposes.includes(purpose)) {
    throwInvalidFileMaintenanceRequest('File maintenance purpose is invalid');
  }

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidFileMaintenanceRequest('File maintenance page is invalid');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throwInvalidFileMaintenanceRequest('File maintenance pageSize is invalid');
  }

  return {
    ...(status ? { status } : {}),
    ...(purpose ? { purpose } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(keyword ? { keyword } : {}),
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeRunFileMaintenanceBatchGovernanceRequest(
  request: PlatformRunFileMaintenanceBatchGovernanceRequest,
): PlatformRunFileMaintenanceBatchGovernanceRequest {
  if (!isPlainObject(request)) {
    throwInvalidFileMaintenanceRequest(
      'File maintenance batch governance request must be an object',
    );
  }

  const action = normalizeRequiredFileMaintenanceString(
    request.action,
    40,
    'File maintenance action is invalid',
  ) as PlatformFileMaintenanceBatchGovernanceAction;

  if (
    action !== 'reject_pending' &&
    action !== 'delete_rejected_objects'
  ) {
    throwInvalidFileMaintenanceRequest('File maintenance action is invalid');
  }

  if (
    !Array.isArray(request.fileIds) ||
    request.fileIds.length < 1 ||
    request.fileIds.length > 50
  ) {
    throwInvalidFileMaintenanceRequest('File maintenance fileIds are invalid');
  }

  const fileIds = Array.from(
    new Set(
      request.fileIds.map(fileId =>
        normalizeRequiredFileMaintenanceString(
          fileId,
          120,
          'File maintenance fileIds are invalid',
        ),
      ),
    ),
  );

  return {
    action,
    fileIds,
  };
}

function normalizeFileId(value: unknown) {
  if (typeof value !== 'string') {
    throw new PlatformApiError(
      'File id is invalid',
      'PLATFORM_FILE_ID_INVALID',
      0,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue === '') {
    throw new PlatformApiError(
      'File id is invalid',
      'PLATFORM_FILE_ID_INVALID',
      0,
    );
  }

  return normalizedValue;
}

function normalizeOrderAttachmentOrderId(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlatformApiError(
      'Order id is invalid',
      'PLATFORM_ORDER_ID_INVALID',
      0,
    );
  }

  return value.trim();
}

function normalizeOrderExceptionCaseId(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlatformApiError(
      'Order exception case id is invalid',
      'PLATFORM_EXCEPTION_CASE_ID_INVALID',
      0,
    );
  }

  return value.trim();
}

function normalizePreviewObjectKey(value: unknown) {
  return normalizePreviewRequiredString(
    value,
    'File preview object key is invalid',
  );
}

function normalizePreviewRequiredString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throwInvalidPreviewRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue === '') {
    throwInvalidPreviewRequest(message);
  }

  return normalizedValue;
}

function normalizeRequiredString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (typeof value !== 'string') {
    throwInvalidUploadRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    throwInvalidUploadRequest(message);
  }

  return normalizedValue;
}

function normalizeRequiredFileMaintenanceString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (typeof value !== 'string') {
    throwInvalidFileMaintenanceRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    throwInvalidFileMaintenanceRequest(message);
  }

  return normalizedValue;
}

function normalizeOptionalTrimmedString(value: unknown, message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidUploadRequest(message);
  }

  const normalizedValue = value.trim();

  return normalizedValue === '' ? undefined : normalizedValue;
}

function normalizeOptionalFileMaintenanceString(
  value: unknown,
  maxLength: number,
  message: string,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throwInvalidFileMaintenanceRequest(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue === '') {
    return undefined;
  }

  if (normalizedValue.length > maxLength) {
    throwInvalidFileMaintenanceRequest(message);
  }

  return normalizedValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidUploadRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_FILE_UPLOAD_REQUEST_INVALID',
    0,
  );
}

function throwInvalidUploadTarget(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_FILE_UPLOAD_TARGET_INVALID',
    0,
  );
}

function throwInvalidPreviewRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_FILE_PREVIEW_REQUEST_INVALID',
    0,
  );
}

function throwInvalidFileMaintenanceRequest(message: string): never {
  throw new PlatformApiError(
    message,
    FILE_MAINTENANCE_REQUEST_INVALID,
    0,
  );
}

function createObjectKeyPath(objectKey: string) {
  return objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function createFileMaintenanceReportPath(
  query: ReturnType<typeof normalizeFileMaintenanceReportQuery>,
) {
  return `/files/maintenance/report?${new URLSearchParams(query).toString()}`;
}

function createFileMaintenanceFilesPath(
  query: ReturnType<typeof normalizeListFileMaintenanceFilesQuery>,
) {
  return `/files/maintenance/files?${new URLSearchParams(query).toString()}`;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function resolvePlatformFilePreviewUrl(previewUrl: string, baseUrl: string) {
  let resolvedUrl: URL;

  try {
    resolvedUrl = new URL(previewUrl, ensureTrailingSlash(baseUrl));
  } catch {
    throwInvalidResolvedPreviewUrl();
  }

  if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
    throwInvalidResolvedPreviewUrl();
  }

  return resolvedUrl.toString();
}

function throwInvalidResolvedPreviewUrl(): never {
  throw new PlatformApiError(
    'Platform file preview URL is invalid',
    'PLATFORM_FILE_PREVIEW_URL_INVALID',
    0,
  );
}

function normalizeBasePath(pathname: string) {
  const trimmedPathname = pathname.replace(/\/+$/, '');

  return trimmedPathname === '/' ? '' : trimmedPathname;
}

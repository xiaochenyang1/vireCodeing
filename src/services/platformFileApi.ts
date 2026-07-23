import {
  PlatformApiError,
  platformGet,
  platformPost,
  type PlatformApiConfig,
} from './platformApiClient';

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
  status: PlatformFileStatus;
  createdAtIso: string;
};

export type PlatformFileUploadIntent = PlatformFileUploadRecord & {
  uploadUrl: string;
  expiresAtIso: string;
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
const maxUploadBytes = 10 * 1024 * 1024;

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

      return platformGet<PlatformFileUploadRecord>(
        config,
        `/files/${normalizedFileId}`,
      );
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

function createObjectKeyPath(objectKey: string) {
  return objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeBasePath(pathname: string) {
  const trimmedPathname = pathname.replace(/\/+$/, '');

  return trimmedPathname === '/' ? '' : trimmedPathname;
}

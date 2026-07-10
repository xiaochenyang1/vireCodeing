export type FilePurpose =
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

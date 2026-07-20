import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  ConfirmFileUploadedRequest,
  ConfirmStorageCallbackRequest,
  CreateFileUploadIntentRequest,
  FileMaintenanceReportQuery,
  FileMaintenanceReportResult,
  FileUploadIntent,
  FileUploadRecord,
  ListFileMaintenanceFilesQuery,
  RunFileMaintenanceBatchGovernanceRequest,
  RunFileMaintenanceBatchGovernanceResult,
} from './dto';
import {
  LocalFilePreviewUrlSigner,
  type FilePreviewUrlVerifier,
  type VerifyFilePreviewUrlInput,
} from './file-preview-url.signer';
import {
  LocalFileStorageProvider,
  type FileStorageProvider,
} from './file-storage.provider';
import type { FilesRepository } from './files.repository';

export type FilesServiceConfig = {
  uploadUrlBase?: string;
  publicUrlBase?: string;
  uploadExpiresInSeconds?: number;
  storageCallbackSigningSecret?: string;
  now?: () => Date;
};

const defaultUploadExpiresInSeconds = 15 * 60;

export class FilesService {
  constructor(
    private readonly repository: FilesRepository,
    private readonly config: FilesServiceConfig = {},
    private readonly previewUrlVerifier: FilePreviewUrlVerifier =
      new LocalFilePreviewUrlSigner(),
    private readonly storageProvider: FileStorageProvider =
      new LocalFileStorageProvider(config),
  ) {}

  async createUploadIntent(
    ownerUserId: string,
    input: CreateFileUploadIntentRequest,
  ): Promise<FileUploadIntent> {
    const now = this.config.now ? this.config.now() : new Date();
    const objectKey = createObjectKey(
      ownerUserId,
      input.purpose,
      input.fileName,
      now,
    );
    const publicUrl = this.storageProvider.createPublicUrl(objectKey);
    const file = await this.repository.createPendingFile(ownerUserId, {
      ...input,
      objectKey,
      publicUrl,
    });
    const expiresAtIso = new Date(
      now.getTime() +
        (this.config.uploadExpiresInSeconds ?? defaultUploadExpiresInSeconds) *
          1000,
    ).toISOString();

    return {
      ...file,
      ...this.storageProvider.createUploadTarget(file, expiresAtIso),
    };
  }

  async confirmUploaded(
    ownerUserId: string,
    fileId: string,
    input: ConfirmFileUploadedRequest,
  ) {
    const file = await this.getConfirmableFile(ownerUserId, fileId);

    try {
      await this.storageProvider.verifyUploadedFile(file);
    } catch {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '远端文件校验失败，请重新上传',
      );
    }

    return this.repository.markFileUploaded(fileId, ownerUserId, input);
  }

  async confirmStorageCallback(input: ConfirmStorageCallbackRequest) {
    if (!this.verifyStorageCallbackSignature(input)) {
      throw new BusinessError(
        ApiErrorCode.FILE_STORAGE_CALLBACK_INVALID,
        '对象存储回调签名无效',
      );
    }

    const file = await this.repository.findFileById(input.fileId);

    if (!file || file.objectKey !== input.objectKey) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    if (file.status === 'uploaded') {
      if (!isMatchingStorageCallback(file, input)) {
        throw new BusinessError(
          ApiErrorCode.FILE_STATE_INVALID,
          '对象存储回调元数据与已上传文件不一致',
        );
      }

      if (
        (input.etag && input.etag !== file.etag) ||
        (input.versionId && input.versionId !== file.versionId)
      ) {
        return this.repository.markFileUploaded(file.id, file.ownerUserId, {
          etag: input.etag ?? file.etag,
          versionId: input.versionId ?? file.versionId,
        });
      }

      return file;
    }

    if (file.status !== 'pending') {
      throw new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '文件状态不允许确认');
    }

    if (this.isUploadIntentExpired(file.createdAtIso)) {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '上传链接已过期，请重新选择文件',
      );
    }

    if (
      file.byteSize !== input.byteSize ||
      file.contentType !== input.contentType
    ) {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '对象存储回调元数据与上传意图不一致',
      );
    }

    return this.repository.markFileUploaded(file.id, file.ownerUserId, {
      etag: input.etag,
      versionId: input.versionId,
    });
  }

  async getFileMetadata(currentUser: AuthenticatedUser, fileId: string) {
    const file =
      currentUser.userType === 'admin'
        ? await this.repository.findFileById(fileId)
        : await this.repository.findFileByIdAndOwner(fileId, currentUser.id);

    if (!file) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    return file;
  }

  async rejectExpiredPendingFiles() {
    const cutoff = this.getUploadExpiryCutoff();
    const expiredPendingFiles =
      await this.repository.findPendingFilesCreatedBefore(cutoff);
    const rejectedCount =
      await this.repository.rejectPendingFilesCreatedBefore(cutoff);
    let deletedObjectCount = 0;
    let failedObjectDeletionCount = 0;

    for (const file of expiredPendingFiles) {
      const currentFile = await this.repository.findFileById(file.id);

      if (currentFile?.status !== 'rejected') {
        continue;
      }

      try {
        await this.storageProvider.deleteObject(currentFile);
        deletedObjectCount += 1;
      } catch {
        failedObjectDeletionCount += 1;
      }
    }

    return {
      rejectedCount,
      deletedObjectCount,
      failedObjectDeletionCount,
      cutoffIso: cutoff.toISOString(),
    };
  }

  async getMaintenanceSummary() {
    const cutoff = this.getUploadExpiryCutoff();

    return {
      ...(await this.repository.getMaintenanceSummary(cutoff)),
      cutoffIso: cutoff.toISOString(),
    };
  }

  async getMaintenanceReport(
    query: FileMaintenanceReportQuery,
  ): Promise<FileMaintenanceReportResult> {
    const now = this.config.now ? this.config.now() : new Date();
    const uploadExpiresInSeconds =
      this.config.uploadExpiresInSeconds ?? defaultUploadExpiresInSeconds;
    const cutoff = new Date(now.getTime() - uploadExpiresInSeconds * 1000);

    return {
      ...(await this.repository.getMaintenanceReport(
        cutoff,
        query.topOwnersLimit,
      )),
      generatedAtIso: now.toISOString(),
      cutoffIso: cutoff.toISOString(),
    };
  }

  async listMaintenanceFiles(query: ListFileMaintenanceFilesQuery) {
    return this.repository.listMaintenanceFiles(
      query,
      this.getUploadExpiryCutoff(),
    );
  }

  async runMaintenanceBatchGovernance(
    input: RunFileMaintenanceBatchGovernanceRequest,
  ): Promise<RunFileMaintenanceBatchGovernanceResult> {
    const matchedFiles = await this.repository.findFilesByIds(input.fileIds);

    if (input.action === 'reject_pending') {
      return this.rejectPendingFilesInBatch(input, matchedFiles);
    }

    return this.deleteRejectedObjectsInBatch(input, matchedFiles);
  }

  async deleteRejectedFileObjects() {
    const rejectedFiles = await this.repository.findRejectedFiles();
    let deletedObjectCount = 0;
    let failedObjectDeletionCount = 0;

    for (const file of rejectedFiles) {
      try {
        await this.storageProvider.deleteObject(file);
        deletedObjectCount += 1;
      } catch {
        failedObjectDeletionCount += 1;
      }
    }

    return {
      attemptedObjectCount: rejectedFiles.length,
      deletedObjectCount,
      failedObjectDeletionCount,
    };
  }

  async uploadLocalFile(ownerUserId: string, fileId: string, content: Buffer) {
    const file = await this.getConfirmableFile(ownerUserId, fileId);

    if (content.length !== file.byteSize) {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '上传内容大小与上传意图不一致，请重新选择文件',
      );
    }

    if (detectContentType(content) !== file.contentType) {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '上传内容类型与上传意图不一致，请重新选择文件',
      );
    }

    await this.storageProvider.saveUploadedFile(file, content);

    return this.repository.markFileUploaded(fileId, ownerUserId, {});
  }

  async getPreviewMetadataByObjectKey(
    objectKey: string,
    input: VerifyFilePreviewUrlInput,
  ) {
    return this.getPreviewableFile(objectKey, input);
  }

  async getPreviewContentByObjectKey(
    objectKey: string,
    input: VerifyFilePreviewUrlInput,
  ): Promise<{ file: FileUploadRecord; content: Buffer }> {
    const file = await this.getPreviewableFile(objectKey, input);

    return {
      file,
      content: await this.storageProvider.readUploadedFile(file),
    };
  }

  private async rejectPendingFilesInBatch(
    input: RunFileMaintenanceBatchGovernanceRequest,
    matchedFiles: FileUploadRecord[],
  ): Promise<RunFileMaintenanceBatchGovernanceResult> {
    const pendingFileIds = matchedFiles
      .filter(file => file.status === 'pending')
      .map(file => file.id);
    const skippedFileIds = matchedFiles
      .filter(file => file.status !== 'pending')
      .map(file => file.id);
    const processedFileIds = new Set<string>();

    await this.repository.rejectPendingFilesByIds(pendingFileIds);

    let deletedObjectCount = 0;
    let failedObjectDeletionCount = 0;
    const rejectedFiles = await this.repository.findFilesByIds(pendingFileIds);

    for (const file of rejectedFiles) {
      if (file.status !== 'rejected') {
        skippedFileIds.push(file.id);
        continue;
      }

      processedFileIds.add(file.id);

      try {
        await this.storageProvider.deleteObject(file);
        deletedObjectCount += 1;
      } catch {
        failedObjectDeletionCount += 1;
      }
    }

    return {
      action: input.action,
      requestedCount: input.fileIds.length,
      matchedCount: matchedFiles.length,
      processedCount: processedFileIds.size,
      skippedFileIds: uniqueFileIds(skippedFileIds),
      deletedObjectCount,
      failedObjectDeletionCount,
    };
  }

  private async deleteRejectedObjectsInBatch(
    input: RunFileMaintenanceBatchGovernanceRequest,
    matchedFiles: FileUploadRecord[],
  ): Promise<RunFileMaintenanceBatchGovernanceResult> {
    const rejectedFiles = matchedFiles.filter(file => file.status === 'rejected');
    const skippedFileIds = matchedFiles
      .filter(file => file.status !== 'rejected')
      .map(file => file.id);
    let deletedObjectCount = 0;
    let failedObjectDeletionCount = 0;

    for (const file of rejectedFiles) {
      try {
        await this.storageProvider.deleteObject(file);
        deletedObjectCount += 1;
      } catch {
        failedObjectDeletionCount += 1;
      }
    }

    return {
      action: input.action,
      requestedCount: input.fileIds.length,
      matchedCount: matchedFiles.length,
      processedCount: rejectedFiles.length,
      skippedFileIds,
      deletedObjectCount,
      failedObjectDeletionCount,
    };
  }

  private async getConfirmableFile(ownerUserId: string, fileId: string) {
    const file = await this.repository.findFileByIdAndOwner(fileId, ownerUserId);

    if (!file) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    if (file.status !== 'pending') {
      throw new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '文件状态不允许确认');
    }

    if (this.isUploadIntentExpired(file.createdAtIso)) {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '上传链接已过期，请重新选择文件',
      );
    }

    return file;
  }

  private async getPreviewableFile(
    objectKey: string,
    input: VerifyFilePreviewUrlInput,
  ) {
    const file = await this.repository.findFileByObjectKey(objectKey);

    if (!file) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    if (!this.previewUrlVerifier.verifyPreviewUrl(file, input)) {
      throw new BusinessError(
        ApiErrorCode.FILE_PREVIEW_SIGNATURE_INVALID,
        '预览链接无效或已过期',
      );
    }

    if (file.status !== 'uploaded') {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '文件尚未上传完成',
      );
    }

    return file;
  }

  private isUploadIntentExpired(createdAtIso: string) {
    const now = this.config.now ? this.config.now() : new Date();
    const createdAt = new Date(createdAtIso);
    const uploadExpiresInSeconds =
      this.config.uploadExpiresInSeconds ?? defaultUploadExpiresInSeconds;

    return now.getTime() > createdAt.getTime() + uploadExpiresInSeconds * 1000;
  }

  private getUploadExpiryCutoff() {
    const now = this.config.now ? this.config.now() : new Date();
    const uploadExpiresInSeconds =
      this.config.uploadExpiresInSeconds ?? defaultUploadExpiresInSeconds;

    return new Date(now.getTime() - uploadExpiresInSeconds * 1000);
  }

  private verifyStorageCallbackSignature(input: ConfirmStorageCallbackRequest) {
    if (!this.config.storageCallbackSigningSecret) {
      return false;
    }

    const expected = signStorageCallback(
      {
        fileId: input.fileId,
        objectKey: input.objectKey,
        byteSize: input.byteSize,
        contentType: input.contentType,
        etag: input.etag,
        versionId: input.versionId,
      },
      this.config.storageCallbackSigningSecret,
    );

    return safeEqualHex(expected, input.signature);
  }
}

function signStorageCallback(
  input: {
    fileId: string;
    objectKey: string;
    byteSize: number;
    contentType: string;
    etag?: string;
    versionId?: string;
  },
  secret: string,
) {
  return createHmac('sha256', secret)
    .update(
      [
        input.fileId,
        input.objectKey,
        String(input.byteSize),
        input.contentType,
        input.etag ?? '',
        input.versionId ?? '',
      ].join('\n'),
    )
    .digest('hex');
}

function safeEqualHex(expected: string, actual: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function isMatchingStorageCallback(
  file: FileUploadRecord,
  input: ConfirmStorageCallbackRequest,
) {
  return (
    file.objectKey === input.objectKey &&
    file.byteSize === input.byteSize &&
    file.contentType === input.contentType &&
    (!input.etag || !file.etag || input.etag === file.etag) &&
    (!input.versionId ||
      !file.versionId ||
      input.versionId === file.versionId)
  );
}

function createObjectKey(
  ownerUserId: string,
  purpose: string,
  fileName: string,
  now: Date,
) {
  const extension = getExtension(fileName);
  const baseName = slugifyFileBase(fileName.replace(/\.[^.]+$/, '')) || 'file';
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, '');

  return `${ownerUserId}/${purpose}/${timestamp}/${randomUUID()}-${baseName}${extension}`;
}

function getExtension(fileName: string) {
  const match = fileName.match(/(\.[A-Za-z0-9]+)$/);

  return match ? match[1].toLowerCase() : '';
}

function detectContentType(content: Buffer) {
  if (startsWithBytes(content, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (
    startsWithBytes(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'image/png';
  }

  if (
    startsWithAscii(content, 'RIFF') &&
    content.length >= 12 &&
    content.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (startsWithAscii(content, '%PDF-')) {
    return 'application/pdf';
  }

  return undefined;
}

function startsWithBytes(content: Buffer, expected: readonly number[]) {
  return expected.every((byte, index) => content[index] === byte);
}

function startsWithAscii(content: Buffer, expected: string) {
  return content.subarray(0, expected.length).toString('ascii') === expected;
}

function slugifyFileBase(value: string) {
  return value
    .trim()
    .replace(/身份证正面/g, 'shen-fen-zheng-zheng-mian')
    .replace(/身份证反面/g, 'shen-fen-zheng-fan-mian')
    .replace(/身份证/g, 'shen-fen-zheng')
    .replace(/正面/g, 'zheng-mian')
    .replace(/反面/g, 'fan-mian')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function uniqueFileIds(fileIds: string[]) {
  return Array.from(new Set(fileIds));
}

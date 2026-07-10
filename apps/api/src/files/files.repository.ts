import type {
  ConfirmFileUploadedRequest,
  CreateFileUploadIntentRequest,
  FileUploadRecord,
} from './dto';

export interface FilesRepository {
  createPendingFile(
    ownerUserId: string,
    input: CreateFileUploadIntentRequest & {
      objectKey: string;
      publicUrl?: string;
    },
  ): Promise<FileUploadRecord>;
  findFileById(fileId: string): Promise<FileUploadRecord | undefined>;
  findFileByIdAndOwner(
    fileId: string,
    ownerUserId: string,
  ): Promise<FileUploadRecord | undefined>;
  findFileByObjectKey(objectKey: string): Promise<FileUploadRecord | undefined>;
  markFileUploaded(
    fileId: string,
    ownerUserId: string,
    input: ConfirmFileUploadedRequest,
  ): Promise<FileUploadRecord>;
  findPendingFilesCreatedBefore(cutoff: Date): Promise<FileUploadRecord[]>;
  findRejectedFiles(): Promise<FileUploadRecord[]>;
  getMaintenanceSummary(cutoff: Date): Promise<FileMaintenanceSummaryCounts>;
  rejectPendingFilesCreatedBefore(cutoff: Date): Promise<number>;
}

export type FileMaintenanceSummaryCounts = {
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredPendingCount: number;
};

export class InMemoryFilesRepository implements FilesRepository {
  private nextId = 1;
  private readonly files = new Map<string, FileUploadRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createPendingFile(
    ownerUserId: string,
    input: CreateFileUploadIntentRequest & {
      objectKey: string;
      publicUrl?: string;
    },
  ): Promise<FileUploadRecord> {
    const file: FileUploadRecord = {
      id: `file-local-${this.nextId++}`,
      ownerUserId,
      purpose: input.purpose,
      contentType: input.contentType,
      byteSize: input.byteSize,
      objectKey: input.objectKey,
      publicUrl: input.publicUrl,
      status: 'pending',
      createdAtIso: this.now().toISOString(),
    };

    this.files.set(file.id, file);

    return file;
  }

  async findFileByIdAndOwner(fileId: string, ownerUserId: string) {
    const file = await this.findFileById(fileId);

    return file?.ownerUserId === ownerUserId ? file : undefined;
  }

  async findFileById(fileId: string) {
    return this.files.get(fileId);
  }

  async findFileByObjectKey(objectKey: string) {
    return Array.from(this.files.values()).find(
      (file) => file.objectKey === objectKey,
    );
  }

  async markFileUploaded(
    fileId: string,
    ownerUserId: string,
    input: ConfirmFileUploadedRequest,
  ): Promise<FileUploadRecord> {
    const currentFile = await this.findFileByIdAndOwner(fileId, ownerUserId);

    if (!currentFile) {
      throw new Error(`File not found: ${fileId}`);
    }

    const uploadedFile: FileUploadRecord = {
      ...currentFile,
      status: 'uploaded',
      publicUrl: input.publicUrl ?? currentFile.publicUrl,
      etag: input.etag ?? currentFile.etag,
      versionId: input.versionId ?? currentFile.versionId,
    };

    this.files.set(fileId, uploadedFile);

    return uploadedFile;
  }

  async findPendingFilesCreatedBefore(cutoff: Date) {
    return Array.from(this.files.values()).filter(
      file =>
        file.status === 'pending' &&
        new Date(file.createdAtIso).getTime() < cutoff.getTime(),
    );
  }

  async findRejectedFiles() {
    return Array.from(this.files.values()).filter(
      file => file.status === 'rejected',
    );
  }

  async getMaintenanceSummary(
    cutoff: Date,
  ): Promise<FileMaintenanceSummaryCounts> {
    const files = Array.from(this.files.values());

    return {
      totalCount: files.length,
      pendingCount: files.filter(file => file.status === 'pending').length,
      uploadedCount: files.filter(file => file.status === 'uploaded').length,
      rejectedCount: files.filter(file => file.status === 'rejected').length,
      expiredPendingCount: files.filter(
        file =>
          file.status === 'pending' &&
          new Date(file.createdAtIso).getTime() < cutoff.getTime(),
      ).length,
    };
  }

  async rejectPendingFilesCreatedBefore(cutoff: Date): Promise<number> {
    let rejectedCount = 0;

    for (const [fileId, file] of this.files.entries()) {
      if (
        file.status === 'pending' &&
        new Date(file.createdAtIso).getTime() < cutoff.getTime()
      ) {
        this.files.set(fileId, {
          ...file,
          status: 'rejected',
        });
        rejectedCount += 1;
      }
    }

    return rejectedCount;
  }
}

export type PrismaFileObjectRecord = {
  id: string;
  ownerUserId: string;
  purpose: string;
  contentType: string;
  byteSize: number;
  objectKey: string;
  publicUrl: string | null;
  etag: string | null;
  versionId: string | null;
  status: string;
  createdAt: Date;
};

export type PrismaFilesClient = {
  fileObject: {
    create(args: {
      data: {
        ownerUserId: string;
        purpose: string;
        contentType: string;
        byteSize: number;
        objectKey: string;
        publicUrl?: string;
        status: 'pending';
      };
    }): Promise<PrismaFileObjectRecord>;
    findUnique(args: {
      where: { id: string };
    }): Promise<PrismaFileObjectRecord | null>;
    findFirst(args: {
      where: { objectKey: string };
    }): Promise<PrismaFileObjectRecord | null>;
    findMany(args: {
      where: {
        status: 'pending' | 'rejected';
        createdAt?: { lt: Date };
      };
    }): Promise<PrismaFileObjectRecord[]>;
    update(args: {
      where: { id: string };
      data: {
        status: 'uploaded';
        publicUrl?: string;
        etag?: string;
        versionId?: string;
      };
    }): Promise<PrismaFileObjectRecord>;
    updateMany(args: {
      where: {
        status: 'pending';
        createdAt: { lt: Date };
      };
      data: {
        status: 'rejected';
      };
    }): Promise<{ count: number }>;
    count(args?: {
      where?: {
        status?: 'pending' | 'uploaded' | 'rejected';
        createdAt?: { lt: Date };
      };
    }): Promise<number>;
  };
};

export class PrismaFilesRepository implements FilesRepository {
  constructor(private readonly prisma: PrismaFilesClient) {}

  async createPendingFile(
    ownerUserId: string,
    input: CreateFileUploadIntentRequest & {
      objectKey: string;
      publicUrl?: string;
    },
  ): Promise<FileUploadRecord> {
    const file = await this.prisma.fileObject.create({
      data: {
        ownerUserId,
        purpose: input.purpose,
        contentType: input.contentType,
        byteSize: input.byteSize,
        objectKey: input.objectKey,
        publicUrl: input.publicUrl,
        status: 'pending',
      },
    });

    return mapPrismaFile(file);
  }

  async findFileByIdAndOwner(fileId: string, ownerUserId: string) {
    const file = await this.findFileById(fileId);

    if (!file || file.ownerUserId !== ownerUserId) {
      return undefined;
    }

    return file;
  }

  async findFileById(fileId: string) {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });

    return file ? mapPrismaFile(file) : undefined;
  }

  async findFileByObjectKey(objectKey: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { objectKey },
    });

    return file ? mapPrismaFile(file) : undefined;
  }

  async markFileUploaded(
    fileId: string,
    ownerUserId: string,
    input: ConfirmFileUploadedRequest,
  ): Promise<FileUploadRecord> {
    const currentFile = await this.findFileByIdAndOwner(fileId, ownerUserId);

    if (!currentFile) {
      throw new Error(`File not found: ${fileId}`);
    }

    const file = await this.prisma.fileObject.update({
      where: { id: fileId },
      data: {
        status: 'uploaded',
        ...(input.publicUrl ? { publicUrl: input.publicUrl } : {}),
        ...(input.etag ? { etag: input.etag } : {}),
        ...(input.versionId ? { versionId: input.versionId } : {}),
      },
    });

    return mapPrismaFile(file);
  }

  async findPendingFilesCreatedBefore(cutoff: Date) {
    const files = await this.prisma.fileObject.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
    });

    return files.map(mapPrismaFile);
  }

  async findRejectedFiles() {
    const files = await this.prisma.fileObject.findMany({
      where: {
        status: 'rejected',
      },
    });

    return files.map(mapPrismaFile);
  }

  async getMaintenanceSummary(
    cutoff: Date,
  ): Promise<FileMaintenanceSummaryCounts> {
    const [
      totalCount,
      pendingCount,
      uploadedCount,
      rejectedCount,
      expiredPendingCount,
    ] = await Promise.all([
      this.prisma.fileObject.count(),
      this.prisma.fileObject.count({ where: { status: 'pending' } }),
      this.prisma.fileObject.count({ where: { status: 'uploaded' } }),
      this.prisma.fileObject.count({ where: { status: 'rejected' } }),
      this.prisma.fileObject.count({
        where: {
          status: 'pending',
          createdAt: { lt: cutoff },
        },
      }),
    ]);

    return {
      totalCount,
      pendingCount,
      uploadedCount,
      rejectedCount,
      expiredPendingCount,
    };
  }

  async rejectPendingFilesCreatedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.fileObject.updateMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      data: {
        status: 'rejected',
      },
    });

    return result.count;
  }
}

function mapPrismaFile(file: PrismaFileObjectRecord): FileUploadRecord {
  return {
    id: file.id,
    ownerUserId: file.ownerUserId,
    purpose: file.purpose as FileUploadRecord['purpose'],
    contentType: file.contentType,
    byteSize: file.byteSize,
    objectKey: file.objectKey,
    publicUrl: file.publicUrl ?? undefined,
    etag: file.etag ?? undefined,
    versionId: file.versionId ?? undefined,
    status: file.status as FileUploadRecord['status'],
    createdAtIso: file.createdAt.toISOString(),
  };
}

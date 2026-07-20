import type {
  ConfirmFileUploadedRequest,
  FileMaintenanceReportData,
  FileMaintenanceListItem,
  FileMaintenancePurposeBreakdownItem,
  FileMaintenanceTopOwnerItem,
  ListFileMaintenanceFilesQuery,
  ListFileMaintenanceFilesResult,
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
  findFilesByIds(fileIds: string[]): Promise<FileUploadRecord[]>;
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
  listMaintenanceFiles(
    query: ListFileMaintenanceFilesQuery,
    cutoff: Date,
  ): Promise<ListFileMaintenanceFilesResult>;
  getMaintenanceReport(
    cutoff: Date,
    topOwnersLimit: number,
  ): Promise<FileMaintenanceReportData>;
  getMaintenanceSummary(cutoff: Date): Promise<FileMaintenanceSummaryCounts>;
  rejectPendingFilesCreatedBefore(cutoff: Date): Promise<number>;
  rejectPendingFilesByIds(fileIds: string[]): Promise<number>;
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

  async findFilesByIds(fileIds: string[]) {
    return fileIds
      .map(fileId => this.files.get(fileId))
      .filter((file): file is FileUploadRecord => Boolean(file));
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

  async listMaintenanceFiles(
    query: ListFileMaintenanceFilesQuery,
    cutoff: Date,
  ): Promise<ListFileMaintenanceFilesResult> {
    const matchedFiles = Array.from(this.files.values())
      .filter(file => matchesMaintenanceFileQuery(file, query))
      .sort(compareMaintenanceFilesByCreatedAtDesc);
    const start = (query.page - 1) * query.pageSize;
    const items = matchedFiles
      .slice(start, start + query.pageSize)
      .map(file => mapMaintenanceListItem(file, cutoff));

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: matchedFiles.length,
    };
  }

  async getMaintenanceReport(
    cutoff: Date,
    topOwnersLimit: number,
  ): Promise<FileMaintenanceReportData> {
    return createMaintenanceReport(Array.from(this.files.values()), cutoff, {
      topOwnersLimit,
    });
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

  async rejectPendingFilesByIds(fileIds: string[]): Promise<number> {
    let rejectedCount = 0;

    for (const fileId of fileIds) {
      const file = this.files.get(fileId);

      if (!file || file.status !== 'pending') {
        continue;
      }

      this.files.set(fileId, {
        ...file,
        status: 'rejected',
      });
      rejectedCount += 1;
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
      where?: unknown;
      orderBy?: {
        createdAt: 'desc';
      };
      skip?: number;
      take?: number;
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
      where: unknown;
      data: {
        status: 'rejected';
      };
    }): Promise<{ count: number }>;
    count(args?: {
      where?: unknown;
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

  async findFilesByIds(fileIds: string[]) {
    if (fileIds.length === 0) {
      return [];
    }

    const files = await this.prisma.fileObject.findMany({
      where: {
        id: {
          in: fileIds,
        },
      },
    });

    return sortFilesByInputOrder(files.map(mapPrismaFile), fileIds);
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

  async listMaintenanceFiles(
    query: ListFileMaintenanceFilesQuery,
    cutoff: Date,
  ): Promise<ListFileMaintenanceFilesResult> {
    const where = createPrismaMaintenanceFilesWhereInput(query);
    const [total, files] = await Promise.all([
      this.prisma.fileObject.count({ where }),
      this.prisma.fileObject.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: files
        .map(mapPrismaFile)
        .map(file => mapMaintenanceListItem(file, cutoff)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getMaintenanceReport(
    cutoff: Date,
    topOwnersLimit: number,
  ): Promise<FileMaintenanceReportData> {
    const files = (await this.prisma.fileObject.findMany({})).map(mapPrismaFile);

    return createMaintenanceReport(files, cutoff, {
      topOwnersLimit,
    });
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

  async rejectPendingFilesByIds(fileIds: string[]): Promise<number> {
    if (fileIds.length === 0) {
      return 0;
    }

    const result = await this.prisma.fileObject.updateMany({
      where: {
        id: {
          in: fileIds,
        },
        status: 'pending',
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

function mapMaintenanceListItem(
  file: FileUploadRecord,
  cutoff: Date,
): FileMaintenanceListItem {
  return {
    ...file,
    isExpiredPending: isExpiredPendingFile(file, cutoff),
  };
}

function isExpiredPendingFile(file: FileUploadRecord, cutoff: Date) {
  return (
    file.status === 'pending' &&
    new Date(file.createdAtIso).getTime() < cutoff.getTime()
  );
}

function matchesMaintenanceFileQuery(
  file: FileUploadRecord,
  query: ListFileMaintenanceFilesQuery,
) {
  if (query.status && file.status !== query.status) {
    return false;
  }

  if (query.purpose && file.purpose !== query.purpose) {
    return false;
  }

  if (query.ownerUserId && file.ownerUserId !== query.ownerUserId) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  const keyword = query.keyword.toLowerCase();

  return [
    file.id,
    file.ownerUserId,
    file.objectKey,
    file.publicUrl,
    file.contentType,
    file.etag,
    file.versionId,
  ]
    .filter((value): value is string => typeof value === 'string')
    .some(value => value.toLowerCase().includes(keyword));
}

function compareMaintenanceFilesByCreatedAtDesc(
  left: FileUploadRecord,
  right: FileUploadRecord,
) {
  const createdAtDelta =
    new Date(right.createdAtIso).getTime() -
    new Date(left.createdAtIso).getTime();

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return right.id.localeCompare(left.id);
}

function createMaintenanceReport(
  files: FileUploadRecord[],
  cutoff: Date,
  input: {
    topOwnersLimit: number;
  },
): FileMaintenanceReportData {
  const purposeBreakdown = aggregatePurposeBreakdown(files, cutoff);
  const topOwners = aggregateTopOwners(files, cutoff).slice(
    0,
    input.topOwnersLimit,
  );

  return {
    purposeBreakdown,
    topOwners,
  };
}

function aggregatePurposeBreakdown(
  files: FileUploadRecord[],
  cutoff: Date,
): FileMaintenancePurposeBreakdownItem[] {
  const purposeMap = new Map<string, FileMaintenancePurposeBreakdownItem>();

  for (const file of files) {
    const current =
      purposeMap.get(file.purpose) ??
      {
        purpose: file.purpose,
        totalCount: 0,
        pendingCount: 0,
        uploadedCount: 0,
        rejectedCount: 0,
        expiredPendingCount: 0,
      };

    current.totalCount += 1;
    if (file.status === 'pending') {
      current.pendingCount += 1;
    }
    if (file.status === 'uploaded') {
      current.uploadedCount += 1;
    }
    if (file.status === 'rejected') {
      current.rejectedCount += 1;
    }
    if (isExpiredPendingFile(file, cutoff)) {
      current.expiredPendingCount += 1;
    }

    purposeMap.set(file.purpose, current);
  }

  return Array.from(purposeMap.values()).sort((left, right) =>
    left.purpose.localeCompare(right.purpose),
  );
}

function aggregateTopOwners(
  files: FileUploadRecord[],
  cutoff: Date,
): FileMaintenanceTopOwnerItem[] {
  const ownerMap = new Map<string, FileMaintenanceTopOwnerItem>();

  for (const file of files) {
    const current =
      ownerMap.get(file.ownerUserId) ??
      {
        ownerUserId: file.ownerUserId,
        totalCount: 0,
        pendingCount: 0,
        uploadedCount: 0,
        rejectedCount: 0,
        expiredPendingCount: 0,
        latestCreatedAtIso: file.createdAtIso,
      };

    current.totalCount += 1;
    if (file.status === 'pending') {
      current.pendingCount += 1;
    }
    if (file.status === 'uploaded') {
      current.uploadedCount += 1;
    }
    if (file.status === 'rejected') {
      current.rejectedCount += 1;
    }
    if (isExpiredPendingFile(file, cutoff)) {
      current.expiredPendingCount += 1;
    }
    if (
      new Date(file.createdAtIso).getTime() >
      new Date(current.latestCreatedAtIso).getTime()
    ) {
      current.latestCreatedAtIso = file.createdAtIso;
    }

    ownerMap.set(file.ownerUserId, current);
  }

  return Array.from(ownerMap.values()).sort(compareMaintenanceTopOwners);
}

function compareMaintenanceTopOwners(
  left: FileMaintenanceTopOwnerItem,
  right: FileMaintenanceTopOwnerItem,
) {
  if (right.expiredPendingCount !== left.expiredPendingCount) {
    return right.expiredPendingCount - left.expiredPendingCount;
  }

  if (right.rejectedCount !== left.rejectedCount) {
    return right.rejectedCount - left.rejectedCount;
  }

  if (right.pendingCount !== left.pendingCount) {
    return right.pendingCount - left.pendingCount;
  }

  if (right.totalCount !== left.totalCount) {
    return right.totalCount - left.totalCount;
  }

  const latestCreatedAtDelta =
    new Date(right.latestCreatedAtIso).getTime() -
    new Date(left.latestCreatedAtIso).getTime();

  if (latestCreatedAtDelta !== 0) {
    return latestCreatedAtDelta;
  }

  return left.ownerUserId.localeCompare(right.ownerUserId);
}

function sortFilesByInputOrder(
  files: FileUploadRecord[],
  fileIds: string[],
): FileUploadRecord[] {
  const fileOrder = new Map(fileIds.map((fileId, index) => [fileId, index]));

  return [...files].sort(
    (left, right) =>
      (fileOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (fileOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function createPrismaMaintenanceFilesWhereInput(
  query: ListFileMaintenanceFilesQuery,
) {
  const where: Record<string, unknown> = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.purpose) {
    where.purpose = query.purpose;
  }

  if (query.ownerUserId) {
    where.ownerUserId = query.ownerUserId;
  }

  if (query.keyword) {
    where.OR = [
      { id: { contains: query.keyword, mode: 'insensitive' } },
      { ownerUserId: { contains: query.keyword, mode: 'insensitive' } },
      { objectKey: { contains: query.keyword, mode: 'insensitive' } },
      { publicUrl: { contains: query.keyword, mode: 'insensitive' } },
      { contentType: { contains: query.keyword, mode: 'insensitive' } },
      { etag: { contains: query.keyword, mode: 'insensitive' } },
      { versionId: { contains: query.keyword, mode: 'insensitive' } },
    ];
  }

  return where;
}

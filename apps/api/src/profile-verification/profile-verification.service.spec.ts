import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import { InMemoryProfileVerificationRepository } from './profile-verification.repository';
import { ProfileVerificationService } from './profile-verification.service';

describe('ProfileVerificationService', () => {
  function createFilesRepository(files: FileUploadRecord[]): FilesRepository {
    const filesById = new Map(files.map(file => [file.id, file]));

    return {
      createPendingFile: jest.fn(),
      findFileById: jest.fn(),
      findFileByIdAndOwner: jest.fn(
        async (fileId: string, ownerUserId: string) => {
          const file = filesById.get(fileId);

          return file?.ownerUserId === ownerUserId ? file : undefined;
        },
      ),
      findFileByObjectKey: jest.fn(),
      markFileUploaded: jest.fn(),
      findPendingFilesCreatedBefore: jest.fn(),
      findRejectedFiles: jest.fn(),
      getMaintenanceSummary: jest.fn(),
      rejectPendingFilesCreatedBefore: jest.fn(),
    } as unknown as FilesRepository;
  }

  function createUploadedIdentityFile(
    id: string,
    ownerUserId = 'shipper-1',
  ): FileUploadRecord {
    return {
      id,
      ownerUserId,
      purpose: 'identity',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: `${ownerUserId}/identity/${id}.png`,
      status: 'uploaded',
      createdAtIso: '2026-07-09T08:00:00.000Z',
    };
  }

  it('returns undefined when the current shipper has no saved verification snapshot', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await expect(service.getIdentity('shipper-1')).resolves.toBeUndefined();
    await expect(service.getEnterprise('shipper-1')).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper identity verification snapshot', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([
      createUploadedIdentityFile('file-front'),
      createUploadedIdentityFile('file-back'),
    ]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await expect(
      service.saveIdentity('shipper-1', {
        realName: '张先生',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      realName: '张先生',
      idNumber: '44030019900101123X',
      status: 'reviewing',
    });

    await expect(service.getIdentity('shipper-1')).resolves.toMatchObject({
      shipperId: 'shipper-1',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
    });
  });

  it('rejects shipper identity verification files that are missing or not uploaded', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([
      {
        ...createUploadedIdentityFile('file-front'),
        status: 'pending',
      },
    ]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await expect(
      service.saveIdentity('shipper-1', {
        realName: '张先生',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '认证附件尚未上传完成'),
    );
  });

  it('rejects shipper identity verification when a file is entirely missing', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await expect(
      service.saveIdentity('shipper-1', {
        realName: '张先生',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-missing',
        identityBackFileId: 'file-back',
        faceVerified: true,
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '认证附件不存在'),
    );
  });

  it('rejects shipper enterprise verification files with invalid purpose', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([
      {
        ...createUploadedIdentityFile('file-license'),
        purpose: 'invoice',
      },
    ]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await expect(
      service.saveEnterprise('shipper-1', {
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '张先生',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licenseFileId: 'file-license',
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_PURPOSE_INVALID, '认证附件用途不匹配'),
    );
  });

  it('keeps enterprise verification snapshots isolated by shipper id', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([
      createUploadedIdentityFile('license-1', 'shipper-1'),
      createUploadedIdentityFile('license-2', 'shipper-2'),
    ]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await service.saveEnterprise('shipper-1', {
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'license-1',
    });
    await service.saveEnterprise('shipper-2', {
      enterpriseName: '深圳星河物流有限公司',
      creditCode: '91440300MA5TEST002',
      legalName: '李先生',
      legalId: '44030019900101124X',
      enterprisePhone: '13800138000',
      licenseFileId: 'license-2',
    });

    await expect(service.getEnterprise('shipper-1')).resolves.toMatchObject({
      shipperId: 'shipper-1',
      enterpriseName: '深圳晨星贸易有限公司',
      licenseFileId: 'license-1',
    });
    await expect(service.getEnterprise('shipper-2')).resolves.toMatchObject({
      shipperId: 'shipper-2',
      enterpriseName: '深圳星河物流有限公司',
      licenseFileId: 'license-2',
    });
  });

  it('lists reviewing shipper verifications for admin', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([
      createUploadedIdentityFile('file-front'),
      createUploadedIdentityFile('file-back'),
      createUploadedIdentityFile('license-1'),
    ]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await service.saveIdentity('shipper-1', {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
    });
    const filesRepositoryWithEnterprise = createFilesRepository([
      createUploadedIdentityFile('file-front'),
      createUploadedIdentityFile('file-back'),
      createUploadedIdentityFile('license-1', 'shipper-2'),
    ]);
    const serviceWithEnterprise = new ProfileVerificationService(
      repository,
      filesRepositoryWithEnterprise,
    );

    await serviceWithEnterprise.saveEnterprise('shipper-2', {
      enterpriseName: '深圳星河物流有限公司',
      creditCode: '91440300MA5FXXXX0X',
      legalName: '李法人',
      legalId: '440300198801011234',
      enterprisePhone: '13800138001',
      licenseFileId: 'license-1',
    });

    await expect(
      serviceWithEnterprise.listVerifications(
        { id: 'admin-1', phone: '13900000000', userType: 'admin' },
        { status: 'reviewing', page: 1, pageSize: 20 },
      ),
    ).resolves.toMatchObject({
      total: 2,
      items: expect.arrayContaining([
        expect.objectContaining({
          shipperId: 'shipper-1',
          identity: expect.objectContaining({ status: 'reviewing' }),
        }),
        expect.objectContaining({
          shipperId: 'shipper-2',
          enterprise: expect.objectContaining({ status: 'reviewing' }),
        }),
      ]),
    });
  });

  it('approves and rejects shipper identity verification for admin', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([
      createUploadedIdentityFile('file-front'),
      createUploadedIdentityFile('file-back'),
    ]);
    const service = new ProfileVerificationService(repository, filesRepository);
    const admin = { id: 'admin-1', phone: '13900000000', userType: 'admin' as const };

    await service.saveIdentity('shipper-1', {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
    });

    await expect(
      service.reviewIdentity(admin, 'shipper-1', { status: 'approved' }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      status: 'approved',
    });

    await service.saveIdentity('shipper-1', {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
    });

    await expect(
      service.reviewIdentity(admin, 'shipper-1', {
        status: 'rejected',
        rejectionReason: '证件照片不清晰',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      status: 'rejected',
      rejectionReason: '证件照片不清晰',
    });
  });

  it('rejects non-admin users from shipper verification review', async () => {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository([]);
    const service = new ProfileVerificationService(repository, filesRepository);

    await expect(
      service.listVerifications(
        { id: 'shipper-1', phone: '13800138000', userType: 'shipper' },
        { status: 'reviewing', page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });
});

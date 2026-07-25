import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import { InMemoryProfileVerificationRepository } from './profile-verification.repository';
import { ProfileVerificationService } from './profile-verification.service';

describe('ProfileVerificationService', () => {
  const previewExpiresAtIso = '2026-07-25T08:10:00.000Z';

  function createFilesRepository(files: FileUploadRecord[]): FilesRepository {
    const filesById = new Map(files.map(file => [file.id, file]));

    return {
      createPendingFile: jest.fn(),
      findFileById: jest.fn(),
      findFilesByIds: jest.fn(),
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
      listMaintenanceFiles: jest.fn(),
      getMaintenanceReport: jest.fn(),
      getMaintenanceSummary: jest.fn(),
      rejectPendingFilesCreatedBefore: jest.fn(),
      rejectPendingFilesByIds: jest.fn(),
    } as unknown as FilesRepository;
  }

  function createUploadedIdentityFile(
    id: string,
    ownerUserId = 'shipper-1',
    publicUrl?: string,
  ): FileUploadRecord {
    return {
      id,
      ownerUserId,
      purpose: 'identity',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: `${ownerUserId}/identity/${id}.png`,
      ...(publicUrl ? { publicUrl } : {}),
      status: 'uploaded',
      createdAtIso: '2026-07-09T08:00:00.000Z',
    };
  }

  function createService(files: FileUploadRecord[] = []) {
    const repository = new InMemoryProfileVerificationRepository();
    const filesRepository = createFilesRepository(files);
    const previewUrlSigner = {
      signPreviewUrl: jest.fn(file => ({
        previewUrl: `https://preview.example.com/${file.id}`,
        previewExpiresAtIso,
      })),
    };

    return {
      repository,
      filesRepository,
      previewUrlSigner,
      service: new ProfileVerificationService(
        repository,
        filesRepository,
        previewUrlSigner,
      ),
    };
  }

  it('returns undefined when the current shipper has no saved verification snapshot', async () => {
    const { service } = createService();

    await expect(service.getIdentity('shipper-1')).resolves.toBeUndefined();
    await expect(service.getEnterprise('shipper-1')).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper identity verification snapshot', async () => {
    const { service } = createService([
      createUploadedIdentityFile('file-front'),
      createUploadedIdentityFile('file-back'),
    ]);

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
    const { service } = createService([
      {
        ...createUploadedIdentityFile('file-front'),
        status: 'pending',
      },
    ]);

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
    const { service } = createService();

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
    const { service } = createService([
      {
        ...createUploadedIdentityFile('file-license'),
        purpose: 'invoice',
      },
    ]);

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
    const { service } = createService([
      createUploadedIdentityFile('license-1', 'shipper-1'),
      createUploadedIdentityFile('license-2', 'shipper-2'),
    ]);

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
    const { repository } = createService();
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
    const { service } = createService([
      createUploadedIdentityFile('file-front'),
      createUploadedIdentityFile('file-back'),
    ]);
    const admin = { id: 'admin-1', phone: '13900000000', userType: 'admin' as const };

    await service.saveIdentity('shipper-1', {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
    });

    await expect(service.listReviewEvents(admin, 'shipper-1')).resolves.toEqual([
      expect.objectContaining({
        verificationType: 'identity',
        eventType: 'shipper_identity_verification_submitted',
        stage: 'submitted',
        actorUserId: 'shipper-1',
        noteText: '提交实名认证：张先生 · 44030019900101123X',
      }),
    ]);

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

    await expect(service.listReviewEvents(admin, 'shipper-1')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          verificationType: 'identity',
          eventType: 'shipper_identity_verification_rejected',
          stage: 'rejected',
          noteText: '证件照片不清晰',
        }),
        expect.objectContaining({
          verificationType: 'identity',
          eventType: 'shipper_identity_verification_submitted',
          stage: 'submitted',
        }),
      ]),
    );
  });

  it('rejects non-admin users from shipper verification review', async () => {
    const { service } = createService();

    await expect(
      service.listVerifications(
        { id: 'shipper-1', phone: '13800138000', userType: 'shipper' },
        { status: 'reviewing', page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });

  it('returns shipper verification attachment previews for admin', async () => {
    const identityFrontFile = createUploadedIdentityFile(
      'file-front',
      'shipper-1',
      'https://cdn.example.com/shipper-1/front.png',
    );
    const identityBackFile = createUploadedIdentityFile('file-back');
    const licenseFile = createUploadedIdentityFile(
      'file-license',
      'shipper-1',
      'https://cdn.example.com/shipper-1/license.png',
    );
    const { service } = createService([
      identityFrontFile,
      identityBackFile,
      licenseFile,
    ]);

    await service.saveIdentity('shipper-1', {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: identityFrontFile.id,
      identityBackFileId: identityBackFile.id,
      faceVerified: true,
    });
    await service.saveEnterprise('shipper-1', {
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: licenseFile.id,
    });

    await expect(
      service.getAttachmentPreviews(
        { id: 'admin-1', phone: '13900000000', userType: 'admin' },
        'shipper-1',
      ),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      identity: {
        identityFront: {
          id: identityFrontFile.id,
          attachmentType: 'identityFront',
          publicUrl: 'https://cdn.example.com/shipper-1/front.png',
          status: 'uploaded',
        },
        identityBack: {
          id: identityBackFile.id,
          attachmentType: 'identityBack',
          status: 'uploaded',
        },
      },
      enterprise: {
        license: {
          id: licenseFile.id,
          attachmentType: 'license',
          publicUrl: 'https://cdn.example.com/shipper-1/license.png',
          status: 'uploaded',
        },
      },
    });
  });

  it('adds signed preview urls to shipper verification attachment previews', async () => {
    const identityFrontFile = createUploadedIdentityFile('file-front');
    const identityBackFile = createUploadedIdentityFile('file-back');
    const { previewUrlSigner, service } = createService([
      identityFrontFile,
      identityBackFile,
    ]);

    await service.saveIdentity('shipper-1', {
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: identityFrontFile.id,
      identityBackFileId: identityBackFile.id,
      faceVerified: true,
    });

    await expect(
      service.getAttachmentPreviews(
        { id: 'admin-1', phone: '13900000000', userType: 'admin' },
        'shipper-1',
      ),
    ).resolves.toMatchObject({
      identity: {
        identityFront: {
          id: identityFrontFile.id,
          previewUrl: `https://preview.example.com/${identityFrontFile.id}`,
          previewExpiresAtIso,
        },
        identityBack: {
          id: identityBackFile.id,
          previewUrl: `https://preview.example.com/${identityBackFile.id}`,
          previewExpiresAtIso,
        },
      },
    });
    expect(previewUrlSigner.signPreviewUrl).toHaveBeenCalledWith(
      identityFrontFile,
    );
    expect(previewUrlSigner.signPreviewUrl).toHaveBeenCalledWith(
      identityBackFile,
    );
  });

  it('rejects non-admin shipper verification attachment preview access', async () => {
    const { service } = createService();

    await expect(
      service.getAttachmentPreviews(
        { id: 'shipper-1', phone: '13800138000', userType: 'shipper' },
        'shipper-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
  });
});

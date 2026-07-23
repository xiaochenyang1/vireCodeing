import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import { InMemoryProfileAccountRepository } from './profile-account.repository';
import { ProfileAccountService } from './profile-account.service';

describe('ProfileAccountService', () => {
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

  function createUploadedAvatarFile(
    id: string,
    ownerUserId = 'shipper-1',
  ): FileUploadRecord {
    return {
      id,
      ownerUserId,
      purpose: 'avatar',
      contentType: 'image/png',
      byteSize: 2048,
      objectKey: `${ownerUserId}/avatar/${id}.png`,
      publicUrl: `https://cdn.example.com/${id}.png`,
      status: 'uploaded',
      createdAtIso: '2026-07-22T08:00:00.000Z',
    };
  }

  function createService() {
    const repository = new InMemoryProfileAccountRepository();
    const filesRepository = createFilesRepository([]);

    return {
      repository,
      filesRepository,
      service: new ProfileAccountService(repository, filesRepository),
    };
  }

  it('returns undefined when the current shipper has no saved account snapshot', async () => {
    const { service } = createService();

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toBeUndefined();
  });

  it('saves and reads the current shipper account snapshot', async () => {
    const repository = new InMemoryProfileAccountRepository();
    const filesRepository = createFilesRepository([
      createUploadedAvatarFile('file-avatar-1'),
    ]);
    const service = new ProfileAccountService(repository, filesRepository);

    await expect(
      service.saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主',
        avatarFileId: 'file-avatar-1',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: false,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: true,
        privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
        privacyPolicyVersion: 'privacy-policy-v2026-07-22',
        privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      avatarFileId: 'file-avatar-1',
      avatarPublicUrl: 'https://cdn.example.com/file-avatar-1.png',
    });

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      avatarFileId: 'file-avatar-1',
      avatarPublicUrl: 'https://cdn.example.com/file-avatar-1.png',
    });
  });

  it('returns the updated bound phone after saving a phone rebind request', async () => {
    const { service } = createService();

    await expect(
      service.saveAccount('shipper-1', '13800138000', {
        displayName: '晨星货主',
        phone: '13900139999',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139999',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
  });

  it('preserves the current settings snapshot when optional fields are omitted', async () => {
    const repository = new InMemoryProfileAccountRepository();
    const filesRepository = createFilesRepository([
      createUploadedAvatarFile('file-avatar-1'),
    ]);
    const service = new ProfileAccountService(repository, filesRepository);

    await service.saveAccount('shipper-1', '13900139001', {
      displayName: '晨星货主',
      avatarFileId: 'file-avatar-1',
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
    });

    await expect(
      service.saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主-二次保存',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主-二次保存',
      phone: '13900139001',
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      avatarFileId: 'file-avatar-1',
      avatarPublicUrl: 'https://cdn.example.com/file-avatar-1.png',
    });
  });

  it('clears the current avatar snapshot when avatarFileId is explicitly null', async () => {
    const repository = new InMemoryProfileAccountRepository();
    const filesRepository = createFilesRepository([
      createUploadedAvatarFile('file-avatar-1'),
    ]);
    const service = new ProfileAccountService(repository, filesRepository);

    await service.saveAccount('shipper-1', '13900139001', {
      displayName: '晨星货主',
      avatarFileId: 'file-avatar-1',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });

    await expect(
      service.saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主',
        avatarFileId: null,
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
  });

  it('keeps account snapshots isolated by shipper id', async () => {
    const repository = new InMemoryProfileAccountRepository();
    const filesRepository = createFilesRepository([
      createUploadedAvatarFile('file-avatar-1', 'shipper-1'),
      createUploadedAvatarFile('file-avatar-2', 'shipper-2'),
    ]);
    const service = new ProfileAccountService(repository, filesRepository);

    await service.saveAccount('shipper-1', '13900139001', {
      displayName: '晨星货主',
      avatarFileId: 'file-avatar-1',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    await service.saveAccount('shipper-2', '13800138000', {
      displayName: '龙华货主',
      avatarFileId: 'file-avatar-2',
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T09:00:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
    });

    await expect(
      service.getAccount('shipper-1', '13900139001'),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      avatarFileId: 'file-avatar-1',
      avatarPublicUrl: 'https://cdn.example.com/file-avatar-1.png',
    });
    await expect(
      service.getAccount('shipper-2', '13800138000'),
    ).resolves.toEqual({
      shipperId: 'shipper-2',
      displayName: '龙华货主',
      phone: '13800138000',
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T09:00:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      avatarFileId: 'file-avatar-2',
      avatarPublicUrl: 'https://cdn.example.com/file-avatar-2.png',
    });
  });

  it('rejects avatar files that are missing, pending, or not avatar purpose', async () => {
    const repository = new InMemoryProfileAccountRepository();

    await expect(
      new ProfileAccountService(
        repository,
        createFilesRepository([]),
      ).saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主',
        avatarFileId: 'file-missing',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '头像文件不存在'),
    );

    await expect(
      new ProfileAccountService(
        repository,
        createFilesRepository([
          {
            ...createUploadedAvatarFile('file-pending'),
            status: 'pending',
          },
        ]),
      ).saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主',
        avatarFileId: 'file-pending',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_STATE_INVALID, '头像文件尚未上传完成'),
    );

    await expect(
      new ProfileAccountService(
        repository,
        createFilesRepository([
          {
            ...createUploadedAvatarFile('file-wrong-purpose'),
            purpose: 'identity',
          },
        ]),
      ).saveAccount('shipper-1', '13900139001', {
        displayName: '晨星货主',
        avatarFileId: 'file-wrong-purpose',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
      }),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.FILE_PURPOSE_INVALID, '头像文件用途不匹配'),
    );
  });
});

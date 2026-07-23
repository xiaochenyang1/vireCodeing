import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import type { SaveShipperProfileAccountRequest } from './dto';
import type { ProfileAccountRepository } from './profile-account.repository';

export class ProfileAccountService {
  constructor(
    private readonly repository: ProfileAccountRepository,
    private readonly filesRepository: FilesRepository,
  ) {}

  async getAccount(shipperId: string, phone: string) {
    const account = await this.repository.findAccountByShipperId(shipperId, phone);

    if (!account) {
      return undefined;
    }

    return this.enrichAvatarSnapshot(shipperId, account);
  }

  async saveAccount(
    shipperId: string,
    phone: string,
    input: SaveShipperProfileAccountRequest,
  ) {
    const avatarFile = input.avatarFileId
      ? await this.assertAvatarFile(shipperId, input.avatarFileId)
      : undefined;
    const account = await this.repository.saveAccount(shipperId, phone, input);

    return this.enrichAvatarSnapshot(shipperId, account, avatarFile);
  }

  private async assertAvatarFile(
    shipperId: string,
    fileId: string,
  ): Promise<FileUploadRecord> {
    const file = await this.filesRepository.findFileByIdAndOwner(
      fileId,
      shipperId,
    );

    if (!file) {
      throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '头像文件不存在');
    }

    if (file.status !== 'uploaded') {
      throw new BusinessError(
        ApiErrorCode.FILE_STATE_INVALID,
        '头像文件尚未上传完成',
      );
    }

    if (file.purpose !== 'avatar') {
      throw new BusinessError(
        ApiErrorCode.FILE_PURPOSE_INVALID,
        '头像文件用途不匹配',
      );
    }

    return file;
  }

  private async enrichAvatarSnapshot(
    shipperId: string,
    account: Awaited<ReturnType<ProfileAccountRepository['saveAccount']>>,
    avatarFile?: FileUploadRecord,
  ) {
    const resolvedAvatarFile =
      avatarFile ??
      (account.avatarFileId
        ? await this.filesRepository.findFileByIdAndOwner(
            account.avatarFileId,
            shipperId,
          )
        : undefined);

    return {
      ...account,
      ...(resolvedAvatarFile?.publicUrl
        ? { avatarPublicUrl: resolvedAvatarFile.publicUrl }
        : {}),
    };
  }
}

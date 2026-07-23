import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FileUploadRecord } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import type { SaveDriverProfileRequest } from './dto';
import type { ProfileDriverRepository } from './profile-driver.repository';

export class ProfileDriverService {
  constructor(
    private readonly repository: ProfileDriverRepository,
    private readonly filesRepository: FilesRepository,
  ) {}

  async getProfile(driverId: string, phone: string) {
    const profile = await this.repository.findProfileByDriverId(driverId, phone);

    if (!profile) {
      return undefined;
    }

    return this.enrichAvatarSnapshot(driverId, profile);
  }

  async saveProfile(
    driverId: string,
    phone: string,
    input: SaveDriverProfileRequest,
  ) {
    const avatarFile = input.avatarFileId
      ? await this.assertAvatarFile(driverId, input.avatarFileId)
      : undefined;
    const profile = await this.repository.saveProfile(driverId, phone, input);

    return this.enrichAvatarSnapshot(driverId, profile, avatarFile);
  }

  private async assertAvatarFile(
    driverId: string,
    fileId: string,
  ): Promise<FileUploadRecord> {
    const file = await this.filesRepository.findFileByIdAndOwner(
      fileId,
      driverId,
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
    driverId: string,
    profile: Awaited<ReturnType<ProfileDriverRepository['saveProfile']>>,
    avatarFile?: FileUploadRecord,
  ) {
    const resolvedAvatarFile =
      avatarFile ??
      (profile.avatarFileId
        ? await this.filesRepository.findFileByIdAndOwner(
            profile.avatarFileId,
            driverId,
          )
        : undefined);

    return {
      ...profile,
      ...(resolvedAvatarFile?.publicUrl
        ? { avatarPublicUrl: resolvedAvatarFile.publicUrl }
        : {}),
    };
  }
}

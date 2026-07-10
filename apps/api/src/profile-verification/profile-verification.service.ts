import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FilePurpose } from '../files/dto';
import type { FilesRepository } from '../files/files.repository';
import type {
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
} from './dto';
import type { ProfileVerificationRepository } from './profile-verification.repository';

export class ProfileVerificationService {
  constructor(
    private readonly repository: ProfileVerificationRepository,
    private readonly filesRepository: FilesRepository,
  ) {}

  async getIdentity(shipperId: string) {
    return this.repository.findIdentityByShipperId(shipperId);
  }

  async saveIdentity(
    shipperId: string,
    input: SaveShipperIdentityVerificationRequest,
  ) {
    await this.assertVerificationFiles(shipperId, [
      input.identityFrontFileId,
      input.identityBackFileId,
    ]);

    return this.repository.saveIdentity(shipperId, input);
  }

  async getEnterprise(shipperId: string) {
    return this.repository.findEnterpriseByShipperId(shipperId);
  }

  async saveEnterprise(
    shipperId: string,
    input: SaveShipperEnterpriseVerificationRequest,
  ) {
    await this.assertVerificationFiles(shipperId, [input.licenseFileId]);

    return this.repository.saveEnterprise(shipperId, input);
  }

  private async assertVerificationFiles(
    shipperId: string,
    fileIds: string[],
    expectedPurpose: FilePurpose = 'identity',
  ) {
    for (const fileId of fileIds) {
      const file = await this.filesRepository.findFileByIdAndOwner(
        fileId,
        shipperId,
      );

      if (!file) {
        throw new BusinessError(ApiErrorCode.FILE_NOT_FOUND, '认证附件不存在');
      }

      if (file.status !== 'uploaded') {
        throw new BusinessError(
          ApiErrorCode.FILE_STATE_INVALID,
          '认证附件尚未上传完成',
        );
      }

      if (file.purpose !== expectedPurpose) {
        throw new BusinessError(
          ApiErrorCode.FILE_PURPOSE_INVALID,
          '认证附件用途不匹配',
        );
      }
    }
  }
}

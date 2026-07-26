import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FilePurpose, FileUploadRecord } from '../files/dto';
import {
  LocalFilePreviewUrlSigner,
  type FilePreviewUrlSigner,
} from '../files/file-preview-url.signer';
import type { FilesRepository } from '../files/files.repository';
import type {
  ListShipperVerificationQuery,
  ReviewShipperVerificationRequest,
  SaveShipperEnterpriseVerificationRequest,
  SaveShipperIdentityVerificationRequest,
  ShipperVerificationAttachmentPreview,
  ShipperVerificationAttachmentRecord,
  ShipperVerificationAttachmentType,
} from './dto';
import type { ProfileVerificationRepository } from './profile-verification.repository';

export class ProfileVerificationService {
  constructor(
    private readonly repository: ProfileVerificationRepository,
    private readonly filesRepository: FilesRepository,
    private readonly previewUrlSigner: FilePreviewUrlSigner =
      new LocalFilePreviewUrlSigner(),
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

  async listVerifications(
    currentUser: AuthenticatedUser,
    query: ListShipperVerificationQuery,
  ) {
    this.assertAdmin(currentUser);
    return this.repository.listVerifications(query);
  }

  async listReviewEvents(currentUser: AuthenticatedUser, shipperId: string) {
    this.assertAdmin(currentUser);
    return this.repository.listReviewEvents(shipperId);
  }

  async getAttachmentPreviews(
    currentUser: AuthenticatedUser,
    shipperId: string,
  ): Promise<ShipperVerificationAttachmentPreview> {
    this.assertAdmin(currentUser);

    const [identity, enterprise] = await Promise.all([
      this.repository.findIdentityByShipperId(shipperId),
      this.repository.findEnterpriseByShipperId(shipperId),
    ]);

    if (!identity && !enterprise) {
      throw new BusinessError(
        ApiErrorCode.SHIPPER_VERIFICATION_NOT_FOUND,
        '货主认证记录不存在',
      );
    }

    const [identityFront, identityBack, license] = await Promise.all([
      this.findAttachment(
        shipperId,
        'identityFront',
        identity?.identityFrontFileId,
      ),
      this.findAttachment(
        shipperId,
        'identityBack',
        identity?.identityBackFileId,
      ),
      this.findAttachment(shipperId, 'license', enterprise?.licenseFileId),
    ]);

    return {
      shipperId,
      identity: {
        ...(identityFront ? { identityFront } : {}),
        ...(identityBack ? { identityBack } : {}),
      },
      enterprise: {
        ...(license ? { license } : {}),
      },
    };
  }

  async reviewIdentity(
    currentUser: AuthenticatedUser,
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ) {
    this.assertAdmin(currentUser);
    return this.repository.reviewIdentity(shipperId, currentUser.id, input);
  }

  async reviewEnterprise(
    currentUser: AuthenticatedUser,
    shipperId: string,
    input: ReviewShipperVerificationRequest,
  ) {
    this.assertAdmin(currentUser);
    return this.repository.reviewEnterprise(shipperId, currentUser.id, input);
  }

  private assertAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'admin') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
    }
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

  private async findAttachment(
    shipperId: string,
    attachmentType: ShipperVerificationAttachmentType,
    fileId: string | undefined,
  ): Promise<ShipperVerificationAttachmentRecord | undefined> {
    if (!fileId) {
      return undefined;
    }

    const file = await this.filesRepository.findFileByIdAndOwner(
      fileId,
      shipperId,
    );

    return file
      ? mapAttachment(file, attachmentType, this.previewUrlSigner)
      : undefined;
  }
}

function mapAttachment(
  file: FileUploadRecord,
  attachmentType: ShipperVerificationAttachmentType,
  previewUrlSigner: FilePreviewUrlSigner,
): ShipperVerificationAttachmentRecord {
  return {
    ...file,
    attachmentType,
    ...previewUrlSigner.signPreviewUrl(file),
  };
}

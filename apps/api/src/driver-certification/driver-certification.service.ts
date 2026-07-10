import type { AuthenticatedUser } from '../auth/dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { FilePurpose, FileUploadRecord } from '../files/dto';
import {
  LocalFilePreviewUrlSigner,
  type FilePreviewUrlSigner,
} from '../files/file-preview-url.signer';
import type { FilesRepository } from '../files/files.repository';
import type {
  DriverCertificationAttachmentPreview,
  DriverCertificationAttachmentRecord,
  DriverCertificationAttachmentType,
  DriverCertificationReviewEventRecord,
  ListDriverCertificationQuery,
  ReviewDriverCertificationRequest,
  SubmitDriverIdentityCertificationRequest,
  SubmitDriverVehicleCertificationRequest,
} from './dto';
import type { DriverCertificationRepository } from './driver-certification.repository';

export class DriverCertificationService {
  constructor(
    private readonly repository: DriverCertificationRepository,
    private readonly filesRepository: FilesRepository,
    private readonly previewUrlSigner: FilePreviewUrlSigner =
      new LocalFilePreviewUrlSigner(),
  ) {}

  async getCertification(currentUser: AuthenticatedUser) {
    this.assertDriver(currentUser);

    return withCurrentDriver(
      await this.repository.getCertification(currentUser.id),
      currentUser,
    );
  }

  async listCertifications(
    currentUser: AuthenticatedUser,
    query: ListDriverCertificationQuery,
  ) {
    this.assertAdmin(currentUser);

    return this.repository.listCertifications(query);
  }

  async listReviewEvents(
    currentUser: AuthenticatedUser,
    driverId: string,
  ): Promise<DriverCertificationReviewEventRecord[]> {
    this.assertAdmin(currentUser);

    return this.repository.listReviewEvents(driverId);
  }

  async getAttachmentPreviews(
    currentUser: AuthenticatedUser,
    driverId: string,
  ): Promise<DriverCertificationAttachmentPreview> {
    this.assertAdmin(currentUser);

    const certification = await this.repository.getCertification(driverId);
    const [
      identityFront,
      identityBack,
      drivingLicense,
      driverLicense,
      transportQualification,
      operationPermit,
      vehiclePhoto,
    ] = await Promise.all([
      this.findAttachment(
        driverId,
        'identityFront',
        certification.identity.identityFrontFileId,
      ),
      this.findAttachment(
        driverId,
        'identityBack',
        certification.identity.identityBackFileId,
      ),
      this.findAttachment(
        driverId,
        'drivingLicense',
        certification.vehicle.drivingLicenseFileId,
      ),
      this.findAttachment(
        driverId,
        'driverLicense',
        certification.vehicle.driverLicenseFileId,
      ),
      this.findAttachment(
        driverId,
        'transportQualification',
        certification.vehicle.transportQualificationFileId,
      ),
      this.findAttachment(
        driverId,
        'operationPermit',
        certification.vehicle.operationPermitFileId,
      ),
      this.findAttachment(
        driverId,
        'vehiclePhoto',
        certification.vehicle.vehiclePhotoFileId,
      ),
    ]);

    return {
      driverId,
      identity: {
        ...(identityFront ? { identityFront } : {}),
        ...(identityBack ? { identityBack } : {}),
      },
      vehicle: {
        ...(drivingLicense ? { drivingLicense } : {}),
        ...(driverLicense ? { driverLicense } : {}),
        ...(transportQualification ? { transportQualification } : {}),
        ...(operationPermit ? { operationPermit } : {}),
        ...(vehiclePhoto ? { vehiclePhoto } : {}),
      },
    };
  }

  async submitIdentity(
    currentUser: AuthenticatedUser,
    input: SubmitDriverIdentityCertificationRequest,
  ) {
    this.assertDriver(currentUser);
    await this.assertCertificationFiles(currentUser.id, [
      input.identityFrontFileId,
      input.identityBackFileId,
    ]);

    return withCurrentDriver(
      await this.repository.saveIdentity(currentUser.id, input, currentUser.phone),
      currentUser,
    );
  }

  async submitVehicle(
    currentUser: AuthenticatedUser,
    input: SubmitDriverVehicleCertificationRequest,
  ) {
    this.assertDriver(currentUser);
    await this.assertCertificationFiles(currentUser.id, [
      input.drivingLicenseFileId,
      input.driverLicenseFileId,
      input.transportQualificationFileId,
      input.operationPermitFileId,
      input.vehiclePhotoFileId,
    ]);

    return withCurrentDriver(
      await this.repository.saveVehicle(currentUser.id, input, currentUser.phone),
      currentUser,
    );
  }

  async reviewIdentity(
    currentUser: AuthenticatedUser,
    driverId: string,
    input: ReviewDriverCertificationRequest,
  ) {
    this.assertAdmin(currentUser);

    return this.repository.reviewIdentity(driverId, currentUser.id, input);
  }

  async reviewVehicle(
    currentUser: AuthenticatedUser,
    driverId: string,
    input: ReviewDriverCertificationRequest,
  ) {
    this.assertAdmin(currentUser);

    return this.repository.reviewVehicle(driverId, currentUser.id, input);
  }

  private assertDriver(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'driver') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是司机');
    }
  }

  private assertAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.userType !== 'admin') {
      throw new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员');
    }
  }

  private async assertCertificationFiles(
    driverId: string,
    fileIds: string[],
    expectedPurpose: FilePurpose = 'identity',
  ) {
    for (const fileId of fileIds) {
      const file = await this.filesRepository.findFileByIdAndOwner(
        fileId,
        driverId,
      );

      if (!file) {
        throw new BusinessError(
          ApiErrorCode.FILE_NOT_FOUND,
          '认证附件不存在',
        );
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
    driverId: string,
    attachmentType: DriverCertificationAttachmentType,
    fileId: string | undefined,
  ): Promise<DriverCertificationAttachmentRecord | undefined> {
    if (!fileId) {
      return undefined;
    }

    const file = await this.filesRepository.findFileByIdAndOwner(
      fileId,
      driverId,
    );

    return file
      ? mapAttachment(file, attachmentType, this.previewUrlSigner)
      : undefined;
  }
}

function mapAttachment(
  file: FileUploadRecord,
  attachmentType: DriverCertificationAttachmentType,
  previewUrlSigner: FilePreviewUrlSigner,
): DriverCertificationAttachmentRecord {
  return {
    ...file,
    attachmentType,
    ...previewUrlSigner.signPreviewUrl(file),
  };
}

function withCurrentDriver<T extends { driver: { id: string; phone?: string } }>(
  snapshot: T,
  currentUser: AuthenticatedUser,
): T {
  return {
    ...snapshot,
    driver: {
      id: currentUser.id,
      phone: snapshot.driver.phone ?? currentUser.phone,
    },
  };
}

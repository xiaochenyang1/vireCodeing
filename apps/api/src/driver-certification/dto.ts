import type { FileUploadRecord } from '../files/dto';

export type CertificationStatus =
  | 'unsubmitted'
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type DriverIdentityCertificationRecord = {
  driverId: string;
  realName?: string;
  identityNumber?: string;
  identityFrontFileId?: string;
  identityBackFileId?: string;
  status: CertificationStatus;
  rejectionReason?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
};

export type DriverVehicleCertificationRecord = {
  driverId: string;
  plateNumber?: string;
  vehicleType?: string;
  vehicleLengthText?: string;
  loadCapacityText?: string;
  hasTailboard?: boolean;
  drivingLicenseFileId?: string;
  driverLicenseFileId?: string;
  transportQualificationFileId?: string;
  operationPermitFileId?: string;
  vehiclePhotoFileId?: string;
  status: CertificationStatus;
  rejectionReason?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
};

export type DriverCertificationDriverRecord = {
  id: string;
  phone?: string;
};

export type DriverCertificationSnapshot = {
  driver: DriverCertificationDriverRecord;
  identity: DriverIdentityCertificationRecord;
  vehicle: DriverVehicleCertificationRecord;
};

export type ListDriverCertificationQuery = {
  status: Extract<CertificationStatus, 'reviewing' | 'approved' | 'rejected'>;
  page: number;
  pageSize: number;
};

export type DriverCertificationListResult = {
  items: DriverCertificationSnapshot[];
  page: number;
  pageSize: number;
  total: number;
};

export type DriverCertificationType = 'identity' | 'vehicle';

export type DriverCertificationReviewEventRecord = {
  id: string;
  driverId: string;
  reviewerAdminId: string;
  certificationType: DriverCertificationType;
  fromStatus: CertificationStatus;
  toStatus: Extract<CertificationStatus, 'approved' | 'rejected'>;
  rejectionReason?: string;
  createdAtIso: string;
};

export type DriverCertificationAttachmentType =
  | 'identityFront'
  | 'identityBack'
  | 'drivingLicense'
  | 'driverLicense'
  | 'transportQualification'
  | 'operationPermit'
  | 'vehiclePhoto';

export type DriverCertificationAttachmentRecord = FileUploadRecord & {
  attachmentType: DriverCertificationAttachmentType;
  previewUrl?: string;
  previewExpiresAtIso?: string;
};

export type DriverCertificationAttachmentPreview = {
  driverId: string;
  identity: {
    identityFront?: DriverCertificationAttachmentRecord;
    identityBack?: DriverCertificationAttachmentRecord;
  };
  vehicle: {
    drivingLicense?: DriverCertificationAttachmentRecord;
    driverLicense?: DriverCertificationAttachmentRecord;
    transportQualification?: DriverCertificationAttachmentRecord;
    operationPermit?: DriverCertificationAttachmentRecord;
    vehiclePhoto?: DriverCertificationAttachmentRecord;
  };
};

export type SubmitDriverIdentityCertificationRequest = {
  realName: string;
  identityNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
};

export type SubmitDriverVehicleCertificationRequest = {
  plateNumber: string;
  vehicleType: string;
  vehicleLengthText: string;
  loadCapacityText: string;
  hasTailboard: boolean;
  drivingLicenseFileId: string;
  driverLicenseFileId: string;
  transportQualificationFileId: string;
  operationPermitFileId: string;
  vehiclePhotoFileId: string;
};

export type ReviewDriverCertificationRequest =
  | {
      status: 'approved';
      rejectionReason?: undefined;
    }
  | {
      status: 'rejected';
      rejectionReason: string;
    };

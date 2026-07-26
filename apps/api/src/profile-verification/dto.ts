import type { FileUploadRecord } from '../files/dto';

export type ShipperProfileVerificationStatus =
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type SaveShipperIdentityVerificationRequest = {
  realName: string;
  idNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
  faceVerified: true;
};

export type ShipperIdentityVerificationRecord =
  SaveShipperIdentityVerificationRequest & {
    shipperId: string;
    status: ShipperProfileVerificationStatus;
    rejectionReason?: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

export type SaveShipperEnterpriseVerificationRequest = {
  enterpriseName: string;
  creditCode: string;
  legalName: string;
  legalId: string;
  enterprisePhone: string;
  licenseFileId: string;
};

export type ShipperEnterpriseVerificationRecord =
  SaveShipperEnterpriseVerificationRequest & {
    shipperId: string;
    status: ShipperProfileVerificationStatus;
    rejectionReason?: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

export type ShipperVerificationType = 'identity' | 'enterprise';

export type ReviewShipperVerificationRequest =
  | {
      status: 'approved';
      rejectionReason?: undefined;
    }
  | {
      status: 'rejected';
      rejectionReason: string;
    };

export type ListShipperVerificationQuery = {
  status: Extract<ShipperProfileVerificationStatus, 'reviewing' | 'approved' | 'rejected'>;
  type?: ShipperVerificationType;
  page: number;
  pageSize: number;
};

export type ShipperVerificationSnapshot = {
  shipperId: string;
  identity?: ShipperIdentityVerificationRecord;
  enterprise?: ShipperEnterpriseVerificationRecord;
};

export type ShipperVerificationListResult = {
  items: ShipperVerificationSnapshot[];
  page: number;
  pageSize: number;
  total: number;
};

export type ShipperVerificationAttachmentType =
  | 'identityFront'
  | 'identityBack'
  | 'license';

export type ShipperVerificationAttachmentRecord = FileUploadRecord & {
  attachmentType: ShipperVerificationAttachmentType;
  previewUrl?: string;
  previewExpiresAtIso?: string;
};

export type ShipperVerificationAttachmentPreview = {
  shipperId: string;
  identity: {
    identityFront?: ShipperVerificationAttachmentRecord;
    identityBack?: ShipperVerificationAttachmentRecord;
  };
  enterprise: {
    license?: ShipperVerificationAttachmentRecord;
  };
};

export type AdminShipperVerificationReviewEventType =
  | 'shipper_identity_verification_submitted'
  | 'shipper_identity_verification_approved'
  | 'shipper_identity_verification_rejected'
  | 'shipper_enterprise_verification_submitted'
  | 'shipper_enterprise_verification_approved'
  | 'shipper_enterprise_verification_rejected';

export type AdminShipperVerificationReviewEventStage =
  | 'submitted'
  | 'approved'
  | 'rejected';

export type AdminShipperVerificationReviewEvent = {
  eventId: string;
  verificationType: ShipperVerificationType;
  actorUserId?: string;
  reviewerAdminId?: string;
  fromStatus?: ShipperProfileVerificationStatus;
  toStatus?: Extract<ShipperProfileVerificationStatus, 'approved' | 'rejected'>;
  eventType: AdminShipperVerificationReviewEventType;
  stage: AdminShipperVerificationReviewEventStage;
  noteText?: string;
  createdAtIso: string;
};

export type ShipperVerificationReviewDecisionRecord = {
  id: string;
  shipperId: string;
  reviewerAdminId: string;
  verificationType: ShipperVerificationType;
  fromStatus: ShipperProfileVerificationStatus;
  toStatus: Extract<ShipperProfileVerificationStatus, 'approved' | 'rejected'>;
  rejectionReason?: string;
  createdAtIso: string;
};

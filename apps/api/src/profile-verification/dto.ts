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

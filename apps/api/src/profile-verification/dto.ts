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

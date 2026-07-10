import {
  PlatformApiError,
  platformGet,
  platformPost,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';

export type PlatformCertificationStatus =
  | 'unsubmitted'
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type PlatformDriverIdentityCertification = {
  driverId: string;
  realName?: string;
  identityNumber?: string;
  identityFrontFileId?: string;
  identityBackFileId?: string;
  status: PlatformCertificationStatus;
  rejectionReason?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
};

export type PlatformDriverVehicleCertification = {
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
  status: PlatformCertificationStatus;
  rejectionReason?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
};

export type PlatformDriverCertificationSnapshot = {
  driver?: PlatformDriverCertificationDriver;
  identity: PlatformDriverIdentityCertification;
  vehicle: PlatformDriverVehicleCertification;
};
export type PlatformDriverCertificationDriver = {
  id: string;
  phone?: string;
};

export type PlatformListDriverCertificationQuery = {
  status?: Extract<PlatformCertificationStatus, 'reviewing' | 'approved' | 'rejected'>;
  page?: number;
  pageSize?: number;
};

export type PlatformDriverCertificationListResult = {
  items: PlatformDriverCertificationSnapshot[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformDriverCertificationReviewRequest =
  | {
      status: 'approved';
    }
  | {
      status: 'rejected';
      rejectionReason: string;
    };

export type PlatformDriverCertificationReviewEvent = {
  id: string;
  driverId: string;
  reviewerAdminId: string;
  certificationType: 'identity' | 'vehicle';
  fromStatus: PlatformCertificationStatus;
  toStatus: Extract<PlatformCertificationStatus, 'approved' | 'rejected'>;
  rejectionReason?: string;
  createdAtIso: string;
};

export type PlatformDriverCertificationAttachmentType =
  | 'identityFront'
  | 'identityBack'
  | 'drivingLicense'
  | 'driverLicense'
  | 'transportQualification'
  | 'operationPermit'
  | 'vehiclePhoto';

export type PlatformDriverCertificationAttachment = {
  id: string;
  ownerUserId: string;
  purpose: string;
  objectKey: string;
  publicUrl?: string;
  status: string;
  createdAtIso: string;
  attachmentType: PlatformDriverCertificationAttachmentType;
  previewUrl?: string;
  previewExpiresAtIso?: string;
};

export type PlatformDriverCertificationAttachmentPreview = {
  driverId: string;
  identity: {
    identityFront?: PlatformDriverCertificationAttachment;
    identityBack?: PlatformDriverCertificationAttachment;
  };
  vehicle: {
    drivingLicense?: PlatformDriverCertificationAttachment;
    driverLicense?: PlatformDriverCertificationAttachment;
    transportQualification?: PlatformDriverCertificationAttachment;
    operationPermit?: PlatformDriverCertificationAttachment;
    vehiclePhoto?: PlatformDriverCertificationAttachment;
  };
};

export type PlatformSubmitDriverIdentityCertificationRequest = {
  realName: string;
  identityNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
};

export type PlatformSubmitDriverVehicleCertificationRequest = {
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

const CERTIFICATION_REQUEST_INVALID =
  'PLATFORM_DRIVER_CERTIFICATION_REQUEST_INVALID';

export function createPlatformDriverCertificationApi(config: PlatformApiConfig) {
  return {
    getCertification() {
      return platformGet<PlatformDriverCertificationSnapshot>(
        config,
        '/driver/certification',
      );
    },
    async submitIdentity(
      request: PlatformSubmitDriverIdentityCertificationRequest,
    ) {
      return platformPut<
        PlatformSubmitDriverIdentityCertificationRequest,
        PlatformDriverCertificationSnapshot
      >(
        config,
        '/driver/certification/identity',
        normalizeIdentityRequest(request),
      );
    },
    async submitVehicle(
      request: PlatformSubmitDriverVehicleCertificationRequest,
    ) {
      return platformPut<
        PlatformSubmitDriverVehicleCertificationRequest,
        PlatformDriverCertificationSnapshot
      >(
        config,
        '/driver/certification/vehicle',
        normalizeVehicleRequest(request),
      );
    },
    async listAdminCertifications(
      query: PlatformListDriverCertificationQuery = {},
    ) {
      const normalizedQuery = normalizeListAdminCertificationsQuery(query);

      return platformGet<PlatformDriverCertificationListResult>(
        config,
        `/admin/driver-certifications?${new URLSearchParams(
          normalizedQuery,
        ).toString()}`,
      );
    },
    async reviewAdminIdentity(
      driverId: string,
      request: PlatformDriverCertificationReviewRequest,
    ) {
      return platformPost<
        PlatformDriverCertificationReviewRequest,
        PlatformDriverCertificationSnapshot
      >(
        config,
        `/admin/driver-certifications/${encodeURIComponent(
          normalizeDriverId(driverId),
        )}/identity/review`,
        normalizeReviewRequest(request),
      );
    },
    async reviewAdminVehicle(
      driverId: string,
      request: PlatformDriverCertificationReviewRequest,
    ) {
      return platformPost<
        PlatformDriverCertificationReviewRequest,
        PlatformDriverCertificationSnapshot
      >(
        config,
        `/admin/driver-certifications/${encodeURIComponent(
          normalizeDriverId(driverId),
        )}/vehicle/review`,
        normalizeReviewRequest(request),
      );
    },
    async getAdminAttachmentPreviews(driverId: string) {
      return platformGet<PlatformDriverCertificationAttachmentPreview>(
        config,
        `/admin/driver-certifications/${encodeURIComponent(
          normalizeDriverId(driverId),
        )}/attachments`,
      );
    },
    async listAdminReviewEvents(driverId: string) {
      return platformGet<PlatformDriverCertificationReviewEvent[]>(
        config,
        `/admin/driver-certifications/${encodeURIComponent(
          normalizeDriverId(driverId),
        )}/review-events`,
      );
    },
  };
}

function normalizeListAdminCertificationsQuery(
  query: PlatformListDriverCertificationQuery,
) {
  assertPlainObject(query, 'Platform driver certification query must be an object');
  const status = query.status ?? 'reviewing';
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!['reviewing', 'approved', 'rejected'].includes(status)) {
    throwInvalidRequest('Platform driver certification status is invalid');
  }

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidRequest('Platform driver certification page is invalid');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throwInvalidRequest('Platform driver certification pageSize is invalid');
  }

  return {
    status,
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeIdentityRequest(
  request: PlatformSubmitDriverIdentityCertificationRequest,
): PlatformSubmitDriverIdentityCertificationRequest {
  assertPlainObject(request, 'Platform driver identity request must be an object');
  const identityNumber = normalizeRequiredString(
    request.identityNumber,
    'identityNumber',
    18,
  ).toUpperCase();

  if (!/^\d{17}[\dX]$/.test(identityNumber)) {
    throwInvalidRequest('Platform driver identityNumber is invalid');
  }

  return {
    realName: normalizeRequiredString(request.realName, 'realName', 30),
    identityNumber,
    identityFrontFileId: normalizeRequiredString(
      request.identityFrontFileId,
      'identityFrontFileId',
      120,
    ),
    identityBackFileId: normalizeRequiredString(
      request.identityBackFileId,
      'identityBackFileId',
      120,
    ),
  };
}

function normalizeVehicleRequest(
  request: PlatformSubmitDriverVehicleCertificationRequest,
): PlatformSubmitDriverVehicleCertificationRequest {
  assertPlainObject(request, 'Platform driver vehicle request must be an object');

  if (typeof request.hasTailboard !== 'boolean') {
    throwInvalidRequest('Platform driver hasTailboard is invalid');
  }

  return {
    plateNumber: normalizeRequiredString(request.plateNumber, 'plateNumber', 20),
    vehicleType: normalizeRequiredString(request.vehicleType, 'vehicleType', 40),
    vehicleLengthText: normalizeRequiredString(
      request.vehicleLengthText,
      'vehicleLengthText',
      30,
    ),
    loadCapacityText: normalizeRequiredString(
      request.loadCapacityText,
      'loadCapacityText',
      30,
    ),
    hasTailboard: request.hasTailboard,
    drivingLicenseFileId: normalizeRequiredString(
      request.drivingLicenseFileId,
      'drivingLicenseFileId',
      120,
    ),
    driverLicenseFileId: normalizeRequiredString(
      request.driverLicenseFileId,
      'driverLicenseFileId',
      120,
    ),
    transportQualificationFileId: normalizeRequiredString(
      request.transportQualificationFileId,
      'transportQualificationFileId',
      120,
    ),
    operationPermitFileId: normalizeRequiredString(
      request.operationPermitFileId,
      'operationPermitFileId',
      120,
    ),
    vehiclePhotoFileId: normalizeRequiredString(
      request.vehiclePhotoFileId,
      'vehiclePhotoFileId',
      120,
    ),
  };
}

function normalizeReviewRequest(
  request: PlatformDriverCertificationReviewRequest,
): PlatformDriverCertificationReviewRequest {
  assertPlainObject(request, 'Platform driver certification review must be an object');

  if (request.status === 'approved') {
    return { status: 'approved' };
  }

  if (request.status === 'rejected') {
    return {
      status: 'rejected',
      rejectionReason: normalizeRequiredString(
        request.rejectionReason,
        'rejectionReason',
        200,
      ),
    };
  }

  throwInvalidRequest('Platform driver certification review status is invalid');
}

function normalizeDriverId(value: unknown) {
  return normalizeRequiredString(value, 'driverId', 120);
}

function assertPlainObject(value: unknown, message: string) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throwInvalidRequest(message);
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
) {
  if (typeof value !== 'string') {
    throwInvalidRequest(`Platform driver ${fieldName} must be a string`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue || normalizedValue.length > maxLength) {
    throwInvalidRequest(`Platform driver ${fieldName} is invalid`);
  }

  return normalizedValue;
}

function throwInvalidRequest(message: string): never {
  throw new PlatformApiError(message, CERTIFICATION_REQUEST_INVALID, 0);
}

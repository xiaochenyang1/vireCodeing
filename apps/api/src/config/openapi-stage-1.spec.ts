import { readFileSync } from 'fs';
import { join } from 'path';

describe('stage 1 OpenAPI contract', () => {
  const openApiPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'docs',
    'platform',
    'openapi-stage-1.yaml',
  );

  it('documents verification code rate limits as HTTP 429 business errors', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain("'429':");
    expect(source).toContain('AUTH_CODE_RATE_LIMITED');
    expect(source).toContain('验证码发送过于频繁');
  });

  it('documents verification code delivery failures as HTTP 502 business errors', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain("'502':");
    expect(source).toContain('AUTH_CODE_DELIVERY_FAILED');
    expect(source).toContain('验证码发送失败');
  });

  it('documents disabled users as HTTP 403 business errors', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain("'403':");
    expect(source).toContain('AUTH_USER_DISABLED');
    expect(source).toContain('账号已禁用');
  });

  it('documents the API server with the Nest global api prefix', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('url: http://localhost:3000/api');
  });

  it('documents opaque refresh token UUID format', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('^refresh\\.');
    expect(source).toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(source).not.toContain('refresh.local-user-13800138000.604800');
  });

  it('documents the current user route as bearer protected', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/me:');
    expect(source).toContain('bearerAuth: []');
    expect(source).toContain('bearerFormat: JWT');
  });

  it('documents success response envelopes for stage 1 auth routes', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('#/components/schemas/SendCodeResponse');
    expect(source).toContain('#/components/schemas/LoginResponse');
    expect(source).toContain('#/components/schemas/PasswordLoginResponse');
    expect(source).toContain('#/components/schemas/RegisterResponse');
    expect(source).toContain('#/components/schemas/RefreshResponse');
    expect(source).toContain('#/components/schemas/LogoutResponse');
    expect(source).toContain('#/components/schemas/ResetPasswordResponse');
    expect(source).toContain('#/components/schemas/ChangePasswordResponse');
    expect(source).toContain('#/components/schemas/MeResponse');
    expect(source).toContain('ApiSuccessEnvelope:');
    expect(source).toContain('TokenPair:');
    expect(source).toContain('AuthenticatedUser:');
  });

  it('documents platform register as a stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/register:');
    expect(source).toContain('Register with phone and verification code');
    expect(source).toContain('#/components/schemas/RegisterRequest');
    expect(source).toContain('#/components/schemas/RegisterResponse');
    expect(source).toContain('required: [phone, code, userType, deviceId, password]');
    expect(source).toContain('密码需至少 6 位并包含字母和数字');
  });

  it('documents platform password login as a stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/password-login:');
    expect(source).toContain('Login with phone and password');
    expect(source).toContain('#/components/schemas/PasswordLoginRequest');
    expect(source).toContain('#/components/schemas/PasswordLoginResponse');
    expect(source).toContain('required: [phone, password, userType, deviceId]');
    expect(source).toContain('AUTH_PASSWORD_INVALID');
    expect(source).toContain('手机号或密码错误');
  });

  it('documents platform password reset as a stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/reset-password:');
    expect(source).toContain('Reset password with phone and verification code');
    expect(source).toContain('#/components/schemas/ResetPasswordRequest');
    expect(source).toContain('#/components/schemas/ResetPasswordResponse');
    expect(source).toContain('required: [phone, code, password]');
    expect(source).toContain('AUTH_PASSWORD_RESET_INVALID');
    expect(source).toContain('手机号或验证码错误');
  });

  it('documents platform change password as a bearer-protected stage 1 auth route', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/auth/change-password:');
    expect(source).toContain('Change current authenticated user password');
    expect(source).toContain('security:');
    expect(source).toContain('bearerAuth: []');
    expect(source).toContain('#/components/schemas/ChangePasswordRequest');
    expect(source).toContain('#/components/schemas/ChangePasswordResponse');
    expect(source).toContain('required: [currentPassword, newPassword]');
    expect(source).toContain('AUTH_PASSWORD_INVALID');
    expect(source).toContain('当前密码错误');
  });

  it('documents request id headers for stage 1 auth routes', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('RequestIdHeader:');
    expect(source).toContain('name: x-request-id');
    expect(source).toContain(
      "$ref: '#/components/parameters/RequestIdHeader'",
    );
  });

  it('documents shipper order endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/orders:');
    expect(source).toContain('/shipper/orders/{orderId}:');
    expect(source).toContain('/shipper/orders/{orderId}/cancel:');
    expect(source).toContain('/shipper/orders/{orderId}/complete:');
    expect(source).toContain('/shipper/orders/{orderId}/exception:');
    expect(source).toContain('/shipper/orders/{orderId}/change-request:');
    expect(source).toContain('/shipper/orders/{orderId}/evaluation:');
    expect(source).toContain('/admin/orders/attachments:');
    expect(source).toContain('List admin order attachment audit summaries');
    expectPathBlockToContain(source, '/admin/orders/attachments', 'name: status');
    expectPathBlockToContain(
      source,
      '/admin/orders/attachments',
      'name: shipperId',
    );
    expect(source).toContain('hasMissingFiles');
    expect(source).toContain(
      'Only return orders whose attachment audit matches the missing-file state.',
    );
    expect(source).toContain('/admin/orders/{orderId}/attachments:');
    expect(source).toContain('Get admin order attachment audit');
    expect(source).toContain('AdminOrderAttachmentAuditListResponse');
    expect(source).toContain('AdminOrderAttachmentAuditSummary');
    expect(source).toContain('AdminOrderAttachmentAuditResponse');
    expect(source).toContain('AdminOrderAttachmentFileRecord');
    expect(source).toContain('AdminOrderAttachmentAuditEvent');
    expect(source).toContain('missingFileIds');
    expect(source).toContain(
      'Signed short-lived preview URL for admin order attachment audit.',
    );
    expect(source).toContain('CreateShipperOrderRequest');
    expect(source).toContain('Update current shipper order');
    expect(source).toContain('CancelShipperOrderRequest');
    expect(source).toContain('Complete shipper order after delivery');
    expect(source).toContain('ReportShipperOrderExceptionRequest');
    expect(source).toContain('photoFileIds');
    expect(source).toContain('Order event attachment file ids');
    expect(source).toContain(
      'Created and updated order events include cargo photo file ids',
    );
    expect(source).toContain('cargoPhotoFileIds');
    expect(source).toContain('Order cargo photo file ids');
    expect(source).toContain('use cargo purpose');
    expect(source).toContain(
      'When present, cargoPhotoCount is derived from this array length.',
    );
    expect(source).toContain('exception_reported');
    expect(source).toContain('SubmitShipperOrderChangeRequest');
    expect(source).toContain('change_requested');
    expect(source).toContain('SubmitShipperOrderEvaluationRequest');
    expect(source).toContain('evaluation_submitted');
    expect(source).toContain('ShipperOrder');
    expect(source).toContain('ShipperOrderListResponse');
    expect(source).toContain('ORDER_STATE_INVALID');
    expect(source).toContain('name: statuses');
    expect(source).toContain('loading,transporting');
    expect(source).toContain('name: keyword');
    expect(source).toContain('name: createdFromIso');
    expect(source).toContain('name: createdToIso');
    expectPathBlockToContain(
      source,
      '/shipper/orders',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expectPathBlockToContain(
      source,
      '/shipper/orders/{orderId}',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
  });

  it('documents the current shipper order draft endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/order-draft:');
    expect(source).toContain('Get current shipper order draft');
    expect(source).toContain('Save current shipper order draft');
    expect(source).toContain('SaveShipperOrderDraftRequest');
    expect(source).toContain('ShipperOrderDraftResponse');
    expect(source).toContain('draftSnapshot');
    expect(source).toContain('clientUpdatedAtIso');
    expect(source).toContain('baseUpdatedAtIso');
    expect(source).toContain("'409':");
    expect(source).toContain('ORDER_DRAFT_CONFLICT');
    expect(source).toContain(
      'Drafts older than 24 hours are treated as missing and return null data.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/order-draft',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
  });

  it('documents driver order hall and first-slice order actions', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/driver/order-hall:');
    expect(source).toContain('/driver/settings/acceptance:');
    expect(source).toContain('/driver/income:');
    expect(source).toContain('/driver/withdrawals:');
    expect(source).toContain('/driver/orders:');
    expect(source).toContain('/driver/orders/{orderId}:');
    expect(source).toContain('/driver/orders/{orderId}/quote:');
    expect(source).toContain('/driver/orders/{orderId}/accept:');
    expect(source).toContain('/driver/orders/{orderId}/status:');
    expect(source).toContain('/driver/orders/{orderId}/evaluation-reply:');
    expect(source).toContain('/driver/orders/{orderId}/shipper-evaluation:');
    expect(source).toContain('DriverOrderHallResponse');
    expect(source).toContain('DriverMyOrdersResponse');
    expect(source).toContain('DriverAcceptanceSettingsResponse');
    expect(source).toContain('DriverIncomeResponse');
    expect(source).toContain('DriverIncomeOverview');
    expect(source).toContain('DriverIncomeSummary');
    expect(source).toContain('DriverIncomeRecord');
    expect(source).toContain('DriverWithdrawalListResponse');
    expect(source).toContain('DriverWithdrawalResponse');
    expect(source).toContain('DriverWithdrawalStatus');
    expect(source).toContain('DriverQuoteOrderRequest');
    expect(source).toContain('DriverAcceptOrderRequest');
    expect(source).toContain('DriverAdvanceOrderStatusRequest');
    expect(source).toContain('DriverReplyEvaluationRequest');
    expect(source).toContain('DriverEvaluateShipperRequest');
    expect(source).toContain('SaveDriverAcceptanceSettingsRequest');
    expect(source).toContain('CreateDriverWithdrawalRequest');
    expect(source).toContain('availableWithdrawalCents');
    expect(source).toContain('reviewingWithdrawalCents');
    expect(source).toContain('bankAccountMasked');
    expect(source).toContain('DRIVER_WITHDRAWAL_BALANCE_INSUFFICIENT');
    expect(source).toContain('receiptPhotoFileIds');
    expect(source).toContain('Driver execution receipt proof file ids');
    expect(source).toContain('use receipt purpose');
    expect(source).toContain('maxDistanceKm');
    expect(source).toContain('vehicleTypePreferences');
    expect(source).toContain('This first slice stores online/offline status');
    expect(source).toContain('driver_quote_submitted');
    expect(source).toContain('driver_accepted');
    expect(source).toContain('driver_status_changed');
    expect(source).toContain('evaluation_replied');
    expect(source).toContain('shipper_evaluation_submitted');
    expect(source).toContain('AUTH_FORBIDDEN');
  });

  it('documents driver identity and vehicle certification endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/driver/certification:');
    expect(source).toContain('/driver/certification/identity:');
    expect(source).toContain('/driver/certification/vehicle:');
    expect(source).toContain('DriverCertificationResponse');
    expect(source).toContain('DriverCertificationSnapshot');
    expect(source).toContain('DriverCertificationDriver');
    expect(source).toContain('DriverIdentityCertification');
    expect(source).toContain('DriverVehicleCertification');
    expect(source).toContain('DriverCertificationStatus');
    expect(source).toContain('SubmitDriverIdentityCertificationRequest');
    expect(source).toContain('SubmitDriverVehicleCertificationRequest');
    expect(source).toContain('unsubmitted, reviewing, approved, rejected');
    expect(source).toContain('Certification file ids must belong to the current driver, be uploaded, and use identity purpose.');
    expect(source).toContain('FILE_PURPOSE_INVALID');
    expect(source).toContain('认证附件用途不匹配');
    expect(source).toContain('required: [realName, identityNumber, identityFrontFileId, identityBackFileId]');
    expect(source).toContain('required: [plateNumber, vehicleType, vehicleLengthText, loadCapacityText, hasTailboard, drivingLicenseFileId, driverLicenseFileId, transportQualificationFileId, operationPermitFileId, vehiclePhotoFileId]');
    expect(source).toContain('driverLicenseFileId');
    expect(source).toContain('transportQualificationFileId');
    expect(source).toContain('operationPermitFileId');
  });

  it('documents driver order action certification gates', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('DRIVER_ACCEPTANCE_OFFLINE');
    expect(source).toContain('司机当前处于离线接单状态');
    expect(source).toContain('DRIVER_CERTIFICATION_REQUIRED');
    expect(source).toContain('司机实名和车辆认证通过后才能接单');
    expect(source).toContain('Driver identity or vehicle certification is not approved');
  });

  it('documents admin driver certification review endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/driver-certifications:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/identity/review:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/vehicle/review:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/attachments:');
    expect(source).toContain('/admin/driver-certifications/{driverId}/review-events:');
    expect(source).toContain('List driver certifications for admin review');
    expect(source).toContain('Get driver certification attachment previews');
    expect(source).toContain('List driver certification review audit events');
    expect(source).toContain('DriverCertificationListResponse');
    expect(source).toContain('DriverCertificationAttachmentPreviewResponse');
    expect(source).toContain('DriverCertificationReviewEventResponse');
    expect(source).toContain('name: status');
    expect(source).toContain('reviewing');
    expect(source).toContain('Review driver identity certification');
    expect(source).toContain('Review driver vehicle certification');
    expect(source).toContain('ReviewDriverCertificationRequest');
    expect(source).toContain('DriverCertificationReviewEvent');
    expect(source).toContain('DriverCertificationAttachmentPreview');
    expect(source).toContain('identityFront');
    expect(source).toContain('driverLicense');
    expect(source).toContain('transportQualification');
    expect(source).toContain('operationPermit');
    expect(source).toContain('vehiclePhoto');
    expect(source).toContain('previewUrl');
    expect(source).toContain('previewExpiresAtIso');
    expect(source).toContain('Signed short-lived preview URL');
    expect(source).toContain('reviewerAdminId');
    expect(source).toContain('fromStatus');
    expect(source).toContain('toStatus');
    expect(source).toContain('enum: [approved, rejected]');
    expect(source).toContain('DRIVER_CERTIFICATION_NOT_FOUND');
    expect(source).toContain('司机认证记录不存在');
    expect(source).toContain('Current authenticated user is not an admin');
    expect(source).toContain('driver phone');
  });

  it('documents file upload intent and confirmation endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/upload-intents:');
    expect(source).toContain('/files/{fileId}:');
    expect(source).toContain('Get current user file metadata');
    expect(source).toContain('/files/{fileId}/uploaded:');
    expect(source).toContain('/files/uploads/{fileId}:');
    expect(source).toContain('Confirm local upload target');
    expect(source).toContain('application/octet-stream');
    expect(source).toContain('format: binary');
    expect(source).toContain('CreateFileUploadIntentRequest');
    expect(source).toContain('ConfirmFileUploadedRequest');
    expect(source).toContain('FileUploadIntentResponse');
    expect(source).toContain('FileUploadRecordResponse');
    expect(source).toContain('FILE_NOT_FOUND');
    expect(source).toContain('FILE_STATE_INVALID');
    expect(source).toContain('identity');
    expect(source).toContain('cargo');
    expect(source).toContain('exception');
    expect(source).toContain('evaluation');
  });

  it('documents S3 compatible storage callback confirmation', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/storage-callbacks/s3-compatible:');
    expect(source).toContain('Confirm S3 compatible storage callback');
    expect(source).toContain(
      'Valid repeated callbacks with matching metadata are idempotent.',
    );
    expect(source).toContain('ConfirmStorageCallbackRequest');
    expect(source).toContain('required: [fileId, objectKey, byteSize, contentType, signature]');
    expect(source).toContain('FILE_STORAGE_CALLBACK_INVALID');
    expect(source).toContain('对象存储回调签名无效');
    expect(source).toContain('etag');
    expect(source).toContain('versionId');
    expectPathBlockToContain(
      source,
      '/files/storage-callbacks/s3-compatible',
      "$ref: '#/components/schemas/ConfirmStorageCallbackRequest'",
    );
    expectPathBlockToContain(
      source,
      '/files/storage-callbacks/s3-compatible',
      "$ref: '#/components/schemas/FileUploadRecordResponse'",
    );
  });

  it('documents admin maintenance cleanup for expired pending files', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/maintenance/reject-expired-pending:');
    expect(source).toContain('/files/maintenance/summary:');
    expect(source).toContain('/files/maintenance/delete-rejected-objects:');
    expect(source).toContain('Reject expired pending file upload intents');
    expect(source).toContain('Get file maintenance summary');
    expect(source).toContain('Retry rejected file object deletion');
    expect(source).toContain('RejectExpiredPendingFilesResponse');
    expect(source).toContain('RejectExpiredPendingFilesResult');
    expect(source).toContain('DeleteRejectedFileObjectsResponse');
    expect(source).toContain('DeleteRejectedFileObjectsResult');
    expect(source).toContain('FileMaintenanceSummaryResponse');
    expect(source).toContain('FileMaintenanceSummaryResult');
    expect(source).toContain('attemptedObjectCount');
    expect(source).toContain('rejectedCount');
    expect(source).toContain('deletedObjectCount');
    expect(source).toContain('failedObjectDeletionCount');
    expect(source).toContain('expiredPendingCount');
    expect(source).toContain('cutoffIso');
    expectPathBlockToContain(
      source,
      '/files/maintenance/summary',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/summary',
      "$ref: '#/components/schemas/FileMaintenanceSummaryResponse'",
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/reject-expired-pending',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/reject-expired-pending',
      'AUTH_FORBIDDEN',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/reject-expired-pending',
      'Current authenticated user is not an admin',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/delete-rejected-objects',
      'bearerAuth: []',
    );
    expectPathBlockToContain(
      source,
      '/files/maintenance/delete-rejected-objects',
      "$ref: '#/components/schemas/DeleteRejectedFileObjectsResponse'",
    );
  });

  it('documents signed file preview metadata endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/files/previews/{objectKey}:');
    expect(source).toContain('/files/preview-contents/{objectKey}:');
    expect(source).toContain('Get signed file preview metadata');
    expect(source).toContain('Get signed file preview content');
    expect(source).toContain(
      'Returns uploaded file metadata after validating the short-lived preview signature.',
    );
    expect(source).toContain(
      'Returns the local binary file content after validating the short-lived preview signature.',
    );
    expect(source).toContain(
      'The objectKey path value is the wildcard suffix after /files/previews/ and may contain slashes.',
    );
    expect(source).toContain('application/octet-stream');
    expect(source).toContain('image/png');
    expect(source).toContain('name: expiresAtIso');
    expect(source).toContain('name: signature');
    expect(source).toContain('FilePreviewMetadataResponse');
    expect(source).toContain('FILE_PREVIEW_SIGNATURE_INVALID');
    expect(source).toContain('预览链接无效或已过期');
  });

  it('documents the current shipper profile address book endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/address-book:');
    expect(source).toContain('Get current shipper profile address book');
    expect(source).toContain('Save current shipper profile address book');
    expect(source).toContain('SaveShipperProfileAddressBookRequest');
    expect(source).toContain('ShipperProfileAddressBookResponse');
    expect(source).toContain('ShipperProfileAddressBookAddress');
    expect(source).toContain('ShipperProfileAddressBookContact');
    expect(source).toContain('maxItems: 20');
    expect(source).toContain('maxItems: 50');
    expect(source).toContain('baseUpdatedAtIso');
    expect(source).toContain('PROFILE_ADDRESS_BOOK_CONFLICT');
    expect(source).toContain(
      'The address book has been updated by another device after the client',
    );
    expect(source).toContain(
      'It does not sync identity verification, coupons, invoices or account security settings.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile account endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/account:');
    expect(source).toContain('Get current shipper profile account');
    expect(source).toContain('Save current shipper profile account');
    expect(source).toContain('SaveShipperProfileAccountRequest');
    expect(source).toContain('ShipperProfileAccountResponse');
    expect(source).toContain(
      'It does not sync bound phone rebind, avatar files or account security settings.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile identity verification endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/identity-verification:');
    expect(source).toContain('Get current shipper identity verification');
    expect(source).toContain('Save current shipper identity verification');
    expect(source).toContain('SaveShipperIdentityVerificationRequest');
    expect(source).toContain('ShipperIdentityVerificationResponse');
    expect(source).toContain('identityFrontFileId');
    expect(source).toContain('faceVerified');
    expect(source).toContain('ShipperProfileVerificationStatus');
    expect(source).toContain(
      'It does not include third-party face recognition SDK callbacks, admin review, or approval result push.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile enterprise verification endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/enterprise-verification:');
    expect(source).toContain('Get current shipper enterprise verification');
    expect(source).toContain('Save current shipper enterprise verification');
    expect(source).toContain('SaveShipperEnterpriseVerificationRequest');
    expect(source).toContain('ShipperEnterpriseVerificationResponse');
    expect(source).toContain('licenseFileId');
    expect(source).toContain('creditCode');
    expect(source).toContain(
      'It does not include admin review, invoice issuance, or tax status callbacks.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile invoice application endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/invoices:');
    expect(source).toContain('List current shipper invoice applications');
    expect(source).toContain('Create current shipper invoice application');
    expect(source).toContain('CreateShipperInvoiceApplicationRequest');
    expect(source).toContain('ShipperInvoiceApplicationListResponse');
    expect(source).toContain('ShipperInvoiceApplicationResponse');
    expect(source).toContain('ShipperInvoiceType');
    expect(source).toContain('ShipperInvoiceTitleType');
    expect(source).toContain('ShipperInvoiceApplicationStatus');
    expect(source).toContain('uniqueItems: true');
    expect(source).toContain(
      'payablePriceCents when present, otherwise falls back to priceCents',
    );
    expect(source).toContain('增值税专用发票需先提交企业认证资料');
    expect(source).toContain('订单已存在开票申请');
    expectPathBlockToContain(
      source,
      '/shipper/profile/invoices',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper spending record endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/spending-records:');
    expect(source).toContain('List current shipper spending records');
    expect(source).toContain('ShipperSpendingRecordsResponse');
    expect(source).toContain('ShipperSpendingSnapshot');
    expect(source).toContain('ShipperSpendingSummary');
    expect(source).toContain('ShipperSpendingRecord');
    expect(source).toContain('completedTotalCents');
    expect(source).toContain('activeTotalCents');
    expect(source).toContain('refundTotalCents');
    expect(source).toContain('routeText');
    expect(source).toContain(
      'It is a spending snapshot derived from order payment fields and does not represent real payment, escrow, or refund ledger entries.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/spending-records',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the current shipper profile evaluation endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/evaluations:');
    expect(source).toContain('/shipper/profile/evaluations/received:');
    expect(source).toContain('List current shipper profile evaluations');
    expect(source).toContain('List current shipper received evaluations');
    expect(source).toContain('ShipperProfileEvaluationSnapshotResponse');
    expect(source).toContain('ShipperProfileEvaluationSnapshot');
    expect(source).toContain('ShipperProfileEvaluationRecord');
    expect(source).toContain('ShipperReceivedEvaluationSnapshotResponse');
    expect(source).toContain('ShipperReceivedEvaluationSnapshot');
    expect(source).toContain('ShipperReceivedEvaluationRecord');
    expect(source).toContain('photoFileIds');
    expect(source).toContain('driverReplyText');
    expect(source).toContain(
      'It is derived from order evaluation_submitted events and merges driver evaluation_replied events when present.',
    );
    expect(source).toContain(
      'It is derived from order shipper_evaluation_submitted events.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/evaluations',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/evaluations/received',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the admin evaluation audit endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/evaluations:');
    expect(source).toContain('List admin evaluation audit records');
    expect(source).toContain('AdminEvaluationAuditListResponse');
    expect(source).toContain('AdminEvaluationAuditRecord');
    expect(source).toContain('AdminEvaluationDirection');
    expect(source).toContain('shipper_to_driver');
    expect(source).toContain('driver_to_shipper');
    expect(source).toContain(
      'It is derived from order evaluation_submitted and shipper_evaluation_submitted events.',
    );
    expectPathBlockToContain(
      source,
      '/admin/evaluations',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not an admin');
  });

  it('documents the current shipper coupon wallet endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/coupons:');
    expect(source).toContain('List current shipper coupon wallet');
    expect(source).toContain('ShipperCouponWalletResponse');
    expect(source).toContain('ShipperCouponWallet');
    expect(source).toContain('ShipperCouponSummary');
    expect(source).toContain('ShipperCouponRecord');
    expect(source).toContain('enum: [usable, locked, used, expired]');
    expect(source).toContain('usableCount');
    expect(source).toContain('lockedCount');
    expect(source).toContain('usedCount');
    expect(source).toContain('expiredCount');
    expect(source).toContain('lockedOrderNo');
    expect(source).toContain('lockedAtIso');
    expect(source).toContain('usedOrderNo');
    expect(source).toContain(
      'order creation/update/cancel/complete can lock, release and redeem existing coupons.',
    );
    expectPathBlockToContain(
      source,
      '/shipper/profile/coupons',
      "$ref: '#/components/responses/ShipperOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });

  it('documents the admin manual shipper coupon issue endpoint', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/admin/shipper-coupons:');
    expect(source).toContain('Issue a shipper coupon manually');
    expect(source).toContain('IssueShipperCouponRequest');
    expect(source).toContain('ShipperCouponRecordResponse');
    expect(source).toContain('discountCents');
    expect(source).toContain('minOrderAmountCents');
    expectPathBlockToContain(
      source,
      '/admin/shipper-coupons',
      "$ref: '#/components/responses/AdminOnlyError'",
    );
    expect(source).toContain('Current authenticated user is not an admin');
  });

  it('documents the current shipper profile frequent routes endpoints', () => {
    const source = readFileSync(openApiPath, 'utf8');

    expect(source).toContain('/shipper/profile/frequent-routes:');
    expect(source).toContain('Get current shipper profile frequent routes');
    expect(source).toContain('Save current shipper profile frequent routes');
    expect(source).toContain('SaveShipperProfileFrequentRoutesRequest');
    expect(source).toContain('ShipperProfileFrequentRoutesResponse');
    expect(source).toContain('ShipperFrequentRoute');
    expect(source).toContain('maxItems: 20');
    expect(source).toContain('PROFILE_FREQUENT_ROUTES_CONFLICT');
    expect(source).toContain(
      'The frequent routes snapshot has been updated by another device after the client',
    );
    expect(source).toContain(
      'It does not sync completed order route mining, dispatch recommendations or driver route preferences.',
    );
    expect(source).toContain('Current authenticated user is not a shipper');
  });
});

function expectPathBlockToContain(source: string, path: string, expected: string) {
  const pathStart = source.indexOf(`  ${path}:`);

  expect(pathStart).toBeGreaterThanOrEqual(0);

  const nextPathStart = source.indexOf('\n  /', pathStart + 1);
  const pathBlock =
    nextPathStart === -1
      ? source.slice(pathStart)
      : source.slice(pathStart, nextPathStart);

  expect(pathBlock).toContain(expected);
}

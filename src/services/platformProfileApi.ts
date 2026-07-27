import {
  PlatformApiError,
  type PlatformApiErrorBody,
  platformGet,
  platformPost,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';
import type { PlatformFileUploadRecord } from './platformFileApi';
import type { PlatformPaymentStatus } from './platformPaymentApi';
import type { OrderPaymentStatus, PaymentChannel } from '../types';

export type PlatformProfileAddressBookAddress = {
  id: string;
  name: string;
  address: string;
  contactText: string;
  tagText?: string;
};

export type PlatformProfileAddressBookContact = {
  id: string;
  name: string;
  roleText: string;
  phoneText: string;
  noteText?: string;
};

export type PlatformSaveProfileAccountRequest = {
  displayName: string;
  avatarFileId?: string | null;
  phone?: string;
  phoneProtectionEnabled?: boolean;
  loginProtectionEnabled?: boolean;
  orderNotificationEnabled?: boolean;
  promotionNotificationEnabled?: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string;
  privacyPolicyVersionTitle?: string;
};

export type PlatformProfileAccount = {
  shipperId: string;
  displayName: string;
  phone: string;
  phoneProtectionEnabled: boolean;
  loginProtectionEnabled: boolean;
  orderNotificationEnabled: boolean;
  promotionNotificationEnabled: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string;
  privacyPolicyVersionTitle?: string;
  avatarFileId?: string;
  avatarPublicUrl?: string;
};

export type PlatformProfileVerificationStatus =
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type PlatformAdminShipperVerificationType =
  | 'identity'
  | 'enterprise';

export type PlatformSaveProfileIdentityVerificationRequest = {
  realName: string;
  idNumber: string;
  identityFrontFileId: string;
  identityBackFileId: string;
  faceVerified: true;
};

export type PlatformProfileIdentityVerification =
  PlatformSaveProfileIdentityVerificationRequest & {
    shipperId: string;
    status: PlatformProfileVerificationStatus;
    rejectionReason?: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

export type PlatformSaveProfileEnterpriseVerificationRequest = {
  enterpriseName: string;
  creditCode: string;
  legalName: string;
  legalId: string;
  enterprisePhone: string;
  licenseFileId: string;
};

export type PlatformProfileEnterpriseVerification =
  PlatformSaveProfileEnterpriseVerificationRequest & {
    shipperId: string;
    status: PlatformProfileVerificationStatus;
    rejectionReason?: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

export type PlatformAdminShipperVerificationReviewRequest =
  | {
      status: 'approved';
    }
  | {
      status: 'rejected';
      rejectionReason: string;
    };

export type PlatformListAdminShipperVerificationQuery = {
  status?: Extract<
    PlatformProfileVerificationStatus,
    'reviewing' | 'approved' | 'rejected'
  >;
  type?: PlatformAdminShipperVerificationType;
  page?: number;
  pageSize?: number;
};

export type PlatformAdminShipperVerificationSnapshot = {
  shipperId: string;
  identity?: PlatformProfileIdentityVerification;
  enterprise?: PlatformProfileEnterpriseVerification;
};

export type PlatformAdminShipperVerificationListResult = {
  items: PlatformAdminShipperVerificationSnapshot[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminShipperVerificationAttachmentType =
  | 'identityFront'
  | 'identityBack'
  | 'license';

export type PlatformAdminShipperVerificationAttachmentRecord =
  PlatformFileUploadRecord & {
    attachmentType: PlatformAdminShipperVerificationAttachmentType;
    previewUrl?: string;
    previewExpiresAtIso?: string;
  };

export type PlatformAdminShipperVerificationAttachmentPreview = {
  shipperId: string;
  identity: {
    identityFront?: PlatformAdminShipperVerificationAttachmentRecord;
    identityBack?: PlatformAdminShipperVerificationAttachmentRecord;
  };
  enterprise: {
    license?: PlatformAdminShipperVerificationAttachmentRecord;
  };
};

export type PlatformAdminShipperVerificationReviewEventType =
  | 'shipper_identity_verification_submitted'
  | 'shipper_identity_verification_approved'
  | 'shipper_identity_verification_rejected'
  | 'shipper_enterprise_verification_submitted'
  | 'shipper_enterprise_verification_approved'
  | 'shipper_enterprise_verification_rejected';

export type PlatformAdminShipperVerificationReviewEventStage =
  | 'submitted'
  | 'approved'
  | 'rejected';

export type PlatformAdminShipperVerificationReviewEvent = {
  eventId: string;
  verificationType: PlatformAdminShipperVerificationType;
  actorUserId?: string;
  eventType: PlatformAdminShipperVerificationReviewEventType;
  stage: PlatformAdminShipperVerificationReviewEventStage;
  noteText?: string;
  createdAtIso: string;
};

export type PlatformProfileInvoiceType = 'normal' | 'vat-special';

export type PlatformProfileInvoiceTitleType = 'personal' | 'enterprise';

export type PlatformCreateProfileInvoiceApplicationRequest = {
  invoiceType: PlatformProfileInvoiceType;
  invoiceTitleType: PlatformProfileInvoiceTitleType;
  invoiceTitle: string;
  receiverEmail: string;
  orderIds: string[];
};

export type PlatformProfileInvoiceApplication =
  PlatformCreateProfileInvoiceApplicationRequest & {
    id: string;
    shipperId: string;
    orderNos: string[];
    amountCents: number;
    status: PlatformProfileVerificationStatus;
    rejectionReason?: string;
    createdAtIso: string;
    updatedAtIso: string;
  };

export type PlatformAdminShipperInvoiceReviewRequest =
  | {
      status: 'approved';
    }
  | {
      status: 'rejected';
      rejectionReason: string;
    };

export type PlatformListAdminShipperInvoiceQuery = {
  status?: PlatformProfileVerificationStatus;
  page?: number;
  pageSize?: number;
};

export type PlatformAdminShipperInvoiceListResult = {
  items: PlatformProfileInvoiceApplication[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminShipperInvoiceReviewEventType =
  | 'invoice_application_submitted'
  | 'invoice_application_approved'
  | 'invoice_application_rejected';

export type PlatformAdminShipperInvoiceReviewEventStage =
  | 'submitted'
  | 'approved'
  | 'rejected';

export type PlatformAdminShipperInvoiceReviewEvent = {
  eventId: string;
  actorUserId?: string;
  reviewerAdminId?: string;
  fromStatus?: PlatformProfileVerificationStatus;
  toStatus?: Extract<
    PlatformProfileVerificationStatus,
    'approved' | 'rejected'
  >;
  eventType: PlatformAdminShipperInvoiceReviewEventType;
  stage: PlatformAdminShipperInvoiceReviewEventStage;
  noteText?: string;
  createdAtIso: string;
};

export type PlatformProfileInvoiceDownloadFile = {
  filename: string;
  contentType: string;
  content: string;
};

export type PlatformProfileSpendingStatus =
  | 'waiting'
  | 'loading'
  | 'transporting'
  | 'confirming'
  | 'completed'
  | 'cancelled';

export type PlatformProfileSpendingPaymentMethod = 'cod' | 'online';

export type PlatformProfileSpendingRefundStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed';

export type PlatformProfileSpendingSummary = {
  completedTotalCents: number;
  activeTotalCents: number;
  refundTotalCents: number;
};

export type PlatformProfileSpendingRecord = {
  orderId: string;
  orderNo: string;
  status: PlatformProfileSpendingStatus;
  paymentMethod: PlatformProfileSpendingPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  paymentChannel?: PaymentChannel;
  paymentOrderStatus?: PlatformPaymentStatus;
  refundStatus?: PlatformProfileSpendingRefundStatus;
  amountCents: number;
  refundAmountCents?: number;
  priceCents?: number;
  payablePriceCents?: number;
  couponTitle?: string;
  couponDiscountCents?: number;
  occurredAtIso: string;
  paidAtIso?: string;
  settledAtIso?: string;
  refundedAtIso?: string;
  routeText: string;
};

export type PlatformProfileSpendingSnapshot = {
  shipperId: string;
  summary: PlatformProfileSpendingSummary;
  items: PlatformProfileSpendingRecord[];
};

export type PlatformProfileCouponStatus =
  | 'usable'
  | 'locked'
  | 'used'
  | 'expired';

export type PlatformProfileCouponSummary = {
  usableCount: number;
  lockedCount: number;
  usedCount: number;
  expiredCount: number;
};

export type PlatformProfileCouponRecord = {
  id: string;
  shipperId: string;
  title: string;
  status: PlatformProfileCouponStatus;
  conditionText: string;
  discountCents: number;
  minOrderAmountCents: number;
  validFromIso: string;
  validUntilIso: string;
  sourceText: string;
  issuedAtIso: string;
  lockedOrderNo?: string;
  lockedAtIso?: string;
  usedOrderNo?: string;
  usedAtIso?: string;
};

export type PlatformProfileCouponWallet = {
  shipperId: string;
  summary: PlatformProfileCouponSummary;
  items: PlatformProfileCouponRecord[];
};

export type PlatformAdminIssueShipperCouponTemplate = {
  title: string;
  conditionText: string;
  discountCents: number;
  minOrderAmountCents: number;
  validFromIso: string;
  validUntilIso: string;
  sourceText?: string;
};

export type PlatformAdminIssueShipperCouponRequest =
  PlatformAdminIssueShipperCouponTemplate & {
    shipperId: string;
  };

export type PlatformAdminBatchIssueShipperCouponsRequest =
  PlatformAdminIssueShipperCouponTemplate & {
    shipperIds: string[];
  };

export type PlatformAdminBatchIssueShipperCouponsResult = {
  requestedCount: number;
  issuedCount: number;
  coupons: PlatformProfileCouponRecord[];
};

export type PlatformAdminShipperCouponReportQuery = {
  topShippersLimit?: number;
};

export type PlatformAdminShipperCouponReportSummary = {
  totalCount: number;
  usableCount: number;
  lockedCount: number;
  usedCount: number;
  expiredCount: number;
  totalDiscountCents: number;
  redeemedDiscountCents: number;
};

export type PlatformAdminShipperCouponReportSourceBreakdownItem = {
  sourceText: string;
  totalCount: number;
  usedCount: number;
  redeemedDiscountCents: number;
};

export type PlatformAdminShipperCouponReportTopShipperItem =
  PlatformAdminShipperCouponReportSummary & {
    shipperId: string;
    latestIssuedAtIso: string;
  };

export type PlatformAdminShipperCouponReport = {
  generatedAtIso: string;
  summary: PlatformAdminShipperCouponReportSummary;
  sourceBreakdown: PlatformAdminShipperCouponReportSourceBreakdownItem[];
  topShippers: PlatformAdminShipperCouponReportTopShipperItem[];
};

export type PlatformProfileEvaluationRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  driverName: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount: number;
  photoFileIds?: string[];
  submittedAtIso: string;
  driverReplyText?: string;
  driverReplyAtIso?: string;
};

export type PlatformProfileEvaluationSnapshot = {
  shipperId: string;
  items: PlatformProfileEvaluationRecord[];
};

export type PlatformProfileReceivedEvaluationRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  driverName: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount: number;
  photoFileIds?: string[];
  submittedAtIso: string;
};

export type PlatformProfileReceivedEvaluationSnapshot = {
  shipperId: string;
  items: PlatformProfileReceivedEvaluationRecord[];
};

export type PlatformAdminEvaluationDirection =
  | 'shipper_to_driver'
  | 'driver_to_shipper';

export type PlatformAdminEvaluationModerationStatus = 'visible' | 'hidden';

export type PlatformAdminEvaluationAuditListQuery = {
  page?: number;
  pageSize?: number;
  direction?: PlatformAdminEvaluationDirection;
  moderationStatus?: PlatformAdminEvaluationModerationStatus;
  rating?: number;
  keyword?: string;
};

export type PlatformAdminEvaluationAuditRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  direction: PlatformAdminEvaluationDirection;
  reviewerUserId: string;
  reviewerName: string;
  revieweeUserId: string;
  revieweeName: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount: number;
  photoFileIds?: string[];
  submittedAtIso: string;
  moderationStatus: PlatformAdminEvaluationModerationStatus;
  moderationVersion: number;
  moderationReason?: string;
  moderatedByAdminId?: string;
  moderatedAtIso?: string;
};

export type PlatformAdminEvaluationAuditListResult = {
  items: PlatformAdminEvaluationAuditRecord[];
  page: number;
  pageSize: number;
  total: number;
};

export type PlatformAdminEvaluationAuditAttachmentRecord =
  PlatformFileUploadRecord & {
    previewUrl?: string;
    previewExpiresAtIso?: string;
  };

export type PlatformAdminEvaluationAuditAttachmentPreview = {
  evaluationId: string;
  orderId: string;
  orderNo: string;
  photoCount: number;
  items: PlatformAdminEvaluationAuditAttachmentRecord[];
  missingFileIds: string[];
};

export type PlatformModerateAdminEvaluationRequest = {
  status: PlatformAdminEvaluationModerationStatus;
  reason: string;
  baseModerationVersion: number;
};

export type PlatformAdminEvaluationModerationEventRecord = {
  id: string;
  evaluationId: string;
  adminUserId: string;
  fromStatus: PlatformAdminEvaluationModerationStatus;
  toStatus: PlatformAdminEvaluationModerationStatus;
  reason: string;
  fromVersion: number;
  toVersion: number;
  createdAtIso: string;
};

export type PlatformSaveProfileAddressBookRequest = {
  addresses: PlatformProfileAddressBookAddress[];
  contacts: PlatformProfileAddressBookContact[];
  clientUpdatedAtIso?: string;
  baseUpdatedAtIso?: string;
};

export type PlatformProfileAddressBook =
  PlatformSaveProfileAddressBookRequest & {
    shipperId: string;
    updatedAtIso: string;
  };

export function createPlatformProfileApi(config: PlatformApiConfig) {
  return {
    getAccountProfile() {
      return platformGet<PlatformProfileAccount | null>(
        config,
        '/shipper/profile/account',
      );
    },
    async saveAccountProfile(request: PlatformSaveProfileAccountRequest) {
      const normalizedRequest = normalizeSaveProfileAccountRequest(request);

      return platformPut<
        PlatformSaveProfileAccountRequest,
        PlatformProfileAccount
      >(config, '/shipper/profile/account', normalizedRequest);
    },
    getIdentityVerification() {
      return platformGet<PlatformProfileIdentityVerification | null>(
        config,
        '/shipper/profile/identity-verification',
      );
    },
    async saveIdentityVerification(
      request: PlatformSaveProfileIdentityVerificationRequest,
    ) {
      const normalizedRequest =
        normalizeSaveProfileIdentityVerificationRequest(request);

      return platformPut<
        PlatformSaveProfileIdentityVerificationRequest,
        PlatformProfileIdentityVerification
      >(
        config,
        '/shipper/profile/identity-verification',
        normalizedRequest,
      );
    },
    getEnterpriseVerification() {
      return platformGet<PlatformProfileEnterpriseVerification | null>(
        config,
        '/shipper/profile/enterprise-verification',
      );
    },
    async saveEnterpriseVerification(
      request: PlatformSaveProfileEnterpriseVerificationRequest,
    ) {
      const normalizedRequest =
        normalizeSaveProfileEnterpriseVerificationRequest(request);

      return platformPut<
        PlatformSaveProfileEnterpriseVerificationRequest,
        PlatformProfileEnterpriseVerification
      >(
        config,
        '/shipper/profile/enterprise-verification',
        normalizedRequest,
      );
    },
    async listAdminVerifications(
      query: PlatformListAdminShipperVerificationQuery = {},
    ) {
      const normalizedQuery = normalizeListAdminShipperVerificationQuery(query);

      return platformGet<PlatformAdminShipperVerificationListResult>(
        config,
        `/admin/shipper-verifications?${new URLSearchParams(
          normalizedQuery,
        ).toString()}`,
      );
    },
    async getAdminVerification(shipperId: string) {
      return platformGet<PlatformAdminShipperVerificationSnapshot>(
        config,
        `/admin/shipper-verifications/${encodeURIComponent(
          normalizeAdminShipperVerificationShipperId(shipperId),
        )}`,
      );
    },
    async listAdminVerificationReviewEvents(shipperId: string) {
      return platformGet<PlatformAdminShipperVerificationReviewEvent[]>(
        config,
        `/admin/shipper-verifications/${encodeURIComponent(
          normalizeAdminShipperVerificationShipperId(shipperId),
        )}/review-events`,
      );
    },
    async listAdminVerificationAttachments(shipperId: string) {
      return platformGet<PlatformAdminShipperVerificationAttachmentPreview>(
        config,
        `/admin/shipper-verifications/${encodeURIComponent(
          normalizeAdminShipperVerificationShipperId(shipperId),
        )}/attachments`,
      );
    },
    async reviewAdminIdentityVerification(
      shipperId: string,
      request: PlatformAdminShipperVerificationReviewRequest,
    ) {
      return platformPost<
        PlatformAdminShipperVerificationReviewRequest,
        PlatformAdminShipperVerificationSnapshot
      >(
        config,
        `/admin/shipper-verifications/${encodeURIComponent(
          normalizeAdminShipperVerificationShipperId(shipperId),
        )}/identity/review`,
        normalizeAdminShipperVerificationReviewRequest(request),
      );
    },
    async reviewAdminEnterpriseVerification(
      shipperId: string,
      request: PlatformAdminShipperVerificationReviewRequest,
    ) {
      return platformPost<
        PlatformAdminShipperVerificationReviewRequest,
        PlatformAdminShipperVerificationSnapshot
      >(
        config,
        `/admin/shipper-verifications/${encodeURIComponent(
          normalizeAdminShipperVerificationShipperId(shipperId),
        )}/enterprise/review`,
        normalizeAdminShipperVerificationReviewRequest(request),
      );
    },
    getInvoices() {
      return platformGet<PlatformProfileInvoiceApplication[]>(
        config,
        '/shipper/profile/invoices',
      );
    },
    async downloadInvoiceApplication(applicationId: string) {
      return platformGetText(
        config,
        `/shipper/profile/invoices/${encodeURIComponent(
          normalizeInvoiceApplicationId(applicationId),
        )}/download`,
      );
    },
    getSpendingRecords() {
      return platformGet<PlatformProfileSpendingSnapshot>(
        config,
        '/shipper/profile/spending-records',
      );
    },
    getCoupons() {
      return platformGet<PlatformProfileCouponWallet>(
        config,
        '/shipper/profile/coupons',
      );
    },
    async issueAdminCoupon(
      request: PlatformAdminIssueShipperCouponRequest,
      idempotencyKey: string,
    ) {
      const normalizedRequest = normalizeAdminIssueShipperCouponRequest(request);
      const normalizedIdempotencyKey =
        normalizeAdminShipperCouponIdempotencyKey(idempotencyKey);

      return platformPost<
        PlatformAdminIssueShipperCouponRequest,
        PlatformProfileCouponRecord
      >(
        config,
        '/admin/shipper-coupons',
        normalizedRequest,
        createAdminShipperCouponMutationRequestOptions(
          normalizedIdempotencyKey,
        ),
      );
    },
    async batchIssueAdminCoupons(
      request: PlatformAdminBatchIssueShipperCouponsRequest,
      idempotencyKey: string,
    ) {
      const normalizedRequest =
        normalizeAdminBatchIssueShipperCouponsRequest(request);
      const normalizedIdempotencyKey =
        normalizeAdminShipperCouponIdempotencyKey(idempotencyKey);

      return platformPost<
        PlatformAdminBatchIssueShipperCouponsRequest,
        PlatformAdminBatchIssueShipperCouponsResult
      >(
        config,
        '/admin/shipper-coupons/batch-issue',
        normalizedRequest,
        createAdminShipperCouponMutationRequestOptions(
          normalizedIdempotencyKey,
        ),
      );
    },
    async getAdminCouponReport(
      query: PlatformAdminShipperCouponReportQuery = {},
    ) {
      const normalizedQuery = normalizeAdminShipperCouponReportQuery(query);

      return platformGet<PlatformAdminShipperCouponReport>(
        config,
        `/admin/shipper-coupons/report?${new URLSearchParams(
          normalizedQuery,
        ).toString()}`,
      );
    },
    getEvaluations() {
      return platformGet<PlatformProfileEvaluationSnapshot>(
        config,
        '/shipper/profile/evaluations',
      );
    },
    getReceivedEvaluations() {
      return platformGet<PlatformProfileReceivedEvaluationSnapshot>(
        config,
        '/shipper/profile/evaluations/received',
      );
    },
    async listAdminEvaluationAudits(
      query: PlatformAdminEvaluationAuditListQuery = {},
    ) {
      const normalizedQuery = normalizeAdminEvaluationAuditListQuery(query);

      return platformGet<PlatformAdminEvaluationAuditListResult>(
        config,
        `/admin/evaluations?${new URLSearchParams(normalizedQuery).toString()}`,
      );
    },
    async getAdminEvaluationAudit(evaluationId: string) {
      return platformGet<PlatformAdminEvaluationAuditRecord>(
        config,
        `/admin/evaluations/${encodeURIComponent(
          normalizeAdminEvaluationAuditId(evaluationId),
        )}`,
      );
    },
    async getAdminEvaluationAuditAttachments(evaluationId: string) {
      return platformGet<PlatformAdminEvaluationAuditAttachmentPreview>(
        config,
        `/admin/evaluations/${encodeURIComponent(
          normalizeAdminEvaluationAuditId(evaluationId),
        )}/attachments`,
      );
    },
    async listAdminEvaluationModerationEvents(evaluationId: string) {
      return platformGet<PlatformAdminEvaluationModerationEventRecord[]>(
        config,
        `/admin/evaluations/${encodeURIComponent(
          normalizeAdminEvaluationAuditId(evaluationId),
        )}/moderation-events`,
      );
    },
    async moderateAdminEvaluation(
      evaluationId: string,
      request: PlatformModerateAdminEvaluationRequest,
    ) {
      const normalizedRequest = normalizeModerateAdminEvaluationRequest(request);

      return platformPut<
        PlatformModerateAdminEvaluationRequest,
        PlatformAdminEvaluationAuditRecord
      >(
        config,
        `/admin/evaluations/${encodeURIComponent(
          normalizeAdminEvaluationAuditId(evaluationId),
        )}/moderation`,
        normalizedRequest,
      );
    },
    async createInvoiceApplication(
      request: PlatformCreateProfileInvoiceApplicationRequest,
    ) {
      const normalizedRequest =
        normalizeCreateProfileInvoiceApplicationRequest(request);

      return platformPost<
        PlatformCreateProfileInvoiceApplicationRequest,
        PlatformProfileInvoiceApplication
      >(config, '/shipper/profile/invoices', normalizedRequest);
    },
    async listAdminInvoiceApplications(
      query: PlatformListAdminShipperInvoiceQuery = {},
    ) {
      const normalizedQuery = normalizeListAdminShipperInvoiceQuery(query);

      return platformGet<PlatformAdminShipperInvoiceListResult>(
        config,
        `/admin/shipper-invoices?${new URLSearchParams(
          normalizedQuery,
        ).toString()}`,
      );
    },
    async getAdminInvoiceApplication(applicationId: string) {
      return platformGet<PlatformProfileInvoiceApplication>(
        config,
        `/admin/shipper-invoices/${encodeURIComponent(
          normalizeAdminShipperInvoiceApplicationId(applicationId),
        )}`,
      );
    },
    async listAdminInvoiceApplicationReviewEvents(applicationId: string) {
      return platformGet<PlatformAdminShipperInvoiceReviewEvent[]>(
        config,
        `/admin/shipper-invoices/${encodeURIComponent(
          normalizeAdminShipperInvoiceApplicationId(applicationId),
        )}/review-events`,
      );
    },
    async reviewAdminInvoiceApplication(
      applicationId: string,
      request: PlatformAdminShipperInvoiceReviewRequest,
    ) {
      return platformPost<
        PlatformAdminShipperInvoiceReviewRequest,
        PlatformProfileInvoiceApplication
      >(
        config,
        `/admin/shipper-invoices/${encodeURIComponent(
          normalizeAdminShipperInvoiceApplicationId(applicationId),
        )}/review`,
        normalizeAdminShipperInvoiceReviewRequest(request),
      );
    },
    async downloadAdminInvoiceApplication(applicationId: string) {
      return platformGetText(
        config,
        `/admin/shipper-invoices/${encodeURIComponent(
          normalizeAdminShipperInvoiceApplicationId(applicationId),
        )}/download`,
      );
    },
    getAddressBook() {
      return platformGet<PlatformProfileAddressBook | null>(
        config,
        '/shipper/profile/address-book',
      );
    },
    async saveAddressBook(request: PlatformSaveProfileAddressBookRequest) {
      const normalizedRequest = normalizeSaveProfileAddressBookRequest(request);

      return platformPut<
        PlatformSaveProfileAddressBookRequest,
        PlatformProfileAddressBook
      >(config, '/shipper/profile/address-book', normalizedRequest);
    },
  };
}

async function platformGetText(
  config: PlatformApiConfig,
  path: string,
): Promise<PlatformProfileInvoiceDownloadFile> {
  const accessToken = config.getAccessToken?.();
  const requestId = config.getRequestId?.();

  if (!accessToken) {
    throw new PlatformApiError(
      'Platform API access token is missing',
      'AUTH_ACCESS_TOKEN_MISSING',
      0,
    );
  }

  let response: Response;

  try {
    response = await fetch(createPlatformRequestUrl(config.baseUrl, path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
    });
  } catch {
    throw new PlatformApiError(
      'Platform API network request failed',
      'NETWORK_ERROR',
      0,
    );
  }

  if (!response.ok) {
    throw await createTextResponseApiError(response);
  }

  let content: string;

  try {
    content = await response.text();
  } catch {
    throw new PlatformApiError(
      'Platform API response is invalid',
      'PLATFORM_RESPONSE_INVALID',
      response.status,
    );
  }

  return {
    filename: extractDownloadFilename(
      response.headers.get('content-disposition'),
      'invoice.txt',
    ),
    contentType:
      response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
    content,
  };
}

function normalizeSaveProfileAccountRequest(
  request: PlatformSaveProfileAccountRequest,
): PlatformSaveProfileAccountRequest {
  if (!isPlainObject(request)) {
    throwInvalidAccountRequest('Account request must be an object');
  }

  return {
    displayName: normalizeRequiredString(
      request.displayName,
      30,
      'Account display name is invalid',
      throwInvalidAccountRequest,
    ),
    ...createOptionalAccountAvatarFields(request.avatarFileId),
    ...createOptionalAccountPhoneField(request.phone),
    ...createOptionalAccountSettingsFields(request),
  };
}

function normalizeSaveProfileIdentityVerificationRequest(
  request: PlatformSaveProfileIdentityVerificationRequest,
): PlatformSaveProfileIdentityVerificationRequest {
  if (!isPlainObject(request)) {
    throwInvalidIdentityVerificationRequest(
      'Identity verification request must be an object',
    );
  }

  const normalizedIdNumber = normalizeRequiredString(
    request.idNumber,
    18,
    'Identity verification id number is invalid',
    throwInvalidIdentityVerificationRequest,
  ).toUpperCase();

  if (!/^\d{17}[\dX]$/.test(normalizedIdNumber)) {
    throwInvalidIdentityVerificationRequest(
      'Identity verification id number is invalid',
    );
  }

  if (request.faceVerified !== true) {
    throwInvalidIdentityVerificationRequest(
      'Identity verification faceVerified is invalid',
    );
  }

  return {
    realName: normalizeRequiredString(
      request.realName,
      30,
      'Identity verification realName is invalid',
      throwInvalidIdentityVerificationRequest,
    ),
    idNumber: normalizedIdNumber,
    identityFrontFileId: normalizeRequiredString(
      request.identityFrontFileId,
      120,
      'Identity verification front file id is invalid',
      throwInvalidIdentityVerificationRequest,
    ),
    identityBackFileId: normalizeRequiredString(
      request.identityBackFileId,
      120,
      'Identity verification back file id is invalid',
      throwInvalidIdentityVerificationRequest,
    ),
    faceVerified: true,
  };
}

function normalizeSaveProfileEnterpriseVerificationRequest(
  request: PlatformSaveProfileEnterpriseVerificationRequest,
): PlatformSaveProfileEnterpriseVerificationRequest {
  if (!isPlainObject(request)) {
    throwInvalidEnterpriseVerificationRequest(
      'Enterprise verification request must be an object',
    );
  }

  const normalizedCreditCode = normalizeRequiredString(
    request.creditCode,
    20,
    'Enterprise verification creditCode is invalid',
    throwInvalidEnterpriseVerificationRequest,
  ).toUpperCase();
  const normalizedLegalId = normalizeRequiredString(
    request.legalId,
    18,
    'Enterprise verification legalId is invalid',
    throwInvalidEnterpriseVerificationRequest,
  ).toUpperCase();

  if (!/^[0-9A-Z]{15,20}$/.test(normalizedCreditCode)) {
    throwInvalidEnterpriseVerificationRequest(
      'Enterprise verification creditCode is invalid',
    );
  }

  if (!/^\d{17}[\dX]$/.test(normalizedLegalId)) {
    throwInvalidEnterpriseVerificationRequest(
      'Enterprise verification legalId is invalid',
    );
  }

  const normalizedEnterprisePhone = normalizeRequiredString(
    request.enterprisePhone,
    11,
    'Enterprise verification enterprisePhone is invalid',
    throwInvalidEnterpriseVerificationRequest,
  );

  if (!/^1[3-9]\d{9}$/.test(normalizedEnterprisePhone)) {
    throwInvalidEnterpriseVerificationRequest(
      'Enterprise verification enterprisePhone is invalid',
    );
  }

  return {
    enterpriseName: normalizeRequiredString(
      request.enterpriseName,
      60,
      'Enterprise verification enterpriseName is invalid',
      throwInvalidEnterpriseVerificationRequest,
    ),
    creditCode: normalizedCreditCode,
    legalName: normalizeRequiredString(
      request.legalName,
      30,
      'Enterprise verification legalName is invalid',
      throwInvalidEnterpriseVerificationRequest,
    ),
    legalId: normalizedLegalId,
    enterprisePhone: normalizedEnterprisePhone,
    licenseFileId: normalizeRequiredString(
      request.licenseFileId,
      120,
      'Enterprise verification licenseFileId is invalid',
      throwInvalidEnterpriseVerificationRequest,
    ),
  };
}

function normalizeCreateProfileInvoiceApplicationRequest(
  request: PlatformCreateProfileInvoiceApplicationRequest,
): PlatformCreateProfileInvoiceApplicationRequest {
  if (!isPlainObject(request)) {
    throwInvalidInvoiceRequest('Invoice application request must be an object');
  }

  const normalizedInvoiceType =
    request.invoiceType === 'vat-special' ? 'vat-special' : 'normal';

  if (
    request.invoiceType !== 'normal' &&
    request.invoiceType !== 'vat-special'
  ) {
    throwInvalidInvoiceRequest('Invoice application type is invalid');
  }

  if (
    request.invoiceTitleType !== 'personal' &&
    request.invoiceTitleType !== 'enterprise'
  ) {
    throwInvalidInvoiceRequest('Invoice application title type is invalid');
  }

  const normalizedReceiverEmail = normalizeRequiredString(
    request.receiverEmail,
    120,
    'Invoice application receiver email is invalid',
    throwInvalidInvoiceRequest,
  );

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedReceiverEmail)) {
    throwInvalidInvoiceRequest('Invoice application receiver email is invalid');
  }

  if (!Array.isArray(request.orderIds) || request.orderIds.length > 20) {
    throwInvalidInvoiceRequest('Invoice application order ids are invalid');
  }

  const normalizedOrderIds = request.orderIds.map(orderId =>
    normalizeRequiredString(
      orderId,
      120,
      'Invoice application order id is invalid',
      throwInvalidInvoiceRequest,
    ),
  );

  if (
    normalizedOrderIds.length === 0 ||
    new Set(normalizedOrderIds).size !== normalizedOrderIds.length
  ) {
    throwInvalidInvoiceRequest('Invoice application order ids are invalid');
  }

  return {
    invoiceType: normalizedInvoiceType,
    invoiceTitleType: request.invoiceTitleType,
    invoiceTitle: normalizeRequiredString(
      request.invoiceTitle,
      60,
      'Invoice application title is invalid',
      throwInvalidInvoiceRequest,
    ),
    receiverEmail: normalizedReceiverEmail,
    orderIds: normalizedOrderIds,
  };
}

function normalizeInvoiceApplicationId(value: unknown) {
  return normalizeRequiredString(
    value,
    120,
    'Invoice application id is invalid',
    throwInvalidInvoiceRequest,
  );
}

function normalizeAdminIssueShipperCouponRequest(
  request: PlatformAdminIssueShipperCouponRequest,
): PlatformAdminIssueShipperCouponRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon issue request must be an object',
    );
  }

  return {
    shipperId: normalizeRequiredString(
      request.shipperId,
      120,
      'Admin shipper coupon shipperId is invalid',
      throwInvalidAdminShipperCouponRequest,
    ),
    ...normalizeAdminCouponIssueTemplate(request),
  };
}

function normalizeAdminBatchIssueShipperCouponsRequest(
  request: PlatformAdminBatchIssueShipperCouponsRequest,
): PlatformAdminBatchIssueShipperCouponsRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon batch issue request must be an object',
    );
  }

  if (!Array.isArray(request.shipperIds)) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon shipperIds are invalid',
    );
  }

  const normalizedShipperIds = request.shipperIds.map(shipperId =>
    normalizeRequiredString(
      shipperId,
      120,
      'Admin shipper coupon shipperId is invalid',
      throwInvalidAdminShipperCouponRequest,
    ),
  );

  if (
    normalizedShipperIds.length === 0 ||
    normalizedShipperIds.length > 50
  ) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon shipperIds are invalid',
    );
  }

  return {
    shipperIds: [...new Set(normalizedShipperIds)],
    ...normalizeAdminCouponIssueTemplate(request),
  };
}

function normalizeAdminShipperCouponIdempotencyKey(value: unknown) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (
    !normalizedValue ||
    normalizedValue.length > 64 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedValue,
    )
  ) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon Idempotency-Key is invalid',
    );
  }

  return normalizedValue;
}

function createAdminShipperCouponMutationRequestOptions(
  idempotencyKey: string,
) {
  return {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  };
}

function normalizeAdminCouponIssueTemplate(
  template: PlatformAdminIssueShipperCouponTemplate,
): PlatformAdminIssueShipperCouponTemplate {
  const validFromIso = normalizeRequiredString(
    template.validFromIso,
    40,
    'Admin shipper coupon validFromIso is invalid',
    throwInvalidAdminShipperCouponRequest,
  );
  const validUntilIso = normalizeRequiredString(
    template.validUntilIso,
    40,
    'Admin shipper coupon validUntilIso is invalid',
    throwInvalidAdminShipperCouponRequest,
  );
  const validFromTimestamp = Date.parse(validFromIso);
  const validUntilTimestamp = Date.parse(validUntilIso);

  if (Number.isNaN(validFromTimestamp)) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon validFromIso is invalid',
    );
  }

  if (Number.isNaN(validUntilTimestamp)) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon validUntilIso is invalid',
    );
  }

  if (validUntilTimestamp <= validFromTimestamp) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon validUntilIso is invalid',
    );
  }

  const discountCents = normalizePositiveInteger(
    template.discountCents,
    'Admin shipper coupon discountCents is invalid',
    throwInvalidAdminShipperCouponRequest,
  );
  const minOrderAmountCents = normalizeNonNegativeInteger(
    template.minOrderAmountCents,
    'Admin shipper coupon minOrderAmountCents is invalid',
    throwInvalidAdminShipperCouponRequest,
  );
  const sourceText = normalizeOptionalString(
    template.sourceText,
    80,
    'Admin shipper coupon sourceText is invalid',
    throwInvalidAdminShipperCouponRequest,
  );

  return {
    title: normalizeRequiredString(
      template.title,
      60,
      'Admin shipper coupon title is invalid',
      throwInvalidAdminShipperCouponRequest,
    ),
    conditionText: normalizeRequiredString(
      template.conditionText,
      120,
      'Admin shipper coupon conditionText is invalid',
      throwInvalidAdminShipperCouponRequest,
    ),
    discountCents,
    minOrderAmountCents,
    validFromIso,
    validUntilIso,
    ...(sourceText ? { sourceText } : {}),
  };
}

function normalizeAdminShipperCouponReportQuery(
  query: PlatformAdminShipperCouponReportQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon report query must be an object',
    );
  }

  const topShippersLimit = query.topShippersLimit ?? 5;

  if (
    !Number.isInteger(topShippersLimit) ||
    topShippersLimit < 1 ||
    topShippersLimit > 20
  ) {
    throwInvalidAdminShipperCouponRequest(
      'Admin shipper coupon topShippersLimit is invalid',
    );
  }

  return {
    topShippersLimit: String(topShippersLimit),
  };
}

function normalizeAdminEvaluationAuditListQuery(
  query: PlatformAdminEvaluationAuditListQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation audit query must be an object',
    );
  }

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation audit page is invalid',
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation audit pageSize is invalid',
    );
  }

  if (
    query.direction !== undefined &&
    !['shipper_to_driver', 'driver_to_shipper'].includes(query.direction)
  ) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation audit direction is invalid',
    );
  }

  if (
    query.moderationStatus !== undefined &&
    !['visible', 'hidden'].includes(query.moderationStatus)
  ) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation audit moderation status is invalid',
    );
  }

  if (
    query.rating !== undefined &&
    (!Number.isInteger(query.rating) || query.rating < 1 || query.rating > 5)
  ) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation audit rating is invalid',
    );
  }

  const normalizedKeyword = normalizeOptionalString(
    query.keyword,
    100,
    'Admin evaluation audit keyword is invalid',
    throwInvalidAdminEvaluationAuditRequest,
  );

  return {
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.moderationStatus
      ? { moderationStatus: query.moderationStatus }
      : {}),
    ...(query.rating !== undefined ? { rating: String(query.rating) } : {}),
    ...(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminEvaluationAuditId(evaluationId: string) {
  return normalizeRequiredString(
    evaluationId,
    120,
    'Admin evaluation audit id is invalid',
    throwInvalidAdminEvaluationAuditRequest,
  );
}

function normalizeModerateAdminEvaluationRequest(
  request: PlatformModerateAdminEvaluationRequest,
): PlatformModerateAdminEvaluationRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation moderation request must be an object',
    );
  }

  if (!['visible', 'hidden'].includes(request.status)) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation moderation status is invalid',
    );
  }

  const reason = normalizeRequiredString(
    request.reason,
    200,
    'Admin evaluation moderation reason is invalid',
    throwInvalidAdminEvaluationAuditRequest,
  );
  if (reason.length < 2) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation moderation reason is invalid',
    );
  }

  if (
    !Number.isInteger(request.baseModerationVersion) ||
    request.baseModerationVersion < 0
  ) {
    throwInvalidAdminEvaluationAuditRequest(
      'Admin evaluation moderation version is invalid',
    );
  }

  return {
    status: request.status,
    reason,
    baseModerationVersion: request.baseModerationVersion,
  };
}

function normalizeListAdminShipperVerificationQuery(
  query: PlatformListAdminShipperVerificationQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminShipperVerificationRequest(
      'Admin shipper verification query must be an object',
    );
  }

  const status = query.status ?? 'reviewing';
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!['reviewing', 'approved', 'rejected'].includes(status)) {
    throwInvalidAdminShipperVerificationRequest(
      'Admin shipper verification status is invalid',
    );
  }

  if (query.type !== undefined && !['identity', 'enterprise'].includes(query.type)) {
    throwInvalidAdminShipperVerificationRequest(
      'Admin shipper verification type is invalid',
    );
  }

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidAdminShipperVerificationRequest(
      'Admin shipper verification page is invalid',
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throwInvalidAdminShipperVerificationRequest(
      'Admin shipper verification pageSize is invalid',
    );
  }

  return {
    status,
    ...(query.type ? { type: query.type } : {}),
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminShipperVerificationReviewRequest(
  request: PlatformAdminShipperVerificationReviewRequest,
): PlatformAdminShipperVerificationReviewRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminShipperVerificationRequest(
      'Admin shipper verification review must be an object',
    );
  }

  if (request.status === 'approved') {
    return { status: 'approved' };
  }

  if (request.status === 'rejected') {
    return {
      status: 'rejected',
      rejectionReason: normalizeRequiredString(
        request.rejectionReason,
        200,
        'Admin shipper verification rejection reason is invalid',
        throwInvalidAdminShipperVerificationRequest,
      ),
    };
  }

  throwInvalidAdminShipperVerificationRequest(
    'Admin shipper verification review status is invalid',
  );
}

function normalizeAdminShipperVerificationShipperId(value: unknown) {
  return normalizeRequiredString(
    value,
    120,
    'Admin shipper verification shipper id is invalid',
    throwInvalidAdminShipperVerificationRequest,
  );
}

function normalizeSaveProfileAddressBookRequest(
  request: PlatformSaveProfileAddressBookRequest,
): PlatformSaveProfileAddressBookRequest {
  if (!isPlainObject(request)) {
    throwInvalidAddressBookRequest('Address book request must be an object');
  }

  const { addresses, contacts, clientUpdatedAtIso, baseUpdatedAtIso } = request;

  if (!Array.isArray(addresses) || addresses.length > 20) {
    throwInvalidAddressBookRequest('Address book addresses are invalid');
  }

  if (!Array.isArray(contacts) || contacts.length > 50) {
    throwInvalidAddressBookRequest('Address book contacts are invalid');
  }

  const normalizedRequest: PlatformSaveProfileAddressBookRequest = {
    addresses: addresses.map(normalizeAddressBookAddress),
    contacts: contacts.map(normalizeAddressBookContact),
  };
  const normalizedClientUpdatedAtIso = normalizeOptionalIsoString(
    clientUpdatedAtIso,
    'Address book client updated time is invalid',
  );
  const normalizedBaseUpdatedAtIso = normalizeOptionalIsoString(
    baseUpdatedAtIso,
    'Address book base updated time is invalid',
  );

  if (normalizedClientUpdatedAtIso !== undefined) {
    normalizedRequest.clientUpdatedAtIso = normalizedClientUpdatedAtIso;
  }

  if (normalizedBaseUpdatedAtIso !== undefined) {
    normalizedRequest.baseUpdatedAtIso = normalizedBaseUpdatedAtIso;
  }

  return normalizedRequest;
}

function normalizeListAdminShipperInvoiceQuery(
  query: PlatformListAdminShipperInvoiceQuery,
) {
  if (!isPlainObject(query)) {
    throwInvalidAdminShipperInvoiceRequest(
      'Admin shipper invoice query must be an object',
    );
  }

  const status = query.status ?? 'reviewing';
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (!['reviewing', 'approved', 'rejected'].includes(status)) {
    throwInvalidAdminShipperInvoiceRequest(
      'Admin shipper invoice status is invalid',
    );
  }

  if (!Number.isInteger(page) || page < 1) {
    throwInvalidAdminShipperInvoiceRequest(
      'Admin shipper invoice page is invalid',
    );
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throwInvalidAdminShipperInvoiceRequest(
      'Admin shipper invoice pageSize is invalid',
    );
  }

  return {
    status,
    page: String(page),
    pageSize: String(pageSize),
  };
}

function normalizeAdminShipperInvoiceReviewRequest(
  request: PlatformAdminShipperInvoiceReviewRequest,
): PlatformAdminShipperInvoiceReviewRequest {
  if (!isPlainObject(request)) {
    throwInvalidAdminShipperInvoiceRequest(
      'Admin shipper invoice review must be an object',
    );
  }

  if (request.status === 'approved') {
    return { status: 'approved' };
  }

  if (request.status === 'rejected') {
    return {
      status: 'rejected',
      rejectionReason: normalizeRequiredString(
        request.rejectionReason,
        200,
        'Admin shipper invoice rejection reason is invalid',
        throwInvalidAdminShipperInvoiceRequest,
      ),
    };
  }

  throwInvalidAdminShipperInvoiceRequest(
    'Admin shipper invoice review status is invalid',
  );
}

function normalizeAdminShipperInvoiceApplicationId(value: unknown) {
  return normalizeRequiredString(
    value,
    120,
    'Admin shipper invoice application id is invalid',
    throwInvalidAdminShipperInvoiceRequest,
  );
}

function normalizeAddressBookAddress(
  address: PlatformProfileAddressBookAddress,
): PlatformProfileAddressBookAddress {
  if (!isPlainObject(address)) {
    throwInvalidAddressBookRequest('Address book address must be an object');
  }

  const normalizedAddress: PlatformProfileAddressBookAddress = {
    id: normalizeRequiredString(address.id, 80, 'Address id is invalid'),
    name: normalizeRequiredString(address.name, 30, 'Address name is invalid'),
    address: normalizeRequiredString(
      address.address,
      120,
      'Address detail is invalid',
    ),
    contactText: normalizeRequiredString(
      address.contactText,
      80,
      'Address contact is invalid',
    ),
  };
  const tagText = normalizeOptionalTrimmedString(
    address.tagText,
    'Address tag is invalid',
  );

  if (tagText !== undefined) {
    normalizedAddress.tagText = tagText;
  }

  return normalizedAddress;
}

function normalizeAddressBookContact(
  contact: PlatformProfileAddressBookContact,
): PlatformProfileAddressBookContact {
  if (!isPlainObject(contact)) {
    throwInvalidAddressBookRequest('Address book contact must be an object');
  }

  const normalizedContact: PlatformProfileAddressBookContact = {
    id: normalizeRequiredString(contact.id, 80, 'Contact id is invalid'),
    name: normalizeRequiredString(contact.name, 30, 'Contact name is invalid'),
    roleText: normalizeRequiredString(
      contact.roleText,
      30,
      'Contact role is invalid',
    ),
    phoneText: normalizePhone(contact.phoneText),
  };
  const noteText = normalizeOptionalTrimmedString(
    contact.noteText,
    'Contact note is invalid',
  );

  if (noteText !== undefined) {
    normalizedContact.noteText = noteText;
  }

  return normalizedContact;
}

function normalizeRequiredString(
  value: unknown,
  maxLength: number,
  message: string,
  thrower: (message: string) => never = throwInvalidAddressBookRequest,
) {
  if (typeof value !== 'string') {
    thrower(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    thrower(message);
  }

  return normalizedValue;
}

function normalizeOptionalTrimmedString(
  value: unknown,
  message: string,
  thrower: (message: string) => never = throwInvalidAddressBookRequest,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    thrower(message);
  }

  const normalizedValue = value.trim();

  return normalizedValue === '' ? undefined : normalizedValue;
}

function createOptionalAccountAvatarFields(avatarFileId: unknown) {
  if (avatarFileId === null) {
    return { avatarFileId: null };
  }

  const normalizedAvatarFileId = normalizeOptionalString(
    avatarFileId,
    120,
    'Account avatar file id is invalid',
    throwInvalidAccountRequest,
  );

  return normalizedAvatarFileId
    ? { avatarFileId: normalizedAvatarFileId }
    : {};
}

function createOptionalAccountPhoneField(phone: unknown) {
  const normalizedPhone = normalizeOptionalString(
    phone,
    11,
    'Account phone is invalid',
    throwInvalidAccountRequest,
  );

  if (!normalizedPhone) {
    return {};
  }

  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
    throwInvalidAccountRequest('Account phone is invalid');
  }

  return { phone: normalizedPhone };
}

function createOptionalAccountSettingsFields(
  request: PlatformSaveProfileAccountRequest,
) {
  const phoneProtectionEnabled = normalizeOptionalBoolean(
    request.phoneProtectionEnabled,
    'Account phone protection setting is invalid',
  );
  const loginProtectionEnabled = normalizeOptionalBoolean(
    request.loginProtectionEnabled,
    'Account login protection setting is invalid',
  );
  const orderNotificationEnabled = normalizeOptionalBoolean(
    request.orderNotificationEnabled,
    'Account order notification setting is invalid',
  );
  const promotionNotificationEnabled = normalizeOptionalBoolean(
    request.promotionNotificationEnabled,
    'Account promotion notification setting is invalid',
  );
  const privacyConfirmedAtIso = normalizeOptionalIsoStringWithThrower(
    request.privacyConfirmedAtIso,
    'Account privacy confirmation time is invalid',
    throwInvalidAccountRequest,
  );
  const privacyPolicyVersion = normalizeOptionalString(
    request.privacyPolicyVersion,
    80,
    'Account privacy policy version is invalid',
    throwInvalidAccountRequest,
  );
  const privacyPolicyVersionTitle = normalizeOptionalString(
    request.privacyPolicyVersionTitle,
    120,
    'Account privacy policy version title is invalid',
    throwInvalidAccountRequest,
  );

  if (
    (privacyPolicyVersion === undefined) !==
    (privacyPolicyVersionTitle === undefined)
  ) {
    throwInvalidAccountRequest(
      'Account privacy policy version snapshot is incomplete',
    );
  }

  if (
    (privacyPolicyVersion !== undefined ||
      privacyPolicyVersionTitle !== undefined) &&
    !privacyConfirmedAtIso
  ) {
    throwInvalidAccountRequest(
      'Account privacy policy version snapshot requires privacy confirmation time',
    );
  }

  return {
    ...(phoneProtectionEnabled !== undefined
      ? { phoneProtectionEnabled }
      : {}),
    ...(loginProtectionEnabled !== undefined
      ? { loginProtectionEnabled }
      : {}),
    ...(orderNotificationEnabled !== undefined
      ? { orderNotificationEnabled }
      : {}),
    ...(promotionNotificationEnabled !== undefined
      ? { promotionNotificationEnabled }
      : {}),
    ...(privacyConfirmedAtIso ? { privacyConfirmedAtIso } : {}),
    ...(privacyPolicyVersion ? { privacyPolicyVersion } : {}),
    ...(privacyPolicyVersionTitle ? { privacyPolicyVersionTitle } : {}),
  };
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
  message: string,
  thrower: (message: string) => never,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    thrower(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    thrower(message);
  }

  return normalizedValue;
}

function normalizePhone(value: unknown) {
  const normalizedValue = normalizeRequiredString(
    value,
    11,
    'Contact phone is invalid',
  );

  if (!/^1[3-9]\d{9}$/.test(normalizedValue)) {
    throwInvalidAddressBookRequest('Contact phone is invalid');
  }

  return normalizedValue;
}

function normalizePositiveInteger(
  value: unknown,
  message: string,
  thrower: (message: string) => never,
) {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    thrower(message);
  }

  return Number(value);
}

function normalizeNonNegativeInteger(
  value: unknown,
  message: string,
  thrower: (message: string) => never,
) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    thrower(message);
  }

  return Number(value);
}

function normalizeOptionalIsoString(value: unknown, message: string) {
  return normalizeOptionalIsoStringWithThrower(
    value,
    message,
    throwInvalidAddressBookRequest,
  );
}

function normalizeOptionalIsoStringWithThrower(
  value: unknown,
  message: string,
  thrower: (message: string) => never,
) {
  const normalizedValue = normalizeOptionalTrimmedString(
    value,
    message,
    thrower,
  );

  if (
    normalizedValue !== undefined &&
    Number.isNaN(Date.parse(normalizedValue))
  ) {
    thrower(message);
  }

  return normalizedValue;
}

function normalizeOptionalBoolean(value: unknown, message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throwInvalidAccountRequest(message);
  }

  return value;
}

async function createTextResponseApiError(response: Response) {
  try {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as PlatformApiErrorBody) : undefined;

    if (payload?.code && payload.message) {
      return new PlatformApiError(
        payload.message,
        payload.code,
        response.status,
        payload.requestId,
      );
    }
  } catch {
    // Fall through to the generic error below.
  }

  return new PlatformApiError(
    `Platform API request failed: ${response.status}`,
    'HTTP_ERROR',
    response.status,
  );
}

function createPlatformRequestUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function extractDownloadFilename(
  contentDisposition: string | null,
  fallbackFileName: string,
) {
  const matched = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '');

  return matched ? matched[1] : fallbackFileName;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwInvalidAddressBookRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_PROFILE_ADDRESS_BOOK_REQUEST_INVALID',
    0,
  );
}

function throwInvalidAccountRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_PROFILE_ACCOUNT_REQUEST_INVALID',
    0,
  );
}

function throwInvalidIdentityVerificationRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_PROFILE_IDENTITY_VERIFICATION_REQUEST_INVALID',
    0,
  );
}

function throwInvalidEnterpriseVerificationRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_PROFILE_ENTERPRISE_VERIFICATION_REQUEST_INVALID',
    0,
  );
}

function throwInvalidInvoiceRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_PROFILE_INVOICE_REQUEST_INVALID',
    0,
  );
}

function throwInvalidAdminShipperVerificationRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ADMIN_SHIPPER_VERIFICATION_REQUEST_INVALID',
    0,
  );
}

function throwInvalidAdminShipperInvoiceRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ADMIN_SHIPPER_INVOICE_REQUEST_INVALID',
    0,
  );
}

function throwInvalidAdminShipperCouponRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ADMIN_SHIPPER_COUPON_REQUEST_INVALID',
    0,
  );
}

function throwInvalidAdminEvaluationAuditRequest(message: string): never {
  throw new PlatformApiError(
    message,
    'PLATFORM_ADMIN_EVALUATION_AUDIT_REQUEST_INVALID',
    0,
  );
}

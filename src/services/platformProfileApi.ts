import {
  PlatformApiError,
  platformGet,
  platformPost,
  platformPut,
  type PlatformApiConfig,
} from './platformApiClient';
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
  submittedAtIso: string;
};

export type PlatformProfileReceivedEvaluationSnapshot = {
  shipperId: string;
  items: PlatformProfileReceivedEvaluationRecord[];
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
    getInvoices() {
      return platformGet<PlatformProfileInvoiceApplication[]>(
        config,
        '/shipper/profile/invoices',
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

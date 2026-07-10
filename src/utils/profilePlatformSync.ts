import type {
  PlatformProfileAccount,
  PlatformProfileAddressBook,
  PlatformProfileCouponWallet,
  PlatformProfileEnterpriseVerification,
  PlatformProfileEvaluationSnapshot,
  PlatformProfileIdentityVerification,
  PlatformProfileReceivedEvaluationSnapshot,
  PlatformProfileSpendingSnapshot,
} from '../services/platformProfileApi';
import {
  type EnterpriseVerificationRequest,
  type IdentityVerificationRequest,
  type ProfileVerificationStatus,
  type AddressConflictFieldKey,
  type AddressItem,
  type ContactConflictFieldKey,
  type ContactItem,
  type ProfileLocalState,
  type ProfileSyncState,
} from './profileLocalState';

/**
 * 个人中心「平台快照 ↔ 本地状态」的纯映射/校验/冲突构建逻辑。
 *
 * 从 ProfileCenterScreen.tsx 下沉，便于单测；组件只保留 React 状态协调、
 * 平台拉取 effect 和渲染。
 */

const identityVerificationFrontFileName = '身份证正面.png';
const identityVerificationBackFileName = '身份证反面.png';
const enterpriseVerificationLicenseFileName = '营业执照.png';

export function mapPlatformAddressBookToLocalState(
  addressBook: PlatformProfileAddressBook,
): Pick<ProfileLocalState, 'addresses' | 'contacts'> {
  const addresses = Array.isArray(addressBook.addresses)
    ? addressBook.addresses
    : [];
  const contacts = Array.isArray(addressBook.contacts)
    ? addressBook.contacts
    : [];

  return {
    addresses: addresses.map(address => ({
      ...address,
      tagText: address.tagText ?? '',
    })),
    contacts: contacts.map(contact => ({
      ...contact,
      noteText: contact.noteText ?? '',
    })),
  };
}

export function createAddressBookConflictSummary(
  addressBook: PlatformProfileAddressBook,
) {
  const firstAddressName = Array.isArray(addressBook.addresses)
    ? addressBook.addresses[0]?.name
    : undefined;
  const firstContactName = Array.isArray(addressBook.contacts)
    ? addressBook.contacts[0]?.name
    : undefined;
  const summaryText =
    firstAddressName ?? firstContactName ?? '服务端暂无地址/联系人';

  return `服务端地址簿：${summaryText}`;
}

export function isValidPlatformAccountProfile(
  accountProfile: PlatformProfileAccount | null,
): accountProfile is PlatformProfileAccount {
  return (
    Boolean(accountProfile) &&
    typeof accountProfile?.displayName === 'string' &&
    typeof accountProfile?.phone === 'string'
  );
}

function mapPlatformVerificationStatusToLocal(
  status: PlatformProfileIdentityVerification['status'] | undefined,
): ProfileVerificationStatus | undefined {
  if (status === 'reviewing' || status === 'approved' || status === 'rejected') {
    return status;
  }

  return undefined;
}

function createVerificationFileRef(fileId: string, fileName: string) {
  return {
    fileId,
    fileName,
    purpose: 'identity' as const,
    status: 'uploaded' as const,
  };
}

export function isValidPlatformIdentityVerification(
  verification: PlatformProfileIdentityVerification | null,
): verification is PlatformProfileIdentityVerification {
  return (
    Boolean(verification) &&
    typeof verification?.realName === 'string' &&
    typeof verification?.idNumber === 'string' &&
    typeof verification?.identityFrontFileId === 'string' &&
    typeof verification?.identityBackFileId === 'string' &&
    verification?.faceVerified === true &&
    typeof verification?.status === 'string'
  );
}

export function mapPlatformIdentityVerificationToLocalState(
  verification: PlatformProfileIdentityVerification,
): IdentityVerificationRequest {
  const localStatus = mapPlatformVerificationStatusToLocal(verification.status);

  return {
    realName: verification.realName,
    idNumber: verification.idNumber,
    identityPhotoCount: 2,
    identityPhotoFiles: [
      createVerificationFileRef(
        verification.identityFrontFileId,
        identityVerificationFrontFileName,
      ),
      createVerificationFileRef(
        verification.identityBackFileId,
        identityVerificationBackFileName,
      ),
    ],
    faceVerified: true,
    ...(localStatus ? { status: localStatus } : {}),
    ...(verification.rejectionReason
      ? { rejectionReason: verification.rejectionReason }
      : {}),
    ...(verification.updatedAtIso
      ? { updatedAtIso: verification.updatedAtIso }
      : {}),
  };
}

export function isValidPlatformEnterpriseVerification(
  verification: PlatformProfileEnterpriseVerification | null,
): verification is PlatformProfileEnterpriseVerification {
  return (
    Boolean(verification) &&
    typeof verification?.enterpriseName === 'string' &&
    typeof verification?.creditCode === 'string' &&
    typeof verification?.legalName === 'string' &&
    typeof verification?.legalId === 'string' &&
    typeof verification?.enterprisePhone === 'string' &&
    typeof verification?.licenseFileId === 'string' &&
    typeof verification?.status === 'string'
  );
}

export function mapPlatformEnterpriseVerificationToLocalState(
  verification: PlatformProfileEnterpriseVerification,
): EnterpriseVerificationRequest {
  const localStatus = mapPlatformVerificationStatusToLocal(verification.status);

  return {
    enterpriseName: verification.enterpriseName,
    creditCode: verification.creditCode,
    legalName: verification.legalName,
    legalId: verification.legalId,
    enterprisePhone: verification.enterprisePhone,
    licensePhotoCount: 1,
    licenseFiles: [
      createVerificationFileRef(
        verification.licenseFileId,
        enterpriseVerificationLicenseFileName,
      ),
    ],
    ...(localStatus ? { status: localStatus } : {}),
    ...(verification.rejectionReason
      ? { rejectionReason: verification.rejectionReason }
      : {}),
    ...(verification.updatedAtIso
      ? { updatedAtIso: verification.updatedAtIso }
      : {}),
  };
}

export function isValidPlatformSpendingSnapshot(
  snapshot: PlatformProfileSpendingSnapshot | undefined,
): snapshot is PlatformProfileSpendingSnapshot {
  return (
    Boolean(snapshot) &&
    typeof snapshot?.shipperId === 'string' &&
    isValidPlatformSpendingSummary(snapshot.summary) &&
    Array.isArray(snapshot.items) &&
    snapshot.items.every(item => isValidPlatformSpendingRecord(item))
  );
}

function isValidPlatformSpendingSummary(
  summary: PlatformProfileSpendingSnapshot['summary'] | undefined,
): summary is PlatformProfileSpendingSnapshot['summary'] {
  return (
    Boolean(summary) &&
    typeof summary?.completedTotalCents === 'number' &&
    typeof summary?.activeTotalCents === 'number' &&
    typeof summary?.refundTotalCents === 'number'
  );
}

function isValidPlatformSpendingRecord(
  item: PlatformProfileSpendingSnapshot['items'][number] | undefined,
): item is PlatformProfileSpendingSnapshot['items'][number] {
  return (
    Boolean(item) &&
    typeof item?.orderId === 'string' &&
    typeof item?.orderNo === 'string' &&
    typeof item?.status === 'string' &&
    typeof item?.paymentMethod === 'string' &&
    typeof item?.amountCents === 'number' &&
    typeof item?.occurredAtIso === 'string' &&
    typeof item?.routeText === 'string'
  );
}

export function isValidPlatformCouponWallet(
  wallet: PlatformProfileCouponWallet | undefined,
): wallet is PlatformProfileCouponWallet {
  return (
    Boolean(wallet) &&
    typeof wallet?.shipperId === 'string' &&
    isValidPlatformCouponSummary(wallet.summary) &&
    Array.isArray(wallet.items) &&
    wallet.items.every(item => isValidPlatformCouponRecord(item))
  );
}

function isValidPlatformCouponSummary(
  summary: PlatformProfileCouponWallet['summary'] | undefined,
): summary is PlatformProfileCouponWallet['summary'] {
  return (
    Boolean(summary) &&
    typeof summary?.usableCount === 'number' &&
    typeof summary?.lockedCount === 'number' &&
    typeof summary?.usedCount === 'number' &&
    typeof summary?.expiredCount === 'number'
  );
}

function isValidPlatformCouponRecord(
  item: PlatformProfileCouponWallet['items'][number] | undefined,
): item is PlatformProfileCouponWallet['items'][number] {
  return (
    Boolean(item) &&
    typeof item?.id === 'string' &&
    typeof item?.shipperId === 'string' &&
    typeof item?.title === 'string' &&
    typeof item?.status === 'string' &&
    typeof item?.conditionText === 'string' &&
    typeof item?.validUntilIso === 'string' &&
    typeof item?.sourceText === 'string'
  );
}

export function isValidPlatformEvaluationSnapshot(
  snapshot: PlatformProfileEvaluationSnapshot | undefined,
): snapshot is PlatformProfileEvaluationSnapshot {
  return (
    Boolean(snapshot) &&
    typeof snapshot?.shipperId === 'string' &&
    Array.isArray(snapshot.items) &&
    snapshot.items.every(item => isValidPlatformEvaluationRecord(item))
  );
}

function isValidPlatformEvaluationRecord(
  item: PlatformProfileEvaluationSnapshot['items'][number] | undefined,
): item is PlatformProfileEvaluationSnapshot['items'][number] {
  return (
    Boolean(item) &&
    typeof item?.id === 'string' &&
    typeof item?.orderId === 'string' &&
    typeof item?.orderNo === 'string' &&
    typeof item?.driverName === 'string' &&
    typeof item?.rating === 'number' &&
    Array.isArray(item?.tags) &&
    item.tags.every(tag => typeof tag === 'string') &&
    typeof item?.content === 'string' &&
    typeof item?.anonymous === 'boolean' &&
    typeof item?.photoCount === 'number' &&
    typeof item?.submittedAtIso === 'string'
  );
}

export function isValidPlatformReceivedEvaluationSnapshot(
  snapshot: PlatformProfileReceivedEvaluationSnapshot | undefined,
): snapshot is PlatformProfileReceivedEvaluationSnapshot {
  return (
    Boolean(snapshot) &&
    typeof snapshot?.shipperId === 'string' &&
    Array.isArray(snapshot.items) &&
    snapshot.items.every(item => isValidPlatformReceivedEvaluationRecord(item))
  );
}

function isValidPlatformReceivedEvaluationRecord(
  item: PlatformProfileReceivedEvaluationSnapshot['items'][number] | undefined,
): item is PlatformProfileReceivedEvaluationSnapshot['items'][number] {
  return (
    Boolean(item) &&
    typeof item?.id === 'string' &&
    typeof item?.orderId === 'string' &&
    typeof item?.orderNo === 'string' &&
    typeof item?.driverName === 'string' &&
    typeof item?.rating === 'number' &&
    Array.isArray(item?.tags) &&
    item.tags.every(tag => typeof tag === 'string') &&
    typeof item?.content === 'string' &&
    typeof item?.anonymous === 'boolean' &&
    typeof item?.submittedAtIso === 'string'
  );
}

const addressConflictFields: Array<{
  key: AddressConflictFieldKey;
  label: string;
}> = [
  { key: 'name', label: '地址名称' },
  { key: 'address', label: '详细地址' },
  { key: 'contactText', label: '联系人' },
  { key: 'tagText', label: '标签' },
];

const contactConflictFields: Array<{
  key: ContactConflictFieldKey;
  label: string;
}> = [
  { key: 'name', label: '姓名' },
  { key: 'roleText', label: '角色' },
  { key: 'phoneText', label: '电话' },
  { key: 'noteText', label: '备注' },
];

export function createAddressConflictFieldItems(
  localAddresses: AddressItem[],
  platformAddresses: AddressItem[],
) {
  const localAddressesById = new Map(
    localAddresses.map(address => [address.id, address]),
  );

  return platformAddresses.flatMap(platformAddress => {
    const localAddress = localAddressesById.get(platformAddress.id);

    if (!localAddress) {
      return [];
    }

    return addressConflictFields
      .filter(({ key }) => localAddress[key] !== platformAddress[key])
      .map(({ key, label }) => ({
        id: `${platformAddress.id}-${key}`,
        addressId: platformAddress.id,
        fieldKey: key,
        fieldLabel: label,
        localValue: localAddress[key] ?? '',
        platformValue: platformAddress[key] ?? '',
      }));
  });
}

export function createContactConflictFieldItems(
  localContacts: ContactItem[],
  platformContacts: ContactItem[],
) {
  const localContactsById = new Map(
    localContacts.map(contact => [contact.id, contact]),
  );

  return platformContacts.flatMap(platformContact => {
    const localContact = localContactsById.get(platformContact.id);

    if (!localContact) {
      return [];
    }

    return contactConflictFields
      .filter(({ key }) => localContact[key] !== platformContact[key])
      .map(({ key, label }) => ({
        id: `${platformContact.id}-${key}`,
        contactId: platformContact.id,
        fieldKey: key,
        fieldLabel: label,
        localValue: localContact[key] ?? '',
        platformValue: platformContact[key] ?? '',
      }));
  });
}

export function upsertProfileItem<T extends { id: string }>(
  items: T[],
  item: T,
) {
  const itemExists = items.some(currentItem => currentItem.id === item.id);

  if (!itemExists) {
    return [...items, item];
  }

  return items.map(currentItem =>
    currentItem.id === item.id ? item : currentItem,
  );
}

export function updateProfileAddressConflictField(
  addresses: AddressItem[],
  addressId: string,
  fieldKey: AddressConflictFieldKey,
  platformValue: string,
) {
  return addresses.map(address =>
    address.id === addressId
      ? { ...address, [fieldKey]: platformValue }
      : address,
  );
}

export function getProfileItemIds(items: Array<{ id: string }>) {
  return items.map(item => item.id);
}

export function updateProfileContactConflictField(
  contacts: ContactItem[],
  contactId: string,
  fieldKey: ContactConflictFieldKey,
  platformValue: string,
) {
  return contacts.map(contact =>
    contact.id === contactId
      ? { ...contact, [fieldKey]: platformValue }
      : contact,
  );
}

export function createResolvedAddressBookConflictSyncState(
  syncState: ProfileSyncState,
) {
  const hasConflictItems =
    (syncState.conflictAddressItems?.length ?? 0) > 0 ||
    (syncState.conflictAddressFieldItems?.length ?? 0) > 0 ||
    (syncState.conflictDeletedAddressItems?.length ?? 0) > 0 ||
    (syncState.conflictContactItems?.length ?? 0) > 0 ||
    (syncState.conflictContactFieldItems?.length ?? 0) > 0 ||
    (syncState.conflictDeletedContactItems?.length ?? 0) > 0;

  if (hasConflictItems) {
    return syncState;
  }

  const nextSyncState = {
    ...syncState,
    message: '平台地址簿冲突项已处理完，请重试同步覆盖平台。',
  };

  delete nextSyncState.conflictSummaryText;
  delete nextSyncState.conflictAddressItems;
  delete nextSyncState.conflictAddressFieldItems;
  delete nextSyncState.conflictDeletedAddressItems;
  delete nextSyncState.conflictContactItems;
  delete nextSyncState.conflictContactFieldItems;
  delete nextSyncState.conflictDeletedContactItems;

  return nextSyncState;
}

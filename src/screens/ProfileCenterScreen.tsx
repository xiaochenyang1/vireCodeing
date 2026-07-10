import { Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import {
  ProfileDetailScreen,
  type ProfilePlatformAuthApi,
  type ProfilePlatformProfileApi,
} from './profile/ProfileDetailScreen';
import { ProfileOverviewPanel } from './profile/ProfileOverviewPanel';
import { ProfileSyncStatusCard } from './profile/ProfileSyncStatusCard';
import { ProfileTopBar } from './profile/ProfileTopBar';
import { styles } from '../styles';
import type { RecentOrder } from '../types';
import type {
  createPlatformProfileApi,
  PlatformProfileAccount,
  PlatformProfileAddressBook,
  PlatformProfileCouponWallet,
  PlatformProfileEnterpriseVerification,
  PlatformProfileEvaluationSnapshot,
  PlatformProfileIdentityVerification,
  PlatformProfileInvoiceApplication,
  PlatformProfileReceivedEvaluationSnapshot,
  PlatformProfileSpendingSnapshot,
} from '../services/platformProfileApi';
import type { createPlatformFileApi } from '../services/platformFileApi';
import { PlatformApiError } from '../services/platformApiClient';
import { getAuthSessionSnapshot } from '../utils/authSession';
import { getAppRuntimeState } from '../utils/appRuntimeState';
import {
  createLocalProfileAddress,
  createLocalProfileContact,
  deleteProfileAddress,
  deleteProfileContact,
  updateProfileAddress,
  updateProfileContact,
} from '../utils/profileAddressBook';
import {
  createEvaluationRecords,
  createLocalEvaluationRecordsFromPlatformSnapshot,
  createLocalReceivedEvaluationRecordsFromPlatformSnapshot,
  type ProfileEvaluationRecordItem,
} from '../utils/profileEvaluations';
import { createLocalCouponsFromPlatformWallet } from '../utils/profileCoupons';
import {
  createLocalInvoiceStateFromPlatformApplications,
  isPlatformInvoiceApplicationSnapshot,
} from '../utils/profileInvoices';
import {
  createProfileOverviewModel,
  profileEntryConfigs,
  type ProfileSectionId,
} from '../utils/profileOverview';
import {
  type EnterpriseVerificationRequest,
  type IdentityVerificationRequest,
  type ProfileVerificationStatus,
  type AddressConflictFieldKey,
  type AddressItem,
  type ContactConflictFieldKey,
  type ContactItem,
  createFailedProfileSyncState,
  createPendingProfileSyncState,
  createSyncedProfileSyncState,
  getProfileLocalState,
  saveProfileLocalState,
  type ProfileLocalState,
  type ProfileSyncState,
} from '../utils/profileLocalState';

const addressBookConflictMissingAuthMessage =
  '平台地址簿冲突处理需要重新登录后再同步。';
const addressBookLoadMissingAuthMessage =
  '平台地址簿拉取需要重新登录后再同步。';
const addressBookLoadFailureMessage =
  '平台地址簿拉取失败，已保留本地常用地址/联系人。';
const identityVerificationFrontFileName = '身份证正面.png';
const identityVerificationBackFileName = '身份证反面.png';
const enterpriseVerificationLicenseFileName = '营业执照.png';

type ProfilePlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
>;

function mapPlatformAddressBookToLocalState(
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

function createAddressBookConflictSummary(
  addressBook: PlatformProfileAddressBook,
) {
  const firstAddressName = Array.isArray(addressBook.addresses)
    ? addressBook.addresses[0]?.name
    : undefined;
  const firstContactName = Array.isArray(addressBook.contacts)
    ? addressBook.contacts[0]?.name
    : undefined;
  const summaryText = firstAddressName ?? firstContactName ?? '服务端暂无地址/联系人';

  return `服务端地址簿：${summaryText}`;
}

function isValidPlatformAccountProfile(
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
  if (
    status === 'reviewing' ||
    status === 'approved' ||
    status === 'rejected'
  ) {
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

function isValidPlatformIdentityVerification(
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

function mapPlatformIdentityVerificationToLocalState(
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

function isValidPlatformEnterpriseVerification(
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

function mapPlatformEnterpriseVerificationToLocalState(
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

function isValidPlatformSpendingSnapshot(
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

function isValidPlatformCouponWallet(
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

function isValidPlatformEvaluationSnapshot(
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

function isValidPlatformReceivedEvaluationSnapshot(
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
  item:
    | PlatformProfileReceivedEvaluationSnapshot['items'][number]
    | undefined,
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

function createAddressConflictFieldItems(
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

function createContactConflictFieldItems(
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

function upsertProfileItem<T extends { id: string }>(items: T[], item: T) {
  const itemExists = items.some(currentItem => currentItem.id === item.id);

  if (!itemExists) {
    return [...items, item];
  }

  return items.map(currentItem =>
    currentItem.id === item.id ? item : currentItem,
  );
}

function updateProfileAddressConflictField(
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

function getProfileItemIds(items: Array<{ id: string }>) {
  return items.map(item => item.id);
}

function updateProfileContactConflictField(
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

function createResolvedAddressBookConflictSyncState(
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

export function ProfileCenterScreen({
  now,
  orders,
  platformAuthApi,
  platformProfileApi,
  platformFileApi,
  onBackHome,
  onLogout,
}: {
  now: number;
  orders: RecentOrder[];
  platformAuthApi?: ProfilePlatformAuthApi;
  platformProfileApi?: Pick<
    ReturnType<typeof createPlatformProfileApi>,
    | 'getAccountProfile'
    | 'saveAccountProfile'
    | 'getIdentityVerification'
    | 'saveIdentityVerification'
    | 'getEnterpriseVerification'
    | 'saveEnterpriseVerification'
    | 'getInvoices'
    | 'getSpendingRecords'
    | 'getCoupons'
    | 'getEvaluations'
    | 'getReceivedEvaluations'
    | 'createInvoiceApplication'
    | 'getAddressBook'
    | 'saveAddressBook'
  >;
  platformFileApi?: ProfilePlatformFileApi;
  onBackHome: () => void;
  onLogout: () => void;
}) {
  const initialProfileState = getProfileLocalState();
  const [activeSection, setActiveSection] = useState<ProfileSectionId>();
  const [profileState, setProfileState] =
    useState<ProfileLocalState>(initialProfileState);
  const [platformSpendingSnapshot, setPlatformSpendingSnapshot] =
    useState<PlatformProfileSpendingSnapshot>();
  const [platformEvaluationRecords, setPlatformEvaluationRecords] =
    useState<ProfileEvaluationRecordItem[]>();
  const [spendingNotice, setSpendingNotice] = useState('');
  const hasLoadedPlatformAddressBook = useRef(false);
  const hasLoadedPlatformAccount = useRef(false);
  const {
    addresses,
    contacts,
    identityVerification,
    enterpriseVerification,
    coupons,
    invoices,
    invoiceDetails,
    invoiceRejectionReasons,
    invoiceType,
    invoiceTitle,
    receiverEmail,
    selectedInvoiceOrderIds,
    settings,
    account,
    password,
    syncState,
  } = profileState;
  const evaluationRecords =
    platformEvaluationRecords ?? createEvaluationRecords(orders);
  const unreadMessageCount = getAppRuntimeState().messages.filter(
    message => message.unread,
  ).length;
  const profileOverview = createProfileOverviewModel({
    account,
    identityVerification,
    enterpriseVerification,
    monthlyOrderCount: orders.length,
    unreadMessageCount,
  });

  useEffect(() => {
    if (!platformProfileApi || hasLoadedPlatformAddressBook.current) {
      return;
    }

    if (
      syncState?.operation === 'addressBook' &&
      syncState.status !== 'synced'
    ) {
      return;
    }

    let cancelled = false;
    hasLoadedPlatformAddressBook.current = true;

    if (!getAuthSessionSnapshot()?.accessToken) {
      setProfileState(current => {
        const failedState = {
          ...current,
          syncState: {
            ...createFailedProfileSyncState(
              addressBookLoadMissingAuthMessage,
              now,
              'addressBook',
            ),
            platformUpdatedAtIso: current.syncState?.platformUpdatedAtIso,
            platformAddressIds: current.syncState?.platformAddressIds,
            platformContactIds: current.syncState?.platformContactIds,
          },
        };
        saveProfileLocalState(failedState);
        return failedState;
      });
      return;
    }

    platformProfileApi
      .getAddressBook()
      .then(addressBook => {
        if (cancelled || !addressBook) {
          return;
        }

        setProfileState(current => {
          if (
            current.syncState?.operation === 'addressBook' &&
            current.syncState.status !== 'synced'
          ) {
            return current;
          }

          const addressBookState =
            mapPlatformAddressBookToLocalState(addressBook);
          const syncedState = {
            ...current,
            addresses: addressBookState.addresses,
            contacts: addressBookState.contacts,
            syncState: {
              ...createSyncedProfileSyncState(
                '平台地址簿已拉取到本地常用地址/联系人。',
                now,
                'addressBook',
              ),
              platformUpdatedAtIso: addressBook.updatedAtIso,
              platformAddressIds: getProfileItemIds(addressBookState.addresses),
              platformContactIds: getProfileItemIds(addressBookState.contacts),
            },
          };
          saveProfileLocalState(syncedState);
          return syncedState;
        });
      })
      .catch(error => {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof PlatformApiError &&
          error.code === 'AUTH_ACCESS_TOKEN_MISSING'
            ? addressBookLoadMissingAuthMessage
            : addressBookLoadFailureMessage;

        setProfileState(current => {
          if (
            current.syncState?.operation === 'addressBook' &&
            current.syncState.status !== 'synced'
          ) {
            return current;
          }

          const failedState = {
            ...current,
            syncState: {
              ...createFailedProfileSyncState(message, now, 'addressBook'),
              platformUpdatedAtIso: current.syncState?.platformUpdatedAtIso,
              platformAddressIds: current.syncState?.platformAddressIds,
              platformContactIds: current.syncState?.platformContactIds,
            },
          };
          saveProfileLocalState(failedState);
          return failedState;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [now, platformProfileApi, syncState?.operation, syncState?.status]);
  useEffect(() => {
    if (
      activeSection !== 'settings' ||
      !platformProfileApi ||
      hasLoadedPlatformAccount.current ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;
    hasLoadedPlatformAccount.current = true;

    platformProfileApi
      .getAccountProfile()
      .then(accountProfile => {
        if (cancelled || !isValidPlatformAccountProfile(accountProfile)) {
          return;
        }

        setProfileState(current => {
          const nextState = {
            ...current,
            account: {
              ...current.account,
              displayName: accountProfile.displayName,
              boundPhone: accountProfile.phone,
            },
          };
          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  useEffect(() => {
    if (
      activeSection !== 'identity-verification' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;

    platformProfileApi
      .getIdentityVerification()
      .then(identityVerificationSnapshot => {
        if (
          cancelled ||
          !isValidPlatformIdentityVerification(identityVerificationSnapshot)
        ) {
          return;
        }

        setProfileState(current => {
          const nextState = {
            ...current,
            identityVerification:
              mapPlatformIdentityVerificationToLocalState(
                identityVerificationSnapshot,
              ),
          };
          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  useEffect(() => {
    if (
      activeSection !== 'enterprise-verification' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;

    platformProfileApi
      .getEnterpriseVerification()
      .then(enterpriseVerificationSnapshot => {
        if (
          cancelled ||
          !isValidPlatformEnterpriseVerification(
            enterpriseVerificationSnapshot,
          )
        ) {
          return;
        }

        setProfileState(current => {
          const nextState = {
            ...current,
            enterpriseVerification:
              mapPlatformEnterpriseVerificationToLocalState(
                enterpriseVerificationSnapshot,
              ),
          };
          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  useEffect(() => {
    if (
      activeSection !== 'spending' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;

    platformProfileApi
      .getSpendingRecords()
      .then(spendingSnapshot => {
        if (cancelled || !isValidPlatformSpendingSnapshot(spendingSnapshot)) {
          return;
        }

        setPlatformSpendingSnapshot(spendingSnapshot);
        setSpendingNotice(
          '消费记录已按平台订单快照同步，真实支付/退款流水尚未接通。',
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setPlatformSpendingSnapshot(undefined);
        setSpendingNotice('平台消费记录拉取失败，已回退本地演示记录。');
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  useEffect(() => {
    if (
      activeSection !== 'invoices' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;

    platformProfileApi
      .getInvoices()
      .then(invoiceApplications => {
        if (cancelled) {
          return;
        }

        const validInvoiceApplications = invoiceApplications.filter(
          (
            application,
          ): application is PlatformProfileInvoiceApplication =>
            isPlatformInvoiceApplicationSnapshot(application),
        );

        setProfileState(current => {
          const nextInvoiceState =
            createLocalInvoiceStateFromPlatformApplications(
              validInvoiceApplications,
            );
          const nextState = {
            ...current,
            invoices: nextInvoiceState.invoices,
            invoiceDetails: nextInvoiceState.invoiceDetails,
            invoiceRejectionReasons: nextInvoiceState.invoiceRejectionReasons,
            ...(nextInvoiceState.invoiceType
              ? { invoiceType: nextInvoiceState.invoiceType }
              : {}),
            ...(nextInvoiceState.invoiceTitle
              ? { invoiceTitle: nextInvoiceState.invoiceTitle }
              : {}),
            ...(nextInvoiceState.receiverEmail
              ? { receiverEmail: nextInvoiceState.receiverEmail }
              : {}),
          };

          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  useEffect(() => {
    if (
      activeSection !== 'coupons' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;

    platformProfileApi
      .getCoupons()
      .then(couponWallet => {
        if (cancelled || !isValidPlatformCouponWallet(couponWallet)) {
          return;
        }

        setProfileState(current => {
          const nextState = {
            ...current,
            coupons: createLocalCouponsFromPlatformWallet(couponWallet),
          };

          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  useEffect(() => {
    if (
      activeSection !== 'evaluations' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    let cancelled = false;

    Promise.all([
      platformProfileApi.getEvaluations(),
      platformProfileApi.getReceivedEvaluations(),
    ])
      .then(([evaluationSnapshot, receivedEvaluationSnapshot]) => {
        if (
          cancelled ||
          !isValidPlatformEvaluationSnapshot(evaluationSnapshot) ||
          !isValidPlatformReceivedEvaluationSnapshot(receivedEvaluationSnapshot)
        ) {
          return;
        }

        setPlatformEvaluationRecords(
          [
            ...createLocalEvaluationRecordsFromPlatformSnapshot(
              evaluationSnapshot,
            ),
            ...createLocalReceivedEvaluationRecordsFromPlatformSnapshot(
              receivedEvaluationSnapshot,
            ),
          ],
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPlatformEvaluationRecords(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformProfileApi]);
  const updateProfileState = (
    updater: (current: ProfileLocalState) => ProfileLocalState,
    options: { markPendingSync?: boolean; syncAddressBook?: boolean } = {},
  ) => {
    setProfileState(current => {
      const nextState = updater(current);
      const syncedState =
        options.markPendingSync === false
          ? nextState
          : {
              ...nextState,
              syncState: {
                ...createPendingProfileSyncState(
                  options.syncAddressBook
                    ? '常用地址/联系人已在本地更新，正在同步平台地址簿。'
                    : undefined,
                  now,
                  options.syncAddressBook ? 'addressBook' : 'local',
                ),
                platformUpdatedAtIso: options.syncAddressBook
                  ? current.syncState?.platformUpdatedAtIso
                  : undefined,
                platformAddressIds: options.syncAddressBook
                  ? current.syncState?.platformAddressIds
                  : undefined,
                platformContactIds: options.syncAddressBook
                  ? current.syncState?.platformContactIds
                  : undefined,
              },
            };
      saveProfileLocalState(syncedState);

      if (options.syncAddressBook) {
        const immediateState = syncAddressBookToPlatform(syncedState);

        if (immediateState) {
          return immediateState;
        }
      }

      return syncedState;
    });
  };

  const keepAddressBookQueuedUntilLogin = (
    state: ProfileLocalState,
    message: string,
  ) => {
    const failedState = {
      ...state,
      syncState: {
        ...createFailedProfileSyncState(message, now, 'addressBook'),
        platformUpdatedAtIso: state.syncState?.platformUpdatedAtIso,
        platformAddressIds: state.syncState?.platformAddressIds,
        platformContactIds: state.syncState?.platformContactIds,
      },
    };

    setProfileState(failedState);
    saveProfileLocalState(failedState);
    return failedState;
  };

  const markAddressBookConflictQueuedUntilLogin = () => {
    setProfileState(current => {
      const failedState = {
        ...current,
        syncState: {
          ...createFailedProfileSyncState(
            addressBookConflictMissingAuthMessage,
            now,
            'addressBook',
          ),
          platformUpdatedAtIso: current.syncState?.platformUpdatedAtIso,
          platformAddressIds: current.syncState?.platformAddressIds,
          platformContactIds: current.syncState?.platformContactIds,
        },
      };
      saveProfileLocalState(failedState);
      return failedState;
    });
  };

  const syncAddressBookToPlatform = (
    state: ProfileLocalState,
    missingAuthMessage = '平台地址簿保存需要重新登录后再同步。',
  ) => {
    if (!platformProfileApi) {
      return undefined;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      return keepAddressBookQueuedUntilLogin(state, missingAuthMessage);
    }

    platformProfileApi
      .saveAddressBook({
        addresses: state.addresses,
        contacts: state.contacts,
        clientUpdatedAtIso: state.syncState?.updatedAtIso,
        baseUpdatedAtIso: state.syncState?.platformUpdatedAtIso,
      })
      .then(addressBook => {
        setProfileState(current => {
          const addressBookState =
            mapPlatformAddressBookToLocalState(addressBook);
          const syncedState = {
            ...current,
            addresses: addressBookState.addresses,
            contacts: addressBookState.contacts,
            syncState: {
              ...createSyncedProfileSyncState(
                '常用地址/联系人已同步到平台地址簿。',
                now,
                'addressBook',
              ),
              platformUpdatedAtIso: addressBook.updatedAtIso,
              platformAddressIds: getProfileItemIds(addressBookState.addresses),
              platformContactIds: getProfileItemIds(addressBookState.contacts),
            },
          };
          saveProfileLocalState(syncedState);
          return syncedState;
        });
      })
      .catch(error => {
        const isConflict =
          error instanceof PlatformApiError &&
          error.code === 'PROFILE_ADDRESS_BOOK_CONFLICT';

        setProfileState(current => {
          const failedState = {
            ...current,
            syncState: {
              ...createFailedProfileSyncState(
                isConflict
                  ? '平台地址簿已被其他设备更新，已保留本地常用地址/联系人。'
                  : '平台地址簿同步失败，已保留本地常用地址/联系人。',
                now,
                'addressBook',
              ),
              platformUpdatedAtIso: current.syncState?.platformUpdatedAtIso,
              platformAddressIds: current.syncState?.platformAddressIds,
              platformContactIds: current.syncState?.platformContactIds,
            },
          };
          saveProfileLocalState(failedState);
          return failedState;
        });

        if (isConflict) {
          if (!getAuthSessionSnapshot()?.accessToken) {
            markAddressBookConflictQueuedUntilLogin();
            return;
          }

          platformProfileApi
            .getAddressBook()
            .then(addressBook => {
              if (!addressBook) {
                return;
              }

              const addressBookState =
                mapPlatformAddressBookToLocalState(addressBook);
              setProfileState(current => {
                const localAddressIds = new Set(
                  current.addresses.map(address => address.id),
                );
                const localContactIds = new Set(
                  current.contacts.map(contact => contact.id),
                );
                const latestPlatformAddressIds = new Set(
                  addressBookState.addresses.map(address => address.id),
                );
                const latestPlatformContactIds = new Set(
                  addressBookState.contacts.map(contact => contact.id),
                );
                const previousPlatformAddressIds = new Set(
                  current.syncState?.platformAddressIds ?? [],
                );
                const previousPlatformContactIds = new Set(
                  current.syncState?.platformContactIds ?? [],
                );
                const conflictAddressFieldItems =
                  createAddressConflictFieldItems(
                    current.addresses,
                    addressBookState.addresses,
                  );
                const conflictContactFieldItems =
                  createContactConflictFieldItems(
                    current.contacts,
                    addressBookState.contacts,
                  );
                const nextState = {
                  ...current,
                  syncState: {
                    ...current.syncState,
                    status: 'failed' as const,
                    operation: 'addressBook' as const,
                    message:
                      current.syncState?.message ??
                      '平台地址簿已被其他设备更新，已保留本地常用地址/联系人。',
                    updatedAtText: current.syncState?.updatedAtText ?? '刚刚',
                    updatedAtIso:
                      current.syncState?.updatedAtIso ??
                      new Date(now).toISOString(),
                    platformUpdatedAtIso: addressBook.updatedAtIso,
                    platformAddressIds: getProfileItemIds(
                      addressBookState.addresses,
                    ),
                    platformContactIds: getProfileItemIds(
                      addressBookState.contacts,
                    ),
                    conflictSummaryText:
                      createAddressBookConflictSummary(addressBook),
                    conflictAddressItems: addressBookState.addresses.filter(
                      address => !localAddressIds.has(address.id),
                    ),
                    conflictAddressFieldItems,
                    conflictDeletedAddressItems: current.addresses.filter(
                      address =>
                        previousPlatformAddressIds.has(address.id) &&
                        !latestPlatformAddressIds.has(address.id),
                    ),
                    conflictContactItems: addressBookState.contacts.filter(
                      contact => !localContactIds.has(contact.id),
                    ),
                    conflictContactFieldItems,
                    conflictDeletedContactItems: current.contacts.filter(
                      contact =>
                        previousPlatformContactIds.has(contact.id) &&
                        !latestPlatformContactIds.has(contact.id),
                    ),
                  },
                };
                saveProfileLocalState(nextState);
                return nextState;
              });
            })
            .catch(fetchConflictError => {
              if (
                fetchConflictError instanceof PlatformApiError &&
                fetchConflictError.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ) {
                markAddressBookConflictQueuedUntilLogin();
              }
            });
        }
      });

    return undefined;
  };

  const adoptConflictAddress = (addressId: string) => {
    updateProfileState(
      current => {
        const conflictAddress = current.syncState?.conflictAddressItems?.find(
          address => address.id === addressId,
        );

        if (!conflictAddress || !current.syncState) {
          return current;
        }

        return {
          ...current,
          addresses: upsertProfileItem(current.addresses, conflictAddress),
          syncState: createResolvedAddressBookConflictSyncState({
            ...current.syncState,
            conflictAddressItems: current.syncState.conflictAddressItems?.filter(
              address => address.id !== addressId,
            ),
          }),
        };
      },
      { markPendingSync: false },
    );
  };

  const adoptConflictAddressField = (fieldId: string) => {
    updateProfileState(
      current => {
        const conflictField =
          current.syncState?.conflictAddressFieldItems?.find(
            fieldItem => fieldItem.id === fieldId,
          );

        if (!conflictField || !current.syncState) {
          return current;
        }

        return {
          ...current,
          addresses: updateProfileAddressConflictField(
            current.addresses,
            conflictField.addressId,
            conflictField.fieldKey,
            conflictField.platformValue,
          ),
          syncState: createResolvedAddressBookConflictSyncState({
            ...current.syncState,
            conflictAddressFieldItems:
              current.syncState.conflictAddressFieldItems?.filter(
                fieldItem => fieldItem.id !== fieldId,
              ),
          }),
        };
      },
      { markPendingSync: false },
    );
  };

  const adoptConflictDeletedAddress = (addressId: string) => {
    updateProfileState(
      current => {
        if (!current.syncState) {
          return current;
        }

        return {
          ...current,
          addresses: current.addresses.filter(
            address => address.id !== addressId,
          ),
          syncState: createResolvedAddressBookConflictSyncState({
            ...current.syncState,
            conflictDeletedAddressItems:
              current.syncState.conflictDeletedAddressItems?.filter(
                address => address.id !== addressId,
              ),
          }),
        };
      },
      { markPendingSync: false },
    );
  };

  const adoptConflictContactField = (fieldId: string) => {
    updateProfileState(
      current => {
        const conflictField =
          current.syncState?.conflictContactFieldItems?.find(
            fieldItem => fieldItem.id === fieldId,
          );

        if (!conflictField || !current.syncState) {
          return current;
        }

        return {
          ...current,
          contacts: updateProfileContactConflictField(
            current.contacts,
            conflictField.contactId,
            conflictField.fieldKey,
            conflictField.platformValue,
          ),
          syncState: createResolvedAddressBookConflictSyncState({
            ...current.syncState,
            conflictContactFieldItems:
              current.syncState.conflictContactFieldItems?.filter(
                fieldItem => fieldItem.id !== fieldId,
              ),
          }),
        };
      },
      { markPendingSync: false },
    );
  };

  const adoptConflictContact = (contactId: string) => {
    updateProfileState(
      current => {
        const conflictContact = current.syncState?.conflictContactItems?.find(
          contact => contact.id === contactId,
        );

        if (!conflictContact || !current.syncState) {
          return current;
        }

        return {
          ...current,
          contacts: upsertProfileItem(current.contacts, conflictContact),
          syncState: createResolvedAddressBookConflictSyncState({
            ...current.syncState,
            conflictContactItems: current.syncState.conflictContactItems?.filter(
              contact => contact.id !== contactId,
            ),
          }),
        };
      },
      { markPendingSync: false },
    );
  };

  const adoptConflictDeletedContact = (contactId: string) => {
    updateProfileState(
      current => {
        if (!current.syncState) {
          return current;
        }

        return {
          ...current,
          contacts: current.contacts.filter(contact => contact.id !== contactId),
          syncState: createResolvedAddressBookConflictSyncState({
            ...current.syncState,
            conflictDeletedContactItems:
              current.syncState.conflictDeletedContactItems?.filter(
                contact => contact.id !== contactId,
              ),
          }),
        };
      },
      { markPendingSync: false },
    );
  };

  if (activeSection) {
    return (
      <ProfileDetailScreen
        now={now}
        sectionId={activeSection}
        orders={orders}
        addresses={addresses}
        contacts={contacts}
        identityVerification={identityVerification}
        enterpriseVerification={enterpriseVerification}
        evaluationRecords={evaluationRecords}
        coupons={coupons}
        invoices={invoices}
        invoiceDetails={invoiceDetails}
        invoiceRejectionReasons={invoiceRejectionReasons}
        invoiceType={invoiceType}
        invoiceTitle={invoiceTitle}
        receiverEmail={receiverEmail}
        selectedInvoiceOrderIds={selectedInvoiceOrderIds}
        settings={settings}
        account={account}
        password={password}
        platformSpendingSnapshot={platformSpendingSnapshot}
        spendingNotice={spendingNotice}
        platformAuthApi={platformAuthApi}
        platformProfileApi={
          platformProfileApi as ProfilePlatformProfileApi | undefined
        }
        platformFileApi={platformFileApi}
        onAddAddress={address =>
          updateProfileState(current => ({
            ...current,
            addresses: [
              ...current.addresses,
              createLocalProfileAddress(current.addresses, address),
            ],
          }), { syncAddressBook: true })
        }
        onDeleteAddress={addressId =>
          updateProfileState(current => ({
            ...current,
            addresses: deleteProfileAddress(current.addresses, addressId),
          }), { syncAddressBook: true })
        }
        onUpdateAddress={(addressId, changes) =>
          updateProfileState(current => ({
            ...current,
            addresses: updateProfileAddress(
              current.addresses,
              addressId,
              changes,
            ),
          }), { syncAddressBook: true })
        }
        onAddContact={contact =>
          updateProfileState(current => ({
            ...current,
            contacts: [
              ...current.contacts,
              createLocalProfileContact(current.contacts, contact),
            ],
          }), { syncAddressBook: true })
        }
        onDeleteContact={contactId =>
          updateProfileState(current => ({
            ...current,
            contacts: deleteProfileContact(current.contacts, contactId),
          }), { syncAddressBook: true })
        }
        onUpdateContact={(contactId, changes) =>
          updateProfileState(current => ({
            ...current,
            contacts: updateProfileContact(
              current.contacts,
              contactId,
              changes,
            ),
          }), { syncAddressBook: true })
        }
        onSubmitIdentityVerification={request =>
          updateProfileState(current => ({
            ...current,
            identityVerification: request,
          }), {
            markPendingSync: !platformProfileApi,
          })
        }
        onRejectIdentityVerification={reason =>
          updateProfileState(current => ({
            ...current,
            identityVerification: current.identityVerification
              ? {
                  ...current.identityVerification,
                  status: 'rejected',
                  rejectionReason: reason,
                }
              : current.identityVerification,
          }))
        }
        onSubmitEnterpriseVerification={request =>
          updateProfileState(current => ({
            ...current,
            enterpriseVerification: request,
          }), {
            markPendingSync: !platformProfileApi,
          })
        }
        onRejectEnterpriseVerification={reason =>
          updateProfileState(current => ({
            ...current,
            enterpriseVerification: current.enterpriseVerification
              ? {
                  ...current.enterpriseVerification,
                  status: 'rejected',
                  rejectionReason: reason,
                }
              : current.enterpriseVerification,
          }))
        }
        onUpdateCoupons={nextCoupons =>
          updateProfileState(current => ({ ...current, coupons: nextCoupons }))
        }
        onUpdateInvoices={nextInvoices =>
          updateProfileState(current => ({ ...current, invoices: nextInvoices }))
        }
        onUpdateInvoiceDetails={nextInvoiceDetails =>
          updateProfileState(current => ({
            ...current,
            invoiceDetails: nextInvoiceDetails,
          }))
        }
        onUpdateInvoiceRejectionReasons={nextReasons =>
          updateProfileState(current => ({
            ...current,
            invoiceRejectionReasons: nextReasons,
          }))
        }
        onUpdateInvoiceSelections={nextSelectedInvoiceOrderIds =>
          updateProfileState(current => ({
            ...current,
            selectedInvoiceOrderIds: nextSelectedInvoiceOrderIds,
          }))
        }
        onUpdateInvoiceMeta={changes =>
          updateProfileState(current => ({
            ...current,
            ...changes,
          }))
        }
        onUpdateSettings={nextSettings =>
          updateProfileState(current => ({ ...current, settings: nextSettings }))
        }
        onUpdateAccount={nextAccount =>
          updateProfileState(current => ({ ...current, account: nextAccount }))
        }
        onUpdatePassword={nextPassword =>
          updateProfileState(current => ({ ...current, password: nextPassword }))
        }
        onBackOverview={() => setActiveSection(undefined)}
        onLogout={onLogout}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <ProfileTopBar
        title="个人中心"
        subtitle="账号资料与常用功能"
        onBack={onBackHome}
        backTestID="support-back-home"
        backText="返回首页"
      />

      <ProfileOverviewPanel
        avatarInitial={profileOverview.avatarInitial}
        displayName={profileOverview.displayName}
        accountTypeLabel={profileOverview.accountTypeLabel}
        maskedPhone={profileOverview.maskedPhone}
        verificationLabel={profileOverview.verificationLabel}
        enterpriseVerificationLabel={
          profileOverview.enterpriseVerificationLabel
        }
        creditScore={profileOverview.creditScore}
        monthlyOrderCount={profileOverview.monthlyOrderCount}
        unreadMessageCount={profileOverview.unreadMessageCount}
      />

      <ProfileSyncStatusCard
        syncState={syncState}
        onRetry={() =>
          syncState?.operation === 'addressBook' && platformProfileApi
            ? syncAddressBookToPlatform(
                profileState,
                '平台地址簿重试需要重新登录后再同步。',
              )
            : updateProfileState(
                current => ({
                  ...current,
                  syncState: createSyncedProfileSyncState(),
                }),
                { markPendingSync: false },
              )
        }
        onMarkFailed={() =>
          updateProfileState(
            current => ({
              ...current,
              syncState: createFailedProfileSyncState(),
            }),
            { markPendingSync: false },
          )
        }
        onAdoptConflictAddress={adoptConflictAddress}
        onAdoptConflictAddressField={adoptConflictAddressField}
        onAdoptConflictDeletedAddress={adoptConflictDeletedAddress}
        onAdoptConflictContact={adoptConflictContact}
        onAdoptConflictContactField={adoptConflictContactField}
        onAdoptConflictDeletedContact={adoptConflictDeletedContact}
      />

      <View style={styles.detailCard}>
        <Text style={styles.draftSectionTitle}>功能入口</Text>
        {profileEntryConfigs.map(entry => (
          <Pressable
            key={entry.id}
            testID={`profile-entry-${entry.id}`}
            style={({ pressed }) => [
              styles.driverInfoCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => setActiveSection(entry.id)}
          >
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{entry.title}</Text>
              <Text style={styles.routeAction}>查看</Text>
            </View>
            <Text style={styles.detailMeta}>{entry.description}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ProfileDetailScreen,
  type ProfilePlatformAuthApi,
  type ProfilePlatformNotificationsApi,
  type ProfilePlatformProfileApi,
} from './profile/ProfileDetailScreen';
import { ProfileOverviewPanel } from './profile/ProfileOverviewPanel';
import { ProfileSyncStatusCard } from './profile/ProfileSyncStatusCard';
import { ProfileTopBar } from './profile/ProfileTopBar';
import type { PushNotificationPermissionStatus } from '../hooks/usePushNotifications';
import { styles } from '../styles';
import type { RecentOrder } from '../types';
import type {
  createPlatformProfileApi,
  PlatformProfileEnterpriseVerification,
  PlatformProfileIdentityVerification,
  PlatformProfileInvoiceApplication,
  PlatformProfileSpendingSnapshot,
} from '../services/platformProfileApi';
import type { createPlatformFileApi } from '../services/platformFileApi';
import { PlatformApiError } from '../services/platformApiClient';
import { getAuthSessionSnapshot } from '../utils/authSession';
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
  hydrateProfileEvaluationRecords,
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
  getProfileEntryConfigs,
  type ProfileSectionId,
} from '../utils/profileOverview';
import {
  createPlatformProfileSettingsSnapshot,
  isOrderNotificationEnabled,
} from '../utils/profileSettings';
import {
  createFailedProfileSyncState,
  createPendingProfileSyncState,
  createSyncedProfileSyncState,
  getProfileLocalState,
  saveProfileLocalState,
  type ProfileInvoiceApplicationSyncMode,
  type ProfileInvoiceApplicationSyncRequest,
  type ProfileLocalState,
  type ProfileSyncState,
  type ProfileSyncMutationOptions,
  type VerificationFileRef,
} from '../utils/profileLocalState';
import {
  createAddressBookConflictSummary,
  createAddressConflictFieldItems,
  createContactConflictFieldItems,
  createResolvedAddressBookConflictSyncState,
  getProfileItemIds,
  isValidPlatformAccountProfile,
  isValidPlatformCouponWallet,
  isValidPlatformEnterpriseVerification,
  isValidPlatformEvaluationSnapshot,
  isValidPlatformIdentityVerification,
  isValidPlatformReceivedEvaluationSnapshot,
  isValidPlatformSpendingSnapshot,
  mapPlatformAccountProfileToLocalState,
  mapPlatformAddressBookToLocalState,
  mapPlatformEnterpriseVerificationToLocalState,
  mapPlatformIdentityVerificationToLocalState,
  updateProfileAddressConflictField,
  updateProfileContactConflictField,
  upsertProfileItem,
} from '../utils/profilePlatformSync';

const addressBookConflictMissingAuthMessage =
  '平台地址簿冲突处理需要重新登录后再同步。';
const addressBookLoadMissingAuthMessage =
  '平台地址簿拉取需要重新登录后再同步。';
const addressBookLoadFailureMessage =
  '平台地址簿拉取失败，已保留本地常用地址/联系人。';
const spendingLoadMissingAuthMessage =
  '平台消费记录拉取需要重新登录后再同步。';
const couponLoadMissingAuthMessage =
  '平台优惠券拉取需要重新登录后再同步。';
const evaluationLoadMissingAuthMessage =
  '平台评价记录拉取需要重新登录后再同步。';
const localIdentityVerificationSyncMessage =
  '实名认证资料已在本地保存，等待真实认证审核接口接入后同步。';
const localEnterpriseVerificationSyncMessage =
  '企业认证资料已在本地保存，等待真实认证审核接口接入后同步。';
const platformIdentityVerificationSyncedMessage =
  '实名认证资料已同步到平台审核。';
const platformEnterpriseVerificationSyncedMessage =
  '企业认证资料已同步到平台审核。';

function doesInvoiceApplicationMatchRequest(
  request: ProfileInvoiceApplicationSyncRequest | undefined,
  invoiceApplications: PlatformProfileInvoiceApplication[],
) {
  if (!request?.orderIds.length) {
    return false;
  }

  return invoiceApplications.some(application =>
    request.orderIds.every(orderId => application.orderIds.includes(orderId)),
  );
}

function shouldResolveInvoiceApplicationSync(
  syncState: ProfileSyncState | undefined,
  invoiceApplications: PlatformProfileInvoiceApplication[],
) {
  if (syncState?.operation !== 'invoiceApplication') {
    return false;
  }

  if (syncState.invoiceApplicationSyncMode === 'refresh') {
    return true;
  }

  return doesInvoiceApplicationMatchRequest(
    syncState.invoiceApplicationRequest,
    invoiceApplications,
  );
}

function getInvoiceApplicationSyncedMessage(syncState?: ProfileSyncState) {
  if (syncState?.invoiceApplicationSyncMode === 'submit') {
    return '平台发票申请状态已从平台刷新。';
  }

  return '平台发票申请记录已同步。';
}

function shouldKeepLocalVerificationSnapshot(input: {
  syncState: ProfileSyncState | undefined;
  operation: 'identityVerification' | 'enterpriseVerification';
  localUpdatedAtIso?: string;
  platformUpdatedAtIso?: string;
}) {
  if (
    input.syncState?.operation === input.operation &&
    input.syncState.status !== 'synced'
  ) {
    return true;
  }

  if (!input.localUpdatedAtIso || !input.platformUpdatedAtIso) {
    return false;
  }

  const localUpdatedAt = Date.parse(input.localUpdatedAtIso);
  const platformUpdatedAt = Date.parse(input.platformUpdatedAtIso);

  return (
    Number.isFinite(localUpdatedAt) &&
    Number.isFinite(platformUpdatedAt) &&
    localUpdatedAt > platformUpdatedAt
  );
}

function createPlatformAccountSnapshotRequest(
  state: Pick<ProfileLocalState, 'account' | 'settings'>,
) {
  return {
    displayName: state.account.displayName,
    ...(state.account.avatarFileId
      ? { avatarFileId: state.account.avatarFileId }
      : {}),
    phone: state.account.boundPhone,
    ...createPlatformProfileSettingsSnapshot(state.settings),
  };
}

function applyPlatformInvoiceApplicationsToProfileState(
  current: ProfileLocalState,
  invoiceApplications: PlatformProfileInvoiceApplication[],
  now: number,
  options: {
    clearSelectedInvoiceOrderIds?: boolean;
    resolveSyncFailureMode?: 'none' | 'auto' | 'always';
    successMessage?: string;
  } = {},
) {
  const nextInvoiceState =
    createLocalInvoiceStateFromPlatformApplications(invoiceApplications);
  const shouldMarkSynced =
    options.resolveSyncFailureMode === 'always' ||
    (options.resolveSyncFailureMode === 'auto' &&
      shouldResolveInvoiceApplicationSync(
        current.syncState,
        invoiceApplications,
      ));

  return {
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
    ...(options.clearSelectedInvoiceOrderIds
      ? { selectedInvoiceOrderIds: [] }
      : {}),
    ...(shouldMarkSynced
      ? {
          syncState: createSyncedProfileSyncState(
            options.successMessage ??
              getInvoiceApplicationSyncedMessage(current.syncState),
            now,
            'invoiceApplication',
          ),
        }
      : {}),
  };
}

type ProfilePlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
> &
  Partial<Pick<ReturnType<typeof createPlatformFileApi>, 'getFileMetadata'>>;

async function hydrateVerificationFileRef(
  fileRef: VerificationFileRef,
  platformFileApi?: ProfilePlatformFileApi,
) {
  const fileId = fileRef.fileId.trim();

  if (!fileId || !platformFileApi?.getFileMetadata) {
    return fileRef;
  }

  try {
    const metadata = await platformFileApi.getFileMetadata(fileId);

    return {
      ...fileRef,
      fileId: metadata.id,
      status: metadata.status,
      ...(metadata.objectKey ? { objectKey: metadata.objectKey } : {}),
      ...(metadata.publicUrl ? { publicUrl: metadata.publicUrl } : {}),
    };
  } catch {
    return fileRef;
  }
}

async function hydrateIdentityVerificationSnapshot(
  verification: PlatformProfileIdentityVerification,
  platformFileApi?: ProfilePlatformFileApi,
) {
  const localVerification =
    mapPlatformIdentityVerificationToLocalState(verification);
  const identityPhotoFiles = await Promise.all(
    (localVerification.identityPhotoFiles ?? []).map(fileRef =>
      hydrateVerificationFileRef(fileRef, platformFileApi),
    ),
  );

  return identityPhotoFiles.length > 0
    ? {
        ...localVerification,
        identityPhotoFiles,
      }
    : localVerification;
}

async function hydrateEnterpriseVerificationSnapshot(
  verification: PlatformProfileEnterpriseVerification,
  platformFileApi?: ProfilePlatformFileApi,
) {
  const localVerification =
    mapPlatformEnterpriseVerificationToLocalState(verification);
  const licenseFiles = await Promise.all(
    (localVerification.licenseFiles ?? []).map(fileRef =>
      hydrateVerificationFileRef(fileRef, platformFileApi),
    ),
  );

  return licenseFiles.length > 0
    ? {
        ...localVerification,
        licenseFiles,
      }
    : localVerification;
}

export function ProfileCenterScreen({
  now,
  orders,
  unreadMessageCount,
  notificationPermissionStatus,
  platformAuthApi,
  platformProfileApi,
  platformNotificationsApi,
  platformFileApi,
  onBackHome,
  onOrderNotificationsEnabledChange,
  onLogout,
}: {
  now: number;
  orders: RecentOrder[];
  unreadMessageCount: number;
  notificationPermissionStatus?: PushNotificationPermissionStatus;
  platformAuthApi?: ProfilePlatformAuthApi;
  platformNotificationsApi?: ProfilePlatformNotificationsApi;
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
  onOrderNotificationsEnabledChange?: (enabled: boolean) => void;
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
  const [isRefreshingPlatformSpending, setIsRefreshingPlatformSpending] =
    useState(false);
  const [isRefreshingPlatformCoupons, setIsRefreshingPlatformCoupons] =
    useState(false);
  const [isRefreshingPlatformEvaluations, setIsRefreshingPlatformEvaluations] =
    useState(false);
  const [spendingNotice, setSpendingNotice] = useState('');
  const [couponNotice, setCouponNotice] = useState('');
  const [evaluationNotice, setEvaluationNotice] = useState('');
  const hasLoadedPlatformAddressBook = useRef(false);
  const hasLoadedPlatformAccount = useRef(false);
  const spendingLoadRequestVersionRef = useRef(0);
  const couponLoadRequestVersionRef = useRef(0);
  const evaluationLoadRequestVersionRef = useRef(0);
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
  const profileOverview = createProfileOverviewModel({
    account,
    identityVerification,
    enterpriseVerification,
    monthlyOrderCount: orders.length,
    unreadMessageCount,
  });
  const profileEntryConfigsForMode = getProfileEntryConfigs(
    Boolean(platformProfileApi),
  );

  useEffect(() => {
    onOrderNotificationsEnabledChange?.(
      isOrderNotificationEnabled(settings),
    );
  }, [onOrderNotificationsEnabledChange, settings]);

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
      !getAuthSessionSnapshot()?.accessToken ||
      (syncState?.operation === 'accountProfile' &&
        syncState.status !== 'synced')
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
          const nextAccountState = mapPlatformAccountProfileToLocalState(
            accountProfile,
            current.settings,
          );
          const nextState = {
            ...current,
            ...nextAccountState,
          };
          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    platformProfileApi,
    syncState?.operation,
    syncState?.status,
  ]);
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
      .then(async identityVerificationSnapshot => {
        if (
          cancelled ||
          !isValidPlatformIdentityVerification(identityVerificationSnapshot)
        ) {
          return;
        }

        const nextIdentityVerification =
          await hydrateIdentityVerificationSnapshot(
            identityVerificationSnapshot,
            platformFileApi,
          );

        if (cancelled) {
          return;
        }

        setProfileState(current => {
          if (
            shouldKeepLocalVerificationSnapshot({
              syncState: current.syncState,
              operation: 'identityVerification',
              localUpdatedAtIso: current.identityVerification?.updatedAtIso,
              platformUpdatedAtIso: identityVerificationSnapshot.updatedAtIso,
            })
          ) {
            return current;
          }

          const nextState = {
            ...current,
            identityVerification: nextIdentityVerification,
          };
          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, now, platformFileApi, platformProfileApi]);
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
      .then(async enterpriseVerificationSnapshot => {
        if (
          cancelled ||
          !isValidPlatformEnterpriseVerification(enterpriseVerificationSnapshot)
        ) {
          return;
        }

        const nextEnterpriseVerification =
          await hydrateEnterpriseVerificationSnapshot(
            enterpriseVerificationSnapshot,
            platformFileApi,
          );

        if (cancelled) {
          return;
        }

        setProfileState(current => {
          if (
            shouldKeepLocalVerificationSnapshot({
              syncState: current.syncState,
              operation: 'enterpriseVerification',
              localUpdatedAtIso: current.enterpriseVerification?.updatedAtIso,
              platformUpdatedAtIso: enterpriseVerificationSnapshot.updatedAtIso,
            })
          ) {
            return current;
          }

          const nextState = {
            ...current,
            enterpriseVerification: nextEnterpriseVerification,
          };
          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, platformFileApi, platformProfileApi]);
  const refreshPlatformSpendingRecords = useCallback(
    (source: 'open' | 'manual') => {
      if (!platformProfileApi) {
        return;
      }

      const requestVersion = ++spendingLoadRequestVersionRef.current;

      if (!getAuthSessionSnapshot()?.accessToken) {
        setPlatformSpendingSnapshot(undefined);
        setSpendingNotice(spendingLoadMissingAuthMessage);
        setIsRefreshingPlatformSpending(false);
        return;
      }

      if (source === 'manual') {
        setIsRefreshingPlatformSpending(true);
      }

      platformProfileApi
        .getSpendingRecords()
        .then(spendingSnapshot => {
          if (
            requestVersion !== spendingLoadRequestVersionRef.current ||
            !isValidPlatformSpendingSnapshot(spendingSnapshot)
          ) {
            return;
          }

          setPlatformSpendingSnapshot(spendingSnapshot);
          setSpendingNotice(
            source === 'manual'
              ? '平台消费记录已手动刷新到最新资金流水。'
              : '消费记录已按平台资金流水同步。',
          );
        })
        .catch(() => {
          if (requestVersion !== spendingLoadRequestVersionRef.current) {
            return;
          }

          setPlatformSpendingSnapshot(undefined);
          setSpendingNotice('平台消费记录拉取失败，已回退本地演示记录。');
        })
        .finally(() => {
          if (
            source === 'manual' &&
            requestVersion === spendingLoadRequestVersionRef.current
          ) {
            setIsRefreshingPlatformSpending(false);
          }
        });
    },
    [platformProfileApi],
  );
  useEffect(() => {
    if (
      (activeSection !== 'spending' && activeSection !== 'invoices') ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    refreshPlatformSpendingRecords('open');
  }, [activeSection, platformProfileApi, refreshPlatformSpendingRecords]);
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
          (application): application is PlatformProfileInvoiceApplication =>
            isPlatformInvoiceApplicationSnapshot(application),
        );

        setProfileState(current => {
          const nextState = applyPlatformInvoiceApplicationsToProfileState(
            current,
            validInvoiceApplications,
            now,
            {
              resolveSyncFailureMode: 'auto',
            },
          );

          saveProfileLocalState(nextState);
          return nextState;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeSection, now, platformProfileApi]);
  const refreshPlatformCoupons = useCallback(
    (source: 'open' | 'manual') => {
      if (!platformProfileApi) {
        return;
      }

      const requestVersion = ++couponLoadRequestVersionRef.current;

      if (!getAuthSessionSnapshot()?.accessToken) {
        setCouponNotice(couponLoadMissingAuthMessage);
        setIsRefreshingPlatformCoupons(false);
        return;
      }

      if (source === 'manual') {
        setIsRefreshingPlatformCoupons(true);
      }

      platformProfileApi
        .getCoupons()
        .then(couponWallet => {
          if (
            requestVersion !== couponLoadRequestVersionRef.current ||
            !isValidPlatformCouponWallet(couponWallet)
          ) {
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
          setCouponNotice(
            source === 'manual'
              ? '平台优惠券已手动刷新到最新券包。'
              : '优惠券已按平台券包同步。',
          );
        })
        .catch(() => {
          if (requestVersion !== couponLoadRequestVersionRef.current) {
            return;
          }

          setCouponNotice('平台优惠券拉取失败，已保留当前优惠券列表。');
        })
        .finally(() => {
          if (
            source === 'manual' &&
            requestVersion === couponLoadRequestVersionRef.current
          ) {
            setIsRefreshingPlatformCoupons(false);
          }
        });
    },
    [platformProfileApi],
  );
  useEffect(() => {
    if (
      activeSection !== 'coupons' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    refreshPlatformCoupons('open');
  }, [activeSection, platformProfileApi, refreshPlatformCoupons]);
  const refreshPlatformEvaluations = useCallback(
    (source: 'open' | 'manual') => {
      if (!platformProfileApi) {
        return;
      }

      const requestVersion = ++evaluationLoadRequestVersionRef.current;

      if (!getAuthSessionSnapshot()?.accessToken) {
        setPlatformEvaluationRecords(undefined);
        setEvaluationNotice(evaluationLoadMissingAuthMessage);
        setIsRefreshingPlatformEvaluations(false);
        return;
      }

      if (source === 'manual') {
        setIsRefreshingPlatformEvaluations(true);
      }

      Promise.all([
        platformProfileApi.getEvaluations(),
        platformProfileApi.getReceivedEvaluations(),
      ])
        .then(async ([evaluationSnapshot, receivedEvaluationSnapshot]) => {
          if (
            requestVersion !== evaluationLoadRequestVersionRef.current ||
            !isValidPlatformEvaluationSnapshot(evaluationSnapshot) ||
            !isValidPlatformReceivedEvaluationSnapshot(receivedEvaluationSnapshot)
          ) {
            return;
          }

          const nextEvaluationRecords = await hydrateProfileEvaluationRecords(
            [
              ...createLocalEvaluationRecordsFromPlatformSnapshot(
                evaluationSnapshot,
              ),
              ...createLocalReceivedEvaluationRecordsFromPlatformSnapshot(
                receivedEvaluationSnapshot,
              ),
            ],
            platformFileApi,
          );

          if (requestVersion !== evaluationLoadRequestVersionRef.current) {
            return;
          }

          setPlatformEvaluationRecords(nextEvaluationRecords);
          setEvaluationNotice(
            source === 'manual'
              ? '平台评价记录已手动刷新到最新评价数据。'
              : '评价记录已按平台评价数据同步。',
          );
        })
        .catch(() => {
          if (requestVersion !== evaluationLoadRequestVersionRef.current) {
            return;
          }

          setPlatformEvaluationRecords(undefined);
          setEvaluationNotice('平台评价记录拉取失败，已回退本地评价记录。');
        })
        .finally(() => {
          if (
            source === 'manual' &&
            requestVersion === evaluationLoadRequestVersionRef.current
          ) {
            setIsRefreshingPlatformEvaluations(false);
          }
        });
    },
    [platformFileApi, platformProfileApi],
  );
  useEffect(() => {
    if (
      activeSection !== 'evaluations' ||
      !platformProfileApi ||
      !getAuthSessionSnapshot()?.accessToken
    ) {
      return;
    }

    refreshPlatformEvaluations('open');
  }, [
    activeSection,
    platformProfileApi,
    refreshPlatformEvaluations,
  ]);
  const updateProfileState = (
    updater: (current: ProfileLocalState) => ProfileLocalState,
    options: ProfileSyncMutationOptions & { syncAddressBook?: boolean } = {},
  ) => {
    setProfileState(current => {
      const nextState = updater(current);
      const syncOperation =
        options.syncOperation ??
        (options.syncAddressBook ? 'addressBook' : 'local');
      const syncedState = options.markSynced
        ? {
            ...nextState,
            syncState: {
              ...createSyncedProfileSyncState(
                options.syncMessage,
                now,
                syncOperation,
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
          }
        : options.markFailed
        ? {
            ...nextState,
            syncState: {
              ...createFailedProfileSyncState(
                options.syncMessage,
                now,
                syncOperation,
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
          }
        : options.markPendingSync === false
        ? nextState
        : {
            ...nextState,
            syncState: {
              ...createPendingProfileSyncState(
                options.syncMessage ??
                  (options.syncAddressBook
                    ? '常用地址/联系人已在本地更新，正在同步平台地址簿。'
                    : undefined),
                now,
                syncOperation,
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

  const refreshPlatformInvoices = async (
    options: {
      clearSelectedInvoiceOrderIds?: boolean;
      resolveSyncFailureMode?: 'none' | 'auto' | 'always';
      successMessage?: string;
    } = {},
  ) => {
    if (!platformProfileApi) {
      return false;
    }

    const invoiceApplications = await platformProfileApi.getInvoices();
    const validInvoiceApplications = invoiceApplications.filter(
      (application): application is PlatformProfileInvoiceApplication =>
        isPlatformInvoiceApplicationSnapshot(application),
    );

    setProfileState(current => {
      const nextState = applyPlatformInvoiceApplicationsToProfileState(
        current,
        validInvoiceApplications,
        now,
        options,
      );
      saveProfileLocalState(nextState);
      return nextState;
    });

    return true;
  };

  const markInvoiceApplicationSyncFailed = ({
    message,
    mode,
    request,
    clearSelectedInvoiceOrderIds = false,
  }: {
    message: string;
    mode: ProfileInvoiceApplicationSyncMode;
    request?: ProfileInvoiceApplicationSyncRequest;
    clearSelectedInvoiceOrderIds?: boolean;
  }) => {
    setProfileState(current => {
      const nextState = {
        ...current,
        ...(clearSelectedInvoiceOrderIds
          ? { selectedInvoiceOrderIds: [] }
          : {}),
        syncState: {
          ...createFailedProfileSyncState(message, now, 'invoiceApplication'),
          invoiceApplicationSyncMode: mode,
          ...(request ? { invoiceApplicationRequest: request } : {}),
        },
      };

      saveProfileLocalState(nextState);
      return nextState;
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

  const retryIdentityVerificationSync = () => {
    const currentProfileState = getProfileLocalState();
    const currentVerification = currentProfileState.identityVerification;

    if (!currentVerification) {
      return;
    }

    if (!platformProfileApi) {
      updateProfileState(current => current, {
        markSynced: true,
        syncMessage: '实名认证资料已按本地演示状态记录。',
        syncOperation: 'identityVerification',
      });
      return;
    }

    const identityFrontFileId =
      currentVerification.identityPhotoFiles?.[0]?.fileId;
    const identityBackFileId =
      currentVerification.identityPhotoFiles?.[1]?.fileId;

    if (!identityFrontFileId || !identityBackFileId) {
      updateProfileState(current => current, {
        markFailed: true,
        syncMessage: '实名认证重试需要先补齐身份证正反面凭证。',
        syncOperation: 'identityVerification',
      });
      return;
    }

    if (!currentVerification.faceVerified) {
      updateProfileState(current => current, {
        markFailed: true,
        syncMessage: '实名认证重试需要先完成人脸核验。',
        syncOperation: 'identityVerification',
      });
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      updateProfileState(current => current, {
        markFailed: true,
        syncMessage: '实名认证重试需要重新登录后再同步。',
        syncOperation: 'identityVerification',
      });
      return;
    }

    platformProfileApi
      .saveIdentityVerification({
        realName: currentVerification.realName,
        idNumber: currentVerification.idNumber,
        identityFrontFileId,
        identityBackFileId,
        faceVerified: true,
      })
      .then(savedVerification => {
        updateProfileState(
          current => ({
            ...current,
            identityVerification: {
              ...(current.identityVerification ?? currentVerification),
              status: savedVerification.status,
              rejectionReason: savedVerification.rejectionReason,
              updatedAtIso: savedVerification.updatedAtIso,
            },
          }),
          {
            markSynced: true,
            syncMessage: '实名认证资料已同步到平台审核。',
            syncOperation: 'identityVerification',
          },
        );
      })
      .catch(error => {
        updateProfileState(current => current, {
          markFailed: true,
          syncMessage:
            error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ? '实名认证重试需要重新登录后再同步。'
              : '实名认证资料重试提交失败，已保留本地资料。',
          syncOperation: 'identityVerification',
        });
      });
  };

  const retryAccountProfileSync = () => {
    const currentProfileState = getProfileLocalState();

    if (!platformProfileApi) {
      updateProfileState(current => current, {
        markSynced: true,
        syncMessage: '账号资料与设置已按本地演示状态记录。',
        syncOperation: 'accountProfile',
      });
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      updateProfileState(current => current, {
        markFailed: true,
        syncMessage: '账号资料与设置重试需要重新登录后再同步。',
        syncOperation: 'accountProfile',
      });
      return;
    }

    platformProfileApi
      .saveAccountProfile(
        createPlatformAccountSnapshotRequest(currentProfileState),
      )
      .then(accountProfile => {
        updateProfileState(
          current => ({
            ...current,
            ...mapPlatformAccountProfileToLocalState(
              accountProfile,
              current.settings,
            ),
          }),
          {
            markSynced: true,
            syncMessage: '账号资料与设置快照已同步到平台。',
            syncOperation: 'accountProfile',
          },
        );
      })
      .catch(error => {
        updateProfileState(current => current, {
          markFailed: true,
          syncMessage:
            error instanceof PlatformApiError &&
            (error.code === 'AUTH_ACCESS_TOKEN_INVALID' ||
              error.code === 'AUTH_ACCESS_TOKEN_MISSING')
              ? '账号资料与设置重试需要重新登录后再同步。'
              : error instanceof PlatformApiError &&
                error.code === 'NETWORK_ERROR'
              ? '账号资料与设置重试失败，请检查网络后重试。'
              : error instanceof PlatformApiError &&
                /[\u4e00-\u9fa5]/.test(error.message)
              ? error.message
              : '账号资料与设置重试失败，请稍后重试。',
          syncOperation: 'accountProfile',
        });
      });
  };

  const retryEnterpriseVerificationSync = () => {
    const currentProfileState = getProfileLocalState();
    const currentVerification = currentProfileState.enterpriseVerification;

    if (!currentVerification) {
      return;
    }

    if (!platformProfileApi) {
      updateProfileState(current => current, {
        markSynced: true,
        syncMessage: '企业认证资料已按本地演示状态记录。',
        syncOperation: 'enterpriseVerification',
      });
      return;
    }

    const licenseFileId = currentVerification.licenseFiles?.[0]?.fileId;

    if (!licenseFileId) {
      updateProfileState(current => current, {
        markFailed: true,
        syncMessage: '企业认证重试需要先补齐营业执照凭证。',
        syncOperation: 'enterpriseVerification',
      });
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      updateProfileState(current => current, {
        markFailed: true,
        syncMessage: '企业认证重试需要重新登录后再同步。',
        syncOperation: 'enterpriseVerification',
      });
      return;
    }

    platformProfileApi
      .saveEnterpriseVerification({
        enterpriseName: currentVerification.enterpriseName,
        creditCode: currentVerification.creditCode,
        legalName: currentVerification.legalName,
        legalId: currentVerification.legalId,
        enterprisePhone: currentVerification.enterprisePhone,
        licenseFileId,
      })
      .then(savedVerification => {
        updateProfileState(
          current => ({
            ...current,
            enterpriseVerification: {
              ...(current.enterpriseVerification ?? currentVerification),
              status: savedVerification.status,
              rejectionReason: savedVerification.rejectionReason,
              updatedAtIso: savedVerification.updatedAtIso,
            },
          }),
          {
            markSynced: true,
            syncMessage: '企业认证资料已同步到平台审核。',
            syncOperation: 'enterpriseVerification',
          },
        );
      })
      .catch(error => {
        updateProfileState(current => current, {
          markFailed: true,
          syncMessage:
            error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ? '企业认证重试需要重新登录后再同步。'
              : '企业认证资料重试提交失败，已保留本地资料。',
          syncOperation: 'enterpriseVerification',
        });
      });
  };

  const retryInvoiceApplicationSync = () => {
    const currentProfileState = getProfileLocalState();
    const currentSyncState = currentProfileState.syncState;

    if (currentSyncState?.operation !== 'invoiceApplication') {
      return;
    }

    const currentMode = currentSyncState.invoiceApplicationSyncMode ?? 'submit';
    const currentRequest = currentSyncState.invoiceApplicationRequest;

    if (!platformProfileApi) {
      setProfileState(current => {
        const nextState = {
          ...current,
          syncState: createSyncedProfileSyncState(
            '发票申请已按本地演示状态记录。',
            now,
            'invoiceApplication',
          ),
        };
        saveProfileLocalState(nextState);
        return nextState;
      });
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      markInvoiceApplicationSyncFailed({
        message:
          currentMode === 'refresh'
            ? '平台发票申请记录刷新需要重新登录后再同步。'
            : '平台发票申请重试需要重新登录后再提交。',
        mode: currentMode,
        request: currentRequest,
        clearSelectedInvoiceOrderIds: currentMode === 'refresh',
      });
      return;
    }

    if (currentMode === 'refresh') {
      refreshPlatformInvoices({
        clearSelectedInvoiceOrderIds: true,
        resolveSyncFailureMode: 'always',
        successMessage: '平台发票申请记录已同步。',
      }).catch(error => {
        markInvoiceApplicationSyncFailed({
          message:
            error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ? '平台发票申请记录刷新需要重新登录后再同步。'
              : '平台发票申请记录刷新失败，请稍后重试。',
          mode: 'refresh',
          clearSelectedInvoiceOrderIds: true,
        });
      });
      return;
    }

    if (!currentRequest || currentRequest.orderIds.length === 0) {
      markInvoiceApplicationSyncFailed({
        message: '发票申请重试缺少订单信息，请重新选择订单后提交。',
        mode: 'submit',
      });
      return;
    }

    platformProfileApi
      .createInvoiceApplication(currentRequest)
      .then(() =>
        refreshPlatformInvoices({
          clearSelectedInvoiceOrderIds: true,
          resolveSyncFailureMode: 'always',
          successMessage: '平台发票申请已提交，状态已同步。',
        }).catch(refreshError => {
          markInvoiceApplicationSyncFailed({
            message:
              refreshError instanceof PlatformApiError &&
              refreshError.code === 'AUTH_ACCESS_TOKEN_MISSING'
                ? '平台发票申请已提交，重新登录后再刷新申请记录。'
                : '平台发票申请已提交，但申请记录刷新失败，请稍后重试。',
            mode: 'refresh',
            clearSelectedInvoiceOrderIds: true,
          });
        }),
      )
      .catch(error => {
        if (
          error instanceof PlatformApiError &&
          error.code === 'ORDER_STATE_INVALID' &&
          error.message === '订单已存在开票申请'
        ) {
          refreshPlatformInvoices({
            clearSelectedInvoiceOrderIds: true,
            resolveSyncFailureMode: 'always',
            successMessage: '平台发票申请状态已从平台刷新。',
          }).catch(refreshError => {
            markInvoiceApplicationSyncFailed({
              message:
                refreshError instanceof PlatformApiError &&
                refreshError.code === 'AUTH_ACCESS_TOKEN_MISSING'
                  ? '平台发票申请已存在，重新登录后再刷新申请记录。'
                  : '平台发票申请已存在，但申请记录刷新失败，请稍后重试。',
              mode: 'refresh',
              clearSelectedInvoiceOrderIds: true,
            });
          });
          return;
        }

        markInvoiceApplicationSyncFailed({
          message:
            error instanceof PlatformApiError &&
            error.code === 'AUTH_ACCESS_TOKEN_MISSING'
              ? '平台发票申请重试需要重新登录后再提交。'
              : error instanceof PlatformApiError &&
                error.code === 'NETWORK_ERROR'
              ? '平台发票申请重试失败，请检查网络后重试。'
              : error instanceof PlatformApiError &&
                /[\u4e00-\u9fa5]/.test(error.message)
              ? error.message
              : '平台发票申请重试失败，请稍后重试。',
          mode: 'submit',
          request: currentRequest,
        });
      });
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
            conflictAddressItems:
              current.syncState.conflictAddressItems?.filter(
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
            conflictContactItems:
              current.syncState.conflictContactItems?.filter(
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
          contacts: current.contacts.filter(
            contact => contact.id !== contactId,
          ),
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
        notificationPermissionStatus={notificationPermissionStatus}
        canRefreshPlatformEvaluations={Boolean(platformProfileApi)}
        isRefreshingPlatformEvaluations={isRefreshingPlatformEvaluations}
        evaluationNotice={evaluationNotice}
        canRefreshPlatformCoupons={Boolean(platformProfileApi)}
        isRefreshingPlatformCoupons={isRefreshingPlatformCoupons}
        couponNotice={couponNotice}
        platformSpendingSnapshot={platformSpendingSnapshot}
        canRefreshPlatformSpending={Boolean(platformProfileApi)}
        isRefreshingPlatformSpending={isRefreshingPlatformSpending}
        spendingNotice={spendingNotice}
        platformAuthApi={platformAuthApi}
        platformNotificationsApi={platformNotificationsApi}
        platformProfileApi={
          platformProfileApi as ProfilePlatformProfileApi | undefined
        }
        platformFileApi={platformFileApi}
        onAddAddress={address =>
          updateProfileState(
            current => ({
              ...current,
              addresses: [
                ...current.addresses,
                createLocalProfileAddress(current.addresses, address),
              ],
            }),
            { syncAddressBook: true },
          )
        }
        onDeleteAddress={addressId =>
          updateProfileState(
            current => ({
              ...current,
              addresses: deleteProfileAddress(current.addresses, addressId),
            }),
            { syncAddressBook: true },
          )
        }
        onUpdateAddress={(addressId, changes) =>
          updateProfileState(
            current => ({
              ...current,
              addresses: updateProfileAddress(
                current.addresses,
                addressId,
                changes,
              ),
            }),
            { syncAddressBook: true },
          )
        }
        onAddContact={contact =>
          updateProfileState(
            current => ({
              ...current,
              contacts: [
                ...current.contacts,
                createLocalProfileContact(current.contacts, contact),
              ],
            }),
            { syncAddressBook: true },
          )
        }
        onDeleteContact={contactId =>
          updateProfileState(
            current => ({
              ...current,
              contacts: deleteProfileContact(current.contacts, contactId),
            }),
            { syncAddressBook: true },
          )
        }
        onUpdateContact={(contactId, changes) =>
          updateProfileState(
            current => ({
              ...current,
              contacts: updateProfileContact(
                current.contacts,
                contactId,
                changes,
              ),
            }),
            { syncAddressBook: true },
          )
        }
        onSubmitIdentityVerification={(request, options) =>
          updateProfileState(
            current => ({
              ...current,
              identityVerification: request,
            }),
            options?.syncStatus === 'failed'
              ? {
                  markFailed: true,
                  syncMessage: options.syncMessage,
                  syncOperation: 'identityVerification',
                }
              : platformProfileApi
              ? {
                  markSynced: true,
                  syncMessage: platformIdentityVerificationSyncedMessage,
                  syncOperation: 'identityVerification',
                }
              : {
                  markPendingSync: !platformProfileApi,
                  syncMessage: !platformProfileApi
                    ? localIdentityVerificationSyncMessage
                    : undefined,
                  syncOperation: 'identityVerification',
                },
          )
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
        onSubmitEnterpriseVerification={(request, options) =>
          updateProfileState(
            current => ({
              ...current,
              enterpriseVerification: request,
            }),
            options?.syncStatus === 'failed'
              ? {
                  markFailed: true,
                  syncMessage: options.syncMessage,
                  syncOperation: 'enterpriseVerification',
                }
              : platformProfileApi
              ? {
                  markSynced: true,
                  syncMessage: platformEnterpriseVerificationSyncedMessage,
                  syncOperation: 'enterpriseVerification',
                }
              : {
                  markPendingSync: !platformProfileApi,
                  syncMessage: !platformProfileApi
                    ? localEnterpriseVerificationSyncMessage
                    : undefined,
                  syncOperation: 'enterpriseVerification',
                },
          )
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
          updateProfileState(
            current => ({ ...current, invoices: nextInvoices }),
            { markPendingSync: false },
          )
        }
        onUpdateInvoiceDetails={nextInvoiceDetails =>
          updateProfileState(
            current => ({
              ...current,
              invoiceDetails: nextInvoiceDetails,
            }),
            { markPendingSync: false },
          )
        }
        onUpdateInvoiceRejectionReasons={nextReasons =>
          updateProfileState(
            current => ({
              ...current,
              invoiceRejectionReasons: nextReasons,
            }),
            { markPendingSync: false },
          )
        }
        onUpdateInvoiceSelections={nextSelectedInvoiceOrderIds =>
          updateProfileState(
            current => ({
              ...current,
              selectedInvoiceOrderIds: nextSelectedInvoiceOrderIds,
            }),
            { markPendingSync: false },
          )
        }
        onUpdateInvoiceMeta={changes =>
          updateProfileState(
            current => ({
              ...current,
              ...changes,
            }),
            { markPendingSync: false },
          )
        }
        onRefreshPlatformInvoices={refreshPlatformInvoices}
        onMarkInvoiceApplicationSyncFailed={markInvoiceApplicationSyncFailed}
        onUpdateSettings={(nextSettings, options) =>
          updateProfileState(
            current => ({ ...current, settings: nextSettings }),
            options,
          )
        }
        onUpdateAccount={(nextAccount, options) =>
          updateProfileState(
            current => ({ ...current, account: nextAccount }),
            options,
          )
        }
        onUpdatePassword={(nextPassword, options) =>
          updateProfileState(
            current => ({ ...current, password: nextPassword }),
            options,
          )
        }
        onRefreshPlatformEvaluations={() =>
          refreshPlatformEvaluations('manual')
        }
        onRefreshPlatformCoupons={() => refreshPlatformCoupons('manual')}
        onRefreshPlatformSpending={() =>
          refreshPlatformSpendingRecords('manual')
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
        account={account}
        modeBadgeText={platformProfileApi ? '平台同步' : '本地版'}
      />

      <ProfileOverviewPanel
        avatarInitial={profileOverview.avatarInitial}
        avatarPhotoCount={profileOverview.avatarPhotoCount}
        avatarPublicUrl={profileOverview.avatarPublicUrl}
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
        onRetry={() => {
          if (syncState?.operation === 'accountProfile') {
            retryAccountProfileSync();
            return;
          }

          if (syncState?.operation === 'addressBook' && platformProfileApi) {
            syncAddressBookToPlatform(
              profileState,
              '平台地址簿重试需要重新登录后再同步。',
            );
            return;
          }

          if (syncState?.operation === 'identityVerification') {
            retryIdentityVerificationSync();
            return;
          }

          if (syncState?.operation === 'enterpriseVerification') {
            retryEnterpriseVerificationSync();
            return;
          }

          if (syncState?.operation === 'invoiceApplication') {
            retryInvoiceApplicationSync();
            return;
          }

          updateProfileState(
            current => ({
              ...current,
              syncState: createSyncedProfileSyncState(),
            }),
            { markPendingSync: false },
          );
        }}
        onMarkFailed={() =>
          updateProfileState(
            current => ({
              ...current,
              syncState: createFailedProfileSyncState(
                undefined,
                now,
                current.syncState?.operation ?? 'local',
              ),
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
        {profileEntryConfigsForMode.map(entry => (
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

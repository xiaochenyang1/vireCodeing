import {
  commonAddressItems,
  commonContactItems,
  couponItems,
  invoiceRecordItems,
  shipperSummary,
  profileSettingItems,
} from '../data/mockData';
import {
  fireAndForget,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';
import type { VerificationStatus } from '../types';

const PROFILE_LOCAL_STATE_VERSION = 1;
const PROFILE_LOCAL_STATE_STORAGE_KEY = '@vireCodeing/profile-local-state';

type ProfileLocalStateSnapshot = {
  version: number;
  state: ProfileLocalState;
};

export type AddressItem = (typeof commonAddressItems)[number];
export type ContactItem = (typeof commonContactItems)[number];
export type CouponItem = (typeof couponItems)[number];
export type InvoiceItem = (typeof invoiceRecordItems)[number];
export type SettingItem = (typeof profileSettingItems)[number] & {
  confirmedAtText?: string;
  confirmedAtIso?: string;
};

export type VerificationFileRef = {
  fileId: string;
  fileName: string;
  purpose:
    | 'identity'
    | 'cargo'
    | 'exception'
    | 'evaluation'
    | 'receipt'
    | 'invoice';
  status: 'pending' | 'uploaded' | 'rejected';
  objectKey?: string;
  publicUrl?: string;
};

export type ProfileVerificationStatus =
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type IdentityVerificationRequest = {
  realName: string;
  idNumber: string;
  identityPhotoCount: number;
  identityPhotoFiles?: VerificationFileRef[];
  faceVerified: boolean;
  status?: ProfileVerificationStatus;
  rejectionReason?: string;
  updatedAtIso?: string;
};

export type EnterpriseVerificationRequest = {
  enterpriseName: string;
  creditCode: string;
  legalName: string;
  legalId: string;
  enterprisePhone: string;
  licensePhotoCount: number;
  licenseFiles?: VerificationFileRef[];
  status?: ProfileVerificationStatus;
  rejectionReason?: string;
  updatedAtIso?: string;
};

export type InvoiceTypeOption = 'normal' | 'vat-special';
export type InvoiceTitleOption = 'personal' | 'enterprise';
export type InvoiceStatusHistoryItem = {
  actionText: string;
  timestampText: string;
  timestampIso?: string;
  noteText?: string;
};
export type InvoiceHistoryEntry = {
  entryId: string;
  sequenceNumber: number;
  titleText: string;
  typeText: string;
  amountText: string;
  orderText: string;
  submittedAtText: string;
  submittedAtIso?: string;
  statusText: string;
  receiverEmail: string;
  rejectionReasonText?: string;
  approvedAtText?: string;
  approvedAtIso?: string;
  rejectedAtIso?: string;
  downloadedAtText?: string;
  downloadedAtIso?: string;
};
export type InvoiceApplicationDetails = {
  invoiceTypeText: string;
  invoiceTitleText: string;
  receiverEmail: string;
  selectedOrderIds: string[];
  selectedOrderText: string;
  invoiceAmountText: string;
  platformSynced?: boolean;
  submittedAtText?: string;
  submittedAtIso?: string;
  approvedAtText?: string;
  approvedAtIso?: string;
  rejectedAtText?: string;
  rejectedAtIso?: string;
  downloadedAtText?: string;
  downloadedAtIso?: string;
  statusHistory?: InvoiceStatusHistoryItem[];
  historyEntries?: InvoiceHistoryEntry[];
};

export type InvoiceRejectionReasons = Record<string, string>;

export type ProfileSyncStatus = 'pending' | 'synced' | 'failed';
export type ProfileSyncOperation = 'addressBook' | 'local';

export type ProfileSyncQueueItem = {
  id: string;
  titleText: string;
  statusText: string;
  updatedAtText: string;
  updatedAtIso?: string;
  noteText: string;
};

export type AddressConflictFieldKey =
  | 'name'
  | 'address'
  | 'contactText'
  | 'tagText';

export type AddressConflictFieldItem = {
  id: string;
  addressId: string;
  fieldKey: AddressConflictFieldKey;
  fieldLabel: string;
  localValue: string;
  platformValue: string;
};

export type ContactConflictFieldKey =
  | 'name'
  | 'roleText'
  | 'phoneText'
  | 'noteText';

export type ContactConflictFieldItem = {
  id: string;
  contactId: string;
  fieldKey: ContactConflictFieldKey;
  fieldLabel: string;
  localValue: string;
  platformValue: string;
};

export type ProfileSyncState = {
  status: ProfileSyncStatus;
  operation?: ProfileSyncOperation;
  message: string;
  updatedAtText: string;
  updatedAtIso?: string;
  platformUpdatedAtIso?: string;
  platformAddressIds?: string[];
  platformContactIds?: string[];
  conflictSummaryText?: string;
  conflictAddressItems?: AddressItem[];
  conflictAddressFieldItems?: AddressConflictFieldItem[];
  conflictDeletedAddressItems?: AddressItem[];
  conflictContactItems?: ContactItem[];
  conflictContactFieldItems?: ContactConflictFieldItem[];
  conflictDeletedContactItems?: ContactItem[];
  queueItems?: ProfileSyncQueueItem[];
};

export type SavedAccountSettings = {
  displayName: string;
  boundPhone: string;
  avatarPhotoCount: number;
};

export type SavedPasswordSettings = {
  savedPassword: string;
  updatedAt: string;
  updatedAtIso?: string;
};

export type ProfileLocalState = {
  addresses: AddressItem[];
  contacts: ContactItem[];
  identityVerification?: IdentityVerificationRequest;
  enterpriseVerification?: EnterpriseVerificationRequest;
  coupons: CouponItem[];
  invoices: InvoiceItem[];
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  invoiceRejectionReasons: InvoiceRejectionReasons;
  invoiceType: InvoiceTypeOption;
  invoiceTitle: InvoiceTitleOption;
  receiverEmail: string;
  selectedInvoiceOrderIds: string[];
  settings: SettingItem[];
  account: SavedAccountSettings;
  password: SavedPasswordSettings;
  syncState?: ProfileSyncState;
};

export function getEffectiveIdentityVerificationStatus(
  identityVerification?: IdentityVerificationRequest,
): VerificationStatus {
  if (
    identityVerification?.status === 'rejected' ||
    identityVerification?.rejectionReason
  ) {
    return 'rejected';
  }

  if (identityVerification?.status === 'approved') {
    return 'verified';
  }

  if (identityVerification?.status === 'reviewing') {
    return 'reviewing';
  }

  if (identityVerification) {
    return 'reviewing';
  }

  return shipperSummary.verificationStatus;
}

export function getIdentityPublishGateNotice(
  identityVerification?: IdentityVerificationRequest,
) {
  const verificationStatus =
    getEffectiveIdentityVerificationStatus(identityVerification);

  if (verificationStatus === 'verified') {
    return '';
  }

  if (verificationStatus === 'reviewing') {
    return '实名认证审核中，审核通过后才能发布订单';
  }

  if (verificationStatus === 'rejected') {
    return '实名认证失败，请重新提交通过后再发布订单';
  }

  return '请先完成实名认证后再发布订单';
}

let profileLocalStateSnapshot: ProfileLocalStateSnapshot | undefined;

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeSettingsWithDefaults(settings: SettingItem[]) {
  const savedSettingsById = new Map(
    settings.map(setting => [setting.id, setting]),
  );

  return profileSettingItems.map(defaultSetting => {
    const savedSetting = savedSettingsById.get(defaultSetting.id);

    return {
      ...cloneData(defaultSetting),
      statusText: savedSetting?.statusText ?? defaultSetting.statusText,
    };
  });
}

function createDefaultProfileLocalState(): ProfileLocalState {
  return {
    addresses: cloneData(commonAddressItems),
    contacts: cloneData(commonContactItems),
    identityVerification: undefined,
    enterpriseVerification: undefined,
    coupons: cloneData(couponItems),
    invoices: cloneData(invoiceRecordItems),
    invoiceDetails: {},
    invoiceRejectionReasons: {},
    invoiceType: 'normal',
    invoiceTitle: 'enterprise',
    receiverEmail: 'finance@chenxing.example',
    selectedInvoiceOrderIds: ['invoice-order-1'],
    settings: cloneData(profileSettingItems),
    account: {
      displayName: shipperSummary.displayName,
      boundPhone: shipperSummary.phoneNumber,
      avatarPhotoCount: 0,
    },
    password: {
      savedPassword: 'abc123',
      updatedAt: '未修改',
    },
    syncState: createSyncedProfileSyncState(
      '本地资料已初始化，等待真实账号中心 API 接入。',
    ),
  };
}

export function createPendingProfileSyncState(
  message = '个人中心资料已在本地更新，等待真实账号中心 API 接入后同步。',
  now = Date.now(),
  operation: ProfileSyncOperation = 'local',
): ProfileSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'pending',
    operation,
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      createProfileSyncQueueItem(
        '待同步',
        '真实账号中心 API 未接入，本地先记录待同步资料。',
        updatedAtIso,
      ),
    ],
  };
}

export function createSyncedProfileSyncState(
  message = '本地资料已记录，等待真实账号中心 API 接入。',
  now = Date.now(),
  operation: ProfileSyncOperation = 'local',
): ProfileSyncState {
  return {
    status: 'synced',
    operation,
    message,
    updatedAtText: '刚刚',
    updatedAtIso: new Date(now).toISOString(),
    queueItems: [],
  };
}

export function createFailedProfileSyncState(
  message = '个人中心资料同步失败，等待本地重试。',
  now = Date.now(),
  operation: ProfileSyncOperation = 'local',
): ProfileSyncState {
  const updatedAtIso = new Date(now).toISOString();

  return {
    status: 'failed',
    operation,
    message,
    updatedAtText: '刚刚',
    updatedAtIso,
    queueItems: [
      createProfileSyncQueueItem(
        '同步失败',
        '真实账号中心 API 未接入，本地仅记录失败队列。',
        updatedAtIso,
      ),
    ],
  };
}

function createProfileSyncQueueItem(
  statusText: string,
  noteText: string,
  updatedAtIso: string,
): ProfileSyncQueueItem {
  return {
    id: 'profile-local-change',
    titleText: '个人中心资料变更',
    statusText,
    updatedAtText: '刚刚',
    updatedAtIso,
    noteText,
  };
}

function isValidSnapshot(
  snapshot: ProfileLocalStateSnapshot | undefined,
): snapshot is ProfileLocalStateSnapshot {
  return (
    Boolean(snapshot) &&
    snapshot?.version === PROFILE_LOCAL_STATE_VERSION &&
    Array.isArray(snapshot.state?.addresses) &&
    Array.isArray(snapshot.state?.contacts) &&
    Array.isArray(snapshot.state?.coupons) &&
    Array.isArray(snapshot.state?.invoices) &&
    Array.isArray(snapshot.state?.settings) &&
    typeof snapshot.state?.account?.displayName === 'string' &&
    typeof snapshot.state?.account?.boundPhone === 'string' &&
    typeof snapshot.state?.password?.savedPassword === 'string' &&
    typeof snapshot.state?.password?.updatedAt === 'string'
  );
}

export async function hydrateProfileLocalState() {
  const storedSnapshot = await readJsonStorage<ProfileLocalStateSnapshot>(
    PROFILE_LOCAL_STATE_STORAGE_KEY,
  );

  if (!isValidSnapshot(storedSnapshot)) {
    profileLocalStateSnapshot = {
      version: PROFILE_LOCAL_STATE_VERSION,
      state: createDefaultProfileLocalState(),
    };
    await removeStorageItem(PROFILE_LOCAL_STATE_STORAGE_KEY);
    return;
  }

  const defaultState = createDefaultProfileLocalState();
  const storedState = cloneData(storedSnapshot.state);

  profileLocalStateSnapshot = {
    version: storedSnapshot.version,
    state: {
      ...defaultState,
      ...storedState,
      settings: mergeSettingsWithDefaults(storedState.settings),
      syncState: storedState.syncState ?? defaultState.syncState,
    },
  };
}

export function getProfileLocalState() {
  if (!isValidSnapshot(profileLocalStateSnapshot)) {
    profileLocalStateSnapshot = {
      version: PROFILE_LOCAL_STATE_VERSION,
      state: createDefaultProfileLocalState(),
    };
  }

  return cloneData(profileLocalStateSnapshot.state);
}

export function saveProfileLocalState(state: ProfileLocalState) {
  profileLocalStateSnapshot = {
    version: PROFILE_LOCAL_STATE_VERSION,
    state: cloneData(state),
  };
  fireAndForget(
    writeJsonStorage(PROFILE_LOCAL_STATE_STORAGE_KEY, profileLocalStateSnapshot),
  );
}

export function clearProfileLocalState() {
  profileLocalStateSnapshot = undefined;
  fireAndForget(removeStorageItem(PROFILE_LOCAL_STATE_STORAGE_KEY));
}

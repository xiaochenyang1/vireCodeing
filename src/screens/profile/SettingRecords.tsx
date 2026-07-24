import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { AuthField } from '../../components/AuthField';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { appVersionInfo } from '../../data/mockData';
import type { PushNotificationPermissionStatus } from '../../hooks/usePushNotifications';
import { styles } from '../../styles';
import { getProfileAvatarInitial } from '../../utils/profileOverview';
import {
  createAccountSecurityCheckModel,
  createAccountAvatarStatusModel,
  applyPlatformProfileSettingsSnapshot,
  createConfirmedPrivacySettings,
  createPlatformProfileSettingsSnapshot,
  createLocalPermissionDeniedStatuses,
  createUpdatedPasswordSettings,
  defaultPermissionStatuses,
  getNextSettingToggle,
  getNotificationPermissionStatusText,
  getSystemPermissionStatusText,
  getPlatformAccountProfileErrorMessage,
  getPermissionDeniedGuideNotice,
  getPlatformPasswordChangeErrorMessage,
  getPlatformPushDeviceErrorMessage,
  getPlatformSessionSecurityErrorMessage,
  getSettingDocumentState,
  isReadOnlySetting,
  localPermissionItems,
  privacyPolicyDocumentInfo,
  type LocalPermissionId,
  validateAccountSettings,
  validatePasswordSettings,
} from '../../utils/profileSettings';
import type {
  ProfileSyncMutationOptions,
  SavedAccountSettings,
  SavedPasswordSettings,
  SettingItem,
} from '../../utils/profileLocalState';
import { getAuthSessionSnapshot } from '../../utils/authSession';
import { getDeviceId } from '../../utils/deviceId';
import { useImageUpload } from '../../hooks/useImageUpload';
import type {
  PlatformAuthSessionRecord,
  createPlatformAuthApi,
} from '../../services/platformAuthApi';
import { type createPlatformFileApi } from '../../services/platformFileApi';
import type {
  PlatformDevicePushTokenRecord,
  createPlatformNotificationsApi,
} from '../../services/platformNotificationsApi';
import type { createPlatformProfileApi } from '../../services/platformProfileApi';

type SettingPlatformAuthApi = Pick<
  ReturnType<typeof createPlatformAuthApi>,
  'changePassword'
> &
  Partial<
    Pick<
      ReturnType<typeof createPlatformAuthApi>,
      'listSessions' | 'revokeOtherSessions'
    >
  >;
type SettingPlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  'saveAccountProfile'
>;
type SettingPlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
>;
type SettingPlatformNotificationsApi = Pick<
  ReturnType<typeof createPlatformNotificationsApi>,
  'listDeviceTokens' | 'deactivateDeviceToken'
>;

type ImagePickerPermissionStatus = 'granted' | 'denied' | 'undetermined';

function getImagePickerPermissionStatus(
  permission: unknown,
): ImagePickerPermissionStatus | undefined {
  const status = (permission as { status?: unknown } | null)?.status;

  if (
    status === 'granted' ||
    status === 'denied' ||
    status === 'undetermined'
  ) {
    return status;
  }

  return undefined;
}

async function readSystemMediaPermissionStatuses() {
  const [cameraPermission, mediaLibraryPermission] = await Promise.all([
    typeof ImagePicker.getCameraPermissionsAsync === 'function'
      ? ImagePicker.getCameraPermissionsAsync()
      : Promise.resolve(undefined),
    typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function'
      ? ImagePicker.getMediaLibraryPermissionsAsync()
      : Promise.resolve(undefined),
  ]);

  return {
    camera: getSystemPermissionStatusText(
      getImagePickerPermissionStatus(cameraPermission),
    ),
    album: getSystemPermissionStatusText(
      getImagePickerPermissionStatus(mediaLibraryPermission),
    ),
  };
}

function formatPushDeviceTimestamp(isoText?: string) {
  if (!isoText) {
    return '未记录';
  }

  const date = new Date(isoText);

  if (Number.isNaN(date.valueOf())) {
    return isoText;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatPushTokenPreview(token: string) {
  if (token.length <= 20) {
    return token;
  }

  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

function getPushDevicePlatformText(platform: 'ios' | 'android') {
  return platform === 'ios' ? 'iOS' : 'Android';
}

export function SettingRecords({
  now,
  settings,
  account,
  password,
  notificationPermissionStatus,
  platformAuthApi,
  platformProfileApi,
  platformFileApi,
  platformNotificationsApi,
  onUpdateSettings,
  onUpdateAccount,
  onUpdatePassword,
  onLogout,
}: {
  now: number;
  settings: SettingItem[];
  account: SavedAccountSettings;
  password: SavedPasswordSettings;
  notificationPermissionStatus?: PushNotificationPermissionStatus;
  platformAuthApi?: SettingPlatformAuthApi;
  platformProfileApi?: SettingPlatformProfileApi;
  platformFileApi?: SettingPlatformFileApi;
  platformNotificationsApi?: SettingPlatformNotificationsApi;
  onUpdateSettings: (
    settings: SettingItem[],
    options?: ProfileSyncMutationOptions,
  ) => void;
  onUpdateAccount: (
    account: SavedAccountSettings,
    options?: ProfileSyncMutationOptions,
  ) => void;
  onUpdatePassword: (
    password: SavedPasswordSettings,
    options?: ProfileSyncMutationOptions,
  ) => void;
  onLogout: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [displayName, setDisplayName] = useState(account.displayName);
  const [boundPhone, setBoundPhone] = useState(account.boundPhone);
  const [avatarPhotoCount, setAvatarPhotoCount] = useState(
    account.avatarPhotoCount,
  );
  const avatarPhotoCountRef = useRef(account.avatarPhotoCount);
  const avatarFileIdRef = useRef(account.avatarFileId);
  const avatarPublicUrlRef = useRef(account.avatarPublicUrl);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPrivacyPanel, setShowPrivacyPanel] = useState(false);
  const [showPermissionPanel, setShowPermissionPanel] = useState(false);
  const [showSecurityCheckPanel, setShowSecurityCheckPanel] = useState(false);
  const [platformSecuritySessions, setPlatformSecuritySessions] = useState<
    PlatformAuthSessionRecord[] | undefined
  >(undefined);
  const [isLoadingSecuritySessions, setIsLoadingSecuritySessions] =
    useState(false);
  const [isRevokingOtherSessions, setIsRevokingOtherSessions] = useState(false);
  const [platformPushDevices, setPlatformPushDevices] = useState<
    PlatformDevicePushTokenRecord[] | undefined
  >(undefined);
  const [isLoadingPushDevices, setIsLoadingPushDevices] = useState(false);
  const [deactivatingPushDeviceId, setDeactivatingPushDeviceId] = useState<
    string | null
  >(null);
  const [isCheckingPermissionStatuses, setIsCheckingPermissionStatuses] =
    useState(false);
  const {
    state: avatarImageUploadState,
    pickAndUpload: pickAvatarAndUpload,
    clear: clearAvatarUpload,
  } = useImageUpload(platformFileApi, {
    purpose: 'avatar',
    fileName: '头像凭证.png',
    contentType: 'image/png',
    byteSize: 2048,
  });
  const isUploadingAvatar = avatarImageUploadState.isUploading;
  const [permissionStatuses, setPermissionStatuses] = useState(() => ({
    ...defaultPermissionStatuses,
    notification: getNotificationPermissionStatusText(
      notificationPermissionStatus,
    ),
  }));
  const privacySetting = settings.find(item => item.id === 'setting-privacy');
  const isPrivacyConfirmed = privacySetting?.statusText === '已确认';
  const loginProtectionSetting = settings.find(
    item => item.id === 'setting-login-protection',
  );
  const loginProtectionStatusText =
    loginProtectionSetting?.statusText ?? '未配置';
  const authSession = getAuthSessionSnapshot();
  const currentDeviceId = authSession?.deviceId ?? getDeviceId();
  const currentDevicePushTokens = (platformPushDevices ?? []).filter(
    device => device.deviceId === currentDeviceId,
  );
  const otherDevicePushTokens = (platformPushDevices ?? []).filter(
    device => device.deviceId !== currentDeviceId,
  );
  const accountSecurityCheck = createAccountSecurityCheckModel({
    settings,
    password,
    authSession,
    deviceSessions: platformSecuritySessions?.map(session => ({
      ...session,
      isCurrentDevice: session.deviceId === currentDeviceId,
    })),
    now,
  });
  const avatarStatus = createAccountAvatarStatusModel({
    savedAccount: account,
    stagedAvatarPhotoCount: avatarPhotoCount,
    stagedAvatarFileId: avatarFileIdRef.current,
    stagedAvatarPublicUrl: avatarPublicUrlRef.current,
    stagedAvatarRemoved: avatarRemoved,
  });
  const avatarPreviewPublicUrl = avatarRemoved
    ? undefined
    : avatarPublicUrlRef.current ?? account.avatarPublicUrl;
  const avatarPreviewInitial = getProfileAvatarInitial(displayName);
  const avatarPreviewHint = avatarRemoved
    ? '保存后会回退到昵称首字占位。'
    : avatarPreviewPublicUrl
    ? '已接入平台公开地址，首页和个人中心会显示真实头像。'
    : avatarPhotoCount > 0
    ? '当前只保留头像凭证，预览先回退到昵称首字占位。'
    : '当前使用昵称首字占位。';
  const hasAvatarToRemove =
    !avatarRemoved &&
    (avatarPhotoCount > 0 ||
      Boolean(avatarFileIdRef.current) ||
      Boolean(avatarPublicUrlRef.current) ||
      Boolean(account.avatarFileId) ||
      Boolean(account.avatarPublicUrl));

  useEffect(() => {
    setDisplayName(account.displayName);
    setBoundPhone(account.boundPhone);
  }, [account.boundPhone, account.displayName]);

  useEffect(() => {
    setAvatarPhotoCount(account.avatarPhotoCount);
    avatarPhotoCountRef.current = account.avatarPhotoCount;
    avatarFileIdRef.current = account.avatarFileId;
    avatarPublicUrlRef.current = account.avatarPublicUrl;
    setAvatarRemoved(false);
  }, [account.avatarFileId, account.avatarPhotoCount, account.avatarPublicUrl]);

  useEffect(() => {
    clearAvatarUpload();
  }, [
    account.avatarFileId,
    account.avatarPhotoCount,
    account.avatarPublicUrl,
    clearAvatarUpload,
  ]);

  useEffect(() => {
    setPermissionStatuses(current => ({
      ...current,
      notification: getNotificationPermissionStatusText(
        notificationPermissionStatus,
      ),
    }));
  }, [notificationPermissionStatus]);

  useEffect(() => {
    if (!showPermissionPanel) {
      return;
    }

    let active = true;

    readSystemMediaPermissionStatuses()
      .then(systemPermissionStatuses => {
        if (!active) {
          return;
        }

        setPermissionStatuses(current => ({
          ...current,
          ...systemPermissionStatuses,
          notification: getNotificationPermissionStatusText(
            notificationPermissionStatus,
          ),
        }));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [notificationPermissionStatus, showPermissionPanel]);

  const createAccountAvatarRequestField = () => {
    if (avatarRemoved) {
      return { avatarFileId: null };
    }

    const avatarFileId = avatarFileIdRef.current ?? account.avatarFileId;

    return avatarFileId ? { avatarFileId } : {};
  };

  const buildStagedAccountSnapshot = ({
    nextDisplayName = account.displayName,
    nextBoundPhone = account.boundPhone,
  }: {
    nextDisplayName?: string;
    nextBoundPhone?: string;
  } = {}): SavedAccountSettings => {
    const avatarFileId = avatarRemoved
      ? undefined
      : avatarFileIdRef.current ?? account.avatarFileId;
    const avatarPublicUrl = avatarRemoved
      ? undefined
      : avatarPublicUrlRef.current ?? account.avatarPublicUrl;

    return {
      displayName: nextDisplayName,
      boundPhone: nextBoundPhone,
      avatarPhotoCount: avatarPhotoCountRef.current,
      ...(avatarFileId ? { avatarFileId } : {}),
      ...(avatarPublicUrl ? { avatarPublicUrl } : {}),
    };
  };

  const buildPlatformAccountSnapshotRequest = (
    nextSettings: SettingItem[],
  ) => ({
    displayName: account.displayName,
    ...(account.avatarFileId ? { avatarFileId: account.avatarFileId } : {}),
    ...createPlatformProfileSettingsSnapshot(nextSettings),
  });

  const getAccountProfileSyncFailureMessage = (
    error: unknown,
    context: 'account' | 'settings' | 'privacy',
  ) => {
    const baseMessage = getPlatformAccountProfileErrorMessage(error);

    if (context === 'account') {
      return baseMessage;
    }

    if (baseMessage === '平台登录已过期，请重新登录后再保存账号资料。') {
      return context === 'settings'
        ? '平台登录已过期，请重新登录后再保存设置。'
        : '平台登录已过期，请重新登录后再确认隐私政策。';
    }

    if (baseMessage === '账号资料同步失败，请稍后重试') {
      return context === 'settings'
        ? '设置同步失败，请稍后重试'
        : '隐私确认同步失败，请稍后重试';
    }

    return baseMessage;
  };

  const markAccountProfileSyncFailed = ({
    message,
    nextSettings,
    nextAccount,
  }: {
    message: string;
    nextSettings?: SettingItem[];
    nextAccount?: SavedAccountSettings;
  }) => {
    if (nextAccount) {
      onUpdateAccount(nextAccount, {
        markFailed: true,
        syncMessage: message,
        syncOperation: 'accountProfile',
      });
    }

    if (nextSettings) {
      onUpdateSettings(
        nextSettings,
        nextAccount
          ? {
              markPendingSync: false,
            }
          : {
              markFailed: true,
              syncMessage: message,
              syncOperation: 'accountProfile',
            },
      );
    }

    setNotice(message);
  };

  const toggleSetting = async (settingId: string) => {
    const nextToggle = getNextSettingToggle(settings, settingId);

    if (!nextToggle) {
      return;
    }

    if (!platformProfileApi) {
      onUpdateSettings(nextToggle.settings);
      setNotice(nextToggle.notice);
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      markAccountProfileSyncFailed({
        message: '平台登录已过期，请重新登录后再保存设置。',
        nextSettings: nextToggle.settings,
      });
      return;
    }

    try {
      const platformAccount = await platformProfileApi.saveAccountProfile(
        buildPlatformAccountSnapshotRequest(nextToggle.settings),
      );
      const syncedSettings = applyPlatformProfileSettingsSnapshot(
        nextToggle.settings,
        platformAccount,
      );

      onUpdateSettings(syncedSettings, {
        markSynced: true,
        syncMessage: '平台设置快照已同步。',
        syncOperation: 'accountProfile',
      });
      setNotice(
        `设置已同步到平台：${nextToggle.notice.replace('设置已更新：', '')}`,
      );
    } catch (error) {
      markAccountProfileSyncFailed({
        message: getAccountProfileSyncFailureMessage(error, 'settings'),
        nextSettings: nextToggle.settings,
      });
    }
  };

  const submitAccountSettings = async () => {
    const nextAvatarPhotoCount = avatarPhotoCountRef.current;
    const validation = validateAccountSettings({
      displayName,
      boundPhone,
      avatarPhotoCount: nextAvatarPhotoCount,
      currentAccount: buildStagedAccountSnapshot(),
    });

    if (validation.notice || !validation.account) {
      setNotice(validation.notice);
      return;
    }

    if (platformProfileApi) {
      if (!getAuthSessionSnapshot()?.accessToken) {
        markAccountProfileSyncFailed({
          message: '平台登录已过期，请重新登录后再保存账号资料。',
          nextAccount: validation.account,
        });
        return;
      }

      try {
        const platformAccount = await platformProfileApi.saveAccountProfile({
          displayName: validation.account.displayName,
          ...createAccountAvatarRequestField(),
          phone: validation.account.boundPhone,
          ...createPlatformProfileSettingsSnapshot(settings),
        });
        const syncedSettings = applyPlatformProfileSettingsSnapshot(
          settings,
          platformAccount,
        );
        const syncedAccount: SavedAccountSettings = {
          displayName: platformAccount.displayName,
          boundPhone: platformAccount.phone,
          avatarPhotoCount: platformAccount.avatarFileId ? 1 : 0,
          ...(platformAccount.avatarFileId
            ? { avatarFileId: platformAccount.avatarFileId }
            : {}),
          ...(platformAccount.avatarPublicUrl
            ? { avatarPublicUrl: platformAccount.avatarPublicUrl }
            : {}),
        };

        onUpdateAccount(syncedAccount, {
          markSynced: true,
          syncMessage: '账号资料快照已同步到平台。',
          syncOperation: 'accountProfile',
        });
        onUpdateSettings(syncedSettings, {
          markPendingSync: false,
        });
        setDisplayName(platformAccount.displayName);
        setBoundPhone(platformAccount.phone);
        setAvatarPhotoCount(syncedAccount.avatarPhotoCount);
        avatarPhotoCountRef.current = syncedAccount.avatarPhotoCount;
        avatarFileIdRef.current = syncedAccount.avatarFileId;
        avatarPublicUrlRef.current = syncedAccount.avatarPublicUrl;
        setAvatarRemoved(false);
        setNotice(
          syncedAccount.avatarPhotoCount > 0
            ? '昵称、手机号和头像已同步到平台。'
            : '昵称和手机号已同步到平台。',
        );
        return;
      } catch (error) {
        markAccountProfileSyncFailed({
          message: getAccountProfileSyncFailureMessage(error, 'account'),
          nextAccount: validation.account,
        });
        return;
      }
    }

    onUpdateAccount(validation.account);
    setAvatarRemoved(false);
    setNotice('账号资料已更新，当前为本地演示状态。');
  };

  const uploadAvatar = async () => {
    if (!platformFileApi) {
      const nextAvatarPhotoCount = 1;
      avatarPhotoCountRef.current = nextAvatarPhotoCount;
      avatarFileIdRef.current = undefined;
      avatarPublicUrlRef.current = undefined;
      setAvatarRemoved(false);
      setAvatarPhotoCount(nextAvatarPhotoCount);
      onUpdateAccount({
        ...account,
        avatarPhotoCount: nextAvatarPhotoCount,
      });
      setNotice('头像凭证已添加，本地版不会上传真实文件。');
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setNotice('平台登录已过期，请重新登录后再上传头像。');
      return;
    }

    setNotice('');

    const result = await pickAvatarAndUpload();

    if (result.status !== 'uploaded') {
      if (result.status === 'error') {
        setNotice(result.message);
      }
      return;
    }

    const nextAccount: SavedAccountSettings = {
      ...account,
      avatarPhotoCount: 1,
      avatarFileId: result.file.id,
      ...(result.file.publicUrl
        ? { avatarPublicUrl: result.file.publicUrl }
        : {}),
    };

    avatarPhotoCountRef.current = nextAccount.avatarPhotoCount;
    avatarFileIdRef.current = nextAccount.avatarFileId;
    avatarPublicUrlRef.current = nextAccount.avatarPublicUrl;
    setAvatarRemoved(false);
    setAvatarPhotoCount(nextAccount.avatarPhotoCount);
    setNotice('头像凭证已上传，保存账号资料后同步到平台。');
    clearAvatarUpload();
  };

  const removeAvatar = () => {
    if (!hasAvatarToRemove) {
      setNotice('当前还没有可移除的头像。');
      return;
    }

    avatarPhotoCountRef.current = 0;
    avatarFileIdRef.current = undefined;
    avatarPublicUrlRef.current = undefined;
    setAvatarPhotoCount(0);
    clearAvatarUpload();

    if (!platformProfileApi) {
      setAvatarRemoved(false);
      onUpdateAccount({
        displayName: account.displayName,
        boundPhone: account.boundPhone,
        avatarPhotoCount: 0,
      });
      setNotice('头像凭证已移除，当前为本地演示状态。');
      return;
    }

    const shouldClearSavedAvatar = Boolean(
      account.avatarFileId || account.avatarPublicUrl,
    );
    setAvatarRemoved(shouldClearSavedAvatar);
    setNotice(
      shouldClearSavedAvatar
        ? '头像已移除，保存账号资料后同步到平台。'
        : '头像凭证已移除，当前未保留待同步头像。',
    );
  };

  const submitPasswordSettings = async () => {
    const validationNotice = validatePasswordSettings({
      currentPassword,
      savedPassword: password.savedPassword,
      newPassword,
      confirmPassword,
      usesPlatformAuth: Boolean(platformAuthApi),
    });

    if (validationNotice) {
      setNotice(validationNotice);
      return;
    }

    if (platformAuthApi) {
      if (!getAuthSessionSnapshot()?.accessToken) {
        setNotice('平台登录已过期，请重新登录后再修改密码。');
        return;
      }

      try {
        await platformAuthApi.changePassword({
          currentPassword,
          newPassword,
        });
      } catch (error) {
        setNotice(getPlatformPasswordChangeErrorMessage(error));
        return;
      }

      onUpdatePassword(createUpdatedPasswordSettings(newPassword, now), {
        markSynced: true,
        syncMessage: '登录密码已通过平台更新。',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('登录密码已通过平台更新。');
      return;
    }

    onUpdatePassword(createUpdatedPasswordSettings(newPassword, now));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNotice('登录密码已更新，当前为本地演示状态。');
  };

  const openSettingDocument = (settingId: string) => {
    const documentState = getSettingDocumentState(settingId, appVersionInfo);

    setShowPrivacyPanel(documentState.showPrivacyPanel);
    setShowPermissionPanel(documentState.showPermissionPanel);
    setShowSecurityCheckPanel(documentState.showSecurityCheckPanel);
    setNotice(documentState.notice);
  };

  const confirmPrivacyPolicy = () => {
    const nextSettings = createConfirmedPrivacySettings(settings, now);

    if (!platformProfileApi) {
      onUpdateSettings(nextSettings);
      setNotice('隐私政策已确认，本地确认时间：刚刚。');
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      markAccountProfileSyncFailed({
        message: '平台登录已过期，请重新登录后再确认隐私政策。',
        nextSettings,
      });
      return;
    }

    platformProfileApi
      .saveAccountProfile(buildPlatformAccountSnapshotRequest(nextSettings))
      .then(platformAccount => {
        const syncedSettings = applyPlatformProfileSettingsSnapshot(
          nextSettings,
          platformAccount,
        );

        onUpdateSettings(syncedSettings, {
          markSynced: true,
          syncMessage: '隐私确认快照已同步到平台。',
          syncOperation: 'accountProfile',
        });
        setNotice('隐私政策确认已同步到平台。');
      })
      .catch(error => {
        markAccountProfileSyncFailed({
          message: getAccountProfileSyncFailureMessage(error, 'privacy'),
          nextSettings,
        });
      });
  };

  const runLocalPermissionCheck = async () => {
    setIsCheckingPermissionStatuses(true);

    try {
      const systemPermissionStatuses =
        await readSystemMediaPermissionStatuses();

      setPermissionStatuses({
        ...createLocalPermissionDeniedStatuses(),
        ...systemPermissionStatuses,
        notification: getNotificationPermissionStatusText(
          notificationPermissionStatus,
        ),
      });
      setNotice(
        '权限检查完成：通知、相机和相册已同步系统状态，定位权限仍为本地演练。',
      );
    } catch {
      setPermissionStatuses(current => ({
        ...current,
        location: '本地未授权',
        notification: getNotificationPermissionStatusText(
          notificationPermissionStatus,
        ),
      }));
      setNotice(
        '权限检查完成：通知权限已同步系统状态；相机和相册状态暂未读取成功，定位权限仍为本地演练。',
      );
    } finally {
      setIsCheckingPermissionStatuses(false);
    }
  };

  const openSecurityCheckPanel = () => {
    setShowPrivacyPanel(false);
    setShowPermissionPanel(false);
    setShowSecurityCheckPanel(true);
  };

  const syncPlatformSecuritySessions = async () => {
    if (!platformAuthApi?.listSessions) {
      setPlatformSecuritySessions(undefined);
      setNotice('账号安全本地检查完成：已基于当前会话和安全开关生成本地结果。');
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setPlatformSecuritySessions(undefined);
      setNotice('平台登录已过期，请重新登录后再检查设备会话。');
      return;
    }

    setIsLoadingSecuritySessions(true);
    setNotice('正在同步平台设备会话...');

    try {
      const result = await platformAuthApi.listSessions();
      setPlatformSecuritySessions(result.sessions);
      setNotice('账号安全检查完成：已同步平台设备会话。');
    } catch (error) {
      setPlatformSecuritySessions(undefined);
      setNotice(getPlatformSessionSecurityErrorMessage(error, 'list'));
    } finally {
      setIsLoadingSecuritySessions(false);
    }
  };

  const runLocalAccountSecurityCheck = async () => {
    openSecurityCheckPanel();
    await syncPlatformSecuritySessions();
  };

  const revokeOtherPlatformSessions = async () => {
    if (!platformAuthApi?.revokeOtherSessions) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setNotice('平台登录已过期，请重新登录后再管理设备会话。');
      return;
    }

    setIsRevokingOtherSessions(true);

    try {
      const result = await platformAuthApi.revokeOtherSessions({
        currentDeviceId,
      });
      setPlatformSecuritySessions(currentSessions =>
        (currentSessions ?? []).filter(
          session => session.deviceId === currentDeviceId,
        ),
      );
      setNotice(
        result.revokedCount > 0
          ? `已退出其它 ${result.revokedCount} 台设备。`
          : '当前没有其它在线设备。',
      );
    } catch (error) {
      setNotice(getPlatformSessionSecurityErrorMessage(error, 'revoke'));
    } finally {
      setIsRevokingOtherSessions(false);
    }
  };

  const syncPlatformPushDevices = async () => {
    if (!platformNotificationsApi) {
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setPlatformPushDevices(undefined);
      setNotice('平台登录已过期，请重新登录后再检查推送设备。');
      return;
    }

    setIsLoadingPushDevices(true);
    setNotice('正在同步平台推送设备...');

    try {
      const result = await platformNotificationsApi.listDeviceTokens();
      setPlatformPushDevices(result.items);
      setNotice(
        result.items.length > 0
          ? `已同步 ${result.items.length} 个活跃推送设备。`
          : '当前没有活跃推送设备。',
      );
    } catch (error) {
      setPlatformPushDevices(undefined);
      setNotice(getPlatformPushDeviceErrorMessage(error, 'list'));
    } finally {
      setIsLoadingPushDevices(false);
    }
  };

  const deactivatePlatformPushDevice = async (
    device: PlatformDevicePushTokenRecord,
  ) => {
    if (!platformNotificationsApi) {
      return;
    }

    if (device.deviceId === currentDeviceId) {
      setNotice('当前设备推送默认保留，如需关闭可直接停用系统通知权限。');
      return;
    }

    if (!getAuthSessionSnapshot()?.accessToken) {
      setNotice('平台登录已过期，请重新登录后再管理推送设备。');
      return;
    }

    setDeactivatingPushDeviceId(device.id);

    try {
      const result = await platformNotificationsApi.deactivateDeviceToken(
        device.token,
      );

      setPlatformPushDevices(currentDevices =>
        (currentDevices ?? []).filter(item => item.id !== device.id),
      );
      setNotice(
        result.deactivated
          ? `已停用设备 ${device.deviceId} 的推送。`
          : `设备 ${device.deviceId} 的推送已不在活跃列表中。`,
      );
    } catch (error) {
      setNotice(getPlatformPushDeviceErrorMessage(error, 'deactivate'));
    } finally {
      setDeactivatingPushDeviceId(null);
    }
  };

  const showDeniedGuide = (permissionId: LocalPermissionId) => {
    const deniedGuideNotice = getPermissionDeniedGuideNotice(permissionId);

    if (!deniedGuideNotice) {
      return;
    }

    setNotice(deniedGuideNotice);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>账号资料</Text>
      <Text style={styles.detailMeta}>{`昵称：${account.displayName}`}</Text>
      <Text style={styles.routeMeta}>
        {`绑定手机号：${account.boundPhone}`}
      </Text>
      <Text style={styles.routeMeta}>{`头像凭证 ${avatarPhotoCount} 张`}</Text>
      <AuthField
        testID="setting-display-name"
        label="修改昵称"
        placeholder="例如 晨星货主"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <AuthField
        testID="setting-bound-phone"
        label="手机号换绑"
        placeholder="例如 13900139999"
        value={boundPhone}
        onChangeText={setBoundPhone}
        keyboardType="phone-pad"
        maxLength={11}
        editable
      />
      {platformProfileApi ? (
        <Text style={styles.detailMeta}>
          平台模式下会同步昵称、手机号、头像和设置快照。
        </Text>
      ) : null}
      <Pressable
        testID="setting-avatar-upload"
        style={styles.detailSecondaryButton}
        disabled={isUploadingAvatar}
        onPress={() => {
          uploadAvatar().catch(() => undefined);
        }}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {isUploadingAvatar
            ? '正在上传头像...'
            : avatarPhotoCount > 0
            ? platformFileApi
              ? '重新上传头像凭证'
              : '已添加头像凭证'
            : platformFileApi
            ? '上传头像凭证'
            : '添加头像凭证'}
        </Text>
      </Pressable>
      {hasAvatarToRemove ? (
        <Pressable
          testID="setting-avatar-remove"
          style={styles.detailSecondaryButton}
          disabled={isUploadingAvatar}
          onPress={removeAvatar}
        >
          <Text style={styles.detailSecondaryButtonText}>移除头像</Text>
        </Pressable>
      ) : null}
      <View style={styles.driverInfoCard}>
        <View style={settingRecordStyles.avatarPreviewRow}>
          <ProfileAvatar
            initial={avatarPreviewInitial}
            publicUrl={avatarPreviewPublicUrl}
            size="lg"
            imageTestID="setting-avatar-preview-image"
            textTestID="setting-avatar-preview-text"
          />
          <View style={settingRecordStyles.avatarPreviewTextGroup}>
            <Text style={styles.routeName}>头像预览</Text>
            <Text style={styles.detailMeta}>{avatarStatus.summaryText}</Text>
            <Text style={styles.detailMeta}>{avatarPreviewHint}</Text>
          </View>
        </View>
        <Text style={styles.detailMeta}>{avatarStatus.sourceText}</Text>
        {avatarStatus.fileIdText ? (
          <Text style={styles.detailMeta}>{avatarStatus.fileIdText}</Text>
        ) : null}
        {avatarStatus.previewText ? (
          <Text style={styles.detailMeta}>{avatarStatus.previewText}</Text>
        ) : null}
      </View>
      <Pressable
        testID="setting-account-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submitAccountSettings}
      >
        <Text style={styles.detailPrimaryButtonText}>保存账号资料</Text>
      </Pressable>

      <Text style={styles.draftSectionTitle}>账号安全</Text>
      <Text style={styles.routeMeta}>
        {`密码更新时间：${password.updatedAt}`}
      </Text>
      <Text style={styles.routeMeta}>
        {`异地登录保护：${loginProtectionStatusText}`}
      </Text>
      <Text style={styles.detailMeta}>
        {platformAuthApi?.listSessions || platformNotificationsApi
          ? '当前已接入平台活跃刷新会话与推送设备管理；异常登录拦截、强设备指纹和更细粒度通知偏好仍未接入。'
          : '当前可基于本地登录会话和安全开关生成检查结果；真实异地登录风控和多设备管理尚未接入。'}
      </Text>
      <Pressable
        testID="account-security-local-check"
        style={styles.detailSecondaryButton}
        disabled={isLoadingSecuritySessions}
        onPress={() => {
          runLocalAccountSecurityCheck().catch(() => undefined);
        }}
      >
        <Text style={styles.detailSecondaryButtonText}>
          {isLoadingSecuritySessions
            ? '正在同步设备会话...'
            : platformAuthApi?.listSessions
            ? '检查设备会话'
            : '本地检查设备'}
        </Text>
      </Pressable>
      <AuthField
        testID="setting-current-password"
        label="当前密码"
        placeholder="请输入当前密码"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />
      <AuthField
        testID="setting-new-password"
        label="新密码"
        placeholder="至少 6 位，包含字母和数字"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />
      <AuthField
        testID="setting-confirm-password"
        label="确认新密码"
        placeholder="再次输入新密码"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      <Pressable
        testID="setting-password-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submitPasswordSettings}
      >
        <Text style={styles.detailPrimaryButtonText}>保存登录密码</Text>
      </Pressable>

      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      {showSecurityCheckPanel ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>账号安全检查</Text>
            <Text style={styles.routeAction}>
              {accountSecurityCheck.statusText}
            </Text>
          </View>
          <Text style={styles.detailMeta}>
            {`当前设备：${accountSecurityCheck.currentDeviceText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`设备会话：${accountSecurityCheck.sessionSourceText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {accountSecurityCheck.deviceSummaryText}
          </Text>
          {isLoadingSecuritySessions ? (
            <Text style={styles.detailMeta}>平台设备会话同步中，请稍候。</Text>
          ) : null}
          {accountSecurityCheck.deviceSessions.length > 0
            ? accountSecurityCheck.deviceSessions.map(session => (
                <Text key={session.id} style={styles.routeMeta}>
                  {`${session.isCurrentDevice ? '当前设备' : '其它设备'}：${
                    session.deviceIdText
                  } · 登录 ${session.createdAtText} · 有效至 ${
                    session.expiresAtText
                  }`}
                </Text>
              ))
            : null}
          <Text style={styles.detailMeta}>
            {`当前会话：${accountSecurityCheck.sessionModeText} · ${accountSecurityCheck.sessionStatusText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`登录时间：${accountSecurityCheck.sessionIssuedAtText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`会话有效期至：${accountSecurityCheck.sessionExpiresAtText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`手机号保护：${accountSecurityCheck.phoneProtectionStatusText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`登录保护：${accountSecurityCheck.loginProtectionStatusText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`密码更新时间：${accountSecurityCheck.passwordUpdatedAtText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`隐私确认：${accountSecurityCheck.privacyConfirmationText}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`风险结论：${accountSecurityCheck.riskSummaryText}`}
          </Text>
          {accountSecurityCheck.riskItems.length > 0 ? (
            accountSecurityCheck.riskItems.map(riskItem => (
              <Text key={riskItem} style={styles.routeMeta}>
                {`风险提示：${riskItem}`}
              </Text>
            ))
          ) : (
            <Text style={styles.routeMeta}>
              {accountSecurityCheck.deviceSessions.length > 0
                ? '当前平台设备会话未发现待处理风险。'
                : '当前仅检测到本机安全快照，未发现待处理风险。'}
            </Text>
          )}
          {platformAuthApi?.revokeOtherSessions &&
          platformSecuritySessions !== undefined ? (
            <Pressable
              testID="account-security-revoke-other-sessions"
              style={styles.detailSecondaryButton}
              disabled={
                isRevokingOtherSessions ||
                accountSecurityCheck.otherDeviceSessionCount === 0
              }
              onPress={() => {
                revokeOtherPlatformSessions().catch(() => undefined);
              }}
            >
              <Text style={styles.detailSecondaryButtonText}>
                {isRevokingOtherSessions
                  ? '正在退出其它设备...'
                  : accountSecurityCheck.otherDeviceSessionCount > 0
                  ? `退出其它 ${accountSecurityCheck.otherDeviceSessionCount} 台设备`
                  : '当前仅本机在线'}
              </Text>
            </Pressable>
          ) : null}
          {platformNotificationsApi ? (
            <View style={styles.driverInfoCard}>
              <View style={styles.routeHeader}>
                <Text style={styles.routeName}>活跃推送设备</Text>
                <Pressable
                  testID="account-security-load-push-devices"
                  style={styles.detailSecondaryButton}
                  disabled={isLoadingPushDevices}
                  onPress={() => {
                    syncPlatformPushDevices().catch(() => undefined);
                  }}
                >
                  <Text style={styles.detailSecondaryButtonText}>
                    {isLoadingPushDevices
                      ? '正在同步推送设备...'
                      : platformPushDevices === undefined
                      ? '同步推送设备'
                      : '刷新推送设备'}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.detailMeta}>
                {platformPushDevices === undefined
                  ? '活跃推送设备和登录会话独立管理，退出其它设备登录不会自动停用其消息提醒。'
                  : `已同步 ${platformPushDevices.length} 个活跃推送设备，当前设备 ${currentDevicePushTokens.length} 个，其它设备 ${otherDevicePushTokens.length} 个。`}
              </Text>
              {platformPushDevices ===
              undefined ? null : platformPushDevices.length === 0 ? (
                <Text style={styles.routeMeta}>当前没有活跃推送设备。</Text>
              ) : (
                platformPushDevices.map(device => (
                  <View key={device.id} style={styles.driverInfoCard}>
                    <Text style={styles.routeName}>
                      {device.deviceId === currentDeviceId
                        ? '当前设备推送'
                        : '其它设备推送'}
                    </Text>
                    <Text style={styles.detailMeta}>
                      {`${getPushDevicePlatformText(device.platform)} · 设备 ${
                        device.deviceId
                      }`}
                    </Text>
                    <Text style={styles.detailMeta}>
                      {`令牌：${formatPushTokenPreview(device.token)}`}
                    </Text>
                    <Text style={styles.detailMeta}>
                      {`最近活跃：${formatPushDeviceTimestamp(
                        device.lastUsedAtIso ??
                          device.updatedAtIso ??
                          device.createdAtIso,
                      )}`}
                    </Text>
                    {device.deviceId === currentDeviceId ? (
                      <Text style={styles.routeMeta}>
                        当前设备保留推送接收。
                      </Text>
                    ) : (
                      <Pressable
                        testID={`push-device-deactivate-${device.id}`}
                        style={styles.detailSecondaryButton}
                        disabled={deactivatingPushDeviceId === device.id}
                        onPress={() => {
                          deactivatePlatformPushDevice(device).catch(
                            () => undefined,
                          );
                        }}
                      >
                        <Text style={styles.detailSecondaryButtonText}>
                          {deactivatingPushDeviceId === device.id
                            ? '正在停用推送...'
                            : '停用该设备推送'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </View>
          ) : null}
          <Text style={styles.detailMeta}>
            {platformSecuritySessions !== undefined ||
            platformPushDevices !== undefined
              ? '登录会话和推送设备需要分别治理；退出其它设备登录后，如不再需要提醒，还需单独停用对应设备推送。'
              : '真实多端设备列表、异常登录拦截和强制下线仍未接入。'}
          </Text>
        </View>
      ) : null}
      {showPrivacyPanel ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>隐私政策确认</Text>
            <Text style={styles.routeAction}>
              {isPrivacyConfirmed ? '已确认' : '未确认'}
            </Text>
          </View>
          <Text style={styles.detailMeta}>
            {`确认状态：${isPrivacyConfirmed ? '已确认' : '未确认'}`}
          </Text>
          <Text style={styles.detailMeta}>
            {`当前版本：${privacyPolicyDocumentInfo.versionTitle}`}
          </Text>
          <Text style={styles.detailMeta}>
            平台会同步隐私确认时间和已确认版本留痕；历史旧数据可能只有确认时间。
          </Text>
          {isPrivacyConfirmed ? (
            <Text style={styles.routeMeta}>
              {`本地确认时间：${privacySetting?.confirmedAtText ?? '刚刚'}`}
            </Text>
          ) : null}
          {isPrivacyConfirmed ? (
            <Text style={styles.routeMeta}>
              {`已确认版本：${
                privacySetting?.confirmedVersionTitle ??
                '历史记录未回填版本，仅保留确认时间'
              }`}
            </Text>
          ) : null}
          <Pressable
            testID="privacy-policy-confirm"
            style={({ pressed }) => [
              styles.detailPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            onPress={confirmPrivacyPolicy}
          >
            <Text style={styles.detailPrimaryButtonText}>确认隐私政策</Text>
          </Pressable>
        </View>
      ) : null}
      {showPermissionPanel ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>权限状态</Text>
            <Text style={styles.routeAction}>系统 + 本地</Text>
          </View>
          <Text style={styles.detailMeta}>
            通知、相机和相册会读取当前系统状态；定位仍为本地演练，不会拉起真实系统权限弹窗。
          </Text>
          {localPermissionItems.map(permission => (
            <View key={permission.id} style={styles.driverInfoCard}>
              <View style={styles.routeHeader}>
                <Text style={styles.routeName}>
                  {`${permission.title}：${permissionStatuses[permission.id]}`}
                </Text>
                <Pressable
                  testID={`permission-denied-guide-${permission.id}`}
                  style={styles.detailSecondaryButton}
                  onPress={() => showDeniedGuide(permission.id)}
                >
                  <Text style={styles.detailSecondaryButtonText}>拒绝引导</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Pressable
            testID="permission-local-check"
            style={({ pressed }) => [
              styles.detailPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            disabled={isCheckingPermissionStatuses}
            onPress={() => {
              runLocalPermissionCheck().catch(() => undefined);
            }}
          >
            <Text style={styles.detailPrimaryButtonText}>
              {isCheckingPermissionStatuses
                ? '正在同步权限状态...'
                : '检查权限状态'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {settings.map(item => {
        const canToggle = !isReadOnlySetting(item.id);
        const settingCard = (
          <>
            <View style={styles.routeHeader}>
              <Text style={styles.routeName}>{item.title}</Text>
              <Text style={styles.routeAction}>{item.statusText}</Text>
            </View>
            <Text style={styles.detailMeta}>{item.description}</Text>
          </>
        );

        return canToggle ? (
          <Pressable
            key={item.id}
            testID={`setting-toggle-${item.id}`}
            style={({ pressed }) => [
              styles.driverInfoCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => toggleSetting(item.id)}
          >
            {settingCard}
          </Pressable>
        ) : (
          <Pressable
            key={item.id}
            testID={`setting-open-${item.id.replace('setting-', '')}`}
            style={({ pressed }) => [
              styles.driverInfoCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => openSettingDocument(item.id)}
          >
            {settingCard}
          </Pressable>
        );
      })}
      <Pressable
        testID="setting-logout"
        style={({ pressed }) => [
          styles.detailSecondaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={onLogout}
      >
        <Text style={styles.detailSecondaryButtonText}>退出登录</Text>
      </Pressable>
    </View>
  );
}

const settingRecordStyles = StyleSheet.create({
  avatarPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPreviewTextGroup: {
    flex: 1,
    gap: 4,
  },
});

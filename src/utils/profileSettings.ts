import type {
  SavedAccountSettings,
  SavedPasswordSettings,
  SettingItem,
} from './profileLocalState';
import type { AuthSessionSnapshot } from './authSession';
import type { PushNotificationPermissionStatus } from '../hooks/usePushNotifications';

export type LocalPermissionId =
  | 'location'
  | 'camera'
  | 'album'
  | 'notification';
export type LocalPermissionStatus =
  | '未检测'
  | '本地未授权'
  | '系统已授权'
  | '系统已拒绝'
  | '系统未决定';
export type AccountSecurityCheckStatus = '检查通过' | '需处理';
export type AccountSecurityDeviceSession = {
  id: string;
  deviceId: string;
  createdAtIso: string;
  expiresAtIso: string;
  isCurrentDevice: boolean;
};
export type AccountSecurityCheckModel = {
  statusText: AccountSecurityCheckStatus;
  currentDeviceText: string;
  deviceSummaryText: string;
  sessionSourceText: string;
  sessionModeText: string;
  sessionStatusText: '有效' | '已过期' | '未登录';
  sessionIssuedAtText: string;
  sessionExpiresAtText: string;
  loginProtectionStatusText: string;
  phoneProtectionStatusText: string;
  passwordUpdatedAtText: string;
  privacyConfirmationText: string;
  riskSummaryText: string;
  riskItems: string[];
  currentDeviceSessionCount: number;
  otherDeviceSessionCount: number;
  deviceSessions: Array<{
    id: string;
    deviceIdText: string;
    createdAtText: string;
    expiresAtText: string;
    isCurrentDevice: boolean;
  }>;
};

export type AccountAvatarStatusModel = {
  summaryText: string;
  sourceText: string;
  fileIdText?: string;
  previewText?: string;
};

export const localPermissionItems: Array<{
  id: LocalPermissionId;
  title: string;
  deniedGuide: string;
}> = [
  {
    id: 'location',
    title: '定位权限',
    deniedGuide: '请到系统设置中为货主端开启定位权限',
  },
  {
    id: 'camera',
    title: '相机权限',
    deniedGuide: '请到系统设置中为货主端开启相机权限',
  },
  {
    id: 'album',
    title: '相册权限',
    deniedGuide: '请到系统设置中为货主端开启相册权限',
  },
  {
    id: 'notification',
    title: '通知权限',
    deniedGuide: '请到系统设置中为货主端开启通知权限',
  },
];

export const defaultPermissionStatuses: Record<
  LocalPermissionId,
  LocalPermissionStatus
> = {
  location: '未检测',
  camera: '未检测',
  album: '未检测',
  notification: '未检测',
};

export const privacyPolicyDocumentInfo = {
  version: 'privacy-policy-v2026-07-22',
  versionTitle: '隐私政策 v2026.07.22',
} as const;

const readOnlySettingIds = [
  'setting-privacy',
  'setting-user-agreement',
  'setting-permissions',
  'setting-version-update',
  'setting-about',
];

export function isReadOnlySetting(settingId: string) {
  return readOnlySettingIds.includes(settingId);
}

export type PlatformProfileSettingsSnapshot = {
  phoneProtectionEnabled?: boolean;
  loginProtectionEnabled?: boolean;
  orderNotificationEnabled?: boolean;
  promotionNotificationEnabled?: boolean;
  privacyConfirmedAtIso?: string;
  privacyPolicyVersion?: string;
  privacyPolicyVersionTitle?: string;
};

export function getNextSettingToggle(
  settings: SettingItem[],
  settingId: string,
) {
  const target = settings.find(item => item.id === settingId);

  if (!target || isReadOnlySetting(target.id)) {
    return undefined;
  }

  const nextStatusText = target.statusText === '已开启' ? '已关闭' : '已开启';

  return {
    settings: settings.map(item =>
      item.id === settingId ? { ...item, statusText: nextStatusText } : item,
    ),
    notice: `设置已更新：${target.title}${nextStatusText}`,
  };
}

export function createPlatformProfileSettingsSnapshot(
  settings: SettingItem[],
): PlatformProfileSettingsSnapshot {
  const privacySetting = settings.find(item => item.id === 'setting-privacy');
  const hasPrivacyPolicyVersionSnapshot =
    privacySetting?.statusText === '已确认' &&
    privacySetting.confirmedAtIso &&
    privacySetting.confirmedVersionId &&
    privacySetting.confirmedVersionTitle;

  return {
    phoneProtectionEnabled: readSettingToggleValue(
      settings,
      'setting-phone',
      true,
    ),
    loginProtectionEnabled: readSettingToggleValue(
      settings,
      'setting-login-protection',
      true,
    ),
    orderNotificationEnabled: readSettingToggleValue(
      settings,
      'setting-notification',
      true,
    ),
    promotionNotificationEnabled: readSettingToggleValue(
      settings,
      'setting-promotion',
      false,
    ),
    ...(privacySetting?.statusText === '已确认' && privacySetting.confirmedAtIso
      ? {
          privacyConfirmedAtIso: privacySetting.confirmedAtIso,
          ...(hasPrivacyPolicyVersionSnapshot
            ? {
                privacyPolicyVersion: privacySetting.confirmedVersionId,
                privacyPolicyVersionTitle: privacySetting.confirmedVersionTitle,
              }
            : {}),
        }
      : {}),
  };
}

export function applyPlatformProfileSettingsSnapshot(
  settings: SettingItem[],
  snapshot: PlatformProfileSettingsSnapshot,
) {
  const hasSettingsSnapshot =
    typeof snapshot.phoneProtectionEnabled === 'boolean' ||
    typeof snapshot.loginProtectionEnabled === 'boolean' ||
    typeof snapshot.orderNotificationEnabled === 'boolean' ||
    typeof snapshot.promotionNotificationEnabled === 'boolean' ||
    snapshot.privacyConfirmedAtIso !== undefined ||
    snapshot.privacyPolicyVersion !== undefined ||
    snapshot.privacyPolicyVersionTitle !== undefined;

  return settings.map(item => {
    if (
      item.id === 'setting-phone' &&
      typeof snapshot.phoneProtectionEnabled === 'boolean'
    ) {
      return {
        ...item,
        statusText: getToggleStatusText(snapshot.phoneProtectionEnabled),
      };
    }

    if (
      item.id === 'setting-login-protection' &&
      typeof snapshot.loginProtectionEnabled === 'boolean'
    ) {
      return {
        ...item,
        statusText: getToggleStatusText(snapshot.loginProtectionEnabled),
      };
    }

    if (
      item.id === 'setting-notification' &&
      typeof snapshot.orderNotificationEnabled === 'boolean'
    ) {
      return {
        ...item,
        statusText: getToggleStatusText(snapshot.orderNotificationEnabled),
      };
    }

    if (
      item.id === 'setting-promotion' &&
      typeof snapshot.promotionNotificationEnabled === 'boolean'
    ) {
      return {
        ...item,
        statusText: getToggleStatusText(snapshot.promotionNotificationEnabled),
      };
    }

    if (item.id === 'setting-privacy') {
      if (
        !hasSettingsSnapshot &&
        snapshot.privacyConfirmedAtIso === undefined
      ) {
        return item;
      }

      if (snapshot.privacyConfirmedAtIso) {
        return {
          ...item,
          statusText: '已确认',
          confirmedAtText: formatIsoMinute(snapshot.privacyConfirmedAtIso),
          confirmedAtIso: snapshot.privacyConfirmedAtIso,
          confirmedVersionId: snapshot.privacyPolicyVersion,
          confirmedVersionTitle: snapshot.privacyPolicyVersionTitle,
        };
      }

      return {
        ...item,
        statusText: '未确认',
        confirmedAtText: undefined,
        confirmedAtIso: undefined,
        confirmedVersionId: undefined,
        confirmedVersionTitle: undefined,
      };
    }

    return item;
  });
}

export function validateAccountSettings({
  displayName,
  boundPhone,
  avatarPhotoCount,
  currentAccount,
}: {
  displayName: string;
  boundPhone: string;
  avatarPhotoCount: number;
  currentAccount: SavedAccountSettings;
}) {
  const trimmedDisplayName = displayName.trim();
  const trimmedBoundPhone = boundPhone.trim();

  if (!trimmedDisplayName) {
    return {
      notice: '请填写昵称',
    };
  }

  if (!/^1[3-9]\d{9}$/.test(trimmedBoundPhone)) {
    return {
      notice: '请填写 11 位换绑手机号',
    };
  }

  return {
    notice: '',
    account: {
      ...currentAccount,
      displayName: trimmedDisplayName,
      boundPhone: trimmedBoundPhone,
      avatarPhotoCount,
    },
  };
}

export function validatePasswordSettings({
  currentPassword,
  savedPassword,
  newPassword,
  confirmPassword,
  usesPlatformAuth,
}: {
  currentPassword: string;
  savedPassword: string;
  newPassword: string;
  confirmPassword: string;
  usesPlatformAuth: boolean;
}) {
  if (!usesPlatformAuth && currentPassword !== savedPassword) {
    return '当前密码不正确';
  }

  if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(newPassword)) {
    return '新密码需至少 6 位并包含字母和数字';
  }

  if (newPassword !== confirmPassword) {
    return '两次输入的新密码不一致';
  }

  return '';
}

export function createUpdatedPasswordSettings(
  savedPassword: string,
  now = Date.now(),
): SavedPasswordSettings {
  return {
    savedPassword,
    updatedAt: '刚刚',
    updatedAtIso: new Date(now).toISOString(),
  };
}

export function createAccountAvatarStatusModel({
  savedAccount,
  stagedAvatarPhotoCount,
  stagedAvatarFileId,
  stagedAvatarPublicUrl,
  stagedAvatarRemoved = false,
}: {
  savedAccount: SavedAccountSettings;
  stagedAvatarPhotoCount: number;
  stagedAvatarFileId?: string;
  stagedAvatarPublicUrl?: string;
  stagedAvatarRemoved?: boolean;
}): AccountAvatarStatusModel {
  if (
    stagedAvatarRemoved &&
    (savedAccount.avatarFileId || savedAccount.avatarPublicUrl)
  ) {
    return {
      summaryText: '头像：已移除待保存到平台',
      sourceText: '来源：保存后会回退到昵称首字占位',
    };
  }

  if (stagedAvatarFileId && stagedAvatarFileId !== savedAccount.avatarFileId) {
    return {
      summaryText: '头像凭证：已上传待保存到平台',
      sourceText: '来源：平台文件对象（已上传）',
      fileIdText: `文件 ID：${stagedAvatarFileId}`,
      ...(stagedAvatarPublicUrl ? { previewText: '已生成平台公开地址。' } : {}),
    };
  }

  const effectiveAvatarFileId = stagedAvatarFileId ?? savedAccount.avatarFileId;
  const effectiveAvatarPublicUrl =
    stagedAvatarPublicUrl ?? savedAccount.avatarPublicUrl;

  if (effectiveAvatarFileId) {
    return {
      summaryText: '头像：平台已同步',
      sourceText: '来源：平台文件对象（已上传）',
      fileIdText: `文件 ID：${effectiveAvatarFileId}`,
      ...(effectiveAvatarPublicUrl
        ? { previewText: '已生成平台公开地址。' }
        : {}),
    };
  }

  if (stagedAvatarPhotoCount > 0 || savedAccount.avatarPhotoCount > 0) {
    return {
      summaryText: '头像凭证：本地已保存',
      sourceText: '来源：本地图片凭证占位',
    };
  }

  return {
    summaryText: '头像：当前使用昵称首字占位',
    sourceText: '来源：本地默认头像占位',
  };
}

export function getPlatformPasswordChangeErrorMessage(error: unknown) {
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;

  if (errorCode === 'AUTH_PASSWORD_INVALID') {
    return '当前密码错误';
  }

  if (errorCode === 'NETWORK_ERROR') {
    return '网络连接不可用，请检查网络后重试';
  }

  if (errorCode === 'AUTH_USER_DISABLED') {
    return '账号已禁用，请联系客服处理';
  }

  return '登录密码更新失败，请稍后重试';
}

export function getPlatformAccountProfileErrorMessage(error: unknown) {
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;

  if (errorCode === 'NETWORK_ERROR') {
    return '网络连接不可用，请检查网络后重试';
  }

  if (
    errorCode === 'AUTH_ACCESS_TOKEN_INVALID' ||
    errorCode === 'AUTH_ACCESS_TOKEN_MISSING'
  ) {
    return '平台登录已过期，请重新登录后再保存账号资料。';
  }

  if (errorCode === 'AUTH_USER_DISABLED') {
    return '账号已禁用，请联系客服处理';
  }

  if (errorCode === 'FILE_NOT_FOUND') {
    return '头像文件不存在，请重新上传后再保存。';
  }

  if (errorCode === 'FILE_STATE_INVALID') {
    return '头像文件尚未上传完成，请重新上传后再保存。';
  }

  if (errorCode === 'FILE_PURPOSE_INVALID') {
    return '头像文件用途不匹配，请重新上传头像凭证。';
  }

  if (
    errorCode === 'VALIDATION_ERROR' &&
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return '账号资料同步失败，请稍后重试';
}

export function getPlatformSessionSecurityErrorMessage(
  error: unknown,
  action: 'list' | 'revoke',
) {
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;

  if (errorCode === 'NETWORK_ERROR') {
    return action === 'list'
      ? '设备会话同步失败，请检查网络后重试。'
      : '退出其它设备失败，请检查网络后重试。';
  }

  if (
    errorCode === 'AUTH_ACCESS_TOKEN_INVALID' ||
    errorCode === 'AUTH_ACCESS_TOKEN_MISSING'
  ) {
    return action === 'list'
      ? '平台登录已过期，请重新登录后再检查设备会话。'
      : '平台登录已过期，请重新登录后再管理设备会话。';
  }

  if (errorCode === 'AUTH_USER_DISABLED') {
    return '账号已禁用，请联系客服处理';
  }

  return action === 'list'
    ? '设备会话同步失败，请稍后重试。'
    : '退出其它设备失败，请稍后重试。';
}

export function getPlatformPushDeviceErrorMessage(
  error: unknown,
  action: 'list' | 'deactivate',
) {
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;

  if (errorCode === 'NETWORK_ERROR') {
    return action === 'list'
      ? '推送设备同步失败，请检查网络后重试。'
      : '停用设备推送失败，请检查网络后重试。';
  }

  if (
    errorCode === 'AUTH_ACCESS_TOKEN_INVALID' ||
    errorCode === 'AUTH_ACCESS_TOKEN_MISSING'
  ) {
    return action === 'list'
      ? '平台登录已过期，请重新登录后再检查推送设备。'
      : '平台登录已过期，请重新登录后再管理推送设备。';
  }

  if (errorCode === 'AUTH_USER_DISABLED') {
    return '账号已禁用，请联系客服处理';
  }

  return action === 'list'
    ? '推送设备同步失败，请稍后重试。'
    : '停用设备推送失败，请稍后重试。';
}

export function createLocalPermissionDeniedStatuses(): Record<
  LocalPermissionId,
  LocalPermissionStatus
> {
  return {
    location: '本地未授权',
    camera: '本地未授权',
    album: '本地未授权',
    notification: '本地未授权',
  };
}

export function getPermissionDeniedGuideNotice(permissionId: string) {
  const permission = localPermissionItems.find(
    item => item.id === permissionId,
  );

  if (!permission) {
    return '';
  }

  return `${permission.title}拒绝引导：${permission.deniedGuide}；当前不会拉起真实系统设置页。`;
}

export function getSystemPermissionStatusText(
  status?: 'granted' | 'denied' | 'undetermined',
): LocalPermissionStatus {
  if (status === 'granted') {
    return '系统已授权';
  }

  if (status === 'denied') {
    return '系统已拒绝';
  }

  if (status === 'undetermined') {
    return '系统未决定';
  }

  return '未检测';
}

export function getNotificationPermissionStatusText(
  status?: PushNotificationPermissionStatus,
): LocalPermissionStatus {
  return getSystemPermissionStatusText(status);
}

export function createAccountSecurityCheckModel({
  settings,
  password,
  authSession,
  deviceSessions,
  now = Date.now(),
}: {
  settings: SettingItem[];
  password: SavedPasswordSettings;
  authSession?: AuthSessionSnapshot;
  deviceSessions?: AccountSecurityDeviceSession[];
  now?: number;
}): AccountSecurityCheckModel {
  const loginProtectionStatusText = readSettingStatusText(
    settings,
    'setting-login-protection',
  );
  const phoneProtectionStatusText = readSettingStatusText(
    settings,
    'setting-phone',
  );
  const privacySetting = settings.find(item => item.id === 'setting-privacy');
  const usesPlatformSession = Boolean(authSession?.accessToken);
  const hasAuthSession = Boolean(authSession);
  const hasPlatformDeviceSessions = deviceSessions !== undefined;
  const normalizedDeviceSessions = (deviceSessions ?? []).map(session => ({
    id: session.id,
    deviceIdText: session.deviceId,
    createdAtText: formatIsoMinute(session.createdAtIso),
    expiresAtText: formatIsoMinute(session.expiresAtIso),
    isCurrentDevice: session.isCurrentDevice,
  }));
  const currentDeviceSessionCount = normalizedDeviceSessions.filter(
    session => session.isCurrentDevice,
  ).length;
  const otherDeviceSessionCount = Math.max(
    normalizedDeviceSessions.length - currentDeviceSessionCount,
    0,
  );
  const currentDeviceSession = normalizedDeviceSessions.find(
    session => session.isCurrentDevice,
  );
  const sessionExpired =
    authSession !== undefined ? authSession.expiresAt <= now : false;
  const currentPlatformSessionExpired = currentDeviceSession
    ? Date.parse(
        deviceSessions?.find(session => session.id === currentDeviceSession.id)
          ?.expiresAtIso ?? '',
      ) <= now
    : false;
  const riskItems: string[] = [];

  if (hasPlatformDeviceSessions) {
    if (normalizedDeviceSessions.length === 0) {
      riskItems.push('平台未返回任何活跃设备会话，建议重新登录后再检查。');
    } else if (currentDeviceSessionCount === 0) {
      riskItems.push('平台未返回当前设备会话，建议重新登录后再检查。');
    }

    if (otherDeviceSessionCount > 0) {
      riskItems.push(
        `检测到 ${otherDeviceSessionCount} 台其它设备保持登录，如非本人请立即退出其它设备。`,
      );
    }
  } else if (!hasAuthSession) {
    riskItems.push('当前未检测到登录会话，本地仅保留离线资料快照。');
  } else if (sessionExpired) {
    riskItems.push('当前登录会话已过期，敏感操作需要重新登录。');
  }

  if (loginProtectionStatusText !== '已开启') {
    riskItems.push('异地登录保护已关闭，本地无法拦截异常设备登录。');
  }

  if (phoneProtectionStatusText !== '已开启') {
    riskItems.push('手机号保护已关闭，联系信息脱敏保护未开启。');
  }

  return {
    statusText: riskItems.length > 0 ? '需处理' : '检查通过',
    currentDeviceText: hasPlatformDeviceSessions
      ? currentDeviceSessionCount > 0
        ? '当前安装设备（已匹配平台会话）'
        : '当前安装设备（未匹配到平台会话）'
      : usesPlatformSession
      ? '本机演示设备（平台会话）'
      : hasAuthSession
      ? '本机演示设备（本地会话）'
      : '未检测到设备会话',
    deviceSummaryText: hasPlatformDeviceSessions
      ? `平台共检测到 ${normalizedDeviceSessions.length} 个活跃会话，当前设备 ${currentDeviceSessionCount} 个，其它设备 ${otherDeviceSessionCount} 个。`
      : hasAuthSession
      ? '仅检测到当前设备会话，本地未发现其他设备快照。'
      : '当前未检测到可用设备会话快照。',
    sessionSourceText: hasPlatformDeviceSessions
      ? `已同步平台 ${normalizedDeviceSessions.length} 条活跃刷新会话`
      : '已生成本地快照',
    sessionModeText: hasPlatformDeviceSessions
      ? '平台刷新会话'
      : usesPlatformSession
      ? '平台登录会话'
      : hasAuthSession
      ? '本地演示会话'
      : '未检测到登录会话',
    sessionStatusText: hasPlatformDeviceSessions
      ? !currentDeviceSession
        ? '未登录'
        : currentPlatformSessionExpired
        ? '已过期'
        : '有效'
      : !hasAuthSession
      ? '未登录'
      : sessionExpired
      ? '已过期'
      : '有效',
    sessionIssuedAtText: currentDeviceSession
      ? currentDeviceSession.createdAtText
      : authSession
      ? formatTimestampMinute(authSession.issuedAt)
      : '未记录',
    sessionExpiresAtText: currentDeviceSession
      ? currentDeviceSession.expiresAtText
      : authSession
      ? formatTimestampMinute(authSession.expiresAt)
      : '未记录',
    loginProtectionStatusText,
    phoneProtectionStatusText,
    passwordUpdatedAtText: password.updatedAt,
    privacyConfirmationText:
      privacySetting?.statusText === '已确认'
        ? privacySetting.confirmedAtText
          ? `已确认（${privacySetting.confirmedAtText}）`
          : '已确认'
        : '未确认',
    riskSummaryText:
      riskItems.length > 0
        ? `发现 ${riskItems.length} 项待处理风险`
        : '当前未发现待处理风险',
    riskItems,
    currentDeviceSessionCount,
    otherDeviceSessionCount,
    deviceSessions: normalizedDeviceSessions,
  };
}

export function getSettingDocumentState(
  settingId: string,
  versionInfo: {
    currentVersion: string;
    latestVersion: string;
    channelText: string;
  },
) {
  const baseState = {
    showPrivacyPanel: settingId === 'setting-privacy',
    showPermissionPanel: settingId === 'setting-permissions',
    showSecurityCheckPanel: false,
  };

  if (settingId === 'setting-user-agreement') {
    return {
      ...baseState,
      notice: '用户协议摘要：本地演示版展示协议要点。',
    };
  }

  if (settingId === 'setting-privacy') {
    return {
      ...baseState,
      notice: `隐私政策摘要：说明位置权限、订单信息和联系方式使用范围。当前待确认版本：${privacyPolicyDocumentInfo.versionTitle}；确认后会同步确认时间和已确认版本留痕。`,
    };
  }

  if (settingId === 'setting-permissions') {
    return {
      ...baseState,
      notice:
        '权限说明：定位用于发单城市与路线展示；相机用于本地图片凭证占位；相册用于选择本地图片凭证；通知用于订单状态提醒。通知、相机和相册会读取当前系统状态；定位仍未接入真实系统权限弹窗。',
    };
  }

  if (settingId === 'setting-version-update') {
    return {
      ...baseState,
      notice: `版本更新：当前版本 ${versionInfo.currentVersion}；最新版本 ${versionInfo.latestVersion}；更新结果：${versionInfo.channelText} 暂无线上更新包；检查时间：刚刚`,
    };
  }

  if (settingId === 'setting-about') {
    return {
      ...baseState,
      notice: '关于我们：货主端本地 MVP，真实版本、客服和备案信息待接入。',
    };
  }

  return {
    ...baseState,
    notice: '',
  };
}

export function createConfirmedPrivacySettings(
  settings: SettingItem[],
  now = Date.now(),
) {
  return settings.map(item =>
    item.id === 'setting-privacy'
      ? {
          ...item,
          statusText: '已确认',
          confirmedAtText: '刚刚',
          confirmedAtIso: new Date(now).toISOString(),
          confirmedVersionId: privacyPolicyDocumentInfo.version,
          confirmedVersionTitle: privacyPolicyDocumentInfo.versionTitle,
        }
      : item,
  );
}

function readSettingToggleValue(
  settings: SettingItem[],
  settingId: string,
  defaultValue: boolean,
) {
  const setting = settings.find(item => item.id === settingId);

  if (!setting) {
    return defaultValue;
  }

  if (setting.statusText === '已开启') {
    return true;
  }

  if (setting.statusText === '已关闭') {
    return false;
  }

  return defaultValue;
}

function readSettingStatusText(
  settings: SettingItem[],
  settingId: string,
  fallback = '未配置',
) {
  return settings.find(item => item.id === settingId)?.statusText ?? fallback;
}

function getToggleStatusText(enabled: boolean) {
  return enabled ? '已开启' : '已关闭';
}

function formatIsoMinute(isoText: string) {
  return isoText.slice(0, 16).replace('T', ' ');
}

function formatTimestampMinute(timestamp: number) {
  return formatIsoMinute(new Date(timestamp).toISOString());
}

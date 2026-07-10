import type {
  SavedAccountSettings,
  SavedPasswordSettings,
  SettingItem,
} from './profileLocalState';

export type LocalPermissionId = 'location' | 'camera' | 'album' | 'notification';
export type LocalPermissionStatus = '未检测' | '本地未授权';

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

export function getNextSettingToggle(
  settings: SettingItem[],
  settingId: string,
) {
  const target = settings.find(item => item.id === settingId);

  if (!target || isReadOnlySetting(target.id)) {
    return undefined;
  }

  const nextStatusText =
    target.statusText === '已开启' ? '已关闭' : '已开启';

  return {
    settings: settings.map(item =>
      item.id === settingId ? {...item, statusText: nextStatusText} : item,
    ),
    notice: `设置已更新：${target.title}${nextStatusText}`,
  };
}

export function validateAccountSettings({
  displayName,
  boundPhone,
  avatarPhotoCount,
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

  if (!/^1\d{10}$/.test(trimmedBoundPhone)) {
    return {
      notice: '请填写 11 位换绑手机号',
    };
  }

  return {
    notice: '',
    account: {
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

export function getPlatformPasswordChangeErrorMessage(error: unknown) {
  const errorCode =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
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
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined;

  if (errorCode === 'NETWORK_ERROR') {
    return '网络连接不可用，请检查网络后重试';
  }

  if (errorCode === 'AUTH_USER_DISABLED') {
    return '账号已禁用，请联系客服处理';
  }

  return '账号资料同步失败，请稍后重试';
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
  const permission = localPermissionItems.find(item => item.id === permissionId);

  if (!permission) {
    return '';
  }

  return `${permission.title}拒绝引导：${permission.deniedGuide}；当前不会拉起真实系统设置页。`;
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
      notice:
        '隐私政策摘要：说明位置权限、订单信息和联系方式使用范围。真实隐私协议版本留痕和后端同步仍未接入。',
    };
  }

  if (settingId === 'setting-permissions') {
    return {
      ...baseState,
      notice:
        '权限说明：定位用于发单城市与路线展示；相机用于本地图片凭证占位；相册用于选择本地图片凭证；通知用于订单状态提醒。真实系统权限弹窗尚未接入。',
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
        }
      : item,
  );
}

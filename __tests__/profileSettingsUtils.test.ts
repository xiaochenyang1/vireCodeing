import {appVersionInfo, profileSettingItems} from '../src/data/mockData';
import type {
  SavedAccountSettings,
  SettingItem,
} from '../src/utils/profileLocalState';
import {
  createConfirmedPrivacySettings,
  createLocalPermissionDeniedStatuses,
  createUpdatedPasswordSettings,
  defaultPermissionStatuses,
  getNextSettingToggle,
  getPlatformAccountProfileErrorMessage,
  getPermissionDeniedGuideNotice,
  getPlatformPasswordChangeErrorMessage,
  getSettingDocumentState,
  isReadOnlySetting,
  localPermissionItems,
  validateAccountSettings,
  validatePasswordSettings,
} from '../src/utils/profileSettings';

function cloneSettings(): SettingItem[] {
  return profileSettingItems.map(item => ({...item})) as SettingItem[];
}

describe('profile settings utils', () => {
  it('keeps document settings read only and toggles writable settings between opened and closed states', () => {
    const settings = cloneSettings();

    expect(isReadOnlySetting('setting-privacy')).toBe(true);
    expect(isReadOnlySetting('setting-user-agreement')).toBe(true);
    expect(isReadOnlySetting('setting-version-update')).toBe(true);
    expect(isReadOnlySetting('setting-phone')).toBe(false);

    expect(getNextSettingToggle(settings, 'setting-privacy')).toBeUndefined();
    expect(getNextSettingToggle(settings, 'setting-missing')).toBeUndefined();

    const disabled = getNextSettingToggle(settings, 'setting-phone');
    expect(disabled?.notice).toBe('设置已更新：手机号保护已关闭');
    expect(
      disabled?.settings.find(item => item.id === 'setting-phone')?.statusText,
    ).toBe('已关闭');

    const enabled = getNextSettingToggle(
      disabled?.settings ?? settings,
      'setting-phone',
    );
    expect(enabled?.notice).toBe('设置已更新：手机号保护已开启');
    expect(
      enabled?.settings.find(item => item.id === 'setting-phone')?.statusText,
    ).toBe('已开启');
  });

  it('validates account settings before creating a trimmed account snapshot', () => {
    const currentAccount: SavedAccountSettings = {
      displayName: '旧昵称',
      boundPhone: '13800138000',
      avatarPhotoCount: 0,
    };

    expect(
      validateAccountSettings({
        displayName: '   ',
        boundPhone: '13900139999',
        avatarPhotoCount: 1,
        currentAccount,
      }),
    ).toEqual({
      notice: '请填写昵称',
    });
    expect(
      validateAccountSettings({
        displayName: ' 晨星货主 ',
        boundPhone: '12345',
        avatarPhotoCount: 1,
        currentAccount,
      }),
    ).toEqual({
      notice: '请填写 11 位换绑手机号',
    });
    expect(
      validateAccountSettings({
        displayName: ' 晨星货主 ',
        boundPhone: ' 13900139999 ',
        avatarPhotoCount: 1,
        currentAccount,
      }),
    ).toEqual({
      notice: '',
      account: {
        displayName: '晨星货主',
        boundPhone: '13900139999',
        avatarPhotoCount: 1,
      },
    });
  });

  it('validates local and platform password changes without leaking saved password checks into platform mode', () => {
    expect(
      validatePasswordSettings({
        currentPassword: 'wrong123',
        savedPassword: 'abc123',
        newPassword: 'newpass1',
        confirmPassword: 'newpass1',
        usesPlatformAuth: false,
      }),
    ).toBe('当前密码不正确');
    expect(
      validatePasswordSettings({
        currentPassword: 'wrong123',
        savedPassword: 'abc123',
        newPassword: 'short',
        confirmPassword: 'short',
        usesPlatformAuth: true,
      }),
    ).toBe('新密码需至少 6 位并包含字母和数字');
    expect(
      validatePasswordSettings({
        currentPassword: 'abc123',
        savedPassword: 'abc123',
        newPassword: 'newpass1',
        confirmPassword: 'newpass2',
        usesPlatformAuth: false,
      }),
    ).toBe('两次输入的新密码不一致');
    expect(
      validatePasswordSettings({
        currentPassword: 'wrong123',
        savedPassword: 'abc123',
        newPassword: 'newpass1',
        confirmPassword: 'newpass1',
        usesPlatformAuth: true,
      }),
    ).toBe('');
  });

  it('creates password settings with a structured update timestamp', () => {
    const now = new Date('2026-06-30T08:30:00+08:00').getTime();

    expect(createUpdatedPasswordSettings('newpass1', now)).toEqual({
      savedPassword: 'newpass1',
      updatedAt: '刚刚',
      updatedAtIso: new Date(now).toISOString(),
    });
  });

  it.each([
    ['AUTH_PASSWORD_INVALID', '当前密码错误'],
    ['NETWORK_ERROR', '网络连接不可用，请检查网络后重试'],
    ['AUTH_USER_DISABLED', '账号已禁用，请联系客服处理'],
    ['UNKNOWN_CODE', '登录密码更新失败，请稍后重试'],
  ])('maps platform password error %s', (code, message) => {
    expect(
      getPlatformPasswordChangeErrorMessage(
        Object.assign(new Error('raw error'), {code}),
      ),
    ).toBe(message);
  });

  it.each([
    ['NETWORK_ERROR', '网络连接不可用，请检查网络后重试'],
    ['AUTH_USER_DISABLED', '账号已禁用，请联系客服处理'],
    ['UNKNOWN_CODE', '账号资料同步失败，请稍后重试'],
  ])('maps platform account profile error %s', (code, message) => {
    expect(
      getPlatformAccountProfileErrorMessage(
        Object.assign(new Error('raw error'), {code}),
      ),
    ).toBe(message);
  });

  it('creates local permission defaults, denied statuses, and denied guide copy', () => {
    expect(localPermissionItems.map(item => item.id)).toEqual([
      'location',
      'camera',
      'album',
      'notification',
    ]);
    expect(defaultPermissionStatuses).toEqual({
      location: '未检测',
      camera: '未检测',
      album: '未检测',
      notification: '未检测',
    });
    expect(createLocalPermissionDeniedStatuses()).toEqual({
      location: '本地未授权',
      camera: '本地未授权',
      album: '本地未授权',
      notification: '本地未授权',
    });
    expect(getPermissionDeniedGuideNotice('location')).toBe(
      '定位权限拒绝引导：请到系统设置中为货主端开启定位权限；当前不会拉起真实系统设置页。',
    );
    expect(getPermissionDeniedGuideNotice('missing')).toBe('');
  });

  it('returns document panel state and copy for read-only settings', () => {
    expect(getSettingDocumentState('setting-user-agreement', appVersionInfo)).toEqual({
      showPrivacyPanel: false,
      showPermissionPanel: false,
      showSecurityCheckPanel: false,
      notice: '用户协议摘要：本地演示版展示协议要点。',
    });
    expect(getSettingDocumentState('setting-privacy', appVersionInfo)).toEqual({
      showPrivacyPanel: true,
      showPermissionPanel: false,
      showSecurityCheckPanel: false,
      notice:
        '隐私政策摘要：说明位置权限、订单信息和联系方式使用范围。真实隐私协议版本留痕和后端同步仍未接入。',
    });
    expect(
      getSettingDocumentState('setting-permissions', appVersionInfo),
    ).toEqual({
      showPrivacyPanel: false,
      showPermissionPanel: true,
      showSecurityCheckPanel: false,
      notice:
        '权限说明：定位用于发单城市与路线展示；相机用于本地图片凭证占位；相册用于选择本地图片凭证；通知用于订单状态提醒。真实系统权限弹窗尚未接入。',
    });
    expect(
      getSettingDocumentState('setting-version-update', appVersionInfo).notice,
    ).toBe(
      '版本更新：当前版本 0.0.1；最新版本 0.0.1；更新结果：本地 MVP 暂无线上更新包；检查时间：刚刚',
    );
    expect(getSettingDocumentState('setting-about', appVersionInfo)).toEqual({
      showPrivacyPanel: false,
      showPermissionPanel: false,
      showSecurityCheckPanel: false,
      notice: '关于我们：货主端本地 MVP，真实版本、客服和备案信息待接入。',
    });
  });

  it('confirms privacy policy by updating only the privacy setting', () => {
    const now = new Date('2026-06-30T09:00:00+08:00').getTime();
    const nextSettings = createConfirmedPrivacySettings(cloneSettings(), now);
    const privacySetting = nextSettings.find(
      item => item.id === 'setting-privacy',
    );

    expect(privacySetting).toMatchObject({
      statusText: '已确认',
      confirmedAtText: '刚刚',
      confirmedAtIso: new Date(now).toISOString(),
    });
    expect(
      nextSettings.find(item => item.id === 'setting-phone')?.statusText,
    ).toBe('已开启');
    expect(
      nextSettings.find(item => item.id === 'setting-phone'),
    ).not.toHaveProperty('confirmedAtIso');
  });
});

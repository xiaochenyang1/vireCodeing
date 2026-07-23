import {appVersionInfo, profileSettingItems} from '../src/data/mockData';
import type {
  SavedAccountSettings,
  SettingItem,
} from '../src/utils/profileLocalState';
import {
  createAccountAvatarStatusModel,
  applyPlatformProfileSettingsSnapshot,
  createAccountSecurityCheckModel,
  createConfirmedPrivacySettings,
  createLocalPermissionDeniedStatuses,
  createPlatformProfileSettingsSnapshot,
  createUpdatedPasswordSettings,
  defaultPermissionStatuses,
  getNextSettingToggle,
  getPlatformAccountProfileErrorMessage,
  getPermissionDeniedGuideNotice,
  getPlatformPasswordChangeErrorMessage,
  getSettingDocumentState,
  isReadOnlySetting,
  localPermissionItems,
  privacyPolicyDocumentInfo,
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

  it('derives layered avatar status copy from saved and staged account snapshots', () => {
    const savedAccount: SavedAccountSettings = {
      displayName: '旧昵称',
      boundPhone: '13800138000',
      avatarPhotoCount: 0,
    };

    expect(
      createAccountAvatarStatusModel({
        savedAccount,
        stagedAvatarPhotoCount: 0,
      }),
    ).toEqual({
      summaryText: '头像：当前使用昵称首字占位',
      sourceText: '来源：本地默认头像占位',
    });

    expect(
      createAccountAvatarStatusModel({
        savedAccount,
        stagedAvatarPhotoCount: 1,
      }),
    ).toEqual({
      summaryText: '头像凭证：本地已保存',
      sourceText: '来源：本地图片凭证占位',
    });

    expect(
      createAccountAvatarStatusModel({
        savedAccount,
        stagedAvatarPhotoCount: 1,
        stagedAvatarFileId: 'file-avatar-1',
        stagedAvatarPublicUrl:
          'https://cdn.example.com/avatar/file-avatar-1.png',
      }),
    ).toEqual({
      summaryText: '头像凭证：已上传待保存到平台',
      sourceText: '来源：平台文件对象（已上传）',
      fileIdText: '文件 ID：file-avatar-1',
      previewText: '已生成平台公开地址。',
    });

    expect(
      createAccountAvatarStatusModel({
        savedAccount: {
          ...savedAccount,
          avatarPhotoCount: 1,
          avatarFileId: 'file-avatar-2',
          avatarPublicUrl:
            'https://cdn.example.com/avatar/file-avatar-2.png',
        },
        stagedAvatarPhotoCount: 1,
        stagedAvatarFileId: 'file-avatar-2',
        stagedAvatarPublicUrl:
          'https://cdn.example.com/avatar/file-avatar-2.png',
      }),
    ).toEqual({
      summaryText: '头像：平台已同步',
        sourceText: '来源：平台文件对象（已上传）',
        fileIdText: '文件 ID：file-avatar-2',
        previewText: '已生成平台公开地址。',
      });

    expect(
      createAccountAvatarStatusModel({
        savedAccount: {
          ...savedAccount,
          avatarPhotoCount: 1,
          avatarFileId: 'file-avatar-2',
          avatarPublicUrl:
            'https://cdn.example.com/avatar/file-avatar-2.png',
        },
        stagedAvatarPhotoCount: 0,
        stagedAvatarRemoved: true,
      }),
    ).toEqual({
      summaryText: '头像：已移除待保存到平台',
      sourceText: '来源：保存后会回退到昵称首字占位',
    });
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
    ['VALIDATION_ERROR', '手机号已被其他账号占用'],
    ['UNKNOWN_CODE', '账号资料同步失败，请稍后重试'],
  ])('maps platform account profile error %s', (code, message) => {
    expect(
      getPlatformAccountProfileErrorMessage(
        Object.assign(new Error(message), {code}),
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
      notice: `隐私政策摘要：说明位置权限、订单信息和联系方式使用范围。当前待确认版本：${privacyPolicyDocumentInfo.versionTitle}；确认后会同步确认时间和已确认版本留痕。`,
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
      confirmedVersionId: privacyPolicyDocumentInfo.version,
      confirmedVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });
    expect(
      nextSettings.find(item => item.id === 'setting-phone')?.statusText,
    ).toBe('已开启');
    expect(
      nextSettings.find(item => item.id === 'setting-phone'),
    ).not.toHaveProperty('confirmedAtIso');
  });

  it('creates and applies platform settings snapshots', () => {
    const settings = cloneSettings();

    expect(createPlatformProfileSettingsSnapshot(settings)).toEqual({
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });

    const confirmedSettings = createConfirmedPrivacySettings(
      settings,
      Date.parse('2026-07-22T08:30:00.000Z'),
    );

    expect(createPlatformProfileSettingsSnapshot(confirmedSettings)).toEqual({
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: privacyPolicyDocumentInfo.version,
      privacyPolicyVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });

    const syncedSettings = applyPlatformProfileSettingsSnapshot(settings, {
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: privacyPolicyDocumentInfo.version,
      privacyPolicyVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });

    expect(
      syncedSettings.find(item => item.id === 'setting-phone')?.statusText,
    ).toBe('已关闭');
    expect(
      syncedSettings.find(item => item.id === 'setting-login-protection')
        ?.statusText,
    ).toBe('已关闭');
    expect(
      syncedSettings.find(item => item.id === 'setting-promotion')?.statusText,
    ).toBe('已开启');
    expect(
      syncedSettings.find(item => item.id === 'setting-privacy'),
    ).toMatchObject({
      statusText: '已确认',
      confirmedAtText: '2026-07-22 08:30',
      confirmedAtIso: '2026-07-22T08:30:00.000Z',
      confirmedVersionId: privacyPolicyDocumentInfo.version,
      confirmedVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });

    const unconfirmedSettings = applyPlatformProfileSettingsSnapshot(settings, {
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: false,
      promotionNotificationEnabled: false,
    });

    expect(
      unconfirmedSettings.find(item => item.id === 'setting-notification')
        ?.statusText,
    ).toBe('已关闭');
    expect(
      unconfirmedSettings.find(item => item.id === 'setting-privacy')
        ?.statusText,
    ).toBe('未确认');
  });

  it('creates a local account security check summary from the current session snapshot', () => {
    const now = Date.parse('2026-07-22T08:30:00.000Z');
    const securityCheck = createAccountSecurityCheckModel({
      settings: cloneSettings(),
      password: {
        savedPassword: 'abc123',
        updatedAt: '刚刚',
        updatedAtIso: '2026-07-22T08:20:00.000Z',
      },
      authSession: {
        issuedAt: Date.parse('2026-07-22T08:00:00.000Z'),
        expiresAt: Date.parse('2026-07-29T08:00:00.000Z'),
      },
      now,
    });

    expect(securityCheck).toMatchObject({
      statusText: '检查通过',
      currentDeviceText: '本机演示设备（本地会话）',
      deviceSummaryText: '仅检测到当前设备会话，本地未发现其他设备快照。',
      sessionModeText: '本地演示会话',
      sessionStatusText: '有效',
      sessionIssuedAtText: '2026-07-22 08:00',
      sessionExpiresAtText: '2026-07-29 08:00',
      loginProtectionStatusText: '已开启',
      phoneProtectionStatusText: '已开启',
      passwordUpdatedAtText: '刚刚',
      privacyConfirmationText: '未确认',
      riskSummaryText: '当前未发现待处理风险',
      riskItems: [],
    });
  });

  it('reports expired sessions and disabled protection switches in account security checks', () => {
    const now = Date.parse('2026-07-22T08:30:00.000Z');
    const settings = cloneSettings().map(item => {
      if (
        item.id === 'setting-login-protection' ||
        item.id === 'setting-phone'
      ) {
        return {
          ...item,
          statusText: '已关闭',
        };
      }

      return item;
    });
    const securityCheck = createAccountSecurityCheckModel({
      settings,
      password: {
        savedPassword: 'abc123',
        updatedAt: '未修改',
      },
      authSession: {
        issuedAt: Date.parse('2026-07-22T07:00:00.000Z'),
        expiresAt: Date.parse('2026-07-22T08:00:00.000Z'),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
      now,
    });

    expect(securityCheck.statusText).toBe('需处理');
    expect(securityCheck.currentDeviceText).toBe('本机演示设备（平台会话）');
    expect(securityCheck.sessionModeText).toBe('平台登录会话');
    expect(securityCheck.sessionStatusText).toBe('已过期');
    expect(securityCheck.riskSummaryText).toBe('发现 3 项待处理风险');
    expect(securityCheck.riskItems).toEqual([
      '当前登录会话已过期，敏感操作需要重新登录。',
      '异地登录保护已关闭，本地无法拦截异常设备登录。',
      '手机号保护已关闭，联系信息脱敏保护未开启。',
    ]);
  });

  it('summarizes platform device sessions and other-device risk items in account security checks', () => {
    const now = Date.parse('2026-07-22T08:30:00.000Z');
    const securityCheck = createAccountSecurityCheckModel({
      settings: cloneSettings(),
      password: {
        savedPassword: 'abc123',
        updatedAt: '刚刚',
      },
      authSession: {
        issuedAt: Date.parse('2026-07-22T08:00:00.000Z'),
        expiresAt: Date.parse('2026-07-22T08:45:00.000Z'),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        deviceId: 'mobile-device-current',
      },
      deviceSessions: [
        {
          id: 'session-current',
          deviceId: 'mobile-device-current',
          createdAtIso: '2026-07-22T08:00:00.000Z',
          expiresAtIso: '2026-07-29T08:00:00.000Z',
          isCurrentDevice: true,
        },
        {
          id: 'session-laptop',
          deviceId: 'mobile-device-laptop',
          createdAtIso: '2026-07-21T08:00:00.000Z',
          expiresAtIso: '2026-07-28T08:00:00.000Z',
          isCurrentDevice: false,
        },
      ],
      now,
    });

    expect(securityCheck).toMatchObject({
      statusText: '需处理',
      currentDeviceText: '当前安装设备（已匹配平台会话）',
      deviceSummaryText:
        '平台共检测到 2 个活跃会话，当前设备 1 个，其它设备 1 个。',
      sessionSourceText: '已同步平台 2 条活跃刷新会话',
      sessionModeText: '平台刷新会话',
      sessionStatusText: '有效',
      sessionIssuedAtText: '2026-07-22 08:00',
      sessionExpiresAtText: '2026-07-29 08:00',
      currentDeviceSessionCount: 1,
      otherDeviceSessionCount: 1,
    });
    expect(securityCheck.riskItems).toEqual([
      '检测到 1 台其它设备保持登录，如非本人请立即退出其它设备。',
    ]);
    expect(securityCheck.deviceSessions).toEqual([
      {
        id: 'session-current',
        deviceIdText: 'mobile-device-current',
        createdAtText: '2026-07-22 08:00',
        expiresAtText: '2026-07-29 08:00',
        isCurrentDevice: true,
      },
      {
        id: 'session-laptop',
        deviceIdText: 'mobile-device-laptop',
        createdAtText: '2026-07-21 08:00',
        expiresAtText: '2026-07-28 08:00',
        isCurrentDevice: false,
      },
    ]);
  });
});

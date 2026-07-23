import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { profileSettingItems } from '../src/data/mockData';
import { PlatformApiError } from '../src/services/platformApiClient';
import { SettingRecords } from '../src/screens/profile/SettingRecords';
import { clearAuthSession, saveAuthSession } from '../src/utils/authSession';
import { clearDeviceId } from '../src/utils/deviceId';
import type {
  SavedAccountSettings,
  SavedPasswordSettings,
  SettingItem,
} from '../src/utils/profileLocalState';
import { privacyPolicyDocumentInfo } from '../src/utils/profileSettings';

function cloneSettings(): SettingItem[] {
  return profileSettingItems.map(item => ({ ...item })) as SettingItem[];
}

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

describe('SettingRecords platform account profile', () => {
  const baseAccount: SavedAccountSettings = {
    displayName: '旧昵称',
    boundPhone: '13800138000',
    avatarPhotoCount: 0,
  };
  const basePassword: SavedPasswordSettings = {
    savedPassword: 'abc123',
    updatedAt: '未修改',
  };

  afterEach(async () => {
    clearAuthSession();
    await clearDeviceId();
  });

  it('syncs display name and bound phone through the platform profile api', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '平台昵称',
        phone: '13800138000',
      }),
    };
    const onUpdateAccount = jest.fn();
    const onUpdateSettings = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={onUpdateSettings}
          onUpdateAccount={onUpdateAccount}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'setting-bound-phone' }).props
        .editable,
    ).toBe(true);

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-display-name' })
        .props.onChangeText(' 平台昵称 ');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-account-submit' })
        .props.onPress();
    });

    expect(platformProfileApi.saveAccountProfile).toHaveBeenCalledWith({
      displayName: '平台昵称',
      phone: '13800138000',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(onUpdateAccount).toHaveBeenCalledWith(
      {
        displayName: '平台昵称',
        boundPhone: '13800138000',
        avatarPhotoCount: 0,
      },
      {
        markSynced: true,
        syncMessage: '账号资料快照已同步到平台。',
        syncOperation: 'accountProfile',
      },
    );
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.any(Array),
      { markPendingSync: false },
    );
    expect(getRenderedText(renderer)).toContain('昵称和手机号已同步到平台。');
  });

  it('shows an actionable message when platform account sync fails because the network is unavailable', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockRejectedValue(
        new PlatformApiError(
          'Network request failed',
          'NETWORK_ERROR',
          0,
          undefined,
        ),
      ),
    };
    const onUpdateAccount = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={jest.fn()}
          onUpdateAccount={onUpdateAccount}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-display-name' })
        .props.onChangeText(' 平台昵称 ');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-account-submit' })
        .props.onPress();
    });

    expect(getRenderedText(renderer)).toContain(
      '网络连接不可用，请检查网络后重试',
    );
    expect(onUpdateAccount).toHaveBeenCalledWith(
      {
        displayName: '平台昵称',
        boundPhone: '13800138000',
        avatarPhotoCount: 0,
      },
      {
        markFailed: true,
        syncMessage: '网络连接不可用，请检查网络后重试',
        syncOperation: 'accountProfile',
      },
    );
  });

  it('shows the platform validation message when the bound phone is already occupied', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockRejectedValue(
        new PlatformApiError(
          '手机号已被其他账号占用',
          'VALIDATION_ERROR',
          400,
          'req-test',
        ),
      ),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={jest.fn()}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-bound-phone' })
        .props.onChangeText('13900139999');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-account-submit' })
        .props.onPress();
    });

    expect(platformProfileApi.saveAccountProfile).toHaveBeenCalledWith({
      displayName: '旧昵称',
      phone: '13900139999',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(getRenderedText(renderer)).toContain('手机号已被其他账号占用');
  });

  it('renders synced avatar source details when the account already carries a platform avatar snapshot', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={{
            ...baseAccount,
            avatarPhotoCount: 1,
            avatarFileId: 'file-avatar-synced',
            avatarPublicUrl:
              'https://cdn.example.com/avatar/file-avatar-synced.png',
          }}
          password={basePassword}
          onUpdateSettings={jest.fn()}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'setting-avatar-preview-image' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/avatar/file-avatar-synced.png',
    });
    expect(getRenderedText(renderer)).toContain('头像：平台已同步');
    expect(getRenderedText(renderer)).toContain('来源：平台文件对象（已上传）');
    expect(getRenderedText(renderer)).toContain('文件 ID：file-avatar-synced');
    expect(getRenderedText(renderer)).toContain('已生成平台公开地址。');
  });

  it('keeps unsaved nickname and phone edits after adding a local avatar placeholder', async () => {
    const onUpdateAccount = jest.fn();

    function LocalAvatarHarness() {
      const [settings, setSettings] = React.useState(cloneSettings());
      const [account, setAccount] = React.useState(baseAccount);

      return (
        <SettingRecords
          now={1000}
          settings={settings}
          account={account}
          password={basePassword}
          onUpdateSettings={nextSettings => setSettings(nextSettings)}
          onUpdateAccount={(nextAccount, options) => {
            onUpdateAccount(nextAccount, options);
            setAccount(nextAccount);
          }}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />
      );
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<LocalAvatarHarness />);
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-display-name' })
        .props.onChangeText('晨星货主');
      renderer.root
        .findByProps({ testID: 'setting-bound-phone' })
        .props.onChangeText('13900139999');
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-avatar-upload' })
        .props.onPress();
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-account-submit' })
        .props.onPress();
    });

    expect(onUpdateAccount).toHaveBeenLastCalledWith(
      {
        displayName: '晨星货主',
        boundPhone: '13900139999',
        avatarPhotoCount: 1,
      },
      undefined,
    );
    expect(getRenderedText(renderer)).toContain('昵称：晨星货主');
    expect(getRenderedText(renderer)).toContain('绑定手机号：13900139999');
    expect(getRenderedText(renderer)).toContain('头像凭证 1 张');
    expect(getRenderedText(renderer)).toContain('头像凭证：本地已保存');
    expect(getRenderedText(renderer)).toContain('来源：本地图片凭证占位');
    expect(
      renderer.root.findByProps({ testID: 'setting-avatar-preview-text' }).props
        .children,
    ).toBe('晨');
  });

  it('uploads an avatar through the platform file api and syncs the avatar file id when saving account settings', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformFileApi = {
      createUploadIntent: jest.fn().mockResolvedValue({
        id: 'file-avatar-1',
        ownerUserId: 'shipper-1',
        purpose: 'avatar',
        objectKey: 'shipper-1/avatar/file-avatar-1.png',
        publicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
        status: 'pending',
        createdAtIso: '2026-07-22T08:00:00.000Z',
        uploadUrl: 'http://localhost:3000/api/files/uploads/file-avatar-1',
        expiresAtIso: '2026-07-22T08:10:00.000Z',
      }),
      confirmUploaded: jest.fn(),
      confirmLocalUploadTarget: jest.fn().mockResolvedValue({
        id: 'file-avatar-1',
        ownerUserId: 'shipper-1',
        purpose: 'avatar',
        objectKey: 'shipper-1/avatar/file-avatar-1.png',
        publicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
        status: 'uploaded',
        createdAtIso: '2026-07-22T08:00:00.000Z',
      }),
    };
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '平台昵称',
        phone: '13800138000',
        avatarFileId: 'file-avatar-1',
        avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
      }),
    };
    const onUpdateAccount = jest.fn();
    const onUpdateSettings = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          platformFileApi={platformFileApi}
          onUpdateSettings={onUpdateSettings}
          onUpdateAccount={onUpdateAccount}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-avatar-upload' })
        .props.onPress();
    });

    expect(onUpdateAccount).not.toHaveBeenCalled();
    expect(getRenderedText(renderer)).toContain('头像凭证 1 张');
    expect(getRenderedText(renderer)).toContain(
      '头像凭证：已上传待保存到平台',
    );
    expect(getRenderedText(renderer)).toContain('来源：平台文件对象（已上传）');
    expect(getRenderedText(renderer)).toContain('文件 ID：file-avatar-1');
    expect(getRenderedText(renderer)).toContain('已生成平台公开地址。');
    expect(
      renderer.root.findByProps({ testID: 'setting-avatar-preview-image' }).props
        .source,
    ).toEqual({
      uri: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-display-name' })
        .props.onChangeText(' 平台昵称 ');
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-account-submit' })
        .props.onPress();
    });

    expect(platformFileApi.createUploadIntent).toHaveBeenCalledWith({
      purpose: 'avatar',
      fileName: '头像凭证.png',
      contentType: 'image/png',
      byteSize: 2048,
    });
    expect(platformProfileApi.saveAccountProfile).toHaveBeenCalledWith({
      displayName: '平台昵称',
      avatarFileId: 'file-avatar-1',
      phone: '13800138000',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(onUpdateAccount).toHaveBeenLastCalledWith(
      {
        displayName: '平台昵称',
        boundPhone: '13800138000',
        avatarPhotoCount: 1,
        avatarFileId: 'file-avatar-1',
        avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
      },
      {
        markSynced: true,
        syncMessage: '账号资料快照已同步到平台。',
        syncOperation: 'accountProfile',
      },
    );
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.any(Array),
      { markPendingSync: false },
    );
    expect(getRenderedText(renderer)).toContain(
      '昵称、手机号和头像已同步到平台。',
    );
  });

  it('clears a synced avatar after removing it and saving account settings', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '旧昵称',
        phone: '13800138000',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
      }),
    };
    const onUpdateAccount = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={{
            ...baseAccount,
            avatarPhotoCount: 1,
            avatarFileId: 'file-avatar-synced',
            avatarPublicUrl:
              'https://cdn.example.com/avatar/file-avatar-synced.png',
          }}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={jest.fn()}
          onUpdateAccount={onUpdateAccount}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'setting-avatar-remove' })
        .props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: 'setting-avatar-preview-text' }).props
        .children,
    ).toBe('旧');
    expect(getRenderedText(renderer)).toContain('头像：已移除待保存到平台');
    expect(getRenderedText(renderer)).toContain(
      '来源：保存后会回退到昵称首字占位',
    );

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-account-submit' })
        .props.onPress();
    });

    expect(platformProfileApi.saveAccountProfile).toHaveBeenCalledWith({
      displayName: '旧昵称',
      avatarFileId: null,
      phone: '13800138000',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
    });
    expect(onUpdateAccount).toHaveBeenLastCalledWith(
      {
        displayName: '旧昵称',
        boundPhone: '13800138000',
        avatarPhotoCount: 0,
      },
      {
        markSynced: true,
        syncMessage: '账号资料快照已同步到平台。',
        syncOperation: 'accountProfile',
      },
    );
    expect(getRenderedText(renderer)).toContain('昵称和手机号已同步到平台。');
  });

  it('syncs setting toggles through the platform account snapshot api', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '旧昵称',
        phone: '13800138000',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: true,
      }),
    };
    const onUpdateSettings = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={onUpdateSettings}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-toggle-setting-promotion' })
        .props.onPress();
    });

    expect(platformProfileApi.saveAccountProfile).toHaveBeenCalledWith({
      displayName: '旧昵称',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
    });
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'setting-promotion',
          statusText: '已开启',
        }),
      ]),
      {
        markSynced: true,
        syncMessage: '平台设置快照已同步。',
        syncOperation: 'accountProfile',
      },
    );
    expect(getRenderedText(renderer)).toContain(
      '设置已同步到平台：促销通知已开启',
    );
  });

  it('keeps a failed platform settings snapshot queued locally when a toggle save fails', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockRejectedValue(
        new PlatformApiError(
          'Network request failed',
          'NETWORK_ERROR',
          0,
          undefined,
        ),
      ),
    };
    const onUpdateSettings = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={onUpdateSettings}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'setting-toggle-setting-promotion' })
        .props.onPress();
    });

    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'setting-promotion',
          statusText: '已开启',
        }),
      ]),
      {
        markFailed: true,
        syncMessage: '网络连接不可用，请检查网络后重试',
        syncOperation: 'accountProfile',
      },
    );
    expect(getRenderedText(renderer)).toContain(
      '网络连接不可用，请检查网络后重试',
    );
  });

  it('syncs privacy confirmation through the platform account snapshot api', async () => {
    saveAuthSession(1000, {
      accessToken: 'access-token',
      refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
      expiresIn: 900,
    });
    const platformProfileApi = {
      saveAccountProfile: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        displayName: '旧昵称',
        phone: '13800138000',
        phoneProtectionEnabled: true,
        loginProtectionEnabled: true,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: false,
        privacyConfirmedAtIso: new Date(1000).toISOString(),
        privacyPolicyVersion: privacyPolicyDocumentInfo.version,
        privacyPolicyVersionTitle: privacyPolicyDocumentInfo.versionTitle,
      }),
    };
    const onUpdateSettings = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={onUpdateSettings}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'setting-open-privacy' }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'privacy-policy-confirm' })
        .props.onPress();
    });

    expect(platformProfileApi.saveAccountProfile).toHaveBeenCalledWith({
      displayName: '旧昵称',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAtIso: new Date(1000).toISOString(),
      privacyPolicyVersion: privacyPolicyDocumentInfo.version,
      privacyPolicyVersionTitle: privacyPolicyDocumentInfo.versionTitle,
    });
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'setting-privacy',
          statusText: '已确认',
          confirmedAtIso: new Date(1000).toISOString(),
          confirmedVersionId: privacyPolicyDocumentInfo.version,
          confirmedVersionTitle: privacyPolicyDocumentInfo.versionTitle,
        }),
      ]),
      {
        markSynced: true,
        syncMessage: '隐私确认快照已同步到平台。',
        syncOperation: 'accountProfile',
      },
    );
    expect(getRenderedText(renderer)).toContain('隐私政策确认已同步到平台。');
  });

  it('derives account security check details from the current local session and security switches', async () => {
    saveAuthSession(1000);
    const settings = cloneSettings().map(item =>
      item.id === 'setting-login-protection'
        ? {
            ...item,
            statusText: '已关闭',
          }
        : item,
    );

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={1000}
          settings={settings}
          account={baseAccount}
          password={basePassword}
          onUpdateSettings={jest.fn()}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({ testID: 'account-security-local-check' })
        .props.onPress();
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain('账号安全本地检查完成：已基于当前会话和安全开关生成本地结果。');
    expect(renderedText).toContain('账号安全检查');
    expect(renderedText).toContain('需处理');
    expect(renderedText).toContain('当前设备：本机演示设备（本地会话）');
    expect(renderedText).toContain('仅检测到当前设备会话，本地未发现其他设备快照。');
    expect(renderedText).toContain('当前会话：本地演示会话 · 有效');
    expect(renderedText).toContain('登录保护：已关闭');
    expect(renderedText).toContain('手机号保护：已开启');
    expect(renderedText).toContain('风险结论：发现 1 项待处理风险');
    expect(renderedText).toContain(
      '风险提示：异地登录保护已关闭，本地无法拦截异常设备登录。',
    );
  });

  it('loads platform device sessions and revokes other devices from the security panel', async () => {
    saveAuthSession(
      1000,
      {
        accessToken: 'access-token',
        refreshToken: 'refresh.550e8400-e29b-41d4-a716-446655440000',
        expiresIn: 900,
      },
      'mobile-device-current',
    );
    const platformAuthApi = {
      changePassword: jest.fn(),
      listSessions: jest.fn().mockResolvedValue({
        sessions: [
          {
            id: 'session-current',
            deviceId: 'mobile-device-current',
            createdAtIso: '2026-07-22T08:00:00.000Z',
            expiresAtIso: '2026-07-29T08:00:00.000Z',
          },
          {
            id: 'session-laptop',
            deviceId: 'mobile-device-laptop',
            createdAtIso: '2026-07-21T08:00:00.000Z',
            expiresAtIso: '2026-07-28T08:00:00.000Z',
          },
          {
            id: 'session-tablet',
            deviceId: 'mobile-device-tablet',
            createdAtIso: '2026-07-20T08:00:00.000Z',
            expiresAtIso: '2026-07-27T08:00:00.000Z',
          },
        ],
        total: 3,
      }),
      revokeOtherSessions: jest.fn().mockResolvedValue({
        currentDeviceId: 'mobile-device-current',
        revokedCount: 2,
      }),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingRecords
          now={Date.parse('2026-07-22T08:30:00.000Z')}
          settings={cloneSettings()}
          account={baseAccount}
          password={basePassword}
          platformAuthApi={platformAuthApi}
          onUpdateSettings={jest.fn()}
          onUpdateAccount={jest.fn()}
          onUpdatePassword={jest.fn()}
          onLogout={jest.fn()}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'account-security-local-check' })
        .props.onPress();
    });

    let renderedText = getRenderedText(renderer);

    expect(platformAuthApi.listSessions).toHaveBeenCalledTimes(1);
    expect(renderedText).toContain('账号安全检查完成：已同步平台设备会话。');
    expect(renderedText).toContain('设备会话：已同步平台 3 条活跃刷新会话');
    expect(renderedText).toContain(
      '平台共检测到 3 个活跃会话，当前设备 1 个，其它设备 2 个。',
    );
    expect(renderedText).toContain(
      '风险提示：检测到 2 台其它设备保持登录，如非本人请立即退出其它设备。',
    );
    expect(renderedText).toContain(
      '当前设备：当前安装设备（已匹配平台会话）',
    );

    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ testID: 'account-security-revoke-other-sessions' })
        .props.onPress();
    });

    renderedText = getRenderedText(renderer);

    expect(platformAuthApi.revokeOtherSessions).toHaveBeenCalledWith({
      currentDeviceId: 'mobile-device-current',
    });
    expect(renderedText).toContain('已退出其它 2 台设备。');
    expect(renderedText).toContain(
      '平台共检测到 1 个活跃会话，当前设备 1 个，其它设备 0 个。',
    );
    expect(renderedText).toContain('当前平台设备会话未发现待处理风险。');
  });
});

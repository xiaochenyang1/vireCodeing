import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { profileSettingItems } from '../src/data/mockData';
import { PlatformApiError } from '../src/services/platformApiClient';
import { SettingRecords } from '../src/screens/profile/SettingRecords';
import { clearAuthSession, saveAuthSession } from '../src/utils/authSession';
import type {
  SavedAccountSettings,
  SavedPasswordSettings,
  SettingItem,
} from '../src/utils/profileLocalState';

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

  afterEach(() => {
    clearAuthSession();
  });

  it('syncs display name through the platform profile api and keeps the bound phone read only', async () => {
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

    expect(
      renderer.root.findByProps({ testID: 'setting-bound-phone' }).props
        .editable,
    ).toBe(false);

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
    });
    expect(onUpdateAccount).toHaveBeenCalledWith({
      displayName: '平台昵称',
      boundPhone: '13800138000',
      avatarPhotoCount: 0,
    });
    expect(getRenderedText(renderer)).toContain('昵称已同步到平台。');
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
  });
});
